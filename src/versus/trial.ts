import { lev, norm } from '../lib/text';
import { matchPool } from './plan';
import type { Scope, State } from '../types';

/**
 * Time Trial: both players race, on their own, to name every state.
 *
 * It is the one Versus mode that is not a sequence of shared rounds. There is
 * no question on screen and no reveal — each player types into their own list
 * for the same four minutes, and the map fills as they go. Whoever names them
 * all first takes it; if the clock runs out first, whoever has more.
 *
 * Because the two sides move independently, a player's answers are recorded
 * at their *own* indices: their first correct name is round 0, their second
 * round 1, and so on. The answers table is keyed by round and player, so the
 * two lists sit side by side without either constraining the other.
 */

/** How long a trial runs before the count decides it. */
export const TRIAL_MS = 4 * 60 * 1000;

/**
 * Match typed text against the states this player has not yet named.
 *
 * The same rule the solo sprint uses: exact matches only while the player is
 * still typing, since no state name is a prefix of another, and a forgiving
 * match once they have committed with Enter. Misspelling a state you plainly
 * know is not a knowledge failure.
 */
export function findTrialHit(
  text: string, scope: Scope, got: ReadonlySet<string>, fuzzy: boolean,
): State | null {
  const v = norm(text);
  if (v.length < 3) return null;
  const rest = matchPool(scope).filter((s) => !got.has(s.a));
  const exact = rest.find((s) => norm(s.n) === v);
  if (exact) return exact;
  if (!fuzzy) return null;
  return rest.find((s) => {
    const n = norm(s.n);
    return n.length >= 5 && lev(n, v) <= 1;
  }) ?? null;
}

/** How many states a trial in this scope is asking for. */
export const trialTarget = (scope: Scope): number => matchPool(scope).length;

/**
 * Who won, from the two lists.
 *
 * The count decides it. A tie on count goes to whoever got there first, which
 * is the only thing left to separate them — and is what makes the last minute
 * of a close trial worth typing through rather than coasting.
 */
export function trialOutcome(
  mine: { count: number; ms: number }, theirs: { count: number; ms: number },
): 'win' | 'loss' | 'draw' {
  if (mine.count !== theirs.count) return mine.count > theirs.count ? 'win' : 'loss';
  if (mine.ms === theirs.ms) return 'draw';
  return mine.ms < theirs.ms ? 'win' : 'loss';
}
