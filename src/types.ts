import type { Abbr } from './data/abbr';

export type { Abbr };

export type Region = 'Northeast' | 'South' | 'Midwest' | 'West';

export type Division =
  | 'New England'
  | 'Middle Atlantic'
  | 'South Atlantic'
  | 'East South Central'
  | 'West South Central'
  | 'East North Central'
  | 'West North Central'
  | 'Mountain'
  | 'Pacific';

/**
 * One state, as decoded from the us-atlas TopoJSON. Field names are terse
 * because there are fifty of these inlined in the bundle; see `states.json`.
 */
export interface State {
  /** Name, e.g. "Alabama". */
  n: string;
  /** Two-letter postal code. */
  a: Abbr;
  /** Capital city. */
  cap: string;
  /** Order of admission, 1–50. */
  ord: number;
  /** Date of admission, e.g. "Dec 14, 1819". */
  adm: string;
  nick: string;
  div: Division;
  reg: Region;
  /** SVG path data in the Albers projection used by the map. */
  d: string;
  /** Label anchor point, [x, y]. */
  c: [number, number];
  /** Bounding box, [x0, y0, x1, y1]. */
  bb: [number, number, number, number];
  /** Approximate projected area; drives hit-target padding and label culling. */
  ar: number;
  /** States sharing a land border. */
  nb: Abbr[];
  /** Neighbours plus their neighbours — the pool for plausible decoys. */
  nr: Abbr[];
}

/** A quiz type that carries its own per-state mastery level. */
export type Track = 'find' | 'name' | 'shape' | 'capital' | 'code' | 'border';

export type ModeKey =
  | 'map' | 'letter' | 'cards' | 'hooks' | 'weak'
  | 'find' | 'name' | 'shape' | 'roll' | 'all50'
  | 'capital' | 'code' | 'border' | 'mixed';

export type ModeKind =
  | 'explore' | 'letters' | 'cards' | 'hooks' | 'weak'
  | 'click' | 'choice' | 'roll' | 'recall' | 'type';

export interface Mode {
  /** Which tab group the mode sits in. */
  g: 'learn' | 'quiz';
  label: string;
  kind: ModeKind;
  /** Modes that hide the map entirely and centre the control card. */
  nomap?: boolean;
  /**
   * Reference modes: the panel is a list that drives the map rather than a
   * question. They give the roster's column over to the panel, and on phones
   * the map moves above the panel so tapping an entry has something visible
   * to light up.
   */
  reference?: boolean;
}

/** Colour scheme: `system` defers to prefers-color-scheme. */
export type Theme = 'system' | 'light' | 'dark';

export type DiffKey = 'guided' | 'standard' | 'expert';

export interface Difficulty {
  label: string;
  /** Attempts allowed in Find It before the answer is revealed. */
  tries: number;
  /** Find It: dim every state outside the target's census division. */
  regionHint: boolean;
  /** Offer multiple choice for modes that would otherwise take typed input. */
  forceChoice: boolean;
  /** Draw decoys from other regions instead of from neighbours. */
  easyDistractors: boolean;
  /** Name It / Silhouette take a typed name rather than four options. */
  typeNames: boolean;
  /** Codes runs backwards: given "DE", name the state. */
  reverseCode: boolean;
  /** Highlight the state being asked about on the map. */
  showTarget: boolean;
  /** Split recall answers into per-letter groups. */
  letterGroups: boolean;
  /** Size the blank placeholders to each missing name. */
  lengths: boolean;
  /** Highest mastery level reachable at this difficulty. */
  cap: number;
  blurb: string;
}

/** Attempts and correct answers for one state on one track. */
export interface TrackRecord {
  a: number;
  c: number;
}

/**
 * Everything persisted to localStorage. The shape is the one written by the
 * pre-React version under the same key, so existing progress carries over.
 */
export interface Progress {
  /** Mastery level 0–3 per state, per track. */
  lv: Record<string, Partial<Record<Track, number>>>;
  /** Running count of wrong answers per state; also set by "Need work". */
  err: Record<string, number>;
  /** Best Name All 50 time in ms, keyed by scope. */
  best: Record<string, number>;
  /** Attempt tallies per state, per track. Absent until the first answer. */
  st?: Record<string, Partial<Record<Track, TrackRecord>>>;
  /** Last difficulty chosen. */
  dif?: DiffKey;
}

/** Region selector value: `all`, `weak`, `r:<region>`, or a division name. */
export type Scope = string;

/** Which field of a state the multiple-choice buttons should show. */
export type ChoiceLabel = 'n' | 'cap' | 'a';

/** The question currently on screen. */
export interface Ask {
  /** The state being asked about. */
  s: State;
  /** State to highlight on the map, if any. */
  show: Abbr | null;
  won: boolean;
  /** The choice or map target the player picked. */
  hit: Abbr | null;
  choices: Abbr[] | null;
  /** Expected answer: an abbreviation for choices, free text for typed modes. */
  answer: string | null;
  labelBy: ChoiceLabel;
  /** Codes mode running backwards. */
  rev: boolean;
  /** What the player typed, kept so it can be shown back once locked. */
  typed?: string;
  /** True when the player pressed "Show me" instead of answering. */
  gave?: boolean;
}

/** Session tallies, reset whenever the mode or difficulty changes. */
export interface Run {
  right: number;
  asked: number;
  streak: number;
  best: number;
}

/** A rectangle in map coordinates, used as the SVG viewBox. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Name All 50 in progress. */
export interface Recall {
  got: Set<Abbr>;
  done: boolean;
  /** Epoch ms the run started. */
  t0: number;
  /** Epoch ms the run ended, or 0 while running. */
  stopAt: number;
  total: number;
  /** Last state accepted, for the "Locked in ..." readout. */
  last: Abbr | null;
  msg: string;
  /** Set when the finished run beat the stored best time. */
  record?: boolean;
}

/** Roll Call in progress. */
export interface Roll {
  letter: string;
  got: Set<Abbr>;
  /** Letters whose answers have been revealed. */
  shown: Set<string>;
  msg: string;
}

/** One weak spot: the worst-performing track for a state. */
export interface WeakSpot {
  s: State;
  track: Track;
  rate: number;
  /** Attempts. */
  a: number;
  /** Correct. */
  c: number;
}
