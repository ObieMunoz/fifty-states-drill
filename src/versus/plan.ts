import { ST } from '../data/states';
import { MIXPOOL } from '../data/modes';
import { hashSeed, mulberry32, pickRnd } from '../lib/random';
import type { Rng } from '../lib/random';
import { inScope } from '../game/scope';
import { emptyProgress } from '../game/progress';
import type { MatchConfig, PlannedRound } from './types';
import type { ModeKey, Scope, State } from '../types';

/**
 * The pool a match draws from.
 *
 * Deliberately *not* `poolFor`: that resolves `weak` against a Progress
 * record, which differs per device and would hand the two players different
 * questions. Versus scopes are geographic only, so an empty progress record is
 * enough to satisfy the signature.
 */
export function matchPool(scope: Scope): State[] {
  const p = emptyProgress();
  const pool = ST.filter((s) => inScope(s, scope, p));
  return pool.length ? pool : ST;
}

/** A generator private to one round, so a change in round N cannot shift N+1. */
const roundRng = (seed: string, round: number): Rng =>
  mulberry32(hashSeed(`${seed}#${round}`));

/**
 * The whole question sequence for a match, derived from the seed alone.
 *
 * Both devices call this with the same config and get the same array, which is
 * what makes the match fair without either side sending questions over the
 * wire. Nothing here consults player progress, the clock, or `Math.random`.
 */
export function planMatch(cfg: MatchConfig): PlannedRound[] {
  const pool = matchPool(cfg.scope);
  const out: PlannedRound[] = [];
  // States already asked this match, so a short match never repeats itself.
  const used = new Set<string>();

  for (let i = 0; i < cfg.rounds; i++) {
    const rnd = roundRng(cfg.seed, i);
    const qm: ModeKey = cfg.mode === 'mixed' ? pickRnd(MIXPOOL, rnd) : cfg.mode;

    // Borders needs a state that actually has one.
    const eligible = pool.filter((s) => qm !== 'border' || s.nb.length > 0);
    let cand = eligible.filter((s) => !used.has(s.a));
    // A long match in a small scope will exhaust the pool; start it over
    // rather than run out of questions.
    if (!cand.length) {
      used.clear();
      cand = eligible;
    }

    const state = pickRnd(cand, rnd);
    used.add(state.a);
    out.push({ qm, abbr: state.a });
  }

  return out;
}

/**
 * The generator used to build one player's view of a round.
 *
 * Separate from the planning stream on purpose: the two players may be on
 * different levels, which changes how many draws `buildAsk` makes. Giving the
 * ask its own generator keeps one player's decoys from perturbing the other's.
 */
export const askRng = (seed: string, round: number): Rng =>
  mulberry32(hashSeed(`${seed}!ask!${round}`));
