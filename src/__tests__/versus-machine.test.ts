import { describe, expect, it } from 'vitest';
import {
  correctOf, currentRound, initialVersus, matchResults, reducer, settledTotal, totalOf,
} from '../versus/machine';
import type { VersusAction, VersusState } from '../versus/machine';
import type { LiveSnapshot } from '../versus/live';
import type { AnswerRow, PlayerRow, RoomRow, RoundAnswer } from '../versus/types';

const NOW = '2026-09-10T12:00:00.000Z';
const T = Date.parse(NOW);
const iso = (ms: number) => new Date(ms).toISOString();

const room = (over: Partial<RoomRow> = {}): RoomRow => ({
  code: 'ACDE', host_id: 'me', status: 'waiting', mode: 'mixed', rounds: 5, scope: 'all',
  match_no: 0, seed: null, difs: null, round: 0, round_started_at: null, updated_at: NOW, ...over,
});

const player = (id: string, over: Partial<PlayerRow> = {}): PlayerRow => ({
  room_code: 'ACDE', id, name: id === 'me' ? 'Obie' : 'Sam', dif: id === 'me' ? 'standard' : 'guided',
  ready: false, wants_again: false, ...over,
});

const row = (player_id: string, round: number, over: Partial<AnswerRow> = {}): AnswerRow => ({
  room_code: 'ACDE', match_no: 0, round, player_id, correct: true, ms: 1000, points: 140, pick: 'CA', timeout: false, ...over,
});

const snap = (
  r: Partial<RoomRow>, players: PlayerRow[], answers: AnswerRow[] = [], receivedAt = T, now = NOW,
): LiveSnapshot => ({ room: room(r), players, answers, now, receivedAt });

const ans = (over: Partial<RoundAnswer> = {}): RoundAnswer =>
  ({ correct: true, ms: 1000, points: 148, pick: 'CA', timeout: false, ...over });

const start = (): VersusState => initialVersus('Obie', 'standard', '', 'me');

const run = (s: VersusState, ...actions: VersusAction[]): VersusState => actions.reduce(reducer, s);

const both = (): PlayerRow[] => [player('me'), player('them')];

const playingRoom = (over: Partial<RoomRow> = {}): Partial<RoomRow> => ({
  status: 'playing', seed: 'ACDE:0', difs: { me: 'standard', them: 'guided' },
  round: 0, round_started_at: iso(T + 3000), ...over,
});

const entered = (asHost = true): VersusState =>
  reducer(start(), { type: 'enter', code: asHost ? '' : 'ACDE', asHost });

const waiting = (): VersusState =>
  reducer(entered(), { type: 'snapshot', snap: snap({}, [player('me')]), at: T });

const lobby = (): VersusState =>
  reducer(waiting(), { type: 'snapshot', snap: snap({ status: 'lobby' }, both()), at: T });

/** Just kicked off: on the countdown. */
const kicked = (): VersusState =>
  reducer(lobby(), { type: 'snapshot', snap: snap(playingRoom(), both()), at: T });

/** Mid-match, on round 0. */
const playing = (): VersusState =>
  reducer(kicked(), { type: 'beginQuestions', at: T + 3000 });

const finished = (): VersusState => {
  const answers: AnswerRow[] = [];
  const mine = [150, 0, 130, 140, 120];
  const theirs = [100, 145, 0, 110, 130];
  for (let i = 0; i < 5; i++) {
    answers.push(row('me', i, { points: mine[i], correct: mine[i] > 0 }));
    answers.push(row('them', i, { points: theirs[i], correct: theirs[i] > 0 }));
  }
  return reducer(playing(), { type: 'snapshot', snap: snap(playingRoom({ status: 'final', round: 4 }), both(), answers), at: T + 60000 });
};

