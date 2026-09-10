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

/**
 * The two seat colours. They belong to the seat, not the screen: the host is
 * always teal and the guest always coral on *both* phones, so a pick painted
 * coral means the same player wherever it is seen.
 */
export const PLAYER_COLORS = ['teal', 'coral'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export const COLOR_LABEL: Record<PlayerColor, string> = { teal: 'Teal', coral: 'Coral' };

/** The host takes the first colour; whoever joins takes the other. */
export const colorOf = (isHost: boolean): PlayerColor => (isHost ? 'teal' : 'coral');

/** One player, as either device sees them. */
export interface Player {
  id: string;
  name: string;
  /** Their seat colour, the same on both phones. */
  color: PlayerColor;
  /** Per-player handicap: each side picks their own level, both sides see it. */
  dif: DiffKey;
  ready: boolean;
  /** True for the player on this device. */
  self: boolean;
  /** Whether their phone is on the room right now, as far as presence can tell. */
  present: boolean;
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

/** This phone's own connection to the room, so the UI can be honest about it. */
export type LinkState = 'idle' | 'linked' | 'lost' | 'error';

/** Where a room is in its life, as the server records it. */
export type RoomStatus = 'waiting' | 'lobby' | 'playing' | 'final' | 'closed';

/**
 * The server's rows, as both the API and the phones see them.
 *
 * Snake case throughout: these are the database columns, and Realtime
 * delivers them verbatim, so renaming on the way in would mean two shapes.
 */
export interface RoomRow {
  code: string;
  host_id: string;
  status: RoomStatus;
  mode: ModeKey;
  rounds: number;
  scope: Scope;
  /** Counts up on every rematch; feeds the seed. */
  match_no: number;
  /** Set at kick-off; null in the lobby. */
  seed: string | null;
  /** Levels locked at kick-off, by player id. */
  difs: Record<string, DiffKey> | null;
  round: number;
  /**
   * When the question on screen is meant to have appeared, on the server's
   * clock. Kick-off plus the countdown at the start, then now on each advance.
   * A phone that reloads mid-match resumes its clock from this.
   */
  round_started_at: string | null;
  updated_at: string;
}

export interface PlayerRow {
  room_code: string;
  id: string;
  name: string;
  dif: DiffKey;
  ready: boolean;
  wants_again: boolean;
}

export interface AnswerRow {
  room_code: string;
  match_no: number;
  round: number;
  player_id: string;
  correct: boolean;
  ms: number;
  points: number;
  pick: string | null;
  timeout: boolean;
}

/** Everything about a room, as the API answers every call. */
export interface Snapshot {
  room: RoomRow;
  players: PlayerRow[];
  /** Answers for the current match only. */
  answers: AnswerRow[];
  /** The server's clock when this was taken, for recovering a round's timing. */
  now: string;
}
