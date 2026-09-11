import { BY } from '../data/states';
import { roundTaker } from './machine';
import { outcomeOf } from './scoring';
import type { PlannedRound, RoundAnswer } from './types';

/**
 * What a finished match says about each player, beyond the score.
 *
 * Pure functions over the two answer sheets, so the result screen can be as
 * rich as it likes without the reducer knowing about any of it.
 */

export interface SideStats {
  points: number;
  correct: number;
  asked: number;
  /** The quickest right answer, in ms; null with none right. */
  fastestMs: number | null;
  /** Mean time over the answers actually given; null with none. */
  avgMs: number | null;
  bestStreak: number;
  /** Rounds this side took outright. */
  roundsWon: number;
}

const given = (a: RoundAnswer | null): a is RoundAnswer => !!a && !a.timeout;
const right = (a: RoundAnswer | null): a is RoundAnswer => !!a && a.correct;

/** The longest run of right answers in the sheet. */
export function bestStreakOf(answers: readonly (RoundAnswer | null)[]): number {
  let best = 0;
  let run = 0;
  for (const a of answers) {
    run = a?.correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function sideStats(
  mine: readonly (RoundAnswer | null)[], theirs: readonly (RoundAnswer | null)[],
): SideStats {
  const hits = mine.filter(right);
  const answered = mine.filter(given);
  return {
    points: mine.reduce((n, a) => n + (a?.points ?? 0), 0),
    correct: hits.length,
    asked: mine.length,
    fastestMs: hits.length ? Math.min(...hits.map((a) => a.ms)) : null,
    avgMs: answered.length ? Math.round(answered.reduce((n, a) => n + a.ms, 0) / answered.length) : null,
    bestStreak: bestStreakOf(mine),
    roundsWon: mine.reduce((n, a, i) => n + (roundTaker(a, theirs[i] ?? null) === 'me' ? 1 : 0), 0),
  };
}

/* ---------------- awards ---------------- */

export type AwardKey = 'sweep' | 'comeback' | 'clutch' | 'photo' | 'streak' | 'fastest' | 'buzzer';

export type Who = 'me' | 'them' | 'both';

export interface Award {
  key: AwardKey;
  label: string;
  /** The fact behind it, e.g. "5 in a row". */
  note: string;
  who: Who;
}

/** A comeback is being this far behind at some point, and winning anyway. */
export const COMEBACK_GAP = 100;

/** A photo finish is decided by this much or less. */
export const PHOTO_MARGIN = 25;

/** A right answer with this little of the clock left is a buzzer beater. */
const BUZZER_FRAC = 0.1;

/** A streak worth a mention. */
const STREAK_WORTH = 3;

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

const whoOf = (me: boolean, them: boolean): Who | null =>
  me && them ? 'both' : me ? 'me' : them ? 'them' : null;

/** Running totals after each round. */
const cumulative = (answers: readonly (RoundAnswer | null)[]): number[] => {
  let n = 0;
  return answers.map((a) => (n += a?.points ?? 0));
};

/**
 * Which of the awards this match earned, in the order they are worth
 * showing. Anything about the result — a comeback, a clutch finish, a photo
 * finish — needs a winner; the rest can go to either side or both.
 */
export function awardsFor(
  plan: readonly PlannedRound[],
  mine: readonly (RoundAnswer | null)[],
  theirs: readonly (RoundAnswer | null)[],
  /** The clock each round ran on, so a late answer can be recognised. */
  limits: readonly number[],
): Award[] {
  const n = plan.length;
  const out: Award[] = [];
  if (n === 0) return out;

  const mineCum = cumulative(mine);
  const theirsCum = cumulative(theirs);
  const outcome = outcomeOf(mineCum[n - 1], theirsCum[n - 1]);
  const winner = outcome === 'win' ? 'me' : outcome === 'loss' ? 'them' : null;
  const [winCum, loseCum] = winner === 'me' ? [mineCum, theirsCum] : [theirsCum, mineCum];

  // Clean sweep: every round right. Needs a match long enough to mean something.
  if (n >= 3) {
    const who = whoOf(mine.every(right), theirs.every(right));
    if (who) out.push({ key: 'sweep', label: 'Clean sweep', note: `All ${n} right`, who });
  }

  if (winner && n >= 2) {
    // The deepest hole the winner climbed out of, before the last round.
    let deficit = 0;
    for (let i = 0; i < n - 1; i++) deficit = Math.max(deficit, loseCum[i] - winCum[i]);
    if (deficit >= COMEBACK_GAP) {
      out.push({ key: 'comeback', label: 'Comeback', note: `Down ${deficit}, won anyway`, who: winner });
    }
    // Not ahead going into the last round, and won it.
    if (winCum[n - 2] <= loseCum[n - 2]) {
      out.push({ key: 'clutch', label: 'Clutch', note: 'Won it on the last round', who: winner });
    }
    const margin = Math.abs(mineCum[n - 1] - theirsCum[n - 1]);
    if (margin <= PHOTO_MARGIN) {
      out.push({ key: 'photo', label: 'Photo finish', note: `Decided by ${margin}`, who: winner });
    }
  }

  const myStreak = bestStreakOf(mine);
  const theirStreak = bestStreakOf(theirs);
  const best = Math.max(myStreak, theirStreak);
  if (best >= STREAK_WORTH) {
    const who = whoOf(myStreak === best, theirStreak === best) as Who;
    out.push({ key: 'streak', label: 'On fire', note: `${best} in a row`, who });
  }

  // The single quickest right answer of the match.
  let fastest: { ms: number; round: number; me: boolean; them: boolean } | null = null;
  const consider = (answers: readonly (RoundAnswer | null)[], side: 'me' | 'them') => {
    answers.forEach((a, i) => {
      if (!right(a)) return;
      if (!fastest || a.ms < fastest.ms) fastest = { ms: a.ms, round: i, me: side === 'me', them: side === 'them' };
      else if (a.ms === fastest.ms) fastest[side] = true;
    });
  };
  consider(mine, 'me');
  consider(theirs, 'them');
  if (fastest) {
    const f = fastest as { ms: number; round: number; me: boolean; them: boolean };
    const state = BY[plan[f.round]?.abbr]?.n ?? 'it';
    out.push({ key: 'fastest', label: 'Fastest finger', note: `${secs(f.ms)} on ${state}`, who: whoOf(f.me, f.them) as Who });
  }

  // Right with almost nothing on the clock: the closest call of the match.
  let closest: { left: number; me: boolean; them: boolean } | null = null;
  const nearMiss = (answers: readonly (RoundAnswer | null)[], side: 'me' | 'them') => {
    answers.forEach((a, i) => {
      const limit = limits[i] ?? 0;
      if (!right(a) || !limit || a.ms < limit * (1 - BUZZER_FRAC)) return;
      const left = Math.max(0, limit - a.ms);
      if (!closest || left < closest.left) closest = { left, me: side === 'me', them: side === 'them' };
      else if (left === closest.left) closest[side] = true;
    });
  };
  nearMiss(mine, 'me');
  nearMiss(theirs, 'them');
  if (closest) {
    const c = closest as { left: number; me: boolean; them: boolean };
    out.push({ key: 'buzzer', label: 'Buzzer beater', note: `Right with ${secs(c.left)} to spare`, who: whoOf(c.me, c.them) as Who });
  }

  return out;
}
