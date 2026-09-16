// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, OFFLINE } from '../versus/client';
import { loadProgress } from '../game/progress';
import { planMatch } from '../versus/plan';
import { COUNTDOWN_MS, GRACE_MS, REVEAL_MS } from '../versus/timing';
import type { LiveEvents, LiveSnapshot } from '../versus/live';
import type { AnswerRow, PlayerRow, RoomRow, Snapshot } from '../versus/types';

const { callVersus, callPhone, openLive } = vi.hoisted(() => ({
  callVersus: vi.fn(),
  callPhone: vi.fn(),
  openLive: vi.fn(),
}));

vi.mock('../versus/client', async () => {
  const real = await vi.importActual<typeof import('../versus/client')>('../versus/client');
  return { ...real, callVersus, callPhone };
});

vi.mock('../versus/live', async () => {
  const real = await vi.importActual<typeof import('../versus/live')>('../versus/live');
  return { ...real, openLive };
});

vi.mock('../versus/sound', () => ({
  play: vi.fn(),
  unlockAudio: vi.fn(),
  soundOn: () => false,
  setSoundOn: vi.fn(),
  onSoundChange: () => () => {},
}));

vi.mock('../versus/haptics', () => ({ haptic: vi.fn() }));

vi.mock('../versus/player', () => ({ playerId: () => 'me' }));

const { useVersus } = await import('../versus/useVersus');

const NOW = '2026-09-10T12:00:00.000Z';
const T = Date.parse(NOW);
const CODE = 'ACDE';
const iso = (ms: number) => new Date(ms).toISOString();

const room = (over: Partial<RoomRow> = {}): RoomRow => ({
  code: CODE, host_id: 'me', status: 'waiting', mode: 'find', rounds: 5, scope: 'all',
  match_no: 0, seed: null, difs: null, round: 0, round_started_at: null, updated_at: NOW, ...over,
});

const player = (id: string, over: Partial<PlayerRow> = {}): PlayerRow => ({
  room_code: CODE, id, name: id === 'me' ? 'Obie' : 'Sam', dif: 'standard',
  ready: false, wants_again: false, ...over,
});

const row = (player_id: string, round: number, over: Partial<AnswerRow> = {}): AnswerRow => ({
  room_code: CODE, match_no: 0, round, player_id, correct: true, ms: 1000, points: 140,
  pick: 'CA', timeout: false, ...over,
});

const snapshot = (r: Partial<RoomRow>, players: PlayerRow[], answers: AnswerRow[] = []): Snapshot =>
  ({ room: room(r), players, answers, now: NOW });

const midMatch = (over: Partial<RoomRow> = {}): Partial<RoomRow> => ({
  status: 'playing', seed: `${CODE}:0`, difs: { me: 'standard', them: 'standard' },
  round: 0, round_started_at: iso(T), ...over,
});

let events: LiveEvents;
let seeded: Snapshot[];

function wire(): void {
  seeded = [];
  openLive.mockImplementation((_code: string, _id: string, ev: LiveEvents) => {
    events = ev;
    return {
      seed: (snap: Snapshot) => {
        seeded.push(snap);
        ev.onSnapshot({ ...snap, receivedAt: Date.now() } as LiveSnapshot);
      },
      react: vi.fn(),
      leave: vi.fn(),
    };
  });
}

