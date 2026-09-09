import type { DiffKey, Difficulty, Mode, ModeKey, Track } from '../types';

/** Quiz types that carry a per-state mastery level. Order drives `overall()`. */
export const TRACKS: Track[] = ['find', 'name', 'shape', 'capital', 'code', 'border'];

export const MODES: Record<ModeKey, Mode> = {
  map:     { g: 'learn', label: 'Map',        kind: 'explore' },
  letter:  { g: 'learn', label: 'Letters',    kind: 'letters' },
  cards:   { g: 'learn', label: 'Cards',      kind: 'cards', nomap: true },
  hooks:   { g: 'learn', label: 'Hooks',      kind: 'hooks' },
  weak:    { g: 'learn', label: 'Progress',   kind: 'weak' },
  find:    { g: 'quiz',  label: 'Find It',    kind: 'click' },
  name:    { g: 'quiz',  label: 'Name It',    kind: 'choice' },
  shape:   { g: 'quiz',  label: 'Silhouette', kind: 'choice' },
  roll:    { g: 'quiz',  label: 'Roll Call',  kind: 'roll', nomap: true },
  all50:   { g: 'quiz',  label: 'All 50',     kind: 'recall' },
  capital: { g: 'quiz',  label: 'Capitals',   kind: 'type' },
  code:    { g: 'quiz',  label: 'Codes',      kind: 'type' },
  border:  { g: 'quiz',  label: 'Borders',    kind: 'choice' },
  mixed:   { g: 'quiz',  label: 'Mixed',      kind: 'choice' },
};

export const MODE_KEYS = Object.keys(MODES) as ModeKey[];

/** The question types Mixed draws from. */
export const MIXPOOL: Track[] = ['find', 'name', 'shape', 'capital', 'code', 'border'];

export const DIFFS: Record<DiffKey, Difficulty> = {
  guided: {
    label: 'Guided', tries: 3, regionHint: true, forceChoice: true, easyDistractors: true,
    typeNames: false, reverseCode: false, showTarget: true, letterGroups: true, lengths: true, cap: 2,
    blurb: 'Multiple choice, a region hint on the map, and the full letter breakdown. Caps mastery at Learning.',
  },
  standard: {
    label: 'Standard', tries: 2, regionHint: false, forceChoice: false, easyDistractors: false,
    typeNames: false, reverseCode: false, showTarget: true, letterGroups: true, lengths: false, cap: 3,
    blurb: 'Typed answers, neighbouring states as decoys, letter counts still visible.',
  },
  expert: {
    label: 'Expert', tries: 1, regionHint: false, forceChoice: false, easyDistractors: false,
    typeNames: true, reverseCode: true, showTarget: false, letterGroups: false, lengths: false, cap: 3,
    blurb: 'No map anchor, no letter splits, one attempt, and codes run backwards.',
  },
};

export const DIFF_KEYS = Object.keys(DIFFS) as DiffKey[];

/** Type guard: is this mode key also a scored track? */
export const isTrack = (m: string): m is Track => (TRACKS as string[]).includes(m);

/**
 * The track a mode reports on, or null for the modes that show overall
 * mastery. Mixed is deliberately not a track: the map and the rail follow the
 * question on screen, while the roster stays on the overall view.
 */
export const trackOrNull = (m: string): Track | null => (isTrack(m) ? m : null);