describe('getting into a room', () => {
  it('starts on the menu with the stored name and this device’s id', () => {
    const s = start();
    expect(s.phase).toBe('menu');
    expect(s.me.name).toBe('Obie');
    expect(s.me.id).toBe('me');
    expect(s.them).toBeNull();
    expect(s.synced).toBe(false);
  });

  it('hosting waits for the server to open the room', () => {
    const s = entered();
    expect(s.phase).toBe('connecting');
    expect(s.isHost).toBe(true);
    expect(s.code).toBe('');
  });

  it('joining names the room first and waits for a seat', () => {
    const s = entered(false);
    expect(s.phase).toBe('connecting');
    expect(s.isHost).toBe(false);
    expect(s.code).toBe('ACDE');
  });

  it('the first snapshot names the room and who hosts it', () => {
    const s = waiting();
    expect(s.code).toBe('ACDE');
    expect(s.isHost).toBe(true);
    expect(s.phase).toBe('connecting');
    expect(s.synced).toBe(true);
    expect(s.them).toBeNull();
    expect(s.draft).toEqual({ mode: 'mixed', rounds: 5, scope: 'all' });
  });

  it('a second player opens the lobby', () => {
    const s = lobby();
    expect(s.phase).toBe('lobby');
    expect(s.them).toMatchObject({ id: 'them', name: 'Sam', dif: 'guided', ready: false, present: true });
    expect(s.lastOpponent).toBe('Sam');
    expect(s.error).toBeNull();
  });

  it('knows a guest from the host by the room, whatever was pressed', () => {
    const s = reducer(entered(true), { type: 'snapshot', snap: snap({ host_id: 'them', status: 'lobby' }, both()), at: T });
    expect(s.isHost).toBe(false);
  });

  it('seats a phone that comes back mid-match where it was', () => {
    const s = reducer(entered(false), { type: 'snapshot', snap: snap(playingRoom({ round: 2, round_started_at: iso(T - 5000) }), both()), at: T });
    expect(s.phase).toBe('question');
    expect(s.round).toBe(2);
    expect(s.startedAt).toBe(T - 5000);
    expect(s.plan).toHaveLength(5);
  });

  it('takes its own level and readiness from the server on arrival, and its own word after', () => {
    const arrived = reducer(entered(false), { type: 'snapshot', snap: snap({ status: 'lobby' }, [player('me', { dif: 'expert', ready: true }), player('them')]), at: T });
    expect(arrived.me.dif).toBe('expert');
    expect(arrived.me.ready).toBe(true);
    const edited = run(arrived, { type: 'setDif', dif: 'guided' }, { type: 'setReady', ready: false });
    const echoedLate = reducer(edited, { type: 'snapshot', snap: snap({ status: 'lobby' }, [player('me', { dif: 'expert', ready: true }), player('them')]), at: T });
    expect(echoedLate.me.dif).toBe('guided');
    expect(echoedLate.me.ready).toBe(false);
  });
});

describe('the lobby', () => {
  it('lets the host keep editing the rules while the server catches up', () => {
    const s = run(
      lobby(),
      { type: 'setDraft', draft: { mode: 'capital', rounds: 15 } },
      { type: 'snapshot', snap: snap({ status: 'lobby' }, both()), at: T },
    );
    expect(s.draft).toEqual({ mode: 'capital', rounds: 15, scope: 'all' });
  });

  it('shows a guest the rules as the server has them', () => {
    const guest = reducer(entered(false), { type: 'snapshot', snap: snap({ host_id: 'them', status: 'lobby' }, both()), at: T });
    const s = run(
      guest,
      { type: 'setDraft', draft: { mode: 'capital' } },
      { type: 'snapshot', snap: snap({ host_id: 'them', status: 'lobby', mode: 'border', rounds: 15 }, both()), at: T },
    );
    expect(s.draft).toEqual({ mode: 'border', rounds: 15, scope: 'all' });
  });

  it('tracks the other side’s level and readiness from their row', () => {
    const s = reducer(lobby(), { type: 'snapshot', snap: snap({ status: 'lobby' }, [player('me'), player('them', { dif: 'expert', ready: true })]), at: T });
    expect(s.them?.dif).toBe('expert');
    expect(s.them?.ready).toBe(true);
  });

  it('marks the other phone away and back', () => {
    let s = reducer(lobby(), { type: 'presence', ids: ['me'] });
    expect(s.them?.present).toBe(false);
    s = reducer(s, { type: 'snapshot', snap: snap({ status: 'lobby' }, both()), at: T });
    expect(s.them?.present).toBe(false);
    s = reducer(s, { type: 'presence', ids: ['me', 'them'] });
    expect(s.them?.present).toBe(true);
  });

  it('clears this side’s readiness when the room resets', () => {
    const ready = reducer(lobby(), { type: 'setReady', ready: true });
    expect(reducer(ready, { type: 'snapshot', snap: snap({ status: 'lobby' }, both()), at: T }).me.ready).toBe(true);
    expect(reducer(ready, { type: 'snapshot', snap: snap({}, [player('me')]), at: T }).me.ready).toBe(false);
    expect(reducer(ready, { type: 'snapshot', snap: snap({ status: 'lobby', match_no: 1 }, both()), at: T }).me.ready).toBe(false);
  });
});

