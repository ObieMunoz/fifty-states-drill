import { planMatch } from './plan';
import { outcomeOf } from './scoring';
import type {
  LinkState, MatchConfig, Phase, Player, PlannedRound, RoundAnswer,
} from './types';
import type { DiffKey, ModeKey, Scope } from '../types';

/**
 * The whole of a versus session, on one device.
 *
 * Both peers run this reducer over the same message stream, so the two copies
 * stay in step without either side sending its screen to the other. The host
 * is the only one that decides when a round ends; everything else — scoring,
 * question building, totals — each device works out for itself from the seed.
 */
export interface VersusState {
  phase: Phase;
  link: LinkState;
  /** The room code, once one has been created or joined. */
  code: string;
  /** Whether this device created the room, and so drives the match. */
  isHost: boolean;
  me: Player;
  them: Player | null;
  /** Settings the host is offering, editable in the lobby. */
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
   * The opponent's name, kept after they disconnect. `them` goes null so the
   * lobby knows there is nobody to play, but a result screen still wants to
   * say "Sam has left" rather than "Opponent has left".
   */
  lastOpponent: string;
  error: string | null;
}

export type VersusAction =
  | { type: 'setLink'; link: LinkState }
  | { type: 'setError'; error: string | null }
  | { type: 'hostRoom'; code: string; id: string }
  | { type: 'joinRoom'; code: string; id: string }
  | { type: 'setSelfId'; id: string }
  | { type: 'peerHello'; id: string; name: string; dif: DiffKey; host: boolean }
  | { type: 'peerLeft' }
  | { type: 'peerQuit' }
  | { type: 'roomClosed'; error: string }
  | { type: 'setName'; name: string }
  | { type: 'setDif'; dif: DiffKey }
  | { type: 'setPeerDif'; dif: DiffKey }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setPeerReady'; ready: boolean }
  | { type: 'setDraft'; draft: Partial<VersusState['draft']> }
  | { type: 'startMatch'; cfg: MatchConfig; difs: Record<string, DiffKey>; at: number }
  | { type: 'beginQuestions'; at: number }
  | { type: 'answer'; round: number; answer: RoundAnswer }
  | { type: 'peerAnswer'; round: number; answer: RoundAnswer }
  | { type: 'reveal' }
  | { type: 'advance'; round: number; at: number }
  | { type: 'finish' }
  | { type: 'peerWantsAgain' }
  | { type: 'rematch' }
  | { type: 'leave' };

const emptyPlayer = (id: string, name: string, dif: DiffKey): Player =>
  ({ id, name, dif, ready: false, self: true });

