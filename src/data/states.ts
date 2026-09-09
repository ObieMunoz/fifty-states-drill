import raw from './states.json';
import type { Abbr, Division, Region, State } from '../types';

/**
 * All fifty states, in the order us-atlas emits them (alphabetical by name).
 *
 * `states.json` is plain JSON so TypeScript widens its string fields; the cast
 * re-narrows them to the unions in `types.ts`. The shape is asserted in
 * `states.test.ts` rather than trusted blindly.
 */
export const ST = raw.states as unknown as State[];

/** The District of Columbia, drawn but never quizzed. */
export const DC_PATH: string = raw.dc;

/** Lookup by postal code. */
export const BY: Record<string, State> = Object.fromEntries(ST.map((s) => [s.a, s]));

/** Distinct first letters, alphabetical. Nineteen of them. */
export const LETTERS: string[] = [...new Set(ST.map((s) => s.n[0]))].sort();

/** Census divisions, in the Bureau's own order rather than alphabetical. */
export const DIVS: Division[] = [
  'New England', 'Middle Atlantic', 'South Atlantic', 'East South Central',
  'West South Central', 'East North Central', 'West North Central', 'Mountain', 'Pacific',
];

export const REGS: Region[] = ['Northeast', 'South', 'Midwest', 'West'];

/** The states matching a predicate, as postal codes. */
export const abbrsWhere = (fn: (s: State) => boolean): Abbr[] => ST.filter(fn).map((s) => s.a);
