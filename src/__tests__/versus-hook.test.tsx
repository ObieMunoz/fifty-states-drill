// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError, OFFLINE } from '../versus/client';
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
  play: vi.fn(), unlockAudio: vi.fn(), setMuted: vi.fn(), isMuted: () => true,
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
