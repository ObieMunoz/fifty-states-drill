import { ST } from '../data/states';
import { weakList } from './progress';
import type { Progress, Scope, State } from '../types';

/**
 * The region selector doubles as a zoom control: picking a scope both narrows
 * the question pool and frames those states on the map.
 *
 * Values are `all`, `weak`, `r:<region>`, or a census division name.
 */
export function inScope(s: State, scope: Scope, p: Progress): boolean {
  if (scope === 'all') return true;
  if (scope === 'weak') return weakList(p).some((x) => x.s.a === s.a);
  if (scope.startsWith('r:')) return s.reg === scope.slice(2);
  return s.div === scope;
}

export const poolFor = (scope: Scope, p: Progress): State[] =>
  ST.filter((s) => inScope(s, scope, p));

export function scopeLabel(scope: Scope, p: Progress): string {
  const n = poolFor(scope, p).length;
  if (scope === 'weak') return n + ' weak states';
  if (scope === 'all') return 'all 50 states';
  return n + ' ' + (scope.startsWith('r:') ? 'states in the ' + scope.slice(2) : scope + ' states');
}

/** Key the Name All 50 best time is stored under, per scope. */
export const bestKey = (scope: Scope): string => 'all50:' + (scope === 'all' ? 'us' : scope);
