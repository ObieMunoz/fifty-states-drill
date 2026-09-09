import { BY, ST } from '../data/states';
import { MIXPOOL } from '../data/modes';
import { dist } from '../lib/geo';
import { pickRnd, shuffle, weightedIndex } from '../lib/random';
import { lvl } from './progress';
import type { Abbr, Ask, Difficulty, ModeKey, Progress, State, Track } from '../types';

/**
 * Four options: the answer plus three decoys. Decoys are geographic
 * neighbours (or neighbours-of-neighbours) rather than random states, which
 * makes a wrong answer informative rather than a coin flip.
 *
 * On Guided the decoys instead come from other regions entirely, so the
 * question is about recognition rather than discrimination.
 */
export function choicesFor(s: State, easy: boolean): Abbr[] {
  if (easy) {
    const far = shuffle(ST.filter((x) => x.reg !== s.reg));
    return shuffle([s.a, ...far.slice(0, 3).map((x) => x.a)]);
  }

  const seen = new Set<Abbr>([s.a]);
  const out: Abbr[] = [];
  for (const a of s.nr) {
    if (!seen.has(a)) { seen.add(a); out.push(a); }
  }
  shuffle(out);

  // Top up from the same region first, then from anywhere, so small-neighbour
  // states like Maine still get three plausible decoys.
  const extra = shuffle(ST.filter((x) => !seen.has(x.a) && x.reg === s.reg));
  while (out.length < 3 && extra.length) out.push(extra.pop()!.a);
  const any = shuffle(ST.filter((x) => !seen.has(x.a) && !out.includes(x.a)));
  while (out.length < 3) out.push(any.pop()!.a);

  return shuffle([s.a, ...out.slice(0, 3)]);
}

/**
 * Pick which state to ask about, weighted toward what the player does not
 * know: `(3 - level)²` plus a bonus for anything previously missed. States
 * asked in the last few questions are excluded outright so the drill does not
 * cycle through the same handful.
 */
export function pickState(pool: State[], p: Progress, track: Track, recent: Abbr[]): State {
  const avoid = new Set(recent.slice(-Math.min(6, Math.max(0, pool.length - 1))));
  let cand = pool.filter((s) => !avoid.has(s.a));
  if (!cand.length) cand = pool;

  const weights = cand.map((s) => {
    const L = lvl(p, s.a, track);
    return (3 - L) * (3 - L) + 0.5 + ((p.err[s.a] ?? 0) > 0 && L < 3 ? 1.5 : 0);
  });
  return cand[weightedIndex(weights)];
}

/** Which question type a mode asks; Mixed shuffles between all six. */
export const questionType = (mode: ModeKey): ModeKey =>
  mode === 'mixed' ? pickRnd(MIXPOOL) : mode;

/**
 * Build the question for `s` under `qm`. What varies with difficulty is how
 * much scaffolding comes with it: whether the target is highlighted, whether
 * answers are typed or picked, and which way round Codes runs.
 */
export function buildAsk(s: State, qm: ModeKey, d: Difficulty): Ask {
  const ask: Ask = {
    s, show: null, won: false, hit: null, choices: null, answer: null, labelBy: 'n', rev: false,
  };

  if (qm === 'name' || qm === 'shape') {
    ask.show = s.a;
    ask.answer = s.a;
    if (!d.typeNames) ask.choices = choicesFor(s, d.easyDistractors);
  } else if (qm === 'border') {
    if (d.showTarget) ask.show = s.a;
    const right = pickRnd(s.nb);
    // Decoys are the nearest non-neighbours, so "close but not touching" is
    // the thing being tested.
    const bad = ST.filter((x) => x.a !== s.a && !s.nb.includes(x.a))
      .sort((a, b) => dist(s, a) - dist(s, b))
      .slice(0, 9);
    ask.answer = right;
    ask.choices = shuffle([right, ...shuffle(bad).slice(0, 3).map((x) => x.a)]);
  } else if (qm === 'capital') {
    if (d.showTarget) ask.show = s.a;
    if (d.forceChoice) {
      ask.choices = choicesFor(s, d.easyDistractors);
      ask.labelBy = 'cap';
      ask.answer = s.a;
    } else {
      ask.answer = s.cap;
    }
  } else if (qm === 'code') {
    if (d.reverseCode) {
      ask.rev = true;
      ask.answer = s.n;
    } else if (d.forceChoice) {
      ask.show = s.a;
      ask.choices = choicesFor(s, d.easyDistractors);
      ask.labelBy = 'a';
      ask.answer = s.a;
    } else {
      ask.show = s.a;
      ask.answer = s.a;
    }
  } else if (qm === 'find') {
    ask.answer = s.a;
  }

  return ask;
}

/** The four choice buttons' visible text, which is not always the state name. */
export const choiceLabel = (ask: Ask, a: Abbr): string =>
  ask.labelBy === 'cap' ? BY[a].cap : ask.labelBy === 'a' ? BY[a].a : BY[a].n;

/**
 * What a typed answer is compared against. `ask.answer` holds an abbreviation
 * for chip matching, so typed modes read the expected text off the state.
 */
export function expectedText(ask: Ask, qm: ModeKey): string {
  if (qm === 'capital') return ask.s.cap;
  if (qm === 'code' && !ask.rev) return ask.s.a;
  return ask.s.n;
}
