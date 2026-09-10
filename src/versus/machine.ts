import { planMatch } from './plan';
import { outcomeOf } from './scoring';
import { COUNTDOWN_MS } from './timing';
import type {
  AnswerRow, LinkState, MatchConfig, Phase, Player, PlannedRound, RoundAnswer,
} from './types';
import type { LiveSnapshot } from './live';
import type { DiffKey, ModeKey, Scope } from '../types';

/**
 * The whole of a versus session, on one device.
 *
 * The server holds the room, and every change to it arrives here as a
 * snapshot. What this reducer adds is the part that has to be local: which
 * screen is up, when the clock on it started, and the answer this side has
 * just given before the server has echoed it back. Both phones run this over
 * the same room and land on the same screens without either sending the
 * other anything.
 *
 * Clocks are local on purpose. A question's timer starts when it is painted
 * on this phone, not when the server wrote the row, so a slow link costs a
 * player nothing. The server's time is consulted only to place the clock
 * when a phone joins a match already in progress.
 */
export interface VersusState {
  phase: Phase;
  link: LinkState;
  /** The room code, once one has been created or joined. */
  code: string;
  /** Whether this device hosts the room, and so drives the match. */
  isHost: boolean;
  me: Player;
  them: Player | null;
  /** The rules on offer: the host's own edits, or what the server says. */
  draft: { mode: ModeKey; rounds: number; scope: Scope };
  cfg: MatchConfig | null;
  plan: PlannedRound[];
  /** Levels locked in at kick-off, so a mid-match change cannot skew scoring. */
  difs: Record<string, DiffKey>;
  round: number;
  /**
   * When the thing on screen started: the countdown, then each question.
   * Passed in with the action rather than read from the clock, so the reducer
   * stays pure and each device times from its own paint.
   */
  startedAt: number;
  myAnswers: (RoundAnswer | null)[];
  theirAnswers: (RoundAnswer | null)[];
  /** How many matches this room has played; feeds the next seed. */
  matchNo: number;
  /** Set when the other side asks for a rematch before this side has. */
  theyWantAgain: boolean;
  /**
   * The opponent's name, kept after they go. `them` goes null so the lobby
   * knows there is nobody to play, but a result screen still wants to say
   * "Sam has left" rather than "Opponent has left".
   */
  lastOpponent: string;
  /** Whether the room on screen has been seen from the server yet. */
  synced: boolean;
  error: string | null;
}

export type VersusAction =
  | { type: 'setLink'; link: LinkState }
  | { type: 'setError'; error: string | null }
  | { type: 'enter'; code: string; asHost: boolean }
  | { type: 'snapshot'; snap: LiveSnapshot; at: number }
  | { type: 'presence'; ids: string[] }
  | { type: 'setName'; name: string }
  | { type: 'setDif'; dif: DiffKey }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setDraft'; draft: Partial<VersusState['draft']> }
  | { type: 'beginQuestions'; at: number }
  | { type: 'answer'; round: number; answer: RoundAnswer }
  | { type: 'reveal' }
  | { type: 'roomClosed'; error: string }
  | { type: 'leave' };

const emptyPlayer = (id: string, name: string, dif: DiffKey): Player =>
  ({ id, name, dif, ready: false, self: true, present: true });

export function initialVersus(name: string, dif: DiffKey, code = '', id = ''): VersusState {
  return {
    phase: 'menu',
    link: 'idle',
    code,
    isHost: false,
    me: emptyPlayer(id, name, dif),
    them: null,
    draft: { mode: 'mixed', rounds: 10, scope: 'all' },
    cfg: null,
    plan: [],
    difs: {},
    round: 0,
    startedAt: 0,
    myAnswers: [],
    theirAnswers: [],
    matchNo: 0,
    theyWantAgain: false,
    lastOpponent: '',
    synced: false,
    error: null,
  };
}

/** Both sides have an answer in for the round on screen. */
export const bothAnswered = (s: VersusState): boolean =>
  s.myAnswers[s.round] != null && s.theirAnswers[s.round] != null;