/** A host sitting on the reveal of round 0, both answers in. */
async function hostOnReveal() {
  callVersus.mockResolvedValueOnce(snapshot({ status: 'waiting' }, [player('me')]));
  const hook = renderHook(() => useVersus());
  await act(async () => { hook.result.current.host('Obie'); });

  await act(async () => {
    events.onSnapshot({
      ...snapshot(midMatch(), [player('me'), player('them')]),
      receivedAt: Date.now(),
    } as LiveSnapshot);
  });
  await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 10); });

  callVersus.mockResolvedValue(snapshot(midMatch(), [player('me'), player('them')], [row('me', 0)]));
  await act(async () => { hook.result.current.answerMap('OH'); });
  await act(async () => {
    events.onSnapshot({
      ...snapshot(midMatch(), [player('me'), player('them')], [row('me', 0), row('them', 0)]),
      receivedAt: Date.now(),
    } as LiveSnapshot);
  });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(T);
  localStorage.clear();
  callVersus.mockReset();
  callPhone.mockReset().mockResolvedValue({ ok: true });
  openLive.mockReset();
  wire();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the host moving the match on', () => {
  it('reaches the reveal with both answers in', async () => {
    const hook = await hostOnReveal();
    expect(hook.result.current.state.phase).toBe('reveal');
    expect(hook.result.current.state.isHost).toBe(true);
  });

  it('keeps trying after a dropped advance, and moves the match on when the network returns', async () => {
    const hook = await hostOnReveal();
    callVersus.mockReset();
    callVersus.mockRejectedValueOnce(new ApiError(0, OFFLINE));

    await act(async () => { vi.advanceTimersByTime(REVEAL_MS + 50); });
    expect(callVersus).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state.error).toBe(OFFLINE);

    callVersus.mockResolvedValue(
      snapshot(midMatch({ round: 1, round_started_at: iso(T + 30000) }), [player('me'), player('them')],
        [row('me', 0), row('them', 0)]),
    );
    await act(async () => { vi.advanceTimersByTime(4000); });

    await waitFor(() => expect(hook.result.current.state.round).toBe(1));
    expect(hook.result.current.state.phase).toBe('question');
  });

  it('keeps trying after the server answers 500', async () => {
    await hostOnReveal();
    callVersus.mockReset();
    callVersus.mockRejectedValue(new ApiError(500, 'Something went wrong on the server.'));

    await act(async () => { vi.advanceTimersByTime(REVEAL_MS + 50); });
    const first = callVersus.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(6000); });

    expect(callVersus.mock.calls.length).toBeGreaterThan(first);
  });

  it('still retries a 422 while the server holds the round open, and says nothing about it', async () => {
    const hook = await hostOnReveal();
    callVersus.mockReset();
    callVersus.mockRejectedValue(new ApiError(422, 'An answer is still due.'));

    await act(async () => { vi.advanceTimersByTime(REVEAL_MS + 50); });
    await act(async () => { vi.advanceTimersByTime(GRACE_MS); });

    expect(callVersus.mock.calls.length).toBeGreaterThan(1);
    expect(hook.result.current.state.error).toBeNull();
  });
});

describe('the clock driving the round', () => {
  async function kickedOff() {
    callVersus.mockResolvedValueOnce(snapshot({ status: 'waiting' }, [player('me')]));
    const hook = renderHook(() => useVersus());
    await act(async () => { hook.result.current.host('Obie'); });
    callVersus.mockResolvedValue(snapshot(midMatch(), [player('me'), player('them')]));
    await act(async () => {
      events.onSnapshot({
        ...snapshot(midMatch({ round_started_at: iso(T + COUNTDOWN_MS) }), [player('me'), player('them')]),
        receivedAt: Date.now(),
      } as LiveSnapshot);
    });
    return hook;
  }

  it('counts down before the first question', async () => {
    const hook = await kickedOff();

    expect(hook.result.current.state.phase).toBe('countdown');

    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });

    expect(hook.result.current.state.phase).toBe('question');
    expect(hook.result.current.state.round).toBe(0);
  });

  it('submits nothing of its own when the clock runs out', async () => {
    const hook = await kickedOff();
    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });
    const limit = hook.result.current.limitMs;
    callVersus.mockClear();

    await act(async () => { vi.advanceTimersByTime(limit + 100); });

    await waitFor(() => expect(hook.result.current.state.myAnswers[0]?.timeout).toBe(true));
    expect(hook.result.current.state.myAnswers[0]?.points).toBe(0);
    expect(callVersus).toHaveBeenCalledWith(expect.objectContaining({ action: 'answer', timeout: true }));
  });

  it('reveals at once when both answers are in', async () => {
    const hook = await kickedOff();
    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });

    await act(async () => { hook.result.current.answerMap('OH'); });
    expect(hook.result.current.state.phase).toBe('question');

    await act(async () => {
      events.onSnapshot({
        ...snapshot(midMatch(), [player('me'), player('them')], [row('me', 0), row('them', 0)]),
        receivedAt: Date.now(),
      } as LiveSnapshot);
    });

    expect(hook.result.current.state.phase).toBe('reveal');
  });

  it('waits out the grace on an opponent who has gone quiet', async () => {
    const hook = await kickedOff();
    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });
    const limit = hook.result.current.limitMs;

    await act(async () => { hook.result.current.answerMap('OH'); });
    await act(async () => { vi.advanceTimersByTime(limit + GRACE_MS + 50); });

    expect(hook.result.current.state.phase).toBe('reveal');
  });

  it('asks where things stand when the phone comes back to the foreground', async () => {
    await kickedOff();
    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });
    callVersus.mockClear();

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(callVersus).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }));
  });

  it('asks again after the channel comes back', async () => {
    await kickedOff();
    callVersus.mockClear();

    await act(async () => { events.onLink('lost'); });
    await act(async () => { events.onLink('linked'); });

    expect(callVersus).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync' }));
  });
});

