import { REGS } from '../src/data/states';
import { DIFF_KEYS } from '../src/data/modes';
import { askFor, grade } from '../src/versus/grade';
import { cleanName, displayName } from '../src/versus/identity';
import { planMatch } from '../src/versus/plan';
import { CODE_LENGTH, matchSeed, newRoomCode, normalizeCode } from '../src/versus/room';
import { roundLimitMs, scoreAnswer } from '../src/versus/scoring';
import { rematchPayload } from '../src/versus/notify';
import {
  COUNTDOWN_MS, GRACE_MS, PAIRING_TTL_MS, REMATCH_COOLDOWN_MS, REMATCH_TTL_MS, ROOM_TTL_MS,
} from '../src/versus/timing';
import { ROUND_CHOICES, VERSUS_MODES } from '../src/versus/types';
import type {
  AnswerRow, PairingRow, PlayerRow, Receipt, RoomRow, Snapshot, SubscriptionRow,
} from '../src/versus/types';
import type { DiffKey, ModeKey, Scope } from '../src/types';
import type { Pusher } from './push';

/**
 * The rules of a Versus room, as the server enforces them.
 *
 * Every change to a room comes through `versus`, which reads the room, checks
 * the request against where the room is, writes the change, and answers with
 * the whole room as it now stands. The phones never write rows themselves.
 *
 * Nothing here knows about Postgres: it talks to a `Db` handed in, which is
 * Supabase in production and a few Maps in the tests. The room logic is the
 * part worth testing thoroughly, and this is what makes that cheap.
 *
 * The one rule this file settles rather than the phones: what an answer is
 * worth. Both phones grade as they go, so the reveal is instant, but the
 * points that count are computed here from the seed, the same way — so the
 * running score is only as honest as this file, not as each phone.
 */

export interface Db {
  getRoom(code: string): Promise<RoomRow | null>;
  /** False if the code is already taken. */
  insertRoom(row: RoomRow): Promise<boolean>;
  updateRoom(code: string, patch: Partial<RoomRow>): Promise<void>;
  getPlayers(code: string): Promise<PlayerRow[]>;
  upsertPlayer(row: PlayerRow): Promise<void>;
  /** Apply one change to every player in the room. */
  updatePlayers(code: string, patch: Partial<PlayerRow>): Promise<void>;
  deletePlayer(code: string, id: string): Promise<void>;
  getAnswers(code: string, matchNo: number): Promise<AnswerRow[]>;
  /** False if this player already answered this round. */
  insertAnswer(row: AnswerRow): Promise<boolean>;
  /** Rooms untouched since `before`, with everything in them. Returns how many. */
  deleteRoomsBefore(before: Date): Promise<number>;
  /** Rooms this player hosts that are still waiting for a second player. */
  getWaitingRoomsHostedBy(hostId: string): Promise<RoomRow[]>;

  /* Phones that can be reached, and who may reach whom. */
  getSubscription(endpoint: string): Promise<SubscriptionRow | null>;
  getSubscriptions(playerId: string): Promise<SubscriptionRow[]>;
  upsertSubscription(row: SubscriptionRow): Promise<void>;
  /** With `playerId`, only that player's own row goes. */
  deleteSubscription(endpoint: string, playerId?: string): Promise<void>;
  /** Ids in sorted order, as `pairOf` gives them. */
  getPairing(aId: string, bId: string): Promise<PairingRow | null>;
  upsertPairing(row: PairingRow): Promise<void>;
  deletePairing(aId: string, bId: string): Promise<void>;
  /** Pairings whose last match was before `before`. Returns how many. */
  deletePairingsBefore(before: Date): Promise<number>;
}

/** What went wrong, with the HTTP status that says it. */
export class RoomError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RoomError';
    this.status = status;
  }
}

const bad = (message: string) => new RoomError(400, message);

/** How many codes to try before giving up on an unlucky draw. */
const CODE_TRIES = 5;

/** Room codes are four characters; a player id is whatever the phone made, within reason. */
const MAX_ID = 64;

const isDif = (v: unknown): v is DiffKey => typeof v === 'string' && (DIFF_KEYS as string[]).includes(v);
const isMode = (v: unknown): v is ModeKey => typeof v === 'string' && (VERSUS_MODES as string[]).includes(v);
const isRounds = (v: unknown): v is number => typeof v === 'number' && (ROUND_CHOICES as readonly number[]).includes(v);
const isScope = (v: unknown): v is Scope =>
  typeof v === 'string' && (v === 'all' || (v.startsWith('r:') && (REGS as string[]).includes(v.slice(2))));

