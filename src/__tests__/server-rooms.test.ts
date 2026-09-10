import { beforeEach, describe, expect, it } from 'vitest';
import { BY } from '../data/states';
import { RoomError, expireRooms, versus } from '../../server/rooms';
import type { Db } from '../../server/rooms';
import { planMatch } from '../versus/plan';
import { roundLimitMs, scoreAnswer } from '../versus/scoring';
import { COUNTDOWN_MS, GRACE_MS, ROOM_TTL_MS } from '../versus/timing';
import type { AnswerRow, PlayerRow, RoomRow, Snapshot } from '../versus/types';

function memoryDb(): Db & { rooms: Map<string, RoomRow>; players: PlayerRow[]; answers: AnswerRow[] } {
  const rooms = new Map<string, RoomRow>();
  let players: PlayerRow[] = [];
  let answers: AnswerRow[] = [];
  return {
    rooms,
    get players() { return players; },
    get answers() { return answers; },
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

describe('rematch and leaving', () => {
  const finished = async (): Promise<Snapshot> => {
    let s = await playing('find', 5);
    for (let r = 0; r < 5; r++) {
      const when = questionTime(s, 1000);
      await call({ action: 'answer', code: s.room.code, playerId: 'host', round: r, pick: 'CA', ms: 1000, timeout: false }, when);
      await call({ action: 'answer', code: s.room.code, playerId: 'guest', round: r, pick: 'CA', ms: 1000, timeout: false }, when);
      s = await call({ action: 'advance', code: s.room.code, playerId: 'host' }, new Date(when.getTime() + 1));
    }
    return s;
  };

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
