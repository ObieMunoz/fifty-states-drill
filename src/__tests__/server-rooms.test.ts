import { beforeEach, describe, expect, it } from 'vitest';
import { BY } from '../data/states';
import { RoomError, expireRooms, phone, versus } from '../../server/rooms';
import type { Db } from '../../server/rooms';
import type { Pusher } from '../../server/push';
import { planMatch } from '../versus/plan';
import { roundLimitMs, scoreAnswer } from '../versus/scoring';
import {
  COUNTDOWN_MS, GRACE_MS, PAIRING_TTL_MS, REMATCH_COOLDOWN_MS, ROOM_TTL_MS,
} from '../versus/timing';
import type {
  AnswerRow, PairingRow, PlayerRow, RoomRow, Snapshot, SubscriptionRow,
} from '../versus/types';

interface MemoryDb extends Db {
  rooms: Map<string, RoomRow>;
  players: PlayerRow[];
  answers: AnswerRow[];
  subs: SubscriptionRow[];
  pairings: PairingRow[];
}

function memoryDb(): MemoryDb {
  const rooms = new Map<string, RoomRow>();
  let players: PlayerRow[] = [];
  let answers: AnswerRow[] = [];
  let subs: SubscriptionRow[] = [];
  let pairings: PairingRow[] = [];
  return {
    rooms,
    get players() { return players; },
    get answers() { return answers; },
    get subs() { return subs; },
    get pairings() { return pairings; },
    async getRoom(code) { return rooms.get(code) ?? null; },
    async insertRoom(row) {
      if (rooms.has(row.code)) return false;
      rooms.set(row.code, { ...row });
      return true;
    },
    async updateRoom(code, patch) {
      const r = rooms.get(code);
      if (r) rooms.set(code, { ...r, ...patch });
    },
    async getPlayers(code) { return players.filter((p) => p.room_code === code); },
    async upsertPlayer(row) {
      players = players.filter((p) => !(p.room_code === row.room_code && p.id === row.id));
      players.push({ ...row });
    },
    async updatePlayers(code, patch) {
      players = players.map((p) => (p.room_code === code ? { ...p, ...patch } : p));
    },
    async deletePlayer(code, id) {
      players = players.filter((p) => !(p.room_code === code && p.id === id));
    },
    async getAnswers(code, matchNo) {
      return answers.filter((a) => a.room_code === code && a.match_no === matchNo);
    },
    async insertAnswer(row) {
      if (answers.some((a) => a.room_code === row.room_code && a.match_no === row.match_no
        && a.round === row.round && a.player_id === row.player_id)) return false;
      answers.push({ ...row });
      return true;
    },
    async deleteRoomsBefore(before) {
      let n = 0;
      for (const [code, r] of rooms) {
        if (new Date(r.updated_at) < before) {
          rooms.delete(code);
          players = players.filter((p) => p.room_code !== code);
          answers = answers.filter((a) => a.room_code !== code);
          n++;
        }
      }
      return n;
    },
    async getWaitingRoomsHostedBy(hostId) {
      return [...rooms.values()].filter((r) => r.host_id === hostId && r.status === 'waiting');
    },
    async getSubscription(endpoint) { return subs.find((r) => r.endpoint === endpoint) ?? null; },
    async getSubscriptions(playerId) { return subs.filter((r) => r.player_id === playerId); },
    async upsertSubscription(row) {
      subs = [...subs.filter((r) => r.endpoint !== row.endpoint), { ...row }];
    },
    async deleteSubscription(endpoint, playerId) {
      subs = subs.filter((r) => r.endpoint !== endpoint || (playerId !== undefined && r.player_id !== playerId));
    },
    async getPairing(aId, bId) { return pairings.find((r) => r.a_id === aId && r.b_id === bId) ?? null; },
    async upsertPairing(row) {
      pairings = [...pairings.filter((r) => !(r.a_id === row.a_id && r.b_id === row.b_id)), { ...row }];
    },
    async deletePairing(aId, bId) {
      pairings = pairings.filter((r) => !(r.a_id === aId && r.b_id === bId));
    },
    async deletePairingsBefore(before) {
      const keep = pairings.filter((r) => new Date(r.played_at) >= before);
      const n = pairings.length - keep.length;
      pairings = keep;
      return n;
    },
  };
}

