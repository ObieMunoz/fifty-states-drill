import { describe, expect, it } from 'vitest';
import {
  correctOf, currentRound, initialVersus, matchResults, reducer, totalOf,
} from '../versus/machine';
import type { VersusAction, VersusState } from '../versus/machine';
import type { MatchConfig, RoundAnswer } from '../versus/types';

const cfg: MatchConfig = { seed: 'ACDE:0', mode: 'mixed', rounds: 5, scope: 'all' };

const start = (): VersusState => initialVersus('Obie', 'standard');

const run = (s: VersusState, ...actions: VersusAction[]): VersusState =>
  actions.reduce(reducer, s);

const ans = (over: Partial<RoundAnswer> = {}): RoundAnswer =>
  ({ correct: true, ms: 1000, points: 148, pick: 'CA', timeout: false, ...over });

/** A session already linked to an opponent and in the lobby. */
const linked = (): VersusState => run(
  start(),
  { type: 'hostRoom', code: 'ACDE', id: 'me' },
  { type: 'peerHello', id: 'them', name: 'Sam', dif: 'guided', host: false },
);

/** A session mid-match, on round 0. */
const playing = (): VersusState => run(
  linked(),
  { type: 'startMatch', cfg, difs: { me: 'standard', them: 'guided' }, at: 1000 },
  { type: 'beginQuestions', at: 4000 },
);

describe('lobby', () => {
  it('starts on the menu with the stored name', () => {
    const s = start();
    expect(s.phase).toBe('menu');
    expect(s.me.name).toBe('Obie');
    expect(s.them).toBeNull();
  });

  it('hosting claims the room and waits', () => {
    const s = reducer(start(), { type: 'hostRoom', code: 'ACDE', id: 'me' });
    expect(s.phase).toBe('connecting');
    expect(s.isHost).toBe(true);
    expect(s.code).toBe('ACDE');
    expect(s.link).toBe('searching');
  });

  it('joining does not claim host', () => {
    const s = reducer(start(), { type: 'joinRoom', code: 'ACDE', id: 'me' });
    expect(s.isHost).toBe(false);
    expect(s.phase).toBe('connecting');
  });

  it('an introduction opens the lobby', () => {
    const s = linked();
    expect(s.phase).toBe('lobby');
    expect(s.link).toBe('linked');
    expect(s.them?.name).toBe('Sam');
    expect(s.them?.dif).toBe('guided');
  });

  it('tracks each side’s level independently', () => {
    const s = run(linked(), { type: 'setDif', dif: 'expert' }, { type: 'setPeerDif', dif: 'guided' });
    expect(s.me.dif).toBe('expert');
    expect(s.them?.dif).toBe('guided');
  });

  it('tracks readiness on both sides', () => {
    const s = run(linked(), { type: 'setReady', ready: true }, { type: 'setPeerReady', ready: true });
    expect(s.me.ready).toBe(true);
    expect(s.them?.ready).toBe(true);
  });

  it('ignores peer updates once the peer has gone', () => {
    const s = run(linked(), { type: 'peerLeft' }, { type: 'setPeerReady', ready: true });
    expect(s.them).toBeNull();
  });

  it('carries the host settings into the draft', () => {
    const s = reducer(linked(), { type: 'setDraft', draft: { mode: 'capital', rounds: 15 } });
    expect(s.draft).toEqual({ mode: 'capital', rounds: 15, scope: 'all' });
  });
});

/** What one device pressed in the menu, and the peer id it ended up with. */
interface Side { id: string; claim: boolean }

const claimOf = (side: Side): VersusAction => (side.claim
  ? { type: 'hostRoom', code: 'ACDE', id: side.id }
  : { type: 'joinRoom', code: 'ACDE', id: side.id });

/**
 * Both devices' verdicts on who hosts, after they introduce themselves.
 * Each side runs its own copy of the reducer over its own view of the pair.
 */
const settle = (a: Side, b: Side): boolean[] => {
  const verdict = (me: Side, them: Side): boolean => run(
    start(),
    claimOf(me),
    { type: 'peerHello', id: them.id, name: 'Sam', dif: 'guided', host: them.claim },
  ).isHost;
  return [verdict(a, b), verdict(b, a)];
};