const playerIdOf = (input: Record<string, unknown>): string => {
  const id = input.playerId;
  if (typeof id !== 'string' || !id || id.length > MAX_ID) throw bad('playerId is required');
  return id;
};

const codeOf = (input: Record<string, unknown>): string => {
  const code = typeof input.code === 'string' ? normalizeCode(input.code) : '';
  if (code.length !== CODE_LENGTH) throw bad('a four-character room code is required');
  return code;
};

const nameOf = (input: Record<string, unknown>): string =>
  displayName(typeof input.name === 'string' ? cleanName(input.name) : '');

const difOf = (input: Record<string, unknown>): DiffKey => {
  if (!isDif(input.dif)) throw bad('dif must be a level');
  return input.dif;
};

const iso = (d: Date): string => d.toISOString();

/** A pair of ids in the one order the pairing table keeps them. */
export const pairOf = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** The room, or the reason there is no room to act on. */
async function openRoom(db: Db, code: string): Promise<RoomRow> {
  const room = await db.getRoom(code);
  if (!room) throw new RoomError(404, 'No room has that code.');
  if (room.status === 'closed') throw new RoomError(410, 'That room has closed: its host left.');
  return room;
}

async function snapshot(db: Db, code: string, now: Date): Promise<Snapshot> {
  const room = await db.getRoom(code);
  if (!room) throw new RoomError(404, 'No room has that code.');
  const [players, answers] = await Promise.all([db.getPlayers(code), db.getAnswers(code, room.match_no)]);
  return { room, players, answers, now: iso(now) };
}

/** Every room change goes through here, so `updated_at` is never missed. */
const touch = (db: Db, code: string, patch: Partial<RoomRow>, now: Date) =>
  db.updateRoom(code, { ...patch, updated_at: iso(now) });

/** Back to the lobby's blank slate: no seed, no round, nobody ready. */
const unstarted: Partial<RoomRow> = { seed: null, difs: null, round: 0, round_started_at: null };

async function create(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const playerId = playerIdOf(input);
  const name = nameOf(input);
  const dif = difOf(input);
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = newRoomCode();
    const row: RoomRow = {
      code, host_id: playerId, status: 'waiting',
      mode: 'mixed', rounds: 10, scope: 'all',
      match_no: 0, ...unstarted, updated_at: iso(now),
    } as RoomRow;
    if (!(await db.insertRoom(row))) continue;
    await db.upsertPlayer({ room_code: code, id: playerId, name, dif, ready: false, wants_again: false });
    return snapshot(db, code, now);
  }
  throw new RoomError(503, 'Could not find a free room code; try again.');
}

async function join(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const name = nameOf(input);
  const dif = difOf(input);
  const room = await openRoom(db, code);
  const players = await db.getPlayers(code);
  const seated = players.some((p) => p.id === playerId);
  if (!seated && players.length >= 2) throw new RoomError(409, 'That room is full.');
  const existing = players.find((p) => p.id === playerId);
  await db.upsertPlayer({
    room_code: code, id: playerId, name, dif,
    ready: existing?.ready ?? false, wants_again: existing?.wants_again ?? false,
  });
  // A second player opens the lobby; anything short of a full pair waits.
  if (!seated && room.status !== 'lobby') {
    await touch(db, code, { status: 'lobby', ...unstarted }, now);
    await db.updatePlayers(code, { ready: false, wants_again: false });
  }
  return snapshot(db, code, now);
}

async function settings(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const room = await openRoom(db, code);
  if (room.host_id !== playerId) throw new RoomError(403, 'Only the host sets the rules.');
  if (room.status !== 'waiting' && room.status !== 'lobby') throw new RoomError(422, 'The rules are set once the match is on.');
  const patch: Partial<RoomRow> = {};
  if (input.mode !== undefined) {
    if (!isMode(input.mode)) throw bad('mode is not one Versus plays');
    patch.mode = input.mode;
  }
  if (input.rounds !== undefined) {
    if (!isRounds(input.rounds)) throw bad('rounds must be one of the offered counts');
    patch.rounds = input.rounds;
  }
  if (input.scope !== undefined) {
    if (!isScope(input.scope)) throw bad('scope must be all or a region');
    patch.scope = input.scope;
  }
  await touch(db, code, patch, now);
  return snapshot(db, code, now);
}