const T0 = new Date('2026-09-10T12:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

let db: ReturnType<typeof memoryDb>;
const call = (input: Record<string, unknown>, now = T0) => versus(db, input, now);

const fail = async (input: Record<string, unknown>, status: number, now = T0) => {
  await expect(call(input, now)).rejects.toMatchObject({ status });
};

async function lobby(): Promise<Snapshot> {
  const created = await call({ action: 'create', playerId: 'host', name: 'Obie', dif: 'standard' });
  return call({ action: 'join', code: created.room.code, playerId: 'guest', name: 'Sam', dif: 'guided' });
}

async function playing(mode = 'find', rounds = 5): Promise<Snapshot> {
  const s = await lobby();
  const code = s.room.code;
  await call({ action: 'settings', code, playerId: 'host', mode, rounds });
  await call({ action: 'player', code, playerId: 'guest', ready: true });
  return call({ action: 'player', code, playerId: 'host', ready: true });
}

const questionTime = (s: Snapshot, plus = 0) =>
  new Date(Date.parse(s.room.round_started_at as string) + plus);

beforeEach(() => { db = memoryDb(); });

describe('creating and joining', () => {
  it('opens a room with the creator as host, waiting', async () => {
    const s = await call({ action: 'create', playerId: 'host', name: '  Obie  ', dif: 'expert' });
    expect(s.room.code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{4}$/);
    expect(s.room.host_id).toBe('host');
    expect(s.room.status).toBe('waiting');
    expect(s.room).toMatchObject({ mode: 'mixed', rounds: 10, scope: 'all', match_no: 0, round: 0, seed: null });
    expect(s.players).toEqual([expect.objectContaining({ id: 'host', name: 'Obie', dif: 'expert', ready: false })]);
    expect(s.answers).toEqual([]);
    expect(s.now).toBe(T0.toISOString());
  });

  it('draws another code when one is taken', async () => {
    const first = await call({ action: 'create', playerId: 'a', name: 'A', dif: 'standard' });
    const taken = new Set([first.room.code]);
    for (let i = 0; i < 20; i++) {
      const next = await call({ action: 'create', playerId: `p${i}`, name: 'P', dif: 'standard' });
      expect(taken.has(next.room.code)).toBe(false);
      taken.add(next.room.code);
    }
  });

  it('seats a second player and opens the lobby', async () => {
    const s = await lobby();
    expect(s.room.status).toBe('lobby');
    expect(s.players.map((p) => p.id).sort()).toEqual(['guest', 'host']);
  });

  it('folds a typed code the way the phone does', async () => {
    const created = await call({ action: 'create', playerId: 'host', name: 'Obie', dif: 'standard' });
    const typed = created.room.code.toLowerCase().split('').join(' ');
    const s = await call({ action: 'join', code: typed, playerId: 'guest', name: 'Sam', dif: 'guided' });
    expect(s.room.code).toBe(created.room.code);
  });

  it('lets a seated player rejoin, refreshing their name and level', async () => {
    const s = await lobby();
    const again = await call({ action: 'join', code: s.room.code, playerId: 'guest', name: 'Samantha', dif: 'expert' });
    expect(again.players).toHaveLength(2);
    expect(again.players.find((p) => p.id === 'guest')).toMatchObject({ name: 'Samantha', dif: 'expert' });
    expect(again.room.status).toBe('lobby');
  });

  it('turns a third player away', async () => {
    const s = await lobby();
    await fail({ action: 'join', code: s.room.code, playerId: 'third', name: 'Tom', dif: 'standard' }, 409);
  });

  it('knows a code nobody opened', async () => {
    await fail({ action: 'join', code: 'ACDE', playerId: 'guest', name: 'Sam', dif: 'standard' }, 404);
    await fail({ action: 'sync', code: 'ACDE', playerId: 'guest' }, 404);
  });

  it('refuses bad input before touching the room', async () => {
    await fail({ action: 'create', playerId: '', name: 'Obie', dif: 'standard' }, 400);
    await fail({ action: 'create', playerId: 'host', name: 'Obie', dif: 'brutal' }, 400);
    await fail({ action: 'create', playerId: 'x'.repeat(200), name: 'Obie', dif: 'standard' }, 400);
    await fail({ action: 'join', code: 'AC', playerId: 'guest', name: 'Sam', dif: 'standard' }, 400);
    await fail({ action: 'dance', code: 'ACDE', playerId: 'guest' }, 400);
    await fail({ action: 'sync' }, 400);
    expect(db.rooms.size).toBe(0);
  });

  it('gives a nameless player a stand-in', async () => {
    const s = await call({ action: 'create', playerId: 'host', name: '   ', dif: 'standard' });
    expect(s.players[0].name).toBe('Player');
  });
});

describe('the lobby', () => {
  it('lets only the host change the rules, and only to real ones', async () => {
    const s = await lobby();
    const code = s.room.code;
    const changed = await call({ action: 'settings', code, playerId: 'host', mode: 'capital', rounds: 15, scope: 'r:West' });
    expect(changed.room).toMatchObject({ mode: 'capital', rounds: 15, scope: 'r:West' });
    await fail({ action: 'settings', code, playerId: 'guest', mode: 'find' }, 403);
    await fail({ action: 'settings', code, playerId: 'host', mode: 'roll' }, 400);
    await fail({ action: 'settings', code, playerId: 'host', rounds: 7 }, 400);
    await fail({ action: 'settings', code, playerId: 'host', scope: 'r:Narnia' }, 400);
  });

  it('records each player’s own level and readiness', async () => {
    const s = await lobby();
    const code = s.room.code;
    const guest = await call({ action: 'player', code, playerId: 'guest', dif: 'expert', ready: true });
    expect(guest.players.find((p) => p.id === 'guest')).toMatchObject({ dif: 'expert', ready: true });
    expect(guest.room.status).toBe('lobby');
    await fail({ action: 'player', code, playerId: 'stranger', ready: true }, 403);
  });

  it('kicks off when both are ready, locking levels and setting the clock', async () => {
    const s = await playing('find', 5);
    expect(s.room.status).toBe('playing');
    expect(s.room.seed).toBe(`${s.room.code}:0`);
    expect(s.room.difs).toEqual({ host: 'standard', guest: 'guided' });
    expect(s.room.round).toBe(0);
    expect(s.room.round_started_at).toBe(at(COUNTDOWN_MS).toISOString());
    expect(s.room.updated_at).toBe(T0.toISOString());
  });

  it('rejects a rule change once the match is on', async () => {
    const s = await playing();
    await fail({ action: 'settings', code: s.room.code, playerId: 'host', mode: 'capital' }, 422);
  });
});

describe('answering', () => {
  it('scores a right Find It tap from the seed, not from what the phone claims', async () => {
    const s = await playing('find', 5);
    const code = s.room.code;
    const plan = planMatch({ seed: s.room.seed as string, mode: 'find', rounds: 5, scope: 'all' });
    const limit = roundLimitMs('find', ['standard', 'guided']);
    const after = await call(
      { action: 'answer', code, playerId: 'host', round: 0, pick: plan[0].abbr, ms: 2500, timeout: false },
      questionTime(s, 2500),
    );
    expect(after.answers).toEqual([expect.objectContaining({
      player_id: 'host', round: 0, correct: true, ms: 2500, points: scoreAnswer(true, 2500, limit), pick: plan[0].abbr, timeout: false,
    })]);
  });

  it('scores a typed capital by the same rules as solo play', async () => {
    const s = await playing('capital', 5);
    const code = s.room.code;
    const plan = planMatch({ seed: s.room.seed as string, mode: 'capital', rounds: 5, scope: 'all' });
    const cap = BY[plan[0].abbr].cap;
    const near = cap.slice(0, -1) + (cap.endsWith('a') ? 'e' : 'a');
    const right = await call(
      { action: 'answer', code, playerId: 'host', round: 0, pick: near, ms: 4000, timeout: false },
      questionTime(s, 4000),
    );
    expect(right.answers[0].correct).toBe(true);
    const wrong = await call(
      { action: 'answer', code, playerId: 'guest', round: 0, pick: 'Atlantis', ms: 4000, timeout: false },
      questionTime(s, 4000),
    );
    expect(wrong.answers.find((a) => a.player_id === 'guest')).toMatchObject({ correct: false, points: 0 });
  });

  it('takes a timeout as no answer', async () => {
    const s = await playing();
    const after = await call(
      { action: 'answer', code: s.room.code, playerId: 'guest', round: 0, pick: null, ms: 99999, timeout: true },
      questionTime(s, 30000),
    );
    expect(after.answers[0]).toMatchObject({ correct: false, points: 0, pick: null, timeout: true });
  });

  it('keeps the first answer and ignores a second', async () => {
    const s = await playing('find');
    const code = s.room.code;
    const plan = planMatch({ seed: s.room.seed as string, mode: 'find', rounds: 5, scope: 'all' });
    await call({ action: 'answer', code, playerId: 'host', round: 0, pick: 'ZZ', ms: 1000, timeout: false }, questionTime(s, 1000));
    const again = await call({ action: 'answer', code, playerId: 'host', round: 0, pick: plan[0].abbr, ms: 1000, timeout: false }, questionTime(s, 1000));
    expect(again.answers).toHaveLength(1);
    expect(again.answers[0].correct).toBe(false);
  });

  it('clamps a claimed time to the round’s clock', async () => {
    const s = await playing('find');
    const plan = planMatch({ seed: s.room.seed as string, mode: 'find', rounds: 5, scope: 'all' });
    const limit = roundLimitMs('find', ['standard', 'guided']);
    const after = await call(
      { action: 'answer', code: s.room.code, playerId: 'host', round: 0, pick: plan[0].abbr, ms: -500, timeout: false },
      questionTime(s),
    );
    expect(after.answers[0].ms).toBe(0);
    expect(after.answers[0].points).toBe(scoreAnswer(true, 0, limit));
  });

  it('refuses an answer for the wrong round, from outside, or outside a match', async () => {
    const s = await playing();
    const code = s.room.code;
    await fail({ action: 'answer', code, playerId: 'host', round: 1, pick: 'CA', ms: 1, timeout: false }, 422, questionTime(s));
    await fail({ action: 'answer', code, playerId: 'nobody', round: 0, pick: 'CA', ms: 1, timeout: false }, 403, questionTime(s));
    const l = await lobby();
    await fail({ action: 'answer', code: l.room.code, playerId: 'host', round: 0, pick: 'CA', ms: 1, timeout: false }, 422);
  });
});

describe('advancing', () => {
  const answerBoth = async (s: Snapshot, round: number, when: Date) => {
    await call({ action: 'answer', code: s.room.code, playerId: 'host', round, pick: 'CA', ms: 1000, timeout: false }, when);
    return call({ action: 'answer', code: s.room.code, playerId: 'guest', round, pick: 'CA', ms: 1000, timeout: false }, when);
  };

  it('moves to the next round once both have answered, restarting the clock', async () => {
    const s = await playing('find', 5);
    const when = questionTime(s, 3000);
    await answerBoth(s, 0, when);
    const later = new Date(when.getTime() + 2600);
    const next = await call({ action: 'advance', code: s.room.code, playerId: 'host' }, later);
    expect(next.room.round).toBe(1);
    expect(next.room.round_started_at).toBe(later.toISOString());
    expect(next.room.status).toBe('playing');
  });

  it('will not be hurried while an answer is still due', async () => {
    const s = await playing('find', 5);
    const when = questionTime(s, 3000);
    await call({ action: 'answer', code: s.room.code, playerId: 'host', round: 0, pick: 'CA', ms: 1000, timeout: false }, when);
    await fail({ action: 'advance', code: s.room.code, playerId: 'host' }, 422, when);
  });

  it('moves on alone once the clock and the grace have run out', async () => {
    const s = await playing('find', 5);
    const limit = roundLimitMs('find', ['standard', 'guided']);
    const late = questionTime(s, limit + GRACE_MS);
    const next = await call({ action: 'advance', code: s.room.code, playerId: 'host' }, late);
    expect(next.room.round).toBe(1);
  });

  it('is the host’s call alone', async () => {
    const s = await playing('find', 5);
    await answerBoth(s, 0, questionTime(s, 1000));
    await fail({ action: 'advance', code: s.room.code, playerId: 'guest' }, 403, questionTime(s, 5000));
  });

  it('ends the match after the last round', async () => {
    let s = await playing('find', 5);
    for (let r = 0; r < 5; r++) {
      const when = questionTime(s, 1000);
      await answerBoth(s, r, when);
      s = await call({ action: 'advance', code: s.room.code, playerId: 'host' }, new Date(when.getTime() + 1));
    }
    expect(s.room.status).toBe('final');
    expect(s.room.round).toBe(4);
    expect(s.answers).toHaveLength(10);
    await fail({ action: 'advance', code: s.room.code, playerId: 'host' }, 422);
  });
});

/** A whole match played through, ending on the final screen. */
async function finished(): Promise<Snapshot> {
  let s = await playing('find', 5);
  for (let r = 0; r < 5; r++) {
    const when = questionTime(s, 1000);
    await call({ action: 'answer', code: s.room.code, playerId: 'host', round: r, pick: 'CA', ms: 1000, timeout: false }, when);
    await call({ action: 'answer', code: s.room.code, playerId: 'guest', round: r, pick: 'CA', ms: 1000, timeout: false }, when);
    s = await call({ action: 'advance', code: s.room.code, playerId: 'host' }, new Date(when.getTime() + 1));
  }
  return s;
}

describe('rematch and leaving', () => {
  it('notes a guest asking again, and lets the host restart on a fresh seed', async () => {
    const s = await finished();
    const code = s.room.code;
    const asked = await call({ action: 'again', code, playerId: 'guest' });
    expect(asked.room.status).toBe('final');
    expect(asked.players.find((p) => p.id === 'guest')?.wants_again).toBe(true);
    const restarted = await call({ action: 'again', code, playerId: 'host' });
    expect(restarted.room).toMatchObject({ status: 'lobby', match_no: 1, seed: null, difs: null, round: 0, round_started_at: null });
    expect(restarted.players.every((p) => !p.ready && !p.wants_again)).toBe(true);
    expect(restarted.answers).toEqual([]);
    const next = await call({ action: 'player', code, playerId: 'guest', ready: true });
    const kicked = await call({ action: 'player', code, playerId: 'host', ready: true });
    expect(next.room.status).toBe('lobby');
    expect(kicked.room.seed).toBe(`${code}:1`);
  });

  it('hands the host back the waiting room when the guest leaves', async () => {
    const s = await playing();
    const code = s.room.code;
    const after = await call({ action: 'leave', code, playerId: 'guest' });
    expect(after.room).toMatchObject({ status: 'waiting', seed: null, round: 0 });
    expect(after.players.map((p) => p.id)).toEqual(['host']);
    expect(after.players[0].ready).toBe(false);
    const joined = await call({ action: 'join', code, playerId: 'other', name: 'Kim', dif: 'standard' });
    expect(joined.room.status).toBe('lobby');
  });

  it('closes the room for good when the host leaves', async () => {
    const s = await playing();
    const code = s.room.code;
    const closed = await call({ action: 'leave', code, playerId: 'host' });
    expect(closed.room.status).toBe('closed');
    await fail({ action: 'join', code, playerId: 'guest', name: 'Sam', dif: 'guided' }, 410);
    await fail({ action: 'sync', code, playerId: 'guest' }, 410);
    await fail({ action: 'player', code, playerId: 'guest', ready: true }, 410);
  });

  it('lets a stranger leave without effect', async () => {
    const s = await lobby();
    const after = await call({ action: 'leave', code: s.room.code, playerId: 'nobody' });
    expect(after.players).toHaveLength(2);
    expect(after.room.status).toBe('lobby');
  });
});

describe('sync and housekeeping', () => {
  it('answers a sync with the whole room', async () => {
    const s = await playing();
    const synced = await call({ action: 'sync', code: s.room.code, playerId: 'guest' }, at(5000));
    expect(synced.room).toEqual(s.room);
    expect(synced.players).toHaveLength(2);
    expect(synced.now).toBe(at(5000).toISOString());
  });

  it('touches the room on every change, and sweeps rooms left alone for a day', async () => {
    const s = await lobby();
    await call({ action: 'settings', code: s.room.code, playerId: 'host', mode: 'find' }, at(1000));
    expect(db.rooms.get(s.room.code)?.updated_at).toBe(at(1000).toISOString());
    expect(await expireRooms(db, at(1000 + ROOM_TTL_MS - 1))).toBe(0);
    expect(await expireRooms(db, at(1000 + ROOM_TTL_MS + 1))).toBe(1);
    expect(db.rooms.size).toBe(0);
    expect(db.players).toEqual([]);
  });

  it('reports errors with a status and a message', async () => {
    const err = await call({ action: 'sync', code: 'ACDE', playerId: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoomError);
    expect((err as RoomError).status).toBe(404);
    expect((err as RoomError).message).toMatch(/room/i);
  });
});

describe('rematch requests', () => {
  const sub = (playerId: string, n = 1) => ({
    action: 'subscribe', playerId,
    subscription: { endpoint: `https://push.example/${playerId}/${n}`, keys: { p256dh: 'p', auth: 'a' } },
  });

  /** A push service that records what it was sent and answers as told. */
  function recorder(answer: (endpoint: string) => 'sent' | 'gone' | 'failed' = () => 'sent') {
    const sent: { endpoint: string; payload: Record<string, unknown>; ttl: number }[] = [];
    const pusher: Pusher = {
      async send(to, payload, ttl) {
        sent.push({ endpoint: to.endpoint, payload: JSON.parse(payload) as Record<string, unknown>, ttl });
        return answer(to.endpoint);
      },
    };
    return { sent, pusher };
  }

  const ask = (input: Record<string, unknown>, pusher: Pusher | null, now = T0) =>
    versus(db, { action: 'rematch', playerId: 'host', to: 'guest', name: 'Obie', dif: 'standard', ...input }, now, pusher);

  it('keeps a phone’s subscription against its player, and lets it go again', async () => {
    expect(await phone(db, sub('guest'))).toEqual({ ok: true });
    expect(await phone(db, sub('guest', 2))).toEqual({ ok: true });
    expect(db.subs.map((r) => r.player_id)).toEqual(['guest', 'guest']);
    // Only the owner may drop a row.
    await phone(db, { action: 'unsubscribe', playerId: 'host', endpoint: 'https://push.example/guest/1' });
    expect(db.subs).toHaveLength(2);
    await phone(db, { action: 'unsubscribe', playerId: 'guest', endpoint: 'https://push.example/guest/1' });
    expect(db.subs.map((r) => r.endpoint)).toEqual(['https://push.example/guest/2']);
  });

  it('refuses a subscription that is not one', async () => {
    await expect(phone(db, { action: 'subscribe', playerId: 'g', subscription: { endpoint: 'http://x', keys: { p256dh: 'p', auth: 'a' } } }))
      .rejects.toMatchObject({ status: 400 });
    await expect(phone(db, { action: 'subscribe', playerId: 'g', subscription: { endpoint: 'https://x', keys: { p256dh: 'p' } } }))
      .rejects.toMatchObject({ status: 400 });
    await expect(versus(db, { action: 'subscribe', playerId: 'g' }, T0)).rejects.toMatchObject({ status: 400 });
    await expect(phone(db, { action: 'sync', code: 'ACDE', playerId: 'g' })).rejects.toMatchObject({ status: 400 });
  });

  it('moves a rotated subscription to the new endpoint without a player id', async () => {
    await phone(db, sub('guest'));
    await phone(db, {
      action: 'resubscribe', endpoint: 'https://push.example/guest/1',
      subscription: { endpoint: 'https://push.example/rotated', keys: { p256dh: 'p2', auth: 'a2' } },
    });
    expect(db.subs).toEqual([{ endpoint: 'https://push.example/rotated', player_id: 'guest', p256dh: 'p2', auth: 'a2' }]);
    await expect(phone(db, { action: 'resubscribe', endpoint: 'https://push.example/nope', subscription: { endpoint: 'https://x', keys: { p256dh: 'p', auth: 'a' } } }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('pairs the two players once a match ends, whoever is in the room by then', async () => {
    const s = await playing('find', 5);
    expect(db.pairings).toEqual([]);
    await finished();
    expect(db.pairings).toEqual([expect.objectContaining({ a_id: 'guest', b_id: 'host', invited_by: null })]);
    // A room in play pairs nobody.
    expect(db.pairings.every((p) => p.played_at)).toBe(true);
    expect(s.room.status).toBe('playing');
  });

  it('only reaches someone the player has finished a match with', async () => {
    await phone(db, sub('guest'));
    const { pusher, sent } = recorder();
    await expect(ask({}, pusher)).rejects.toMatchObject({ status: 403 });
    await expect(ask({ to: 'host' }, pusher)).rejects.toMatchObject({ status: 400 });
    expect(sent).toEqual([]);
    expect(db.rooms.size).toBe(0);
  });

  it('opens a room for the requester and pings every phone the friend has', async () => {
    await finished();
    await phone(db, sub('guest', 1));
    await phone(db, sub('guest', 2));
    const { pusher, sent } = recorder();
    const s = await ask({}, pusher, at(60_000));
    expect(s.room).toMatchObject({ host_id: 'host', status: 'waiting' });
    expect(s.players).toEqual([expect.objectContaining({ id: 'host', name: 'Obie' })]);
    expect(s.notified).toBe('sent');
    expect(sent.map((x) => x.endpoint).sort()).toEqual(['https://push.example/guest/1', 'https://push.example/guest/2']);
    expect(sent[0].payload).toEqual({ kind: 'rematch', code: s.room.code, from: 'Obie' });
    expect(sent[0].ttl).toBe(30 * 60);
    expect(db.pairings[0]).toMatchObject({ invited_by: 'host', invited_at: at(60_000).toISOString() });
  });

  it('still opens the room when the friend cannot be reached, and says so', async () => {
    await finished();
    const { pusher, sent } = recorder();
    const s = await ask({}, pusher);
    expect(s.room.status).toBe('waiting');
    expect(s.notified).toBe('unsubscribed');
    expect(sent).toEqual([]);
    // Nothing was sent, so nothing starts the cooldown.
    expect(db.pairings[0].invited_by).toBeNull();
    // No push service configured at all is told apart from that.
    await phone(db, sub('guest'));
    expect((await ask({}, null)).notified).toBe('unconfigured');
  });

  it('drops a subscription the push service says is gone', async () => {
    await finished();
    await phone(db, sub('guest', 1));
    await phone(db, sub('guest', 2));
    const { pusher } = recorder((e) => (e.endsWith('/1') ? 'gone' : 'sent'));
    const s = await ask({}, pusher);
    expect(s.notified).toBe('sent');
    expect(db.subs.map((r) => r.endpoint)).toEqual(['https://push.example/guest/2']);
    // A transient failure keeps the row.
    const failing = recorder(() => 'failed');
    const again = await ask({}, failing.pusher, at(REMATCH_COOLDOWN_MS + 1));
    expect(again.notified).toBe('undelivered');
    expect(db.subs).toHaveLength(1);
  });

  it('will not ping the same friend twice in a minute while the first room waits, but the other side may', async () => {
    await finished();
    await phone(db, sub('guest'));
    await phone(db, sub('host'));
    const { pusher, sent } = recorder();
    await ask({}, pusher, T0);
    await expect(ask({}, pusher, at(REMATCH_COOLDOWN_MS - 1))).rejects.toMatchObject({ status: 429 });
    expect(sent).toHaveLength(1);
    expect(db.rooms.size).toBe(2); // the finished room and the first request's
    // The friend answering with a request of their own is not a repeat.
    const back = await ask({ playerId: 'guest', to: 'host', name: 'Sam' }, pusher, at(1000));
    expect(back.notified).toBe('sent');
    expect(sent[1]).toMatchObject({ endpoint: 'https://push.example/host/1', payload: { from: 'Sam' } });
    // And after a minute, so may the first side.
    expect((await ask({}, pusher, at(REMATCH_COOLDOWN_MS + 1))).notified).toBe('sent');
  });

  it('lets a request go again the moment the requester has left the room it opened', async () => {
    await finished();
    await phone(db, sub('guest'));
    const { pusher, sent } = recorder();
    const first = await ask({}, pusher, T0);
    await call({ action: 'leave', code: first.room.code, playerId: 'host' }, at(1000));
    const second = await ask({}, pusher, at(2000));
    expect(second.notified).toBe('sent');
    expect(second.room.code).not.toBe(first.room.code);
    expect(sent).toHaveLength(2);
  });

  it('lets a request go again once the friend has joined the room it opened', async () => {
    await finished();
    await phone(db, sub('guest'));
    const { pusher, sent } = recorder();
    const first = await ask({}, pusher, T0);
    await call({ action: 'join', code: first.room.code, playerId: 'guest', name: 'Sam', dif: 'guided' }, at(1000));
    // The room is a lobby now, not a wait: the request was answered.
    expect((await ask({}, pusher, at(2000))).notified).toBe('sent');
    expect(sent).toHaveLength(2);
  });

  it('playing again clears the pending request, and forgetting cuts the link both ways', async () => {
    await finished();
    await phone(db, sub('guest'));
    const { pusher } = recorder();
    await ask({}, pusher);
    expect(db.pairings[0].invited_by).toBe('host');
    await finished();
    expect(db.pairings).toHaveLength(1);
    expect(db.pairings[0].invited_by).toBeNull();
    await phone(db, { action: 'forget', playerId: 'guest', to: 'host' });
    expect(db.pairings).toEqual([]);
    await expect(ask({}, pusher, at(REMATCH_COOLDOWN_MS + 1))).rejects.toMatchObject({ status: 403 });
    await expect(ask({ playerId: 'guest', to: 'host' }, pusher)).rejects.toMatchObject({ status: 403 });
  });

  it('sweeps pairings of players who have not met in months', async () => {
    await finished();
    await expireRooms(db, at(PAIRING_TTL_MS - 1));
    expect(db.pairings).toHaveLength(1);
    await expireRooms(db, at(PAIRING_TTL_MS + 60_000));
    expect(db.pairings).toEqual([]);
  });
});
