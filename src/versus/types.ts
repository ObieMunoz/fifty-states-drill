import type { Abbr, DiffKey, ModeKey, Scope } from '../types';

/**
 * The quiz types a match can be played on: the six scored tracks, plus Mixed,
 * which shuffles between them. Roll Call and Name All 50 are long-form solo
 * sprints rather than one-question-at-a-time, so they sit this out.
 */
export const VERSUS_MODES: ModeKey[] = ['mixed', 'find', 'name', 'shape', 'capital', 'code', 'border'];

export const ROUND_CHOICES = [5, 10, 15] as const;
export type RoundCount = (typeof ROUND_CHOICES)[number];

/** Everything both devices need to generate the identical question sequence. */
export interface MatchConfig {
  /** Drives every draw in the match. Sent by the host at kick-off. */
  seed: string;
  mode: ModeKey;
  rounds: number;
  scope: Scope;
}

/** One player, as either device sees them. */
export interface Player {
  id: string;
  name: string;
  /** Per-player handicap: each side picks their own level, both sides see it. */
  dif: DiffKey;
  ready: boolean;
  /** True for the player on this device. */
  self: boolean;
}

/** One round, as planned identically on both devices from the seed. */
export interface PlannedRound {
  /** The question type actually asked; differs from the match mode in Mixed. */
  qm: ModeKey;
  /** The state being asked about. */
  abbr: Abbr;
}

/** What one player did on one round. */
export interface RoundAnswer {
  correct: boolean;
  /** Milliseconds from the question appearing to the answer landing. */
  ms: number;
  points: number;
  /** What they picked or typed, shown to the opponent on the reveal. */
  pick: string | null;
  /** True when the clock ran out with nothing submitted. */
  timeout: boolean;
}

export type Phase =
  | 'menu'
  | 'connecting'
  | 'lobby'
  | 'countdown'
  | 'question'
  | 'reveal'
  | 'final';

/** Connection status, surfaced so the UI can be honest about what is happening. */
export type LinkState = 'idle' | 'searching' | 'linked' | 'lost' | 'error';

/** A protocol message. Kept terse: these cross a data channel on a phone. */
export type Msg =
  | { t: 'hi'; name: string; dif: DiffKey; host: boolean; ver: number }
  | { t: 'cfg'; mode: ModeKey; rounds: number; scope: Scope }
  | { t: 'dif'; dif: DiffKey }
  | { t: 'rdy'; ready: boolean }
  | { t: 'go'; cfg: MatchConfig; difs: Record<string, DiffKey> }
  | { t: 'ans'; round: number; correct: boolean; ms: number; points: number; pick: string | null; timeout: boolean }
  | { t: 'nxt'; round: number }
  | { t: 'end' }
  | { t: 'again' }
  /**
   * Leaving on purpose, as opposed to dropping off. From the host this closes
   * the room: hosting again draws a fresh code, so a guest left behind would
   * be waiting for nobody. From a guest it is just the peer going away.
   */
  | { t: 'bye' };

/** Bumped when the wire format changes in a way old clients cannot read. */
export const PROTOCOL_VERSION = 1;