/** Running total, so the score is always derived rather than tracked. */
export const totalOf = (answers: (RoundAnswer | null)[]): number =>
  answers.reduce((n, a) => n + (a?.points ?? 0), 0);

export const correctOf = (answers: (RoundAnswer | null)[]): number =>
  answers.reduce((n, a) => n + (a?.correct ? 1 : 0), 0);

/** The round currently on screen, or null outside a match. */
export const currentRound = (s: VersusState): PlannedRound | null =>
  s.plan[s.round] ?? null;

const inMatch = (phase: Phase): boolean =>
  phase === 'countdown' || phase === 'question' || phase === 'reveal';

/** One side's answer sheet: the server's rows, with this side's own unechoed answers kept. */
function sheet(
  answers: AnswerRow[], id: string | undefined, length: number, local: (RoundAnswer | null)[],
): (RoundAnswer | null)[] {
  return Array.from({ length }, (_, i) => {
    const row = id ? answers.find((a) => a.round === i && a.player_id === id) : undefined;
    if (row) {
      return { correct: row.correct, ms: row.ms, points: row.points, pick: row.pick, timeout: row.timeout };
    }
    return local[i] ?? null;
  });
}

function applySnapshot(s: VersusState, snap: LiveSnapshot, at: number): VersusState {
  const { room, players, answers } = snap;

  if (room.status === 'closed') {
    // The host has gone for good. A finished match keeps its result on
    // screen; anything earlier goes back to the front door, with the reason.
    if (s.phase === 'final') return { ...s, them: null };
    return { ...initialVersus(s.me.name, s.me.dif, '', s.me.id), error: 'The host closed the room.' };
  }

  const meRow = players.find((p) => p.id === s.me.id);
  const themRow = players.find((p) => p.id !== s.me.id);
  const isHost = room.host_id === s.me.id;

  // A guest leaving at the result leaves the result up: the sheets stay as
  // they were until the host leaves or somebody new sits down.
  if (room.status === 'waiting' && s.phase === 'final' && s.synced) {
    return { ...s, them: null, me: { ...s.me, ready: false }, theyWantAgain: false, error: null };
  }

  // This side's own level and readiness are its own to set, and the server
  // only ever echoes them — except at a rematch or a reset, which clears
  // readiness on both sides. On arrival, the server's word is all there is.
  const reset = room.status === 'waiting' || (s.synced && s.matchNo !== room.match_no);
  const me: Player = {
    ...s.me,
    name: meRow?.name ?? s.me.name,
    dif: s.synced ? s.me.dif : (meRow?.dif ?? s.me.dif),
    ready: !s.synced ? (meRow?.ready ?? false) : reset ? false : s.me.ready,
  };
  const them: Player | null = themRow ? {
    id: themRow.id, name: themRow.name, dif: themRow.dif, ready: themRow.ready, self: false,
    present: s.them?.id === themRow.id ? s.them.present : true,
  } : null;

  // The host's rules are theirs to edit and only echoed back; a guest reads them.
  const draft = isHost && s.synced
    ? s.draft
    : { mode: room.mode, rounds: room.rounds, scope: room.scope };

  const cfg: MatchConfig | null = room.seed
    ? { seed: room.seed, mode: room.mode, rounds: room.rounds, scope: room.scope }
    : null;
  const sameMatch = cfg !== null && s.cfg?.seed === cfg.seed;
  const plan = cfg ? (sameMatch ? s.plan : planMatch(cfg)) : [];
  const myAnswers = sheet(answers, s.me.id, plan.length, sameMatch ? s.myAnswers : []);
  const theirAnswers = sheet(answers, them?.id, plan.length, []);

  let { phase, round, startedAt } = s;
  switch (room.status) {
    case 'waiting':
      phase = 'connecting';
      round = 0;
      startedAt = 0;
      break;
    case 'lobby':
      phase = 'lobby';
      round = 0;
      startedAt = 0;
      break;
    case 'playing':
      if (sameMatch && inMatch(s.phase)) {
        // Live: the host moved the match on. The clock starts at this paint.
        if (room.round !== s.round) {
          phase = 'question';
          round = room.round;
          startedAt = at;
        }
      } else {
        // A match just started, or this phone is joining one in progress:
        // place the clock where the server says it is.
        const serverNow = at + (Date.parse(snap.now) - snap.receivedAt);
        const elapsed = serverNow - Date.parse(room.round_started_at ?? snap.now);
        if (elapsed < 0) {
          phase = 'countdown';
          round = 0;
          startedAt = at - (COUNTDOWN_MS + elapsed);
        } else {
          phase = 'question';
          round = room.round;
          startedAt = at - elapsed;
        }
      }
      break;
    case 'final':
      phase = 'final';
      round = room.round;
      break;
  }

  return {
    ...s,
    phase,
    code: room.code,
    isHost,
    me,
    them,
    draft,
    cfg,
    plan,
    difs: room.difs ?? {},
    round,
    startedAt,
    myAnswers,
    theirAnswers,
    matchNo: room.match_no,
    theyWantAgain: themRow?.wants_again ?? false,
    lastOpponent: them?.name ?? s.lastOpponent,
    synced: true,
    error: null,
  };
}