describe('settling on a host', () => {
  it('takes a single claim at its word', () => {
    expect(settle({ id: 'aaa', claim: true }, { id: 'bbb', claim: false })).toEqual([true, false]);
    // The claim wins whichever way the ids happen to sort.
    expect(settle({ id: 'zzz', claim: true }, { id: 'aaa', claim: false })).toEqual([true, false]);
  });

  it('hands the room to one side when nobody claims it', () => {
    // What a host reloading onto their own invite link leaves behind: two
    // guests, and — before the ids were consulted — a lobby that never starts.
    expect(settle({ id: 'aaa', claim: false }, { id: 'bbb', claim: false })).toEqual([true, false]);
    expect(settle({ id: 'bbb', claim: false }, { id: 'aaa', claim: false })).toEqual([false, true]);
  });

  it('takes the room off one side when both claim it', () => {
    // Two people hosting the same code, the mirror image of the reload.
    expect(settle({ id: 'aaa', claim: true }, { id: 'bbb', claim: true })).toEqual([true, false]);
    expect(settle({ id: 'bbb', claim: true }, { id: 'aaa', claim: true })).toEqual([false, true]);
  });

  it('leaves exactly one host whatever the two pressed', () => {
    for (const mine of [true, false]) {
      for (const theirs of [true, false]) {
        const [a, b] = settle({ id: 'p-1', claim: mine }, { id: 'p-2', claim: theirs });
        expect(a).not.toBe(b);
      }
    }
  });

  it('holds the settled answer when the peer drops and comes back', () => {
    // The second introduction carries the settled flag, not the first claim.
    const s = run(
      start(),
      { type: 'joinRoom', code: 'ACDE', id: 'aaa' },
      { type: 'peerHello', id: 'bbb', name: 'Sam', dif: 'guided', host: false },
    );
    expect(s.isHost).toBe(true);
    const again = run(
      s,
      { type: 'peerLeft' },
      { type: 'peerHello', id: 'bbb', name: 'Sam', dif: 'guided', host: false },
    );
    expect(again.isHost).toBe(true);
  });
});

describe('match flow', () => {
  it('plans the match and sizes both answer sheets', () => {
    const s = reducer(linked(), { type: 'startMatch', cfg, difs: {}, at: 1000 });
    expect(s.phase).toBe('countdown');
    expect(s.plan).toHaveLength(5);
    expect(s.myAnswers).toHaveLength(5);
    expect(s.theirAnswers).toHaveLength(5);
    expect(s.myAnswers.every((a) => a === null)).toBe(true);
    expect(s.startedAt).toBe(1000);
  });

  it('both devices plan the identical match', () => {
    const a = reducer(linked(), { type: 'startMatch', cfg, difs: {}, at: 1 });
    const b = reducer(linked(), { type: 'startMatch', cfg, difs: {}, at: 999 });
    expect(a.plan).toEqual(b.plan);
  });

  it('hands off from the countdown to the first question', () => {
    const s = playing();
    expect(s.phase).toBe('question');
    expect(s.round).toBe(0);
    expect(s.startedAt).toBe(4000);
    expect(currentRound(s)).not.toBeNull();
  });

  it('records this side’s answer once', () => {
    let s = reducer(playing(), { type: 'answer', round: 0, answer: ans({ points: 140 }) });
    expect(s.myAnswers[0]?.points).toBe(140);
    // A second submission for the same round is ignored.
    s = reducer(s, { type: 'answer', round: 0, answer: ans({ points: 999 }) });
    expect(s.myAnswers[0]?.points).toBe(140);
  });

  it('ignores an answer for a round that is not on screen', () => {
    const s = reducer(playing(), { type: 'answer', round: 3, answer: ans() });
    expect(s.myAnswers[3]).toBeNull();
  });

  it('accepts a peer answer for a round already left behind', () => {
    // Their answer can land after this device has advanced; it still counts.
    const s = run(
      playing(),
      { type: 'advance', round: 1, at: 5000 },
      { type: 'peerAnswer', round: 0, answer: ans({ points: 120 }) },
    );
    expect(s.theirAnswers[0]?.points).toBe(120);
  });

  it('drops a duplicate or out-of-range peer answer', () => {
    let s = reducer(playing(), { type: 'peerAnswer', round: 0, answer: ans({ points: 120 }) });
    s = reducer(s, { type: 'peerAnswer', round: 0, answer: ans({ points: 500 }) });
    expect(s.theirAnswers[0]?.points).toBe(120);
    s = reducer(s, { type: 'peerAnswer', round: 99, answer: ans() });
    s = reducer(s, { type: 'peerAnswer', round: -1, answer: ans() });
    expect(s.theirAnswers).toHaveLength(5);
  });

  it('reveals only from a live question', () => {
    expect(reducer(playing(), { type: 'reveal' }).phase).toBe('reveal');
    expect(reducer(linked(), { type: 'reveal' }).phase).toBe('lobby');
  });

  it('advances to the next question and restarts its clock', () => {
    const s = reducer(playing(), { type: 'advance', round: 1, at: 9000 });
    expect(s.round).toBe(1);
    expect(s.phase).toBe('question');
    expect(s.startedAt).toBe(9000);
  });

  it('finishes rather than advancing past the last round', () => {
    const s = reducer(playing(), { type: 'advance', round: 5, at: 9000 });
    expect(s.phase).toBe('final');
  });
});

