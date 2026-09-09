import { norm, lev } from '../lib/text';
import { poolFor } from './scope';
import type { Progress, Recall, Scope, State } from '../types';

export function startRecall(scope: Scope, p: Progress): Recall {
  return {
    got: new Set(), done: false, t0: Date.now(), stopAt: 0,
    total: poolFor(scope, p).length, last: null, msg: '',
  };
}

/**
 * Milliseconds run so far, or the final time once stopped. Clamped at zero:
 * the caller's clock can lag the start of a run by up to a second.
 */
export const elapsed = (r: Recall, now: number): number =>
  Math.max(0, (r.stopAt || now) - r.t0);

/**
 * Match typed text against the states not yet found.
 *
 * Exact only while typing. No state name is a prefix of another, so this can
 * never fire mid-word; an edit-distance rule here grabbed 44 of the 50 a
 * letter early. `fuzzy` is reserved for Enter, where the player has committed.
 */
export function findRecallHit(
  text: string, scope: Scope, p: Progress, got: Set<string>, fuzzy: boolean,
): State | null {
  const v = norm(text);
  if (v.length < 3) return null;
  const rest = poolFor(scope, p).filter((s) => !got.has(s.a));
  const exact = rest.find((s) => norm(s.n) === v);
  if (exact) return exact;
  if (!fuzzy) return null;
  return rest.find((s) => {
    const n = norm(s.n);
    return n.length >= 5 && lev(n, v) <= 1;
  }) ?? null;
}