describe('getting an answer onto the server', () => {
  async function onQuestion() {
    callVersus.mockResolvedValueOnce(snapshot({ status: 'waiting' }, [player('me')]));
    const hook = renderHook(() => useVersus());
    await act(async () => { hook.result.current.host('Obie'); });
    await act(async () => {
      events.onSnapshot({
        ...snapshot(midMatch({ round_started_at: iso(T + COUNTDOWN_MS) }), [player('me'), player('them')]),
        receivedAt: Date.now(),
      } as LiveSnapshot);
    });
    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });
    return hook;
  }

  it('offers the answer again when the first call is dropped', async () => {
    const hook = await onQuestion();
    callVersus.mockReset();
    callVersus.mockRejectedValueOnce(new ApiError(0, OFFLINE));
    callVersus.mockResolvedValue(snapshot(midMatch(), [player('me'), player('them')], [row('me', 0)]));

    await act(async () => { hook.result.current.answerMap('OH'); });
    await act(async () => { vi.advanceTimersByTime(1000); });

    const sent = callVersus.mock.calls.filter((c) => c[0]?.action === 'answer');
    expect(sent.length).toBeGreaterThan(1);
    expect(sent[0][0]).toMatchObject({ round: 0, pick: 'OH' });
  });

  it('sends it once when the first call lands', async () => {
    const hook = await onQuestion();
    callVersus.mockReset();
    callVersus.mockResolvedValue(snapshot(midMatch(), [player('me'), player('them')], [row('me', 0)]));

    await act(async () => { hook.result.current.answerMap('OH'); });
    await act(async () => { vi.advanceTimersByTime(2000); });

    expect(callVersus.mock.calls.filter((c) => c[0]?.action === 'answer')).toHaveLength(1);
  });
});

describe('folding a finished match into the standings', () => {
  const finalSnap = () => snapshot(
    midMatch({ status: 'final', round: 4, round_started_at: null }),
    [player('me'), player('them')],
    [row('me', 0, { points: 500 }), row('them', 0, { points: 100 })],
  );

  async function finish() {
    callVersus.mockResolvedValueOnce(snapshot({ status: 'waiting' }, [player('me')]));
    const hook = renderHook(() => useVersus());
    await act(async () => { hook.result.current.host('Obie'); });
    await act(async () => {
      events.onSnapshot({ ...finalSnap(), receivedAt: Date.now() } as LiveSnapshot);
    });
    return hook;
  }

  it('records the match once', async () => {
    const hook = await finish();

    const obie = hook.result.current.board.find((r) => r.name === 'Obie');
    expect(obie?.matches).toBe(1);
    expect(obie?.wins).toBe(1);
  });

  it('does not count it again when the phone comes back to the same result', async () => {
    const first = await finish();
    expect(first.result.current.board.find((r) => r.name === 'Obie')?.matches).toBe(1);
    first.unmount();

    const again = await finish();

    const obie = again.result.current.board.find((r) => r.name === 'Obie');
    expect(obie?.matches).toBe(1);
    expect(obie?.wins).toBe(1);
    expect(obie?.points).toBe(500);
  });
});