export function initialVersus(name: string, dif: DiffKey, code = ''): VersusState {
  return {
    phase: 'menu',
    link: 'idle',
    code,
    isHost: false,
    me: emptyPlayer('', name, dif),
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

/**
 * Which side drives the match, settled the moment the two devices meet.
 *
 * Pressing Host or Join is only a claim, and it can be wrong: someone who
 * hosted a room and then reloaded onto their own invite link joins it as a
 * guest, and nobody is left claiming the room. Two people hosting the same
 * code is the mirror image. Both sides run this over the same pair of claims
 * and the same pair of peer ids, so they land on the same answer without
 * another round trip.
 */
export function resolveHost(
  mine: boolean, theirs: boolean, myId: string, theirId: string,
): boolean {
  // Exactly one side claiming the room is the ordinary case: take it as told.
  if (mine !== theirs) return mine;
  // Nobody claimed it, or both did. The lower peer id takes it, on both screens.
  return myId < theirId;
}

export function reducer(s: VersusState, a: VersusAction): VersusState {
  switch (a.type) {
    case 'setLink':
      // Losing the peer mid-match drops back to the lobby rather than
      // pretending a half-finished match is still live.
      return { ...s, link: a.link };

    case 'setError':
      return { ...s, error: a.error };

    case 'hostRoom':
      return {
        ...s,
        phase: 'connecting', link: 'searching', code: a.code, isHost: true,
        me: { ...s.me, id: a.id, ready: false }, them: null, error: null,
      };

    case 'joinRoom':
      return {
        ...s,
        phase: 'connecting', link: 'searching', code: a.code, isHost: false,
        me: { ...s.me, id: a.id, ready: false }, them: null, error: null,
      };

    case 'setSelfId':
      // Lands on its own rather than by re-running `hostRoom`, which would
      // throw away a peer that had already introduced itself.
      return { ...s, me: { ...s.me, id: a.id } };

    case 'peerHello':
      return {
        ...s,
        phase: s.phase === 'connecting' ? 'lobby' : s.phase,
        link: 'linked',
        // The claim each side pressed is only an opening bid; reconcile it now.
        isHost: resolveHost(s.isHost, a.host, s.me.id, a.id),
        them: { id: a.id, name: a.name, dif: a.dif, ready: false, self: false },
        lastOpponent: a.name,
        error: null,
      };

    case 'peerLeft':
      // Nothing to lose at the front door or the waiting room: this is the
      // peer's own departure arriving after they have already been seen off.
      if (s.phase === 'menu' || s.phase === 'connecting') return s;
      return {
        ...s,
        link: 'lost',
        them: null,
        // A match cannot continue one-sided; hold at the result if it finished.
        phase: s.phase === 'final' ? 'final' : 'lobby',
        me: { ...s.me, ready: false },
      };

    case 'peerQuit':
      // Gone on purpose, so not coming back — but the room is still this
      // side's to keep. Back to the waiting room with the code up for the next
      // player, rather than a lobby waiting on a reconnect that will not come.
      // A finished match keeps its result on screen.
      if (s.phase === 'final') return reducer(s, { type: 'peerLeft' });
      return {
        ...s,
        phase: 'connecting',
        link: 'searching',
        them: null,
        lastOpponent: s.them?.name ?? s.lastOpponent,
        theyWantAgain: false,
        me: { ...s.me, ready: false },
      };

    case 'roomClosed':
      // The host has gone for good — hosting again draws a fresh code — so
      // there is nobody to wait for. A finished match keeps its result on
      // screen; anything earlier goes back to the front door, with the reason.
      if (s.phase === 'final') return reducer(s, { type: 'peerLeft' });
      return { ...initialVersus(s.me.name, s.me.dif), error: a.error };

    case 'setName':
      return { ...s, me: { ...s.me, name: a.name } };

    case 'setDif':
      return { ...s, me: { ...s.me, dif: a.dif } };

    case 'setPeerDif':
      return s.them ? { ...s, them: { ...s.them, dif: a.dif } } : s;

    case 'setReady':
      return { ...s, me: { ...s.me, ready: a.ready } };

    case 'setPeerReady':
      return s.them ? { ...s, them: { ...s.them, ready: a.ready } } : s;

    case 'setDraft':
      return { ...s, draft: { ...s.draft, ...a.draft } };

    case 'startMatch': {
      const plan = planMatch(a.cfg);
      return {
        ...s,
        phase: 'countdown',
        cfg: a.cfg,
        plan,
        difs: a.difs,
        round: 0,
        startedAt: a.at,
        myAnswers: Array.from({ length: plan.length }, () => null),
        theirAnswers: Array.from({ length: plan.length }, () => null),
        theyWantAgain: false,
        error: null,
      };
    }

    case 'beginQuestions':
      return s.phase === 'countdown' ? { ...s, phase: 'question', startedAt: a.at } : s;

    case 'answer': {
      // Late or duplicate submissions are ignored: the first one stands.
      if (a.round !== s.round || s.myAnswers[a.round] != null) return s;
      const myAnswers = [...s.myAnswers];
      myAnswers[a.round] = a.answer;
      return { ...s, myAnswers };
    }

    case 'peerAnswer': {
      // An answer can arrive for a round this device has already left behind,
      // so index by the round it names rather than the one on screen.
      if (a.round < 0 || a.round >= s.theirAnswers.length) return s;
      if (s.theirAnswers[a.round] != null) return s;
      const theirAnswers = [...s.theirAnswers];
      theirAnswers[a.round] = a.answer;
      return { ...s, theirAnswers };
    }

    case 'reveal':
      return s.phase === 'question' ? { ...s, phase: 'reveal' } : s;

    case 'advance': {
      if (a.round >= s.plan.length) return { ...s, phase: 'final' };
      return { ...s, round: a.round, phase: 'question', startedAt: a.at };
    }

    case 'finish':
      return { ...s, phase: 'final' };

    case 'peerWantsAgain':
      return { ...s, theyWantAgain: true };

    case 'rematch':
      return {
        ...s,
        phase: 'lobby',
        cfg: null,
        plan: [],
        round: 0,
        startedAt: 0,
        myAnswers: [],
        theirAnswers: [],
        matchNo: s.matchNo + 1,
        theyWantAgain: false,
        me: { ...s.me, ready: false },
        them: s.them ? { ...s.them, ready: false } : null,
      };

    case 'leave':
      return {
        ...initialVersus(s.me.name, s.me.dif),
        // The board is device-local, so a name survives leaving a room.
        me: { ...emptyPlayer('', s.me.name, s.me.dif) },
      };
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