describe('match flow', () => {
  it('kicks off on a countdown aligned to the server’s clock', () => {
    const s = kicked();
    expect(s.phase).toBe('countdown');
    expect(s.startedAt).toBe(T);
    expect(s.cfg).toEqual({ seed: 'ACDE:0', mode: 'mixed', rounds: 5, scope: 'all' });
    expect(s.plan).toHaveLength(5);
    expect(s.difs).toEqual({ me: 'standard', them: 'guided' });
    expect(s.myAnswers).toEqual([null, null, null, null, null]);
    expect(s.theirAnswers).toHaveLength(5);
  });

  it('a phone told late still counts down to the same moment', () => {
    const s = reducer(lobby(), { type: 'snapshot', snap: snap(playingRoom(), both()), at: T + 400 });
    expect(s.phase).toBe('countdown');
    expect(s.startedAt).toBe(T);
  });

  it('allows for this phone’s clock being off from the server’s', () => {
    // The snapshot says noon on the server; this phone's clock said noon
    // plus a minute when it arrived. Elapsed time is measured, not read.
    const s = reducer(lobby(), { type: 'snapshot', snap: snap(playingRoom(), both(), [], T + 60000), at: T + 60000 });
    expect(s.startedAt).toBe(T + 60000);
  });

  it('both devices plan the identical match', () => {
    const a = kicked();
    const b = reducer(entered(false), { type: 'snapshot', snap: snap(playingRoom({ host_id: 'them' }), both()), at: T + 999 });
    expect(a.plan).toEqual(b.plan);
  });

  it('hands off from the countdown to the first question', () => {
    const s = playing();
    expect(s.phase).toBe('question');
    expect(s.round).toBe(0);
    expect(s.startedAt).toBe(T + 3000);
    expect(currentRound(s)).not.toBeNull();
  });

  it('places the clock inside a countdown already running', () => {
    const s = reducer(entered(false), { type: 'snapshot', snap: snap(playingRoom({ round_started_at: iso(T + 1000) }), both()), at: T });
    expect(s.phase).toBe('countdown');
    expect(s.startedAt).toBe(T - 2000);
  });

  it('records this side’s answer once and keeps it until the server echoes', () => {
    let s = reducer(playing(), { type: 'answer', round: 0, answer: ans({ points: 140 }) });
    expect(s.myAnswers[0]?.points).toBe(140);
    s = reducer(s, { type: 'answer', round: 0, answer: ans({ points: 999 }) });
    expect(s.myAnswers[0]?.points).toBe(140);
    s = reducer(s, { type: 'snapshot', snap: snap(playingRoom(), both()), at: T + 5000 });
    expect(s.myAnswers[0]?.points).toBe(140);
    expect(s.phase).toBe('question');
    s = reducer(s, { type: 'snapshot', snap: snap(playingRoom(), both(), [row('me', 0, { points: 123 })]), at: T + 5000 });
    expect(s.myAnswers[0]?.points).toBe(123);
  });

  it('ignores an answer for a round that is not on screen', () => {
    const s = reducer(playing(), { type: 'answer', round: 3, answer: ans() });
    expect(s.myAnswers[3]).toBeNull();
  });

  it('takes the other side’s answer from the room', () => {
    const s = reducer(playing(), { type: 'snapshot', snap: snap(playingRoom(), both(), [row('them', 0, { points: 120 })]), at: T + 5000 });
    expect(s.theirAnswers[0]?.points).toBe(120);
    expect(s.myAnswers[0]).toBeNull();
  });

  it('reveals only from a live question', () => {
    expect(reducer(playing(), { type: 'reveal' }).phase).toBe('reveal');
    expect(reducer(lobby(), { type: 'reveal' }).phase).toBe('lobby');
  });

  it('leaves a reveal alone until the host moves on', () => {
    const revealed = reducer(playing(), { type: 'reveal' });
    const s = reducer(revealed, { type: 'snapshot', snap: snap(playingRoom(), both(), [row('me', 0), row('them', 0)]), at: T + 8000 });
    expect(s.phase).toBe('reveal');
    expect(s.startedAt).toBe(T + 3000);
  });

  it('starts the next question at this phone’s own paint', () => {
    const revealed = reducer(playing(), { type: 'reveal' });
    const s = reducer(revealed, { type: 'snapshot', snap: snap(playingRoom({ round: 1, round_started_at: iso(T + 8500) }), both()), at: T + 9000 });
    expect(s.phase).toBe('question');
    expect(s.round).toBe(1);
    expect(s.startedAt).toBe(T + 9000);
  });

  it('ends on the final snapshot', () => {
    const s = finished();
    expect(s.phase).toBe('final');
    expect(s.round).toBe(4);
    expect(s.plan).toHaveLength(5);
  });
});