describe('scoring the match', () => {
  const finished = (): VersusState => {
    let s = playing();
    const mine = [150, 0, 130, 140, 120];
    const theirs = [100, 145, 0, 110, 130];
    for (let i = 0; i < 5; i++) {
      s = run(
        s,
        { type: 'advance', round: i, at: 1000 * i },
        { type: 'answer', round: i, answer: ans({ points: mine[i], correct: mine[i] > 0 }) },
        { type: 'peerAnswer', round: i, answer: ans({ points: theirs[i], correct: theirs[i] > 0 }) },
      );
    }
    return reducer(s, { type: 'finish' });
  };

  it('totals both sides from the answer sheets', () => {
    const s = finished();
    expect(totalOf(s.myAnswers)).toBe(540);
    expect(totalOf(s.theirAnswers)).toBe(485);
    expect(correctOf(s.myAnswers)).toBe(4);
    expect(correctOf(s.theirAnswers)).toBe(4);
  });

  it('reports the result from this device’s point of view', () => {
    const { mine, theirs, outcome } = matchResults(finished());
    expect(mine.points).toBe(540);
    expect(theirs.points).toBe(485);
    expect(mine.asked).toBe(5);
    expect(outcome).toBe('win');
  });

  it('counts an unanswered round as nothing', () => {
    const s = playing();
    expect(totalOf(s.myAnswers)).toBe(0);
    expect(correctOf(s.myAnswers)).toBe(0);
  });
});

describe('interruptions', () => {
  it('drops a mid-match disconnect back to the lobby', () => {
    const s = reducer(playing(), { type: 'peerLeft' });
    expect(s.phase).toBe('lobby');
    expect(s.link).toBe('lost');
    expect(s.them).toBeNull();
    expect(s.me.ready).toBe(false);
  });

  it('remembers the opponent’s name after they disconnect', () => {
    const s = reducer(playing(), { type: 'peerLeft' });
    expect(s.them).toBeNull();
    // The result screen still has a name to put on the scoreline.
    expect(s.lastOpponent).toBe('Sam');
  });

  it('holds a finished match on the result when the peer leaves', () => {
    const s = run(playing(), { type: 'finish' }, { type: 'peerLeft' });
    expect(s.phase).toBe('final');
  });

  it('surfaces an error without losing the room', () => {
    const s = run(
      reducer(start(), { type: 'hostRoom', code: 'ACDE', id: 'me' }),
      { type: 'setLink', link: 'error' },
      { type: 'setError', error: 'nope' },
    );
    expect(s.error).toBe('nope');
    expect(s.code).toBe('ACDE');
  });
});

describe('rematch', () => {
  it('returns to the lobby on a fresh seed and clears the sheets', () => {
    const s = reducer(run(playing(), { type: 'finish' }), { type: 'rematch' });
    expect(s.phase).toBe('lobby');
    expect(s.matchNo).toBe(1);
    expect(s.plan).toEqual([]);
    expect(s.myAnswers).toEqual([]);
    expect(s.cfg).toBeNull();
    expect(s.me.ready).toBe(false);
    expect(s.them?.ready).toBe(false);
  });

  it('notes that the other side asked first', () => {
    const s = reducer(run(playing(), { type: 'finish' }), { type: 'peerWantsAgain' });
    expect(s.theyWantAgain).toBe(true);
    expect(s.phase).toBe('final');
  });

  it('clears the request once a new match starts', () => {
    const s = run(
      playing(),
      { type: 'finish' },
      { type: 'peerWantsAgain' },
      { type: 'rematch' },
      { type: 'startMatch', cfg: { ...cfg, seed: 'ACDE:1' }, difs: {}, at: 1 },
    );
    expect(s.theyWantAgain).toBe(false);
  });

  it('leaving keeps the name but forgets the room', () => {
    const s = reducer(playing(), { type: 'leave' });
    expect(s.phase).toBe('menu');
    expect(s.me.name).toBe('Obie');
    expect(s.code).toBe('');
    expect(s.them).toBeNull();
  });
});
