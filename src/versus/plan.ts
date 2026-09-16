import { ST } from '../data/states';
import { MIXPOOL } from '../data/modes';
import { hashSeed, mulberry32, pickRnd, shuffle } from '../lib/random';
import type { Rng } from '../lib/random';
import { inScope } from '../game/scope';
import { emptyProgress } from '../game/progress';
import { FILLS_THE_MAP } from './types';
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

/** A generator private to one bagful, for the same reason. */
const bagRng = (seed: string, bag: number): Rng =>
  mulberry32(hashSeed(`${seed}#bag#${bag}`));

/**
 * The question types a Mixed match asks, dealt from a shuffled bag rather
 * than drawn independently each round.
 *
 * Drawing each round on its own left the flagship mode quietly lopsided: over
 * 2000 seeds at the default ten rounds, a match missed at least one of the
 * six tracks 73% of the time and gave one track four or more rounds about 40%
 * of the time. Four Capitals rounds out of ten tilts a match decided by a few
 * hundred points toward whoever is strong at capitals.
 *
 * A bag of all six, reshuffled once empty, spends the variance on order and
 * pairing instead of on which tracks turn up: five rounds give five distinct
 * types, ten cover all six, fifteen give each at least two.
 */
function mixedTypes(seed: string, rounds: number): ModeKey[] {
  const out: ModeKey[] = [];
  for (let bag = 0; out.length < rounds; bag++) {
    out.push(...shuffle([...MIXPOOL], bagRng(seed, bag)));
  }
  return out.slice(0, rounds);
}

/**
 * The whole question sequence for a match, derived from the seed alone.
 *
 * Both devices call this with the same config and get the same array, which is
 * what makes the match fair without either side sending questions over the
 * wire. Nothing here consults player progress, the clock, or `Math.random`.
 */
export function planMatch(cfg: MatchConfig): PlannedRound[] {
  const pool = matchPool(cfg.scope);
  const types = cfg.mode === 'mixed' ? mixedTypes(cfg.seed, cfg.rounds) : null;
  const out: PlannedRound[] = [];
  // States already asked this match, so a short match never repeats itself.
  const used = new Set<string>();

  for (let i = 0; i < cfg.rounds; i++) {
    const rnd = roundRng(cfg.seed, i);
    const qm: ModeKey = types ? types[i] : cfg.mode;

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

/**
 * How many rounds a match should run.
 *
 * Every mode but Place It takes the count the lobby offers. Place It runs the
 * map out instead — one round per state in the scope — so a match ends with
 * the board full, and a regional match fills that region exactly.
 */
export function roundsForMode(mode: ModeKey, scope: Scope, requested = 10): number {
  return FILLS_THE_MAP.includes(mode) ? matchPool(scope).length : requested;
}