export function reducer(s: VersusState, a: VersusAction): VersusState {
  switch (a.type) {
    case 'setLink':
      return { ...s, link: a.link };

    case 'setError':
      return { ...s, error: a.error };

    case 'enter':
      return {
        ...initialVersus(s.me.name, s.me.dif, a.code, s.me.id),
        phase: 'connecting', isHost: a.asHost, lastOpponent: '',
      };

    case 'snapshot':
      return applySnapshot(s, a.snap, a.at);

    case 'presence':
      return s.them ? { ...s, them: { ...s.them, present: a.ids.includes(s.them.id) } } : s;

    case 'setName':
      return { ...s, me: { ...s.me, name: a.name } };

    case 'setDif':
      return { ...s, me: { ...s.me, dif: a.dif } };

    case 'setReady':
      return { ...s, me: { ...s.me, ready: a.ready } };

    case 'setDraft':
      return { ...s, draft: { ...s.draft, ...a.draft } };

    case 'beginQuestions':
      return s.phase === 'countdown' ? { ...s, phase: 'question', startedAt: a.at } : s;

    case 'answer': {
      // Late or duplicate submissions are ignored: the first one stands.
      if (s.phase !== 'question' && s.phase !== 'reveal') return s;
      if (a.round !== s.round || s.myAnswers[a.round] != null) return s;
      const myAnswers = [...s.myAnswers];
      myAnswers[a.round] = a.answer;
      return { ...s, myAnswers };
    }

    case 'reveal':
      return s.phase === 'question' ? { ...s, phase: 'reveal' } : s;

    case 'roomClosed':
      // Nowhere to be: back to the front door, with the reason. A finished
      // match keeps its result on screen.
      if (s.phase === 'final') return { ...s, them: null };
      return { ...initialVersus(s.me.name, s.me.dif, '', s.me.id), error: a.error };

    case 'leave':
      return initialVersus(s.me.name, s.me.dif, '', s.me.id);
  }
}

/** The finished match, in the shape the leaderboard wants. */
export function matchResults(s: VersusState): {
  mine: { points: number; correct: number; asked: number };
  theirs: { points: number; correct: number; asked: number };
  outcome: 'win' | 'loss' | 'draw';
} {
  const mine = {
    points: totalOf(s.myAnswers),
    correct: correctOf(s.myAnswers),
    asked: s.plan.length,
  };
  const theirs = {
    points: totalOf(s.theirAnswers),
    correct: correctOf(s.theirAnswers),
    asked: s.plan.length,
  };
  return { mine, theirs, outcome: outcomeOf(mine.points, theirs.points) };
}