describe('what a match teaches the device', () => {
  const firstRound = () => planMatch({ seed: `${CODE}:0`, mode: 'find', rounds: 5, scope: 'all' })[0];

  it('waits for the reveal before counting the round', async () => {
    callVersus.mockResolvedValueOnce(snapshot({ status: 'waiting' }, [player('me')]));
    const hook = renderHook(() => useVersus());
    await act(async () => { hook.result.current.host('Obie'); });
    await act(async () => {
      events.onSnapshot({
        ...snapshot(midMatch({ round_started_at: iso(T + COUNTDOWN_MS) }), [player('me'), player('them')]),
        receivedAt: Date.now(),
      } as LiveSnapshot);
    });
    await act(async () => { vi.advanceTimersByTime(COUNTDOWN_MS + 20); });
    callVersus.mockResolvedValue(snapshot(midMatch(), [player('me'), player('them')], [row('me', 0)]));
    await act(async () => { hook.result.current.answerMap('OH'); });

    expect(hook.result.current.state.phase).toBe('question');
    expect(loadProgress().st ?? {}).toEqual({});
  });

  it('counts the revealed round as an attempt on its own track', async () => {
    await hostOnReveal();

    const { abbr, qm } = firstRound();

    expect(loadProgress().st?.[abbr]?.[qm as 'find']).toEqual({ a: 1, c: 1 });
  });

  it('does not count the same round twice across a reload', async () => {
    const first = await hostOnReveal();
    first.unmount();

    await hostOnReveal();

    const { abbr, qm } = firstRound();

    expect(loadProgress().st?.[abbr]?.[qm as 'find']).toEqual({ a: 1, c: 1 });
  });
});

describe('the lobby telling the truth about what the server took', () => {
  async function inLobby() {
    callVersus.mockResolvedValueOnce(snapshot({ status: 'waiting' }, [player('me')]));
    const hook = renderHook(() => useVersus());
    await act(async () => { hook.result.current.host('Obie'); });
    await act(async () => {
      events.onSnapshot({
        ...snapshot({ status: 'lobby' }, [player('me'), player('them')]),
        receivedAt: Date.now(),
      } as LiveSnapshot);
    });
    return hook;
  }

  it('puts readiness back when the server never took it', async () => {
    const hook = await inLobby();
    callVersus.mockReset();
    callVersus.mockRejectedValue(new ApiError(0, OFFLINE));

    await act(async () => { hook.result.current.setReady(true); });

    await waitFor(() => expect(hook.result.current.state.me.ready).toBe(false));
    expect(hook.result.current.state.error).toBe(OFFLINE);
  });

  it('puts the level back when the server never took it', async () => {
    const hook = await inLobby();
    callVersus.mockReset();
    callVersus.mockRejectedValue(new ApiError(0, OFFLINE));

    await act(async () => { hook.result.current.setDif('expert'); });

    await waitFor(() => expect(hook.result.current.state.me.dif).toBe('standard'));
  });

  it('puts the rules back when the server never took them', async () => {
    const hook = await inLobby();
    callVersus.mockReset();
    callVersus.mockRejectedValue(new ApiError(0, OFFLINE));

    await act(async () => { hook.result.current.setDraft({ rounds: 15 }); });

    await waitFor(() => expect(hook.result.current.state.draft.rounds).toBe(5));
  });

  it('keeps what the server did take', async () => {
    const hook = await inLobby();
    callVersus.mockReset();
    callVersus.mockResolvedValue(snapshot({ status: 'lobby' }, [player('me', { ready: true }), player('them')]));

    await act(async () => { hook.result.current.setReady(true); });

    await waitFor(() => expect(hook.result.current.state.me.ready).toBe(true));
    expect(hook.result.current.state.error).toBeNull();
  });
});
