import { LETTERS, ST } from '../data/states';
import { lev, norm } from '../lib/text';
import { inScope } from './scope';
import type { Progress, Roll, Scope, State } from '../types';

/** Letters that still have at least one in-scope state behind them. */
export const rollLetters = (scope: Scope, p: Progress): string[] =>
  LETTERS.filter((L) => ST.some((s) => s.n[0] === L && inScope(s, scope, p)));

export const lettersGroup = (L: string, scope: Scope, p: Progress): State[] =>
  ST.filter((s) => s.n[0] === L && inScope(s, scope, p));

/** A letter is done once every state under it is named or the group is revealed. */
export function letterDone(roll: Roll, L: string, scope: Scope, p: Progress): boolean {
  const g = lettersGroup(L, scope, p);
  return g.length > 0 && g.every((s) => roll.got.has(s.a) || roll.shown.has(L));
}

/** The first unfinished letter, falling back to the first letter of all. */
export function nextLetter(roll: Roll, scope: Scope, p: Progress): string {
  const ls = rollLetters(scope, p);
  return ls.find((L) => !letterDone(roll, L, scope, p)) ?? ls[0] ?? 'A';
}

/**
 * Match typed text against any in-scope state — not just the current letter,
 * so that answering under the wrong heading gets a useful correction rather
 * than silence. `fuzzy` allows a one-edit miss and is only on for Enter.
 */
export function findState(text: string, scope: Scope, p: Progress, fuzzy: boolean): State | null {
  const v = norm(text);
  if (v.length < 3) return null;
  const all = ST.filter((s) => inScope(s, scope, p));
  const exact = all.find((s) => norm(s.n) === v);
  if (exact) return exact;
  if (!fuzzy) return null;
  return all.find((s) => norm(s.n).length >= 5 && lev(norm(s.n), v) <= 1) ?? null;
}