async function player(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const room = await openRoom(db, code);
  const players = await db.getPlayers(code);
  const me = players.find((p) => p.id === playerId);
  if (!me) throw new RoomError(403, 'You are not in that room.');
  const next: PlayerRow = { ...me };
  if (input.dif !== undefined) {
    if (!isDif(input.dif)) throw bad('dif must be a level');
    next.dif = input.dif;
  }
  if (input.ready !== undefined) {
    if (typeof input.ready !== 'boolean') throw bad('ready must be true or false');
    next.ready = input.ready;
  }
  await db.upsertPlayer(next);

  // Both ready in the lobby: kick off. The seed fixes the questions, the
  // levels are locked, and the first question is due once the countdown ends.
  const all = players.map((p) => (p.id === playerId ? next : p));
  if (room.status === 'lobby' && all.length === 2 && all.every((p) => p.ready)) {
    const difs = Object.fromEntries(all.map((p) => [p.id, p.dif])) as Record<string, DiffKey>;
    await touch(db, code, {
      status: 'playing',
      seed: matchSeed(code, room.match_no),
      difs,
      round: 0,
      round_started_at: iso(new Date(now.getTime() + COUNTDOWN_MS)),
    }, now);
  }
  return snapshot(db, code, now);
}

/** The clock for the round on screen, from the locked levels. */
function limitFor(room: RoomRow): { qm: ModeKey; limit: number; abbr: string } {
  const seed = room.seed as string;
  const planned = planMatch({ seed, mode: room.mode, rounds: room.rounds, scope: room.scope })[room.round];
  const difs = Object.values(room.difs ?? {});
  return { qm: planned.qm, abbr: planned.abbr, limit: roundLimitMs(planned.qm, difs) };
}

async function answer(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const room = await openRoom(db, code);
  if (room.status !== 'playing' || !room.seed || !room.difs) throw new RoomError(422, 'No question is on.');
  if (input.round !== room.round) throw new RoomError(422, 'That round is not the one on screen.');
  const dif = room.difs[playerId];
  if (!dif) throw new RoomError(403, 'You are not in this match.');
  const timeout = input.timeout === true;
  const pick = !timeout && typeof input.pick === 'string' ? input.pick.slice(0, 80) : null;
  const claimed = typeof input.ms === 'number' && Number.isFinite(input.ms) ? input.ms : 0;

  const { qm, limit, abbr } = limitFor(room);
  const ms = Math.min(limit, Math.max(0, Math.round(claimed)));
  const planned = { qm, abbr } as Parameters<typeof askFor>[2];
  const correct = pick !== null && grade(askFor(room.seed, room.round, planned, dif), qm, pick);
  const points = scoreAnswer(correct, ms, limit);

  await db.insertAnswer({
    room_code: code, match_no: room.match_no, round: room.round, player_id: playerId,
    correct, ms, points, pick, timeout,
  });
  await touch(db, code, {}, now);
  return snapshot(db, code, now);
}

async function advance(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const room = await openRoom(db, code);
  if (room.host_id !== playerId) throw new RoomError(403, 'Only the host moves the match on.');
  if (room.status !== 'playing' || !room.round_started_at) throw new RoomError(422, 'No round is on.');

  // Either both answers are in, or the clock and the grace after it have run out.
  const answers = await db.getAnswers(code, room.match_no);
  const inThisRound = answers.filter((a) => a.round === room.round).length;
  const { limit } = limitFor(room);
  const elapsed = now.getTime() - Date.parse(room.round_started_at);
  if (inThisRound < 2 && elapsed < limit + GRACE_MS) throw new RoomError(422, 'An answer is still due.');

  if (room.round + 1 < room.rounds) {
    await touch(db, code, { round: room.round + 1, round_started_at: iso(now) }, now);
  } else {
    await touch(db, code, { status: 'final', round_started_at: null }, now);
    await notePairing(db, room, now);
  }
  return snapshot(db, code, now);
}

/**
 * A finished match is what lets two players send each other rematch
 * requests later. The ids come from the locked levels, so they are the two
 * who actually played, whoever is in the room now. A request already pending
 * across this pair is cleared: they have just played, so it is answered.
 */
async function notePairing(db: Db, room: RoomRow, now: Date): Promise<void> {
  const ids = Object.keys(room.difs ?? {});
  if (ids.length !== 2) return;
  const [a_id, b_id] = pairOf(ids[0], ids[1]);
  await db.upsertPairing({ a_id, b_id, played_at: iso(now), invited_by: null, invited_at: null });
}

