import { BY } from '../data/states';
import { DIFFS } from '../data/modes';
import { buildAsk, choiceLabel, expectedText } from '../game/question';
import { near, norm } from '../lib/text';
import { askRng } from './plan';
import type { Abbr, Ask, DiffKey, ModeKey } from '../types';
import type { PlannedRound } from './types';

/**
 * Grading, shared by the phone and the server.
 *
 * The phone grades as the answer goes in, so the reveal is instant; the
 * server grades again from the same seed and the same rules, and its verdict
 * is the one that counts. Both build the question the same way, so they
 * cannot disagree except by a bug — and then it is the server's row that
 * both phones end up showing.
 */

/** The question one player saw for a round, rebuilt from the seed. */
export const askFor = (seed: string, round: number, planned: PlannedRound, dif: DiffKey): Ask =>
  buildAsk(BY[planned.abbr], planned.qm, DIFFS[dif], askRng(seed, round));

/** Grade one answer exactly the way the solo game does. */
export function grade(ask: Ask, qm: ModeKey, value: string): boolean {
  if (ask.choices || qm === 'find') return value === ask.answer;
  const expect = expectedText(ask, qm);
  // A two-letter code has no near-misses: one edit is a different state.
  if (qm === 'code' && !ask.rev) return norm(value) === norm(expect);
  return near(value, expect);
}

/**
 * What one answer looked like to the player who gave it, in words the other
 * player can read: a tapped or chosen state by the label its question used,
 * a typed answer as typed. Null when nothing went in.
 *
 * The pick is whatever the phone sent, so an abbreviation that names no state
 * is shown as it came rather than looked up.
 */
export function pickLabel(ask: Ask, qm: ModeKey, pick: string | null): string | null {
  if (pick === null) return null;
  if (ask.choices || qm === 'find') {
    const s = BY[pick as Abbr];
    return s ? choiceLabel(ask, s.a) : pick;
  }
  return pick;
}
