import { beforeEach, describe, expect, it } from 'vitest';
import { memoryDb } from '../../server/memory';
import { versus } from '../../server/rooms';
import { matchPool } from '../versus/plan';
import { TRIAL_MS, findTrialHit, trialOutcome, trialTarget } from '../versus/trial';
import { VERSUS_MODES, isRace } from '../versus/types';
import type { Snapshot } from '../versus/types';

describe('Time Trial is a mode Versus offers', () => {
  it('is on the Versus menu, and is a race rather than a run of rounds', () => {
    expect(VERSUS_MODES).toContain('trial');
    expect(isRace('trial')).toBe(true);
    expect(isRace('find')).toBe(false);
  });

  it('asks for every state in the scope', () => {
    expect(trialTarget('all')).toBe(50);
    expect(trialTarget('r:Northeast')).toBe(matchPool('r:Northeast').length);
  });

  it('runs for four minutes', () => {
    expect(TRIAL_MS).toBe(4 * 60 * 1000);
  });
});

describe('matching a typed name', () => {
  const none = new Set<string>();

  it('takes an exact name', () => {
    expect(findTrialHit('Ohio', 'all', none, false)?.a).toBe('OH');
  });

  it('waits for a committed answer before forgiving a misspelling', () => {
    expect(findTrialHit('Ohiox', 'all', none, false)).toBeNull();
    expect(findTrialHit('Pensylvania', 'all', none, true)?.a).toBe('PA');
  });

  it('will not hand back a state already named', () => {
    expect(findTrialHit('Ohio', 'all', new Set(['OH']), true)).toBeNull();
  });

  it('stays inside the scope', () => {
    expect(findTrialHit('Nevada', 'r:Northeast', none, true)).toBeNull();
    expect(findTrialHit('Maine', 'r:Northeast', none, true)?.a).toBe('ME');
  });

  it('ignores a fragment too short to mean anything', () => {
    expect(findTrialHit('oh', 'all', none, true)).toBeNull();
  });
});

describe('who takes a trial', () => {
  it('gives it to whoever named more', () => {
    expect(trialOutcome({ count: 31, ms: 1 }, { count: 30, ms: 1 })).toBe('win');
    expect(trialOutcome({ count: 29, ms: 1 }, { count: 30, ms: 1 })).toBe('loss');
  });

  it('separates a tie by who got there first', () => {
    expect(trialOutcome({ count: 50, ms: 90_000 }, { count: 50, ms: 95_000 })).toBe('win');
    expect(trialOutcome({ count: 50, ms: 95_000 }, { count: 50, ms: 90_000 })).toBe('loss');
    expect(trialOutcome({ count: 20, ms: 5000 }, { count: 20, ms: 5000 })).toBe('draw');
  });
});

describe('a trial on the server', () => {
  const T0 = new Date('2026-09-10T12:00:00.000Z');
  let db: ReturnType<typeof memoryDb>;
  const call = (input: Record<string, unknown>, now = T0) => versus(db, input, now);

  beforeEach(() => { db = memoryDb(); });

  async function running(): Promise<Snapshot> {
    const created = await call({ action: 'create', playerId: 'host', name: 'Obie', dif: 'standard' });
    const code = created.room.code;
    await call({ action: 'join', code, playerId: 'guest', name: 'Sam', dif: 'guided' });
    await call({ action: 'settings', code, playerId: 'host', mode: 'trial' });
    await call({ action: 'player', code, playerId: 'guest', ready: true });
    return call({ action: 'player', code, playerId: 'host', ready: true });
  }

  const at = (s: Snapshot, plus: number) => new Date(Date.parse(s.room.round_started_at as string) + plus);
  const mineIn = (s: Snapshot, id: string) => s.answers.filter((a) => a.player_id === id);

  it('sizes a trial to the whole map', async () => {
    const s = await running();
    expect(s.room.mode).toBe('trial');
    expect(s.room.rounds).toBe(50);
  });

  it('records each name at that player’s own next index', async () => {
    const s = await running();
    const code = s.room.code;
    await call({ action: 'answer', code, playerId: 'host', pick: 'Ohio' }, at(s, 1000));
    const second = await call({ action: 'answer', code, playerId: 'host', pick: 'Nevada' }, at(s, 2000));

    expect(mineIn(second, 'host').map((a) => [a.round, a.pick])).toEqual([[0, 'OH'], [1, 'NV']]);
  });

  it('lets the two players run independently', async () => {
    const s = await running();
    const code = s.room.code;
    await call({ action: 'answer', code, playerId: 'host', pick: 'Ohio' }, at(s, 1000));
    const both = await call({ action: 'answer', code, playerId: 'guest', pick: 'Texas' }, at(s, 1100));

    expect(mineIn(both, 'host')).toHaveLength(1);
    expect(mineIn(both, 'guest')).toEqual([expect.objectContaining({ round: 0, pick: 'TX' })]);
  });

  it('takes a misspelling the player committed to', async () => {
    const s = await running();
    const got = await call({ action: 'answer', code: s.room.code, playerId: 'host', pick: 'Pensylvania' }, at(s, 1000));

    expect(mineIn(got, 'host')).toEqual([expect.objectContaining({ pick: 'PA' })]);
  });

  it('shrugs off a name that is not a state', async () => {
    const s = await running();
    const after = await call({ action: 'answer', code: s.room.code, playerId: 'host', pick: 'Atlantis' }, at(s, 1000));

    expect(after.answers).toEqual([]);
    expect(after.room.status).toBe('playing');
  });

  it('shrugs off a state already named', async () => {
    const s = await running();
    const code = s.room.code;
    await call({ action: 'answer', code, playerId: 'host', pick: 'Ohio' }, at(s, 1000));
    const again = await call({ action: 'answer', code, playerId: 'host', pick: 'Ohio' }, at(s, 1500));

    expect(mineIn(again, 'host')).toHaveLength(1);
  });

  it('keeps the time each name landed', async () => {
    const s = await running();
    const got = await call({ action: 'answer', code: s.room.code, playerId: 'host', pick: 'Ohio' }, at(s, 7000));

    expect(mineIn(got, 'host')[0].ms).toBe(7000);
  });

  it('refuses a name before the trial has started', async () => {
    const s = await running();
    await expect(call({ action: 'answer', code: s.room.code, playerId: 'host', pick: 'Ohio' }, at(s, -500)))
      .rejects.toMatchObject({ status: 422 });
  });

  it('refuses a name after the clock has run out', async () => {
    const s = await running();
    await expect(call({ action: 'answer', code: s.room.code, playerId: 'host', pick: 'Ohio' }, at(s, TRIAL_MS + 1)))
      .rejects.toMatchObject({ status: 422 });
  });

  it('ends the moment a player names them all', async () => {
    const s = await running();
    const code = s.room.code;
    let last = s;
    const names = matchPool('all').map((st) => st.n);
    for (let i = 0; i < names.length; i++) {
      last = await call({ action: 'answer', code, playerId: 'host', pick: names[i] }, at(s, 1000 + i));
    }

    expect(last.room.status).toBe('final');
    expect(mineIn(last, 'host')).toHaveLength(50);
  });

  it('holds the host off until the clock is done', async () => {
    const s = await running();
    await expect(call({ action: 'advance', code: s.room.code, playerId: 'host' }, at(s, 1000)))
      .rejects.toMatchObject({ status: 422 });
  });

  it('lets the host close it once the clock is done', async () => {
    const s = await running();
    const done = await call({ action: 'advance', code: s.room.code, playerId: 'host' }, at(s, TRIAL_MS));

    expect(done.room.status).toBe('final');
  });
});