async function again(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const room = await openRoom(db, code);
  const players = await db.getPlayers(code);
  const me = players.find((p) => p.id === playerId);
  if (!me) throw new RoomError(403, 'You are not in that room.');
  if (room.status !== 'final') return snapshot(db, code, now);
  if (room.host_id === playerId) {
    // The host restarts both sides: back to the lobby on the next seed.
    await touch(db, code, { status: 'lobby', match_no: room.match_no + 1, ...unstarted }, now);
    await db.updatePlayers(code, { ready: false, wants_again: false });
  } else {
    await db.upsertPlayer({ ...me, wants_again: true });
  }
  return snapshot(db, code, now);
}

async function leave(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  const playerId = playerIdOf(input);
  const room = await openRoom(db, code);
  if (room.host_id === playerId) {
    // The host's leaving closes the room: hosting again draws a fresh code.
    await touch(db, code, { status: 'closed' }, now);
  } else if ((await db.getPlayers(code)).some((p) => p.id === playerId)) {
    // A guest going hands the host the waiting room, with the code still good.
    await db.deletePlayer(code, playerId);
    await touch(db, code, { status: 'waiting', ...unstarted }, now);
    await db.updatePlayers(code, { ready: false, wants_again: false });
  }
  return snapshot(db, code, now);
}

async function sync(db: Db, input: Record<string, unknown>, now: Date): Promise<Snapshot> {
  const code = codeOf(input);
  playerIdOf(input);
  await openRoom(db, code);
  return snapshot(db, code, now);
}

/* ---------------- rematch requests ---------------- */

/** Push endpoints are long, and keys are fixed-size; anything past this is not one. */
const MAX_ENDPOINT = 2048;
const MAX_KEY = 256;

/** The subscription a phone handed over, checked for shape but taken on trust otherwise. */
function subscriptionOf(input: Record<string, unknown>, playerId: string): SubscriptionRow {
  const sub = input.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > MAX_ENDPOINT) {
    throw bad('subscription.endpoint must be an https URL');
  }
  if (typeof p256dh !== 'string' || !p256dh || p256dh.length > MAX_KEY
    || typeof auth !== 'string' || !auth || auth.length > MAX_KEY) {
    throw bad('subscription.keys are required');
  }
  return { endpoint, player_id: playerId, p256dh, auth };
}

const endpointOf = (input: Record<string, unknown>): string => {
  const v = input.endpoint;
  if (typeof v !== 'string' || !v || v.length > MAX_ENDPOINT) throw bad('endpoint is required');
  return v;
};

/** This phone can be reached here from now on. */
async function subscribe(db: Db, input: Record<string, unknown>): Promise<Receipt> {
  await db.upsertSubscription(subscriptionOf(input, playerIdOf(input)));
  return { ok: true };
}

/** This phone is done with notifications. Only its own row goes. */
async function unsubscribe(db: Db, input: Record<string, unknown>): Promise<Receipt> {
  await db.deleteSubscription(endpointOf(input), playerIdOf(input));
  return { ok: true };
}

/**
 * The browser rotated the subscription. The service worker that notices has
 * no player id to hand, so the old endpoint stands in for it: the new
 * subscription takes over whichever player the old one reached.
 */
async function resubscribe(db: Db, input: Record<string, unknown>): Promise<Receipt> {
  const old = await db.getSubscription(endpointOf(input));
  if (!old) throw new RoomError(404, 'That subscription is not known.');
  await db.deleteSubscription(old.endpoint);
  await db.upsertSubscription(subscriptionOf(input, old.player_id));
  return { ok: true };
}

const otherOf = (input: Record<string, unknown>, me: string): string => {
  const to = input.to;
  if (typeof to !== 'string' || !to || to.length > MAX_ID) throw bad('to is required');
  if (to === me) throw bad('to must be someone else');
  return to;
};

/** Cut the link with someone: neither side can ping the other until they play again. */
async function forget(db: Db, input: Record<string, unknown>): Promise<Receipt> {
  const me = playerIdOf(input);
  await db.deletePairing(...pairOf(me, otherOf(input, me)));
  return { ok: true };
}

/**
 * Start a room and tell someone about it. Only someone this player has
 * finished a match with, and not twice in a minute. The room is opened
 * either way — the requester is in it, code on screen, and can share the
 * link by hand — and `notified` says whether the notification got out, and
 * if not, why, so a setup problem reads differently from a friend who has
 * simply not turned notifications on.
 */