describe('scoring the match', () => {
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

describe('seat colours', () => {
  it('gives the host teal and the guest coral', () => {
    const s = lobby();
    expect(s.me.color).toBe('teal');
    expect(s.them?.color).toBe('coral');
  });

  it('agrees on both phones: the guest sees the same two colours the host does', () => {
    const guest = reducer(entered(false), { type: 'snapshot', snap: snap({ host_id: 'them', status: 'lobby' }, both()), at: T });
    expect(guest.me.color).toBe('coral');
    expect(guest.them?.color).toBe('teal');
  });

  it('assumes the seat’s colour from the moment of entering, before the server answers', () => {
    expect(entered(true).me.color).toBe('teal');
    expect(entered(false).me.color).toBe('coral');
  });

  it('goes by the room, not by which button was pressed', () => {
    const s = reducer(entered(true), { type: 'snapshot', snap: snap({ host_id: 'them', status: 'lobby' }, both()), at: T });
    expect(s.me.color).toBe('coral');
    expect(s.them?.color).toBe('teal');
  });
});

describe('the score on screen', () => {
  it('does not move for an answer to the round still in play', () => {
    // The bug this guards: an answer is graded as it goes in, so the total
    // moved before the reveal — and told the player whether they were right.
    const s = reducer(playing(), { type: 'answer', round: 0, answer: ans({ points: 140 }) });
    expect(totalOf(s.myAnswers)).toBe(140);
    expect(settledTotal(s, s.myAnswers)).toBe(0);
  });

  it('nor for the other side’s answer, which arrives before the reveal too', () => {
    const s = reducer(playing(), { type: 'snapshot', snap: snap(playingRoom(), both(), [row('them', 0, { points: 120 })]), at: T + 5000 });
    expect(settledTotal(s, s.theirAnswers)).toBe(0);
  });

  it('counts the round once it is revealed', () => {
    const answered = reducer(playing(), { type: 'answer', round: 0, answer: ans({ points: 140 }) });
    const s = reducer(answered, { type: 'reveal' });
    expect(settledTotal(s, s.myAnswers)).toBe(140);
  });

  it('keeps earlier rounds in while a later one is live', () => {
    const revealed = reducer(reducer(playing(), { type: 'answer', round: 0, answer: ans({ points: 140 }) }), { type: 'reveal' });
    const next = reducer(revealed, { type: 'snapshot', snap: snap(playingRoom({ round: 1, round_started_at: iso(T + 9000) }), both(), [row('me', 0, { points: 140 })]), at: T + 9000 });
    expect(next.phase).toBe('question');
    expect(next.round).toBe(1);
    const s = reducer(next, { type: 'answer', round: 1, answer: ans({ points: 130 }) });
    expect(settledTotal(s, s.myAnswers)).toBe(140);
    expect(settledTotal(reducer(s, { type: 'reveal' }), s.myAnswers)).toBe(270);
  });

  it('counts everything at the final', () => {
    const s = finished();
    expect(settledTotal(s, s.myAnswers)).toBe(540);
    expect(settledTotal(s, s.theirAnswers)).toBe(485);
  });
});

describe('interruptions', () => {
  it('hands the host the waiting room when the guest leaves', () => {
    const s = reducer(playing(), { type: 'snapshot', snap: snap({}, [player('me')]), at: T + 9000 });
    expect(s.phase).toBe('connecting');
    expect(s.them).toBeNull();
    expect(s.code).toBe('ACDE');
    expect(s.lastOpponent).toBe('Sam');
    expect(s.me.ready).toBe(false);
    expect(s.plan).toEqual([]);
  });

  it('keeps a finished match on screen when the guest leaves', () => {
    const s = reducer(finished(), { type: 'snapshot', snap: snap({}, [player('me')]), at: T + 90000 });
    expect(s.phase).toBe('final');
    expect(s.them).toBeNull();
    expect(s.lastOpponent).toBe('Sam');
    expect(totalOf(s.myAnswers)).toBe(540);
  });

  it('opens the lobby again when somebody new sits down after that', () => {
    const alone = reducer(finished(), { type: 'snapshot', snap: snap({}, [player('me')]), at: T + 90000 });
    const s = reducer(alone, { type: 'snapshot', snap: snap({ status: 'lobby' }, [player('me'), player('kim', { name: 'Kim' })]), at: T + 99000 });
    expect(s.phase).toBe('lobby');
    expect(s.them?.name).toBe('Kim');
    expect(s.plan).toEqual([]);
  });

  it('sends a guest home, with the reason, when the host closes the room', () => {
    const guest = reducer(entered(false), { type: 'snapshot', snap: snap({ host_id: 'them', status: 'lobby' }, both()), at: T });
    const s = reducer(guest, { type: 'snapshot', snap: snap({ host_id: 'them', status: 'closed' }, both()), at: T + 1 });
    expect(s.phase).toBe('menu');
    expect(s.code).toBe('');
    expect(s.them).toBeNull();
    expect(s.error).toMatch(/closed/);
    expect(s.me.name).toBe('Obie');
    expect(s.me.id).toBe('me');
  });

  it('keeps a finished match on screen when the host closes the room', () => {
    const s = reducer(finished(), { type: 'snapshot', snap: snap(playingRoom({ status: 'closed' }), both()), at: T + 1 });
    expect(s.phase).toBe('final');
    expect(s.them).toBeNull();
  });

  it('does the same when the server refuses the room outright', () => {
    const s = reducer(lobby(), { type: 'roomClosed', error: 'That room has closed: its host left.' });
    expect(s.phase).toBe('menu');
    expect(s.error).toMatch(/closed/);
    expect(reducer(finished(), { type: 'roomClosed', error: 'gone' }).phase).toBe('final');
  });

  it('surfaces an error without losing the room', () => {
    const s = run(waiting(), { type: 'setLink', link: 'lost' }, { type: 'setError', error: 'nope' });
    expect(s.error).toBe('nope');
    expect(s.link).toBe('lost');
    expect(s.code).toBe('ACDE');
    expect(reducer(s, { type: 'snapshot', snap: snap({}, [player('me')]), at: T }).error).toBeNull();
  });
});

describe('rematch', () => {
  it('returns to the lobby on the next match and clears the sheets', () => {
    const s = reducer(finished(), { type: 'snapshot', snap: snap({ status: 'lobby', match_no: 1 }, both()), at: T + 70000 });
    expect(s.phase).toBe('lobby');
    expect(s.matchNo).toBe(1);
    expect(s.plan).toEqual([]);
    expect(s.myAnswers).toEqual([]);
    expect(s.cfg).toBeNull();
    expect(s.me.ready).toBe(false);
    expect(s.them?.ready).toBe(false);
  });

  it('notes that the other side asked first', () => {
    const s = reducer(finished(), { type: 'snapshot', snap: snap(playingRoom({ status: 'final', round: 4 }), [player('me'), player('them', { wants_again: true })]), at: T + 70000 });
    expect(s.theyWantAgain).toBe(true);
    expect(s.phase).toBe('final');
  });

  it('plays the second match on a fresh seed', () => {
    const again = reducer(finished(), { type: 'snapshot', snap: snap({ status: 'lobby', match_no: 1 }, both()), at: T + 70000 });
    const s = reducer(again, { type: 'snapshot', snap: snap(playingRoom({ match_no: 1, seed: 'ACDE:1', round_started_at: iso(T + 80000) }), both()), at: T + 77000 });
    expect(s.phase).toBe('countdown');
    expect(s.cfg?.seed).toBe('ACDE:1');
    expect(s.theyWantAgain).toBe(false);
  });

  it('leaving keeps the name and id but forgets the room', () => {
    const s = reducer(playing(), { type: 'leave' });
    expect(s.phase).toBe('menu');
    expect(s.me.name).toBe('Obie');
    expect(s.me.id).toBe('me');
    expect(s.code).toBe('');
    expect(s.them).toBeNull();
  });
});