async function rematch(
  db: Db, input: Record<string, unknown>, now: Date, pusher: Pusher | null,
): Promise<Snapshot> {
  const me = playerIdOf(input);
  const them = otherOf(input, me);
  const [a_id, b_id] = pairOf(me, them);
  const pairing = await db.getPairing(a_id, b_id);
  if (!pairing) throw new RoomError(403, 'You can only send a rematch request to someone you have finished a match with.');
  if (pairing.invited_by === me && pairing.invited_at
    && now.getTime() - Date.parse(pairing.invited_at) < REMATCH_COOLDOWN_MS
    && await stillWaitingSince(db, me, pairing.invited_at)) {
    throw new RoomError(429, 'You sent them a request a moment ago. Give them a minute.');
  }

  const snap = await create(db, input, now);
  if (!pusher) return { ...snap, notified: 'unconfigured' };
  const targets = await db.getSubscriptions(them);
  if (!targets.length) return { ...snap, notified: 'unsubscribed' };
  const payload = JSON.stringify(rematchPayload(snap.room.code, nameOf(input)));
  const results = await Promise.all(targets.map((t) => pusher.send(t, payload, Math.round(REMATCH_TTL_MS / 1000))));
  await Promise.all(results.map((r, i) => (r === 'gone' ? db.deleteSubscription(targets[i].endpoint) : Promise.resolve())));
  const sent = results.some((r) => r === 'sent');
  if (sent) await db.upsertPairing({ ...pairing, invited_by: me, invited_at: iso(now) });
  return { ...snap, notified: sent ? 'sent' : 'undelivered' };
}

/**
 * Whether the room a request opened is still sitting there waiting. A second
 * request while it is would only ping the same phone about a second room;
 * once the requester has left it, or the friend has joined it, the request
 * has been answered one way or the other and a new one is fair.
 */
async function stillWaitingSince(db: Db, hostId: string, invitedAt: string): Promise<boolean> {
  const since = Date.parse(invitedAt);
  return (await db.getWaitingRoomsHostedBy(hostId)).some((r) => Date.parse(r.updated_at) >= since);
}

/* ---------------- dispatch ---------------- */

const ROOM_ACTIONS = { create, join, settings, player, answer, advance, again, leave, sync } as const;

const PHONE_ACTIONS = { subscribe, unsubscribe, resubscribe, forget } as const;

type ActionName = keyof typeof ROOM_ACTIONS | keyof typeof PHONE_ACTIONS | 'rematch';

const actionOf = (input: unknown): { body: Record<string, unknown>; action: ActionName } => {
  if (!input || typeof input !== 'object') throw bad('a JSON object is required');
  const body = input as Record<string, unknown>;
  const name = body.action;
  if (typeof name !== 'string' || !(name in ROOM_ACTIONS || name in PHONE_ACTIONS || name === 'rematch')) {
    throw bad('action is not one the room knows');
  }
  return { body, action: name as ActionName };
};

/**
 * One request against one room. Throws `RoomError` for anything refused.
 * A `rematch` opens a room and needs a way to send the notification.
 */
export async function versus(db: Db, input: unknown, now: Date, pusher: Pusher | null = null): Promise<Snapshot> {
  const { body, action } = actionOf(input);
  if (action === 'rematch') return rematch(db, body, now, pusher);
  if (!(action in ROOM_ACTIONS)) throw bad('that action is not about a room');
  return ROOM_ACTIONS[action as keyof typeof ROOM_ACTIONS](db, body, now);
}

/** One request about a phone rather than a room: where it can be reached. */
export async function phone(db: Db, input: unknown): Promise<Receipt> {
  const { body, action } = actionOf(input);
  if (!(action in PHONE_ACTIONS)) throw bad('that action is about a room');
  return PHONE_ACTIONS[action as keyof typeof PHONE_ACTIONS](db, body);
}

/** Whether a request is for `phone` rather than `versus`. */
export const isPhoneAction = (input: unknown): boolean =>
  !!input && typeof input === 'object' && typeof (input as { action?: unknown }).action === 'string'
  && (input as { action: string }).action in PHONE_ACTIONS;

/**
 * Sweep rooms nobody has touched for a day, and pairings of players who
 * have not met in months. Returns how many rooms went.
 */
export async function expireRooms(db: Db, now: Date): Promise<number> {
  const rooms = await db.deleteRoomsBefore(new Date(now.getTime() - ROOM_TTL_MS));
  await db.deletePairingsBefore(new Date(now.getTime() - PAIRING_TTL_MS));
  return rooms;
}
