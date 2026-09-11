import { DIFFS } from '../data/modes';
import type { DiffKey, ModeKey } from '../types';

/** A right answer is worth this before any bonus. */
export const BASE_POINTS = 100;

/** The most a fast answer can add on top. */
export const SPEED_POINTS = 50;

/** Each right answer in a row before this one adds this much more... */
export const STREAK_POINTS = 10;

/** ...up to this many: a streak of five pays as much as an instant answer. */
export const STREAK_CAP = 5;

/** The last round pays this many times over, so nobody is out of it until the end. */
export const FINAL_ROUND_MULTIPLIER = 2;

/** How long a round runs when both players are picking from options. */
const CHOICE_MS = 20_000;

/** Typing a capital takes longer than tapping one of four. */
const TYPED_MS = 30_000;

/** Find It: the eye has to travel to the map and back. */
const FIND_MS = 25_000;

/** Who won, from two totals. */
export type Outcome = 'win' | 'loss' | 'draw';

/** Whether this player types their answer rather than picking one. */
export function isTyped(qm: ModeKey, dif: DiffKey): boolean {
  const d = DIFFS[dif];
  if (qm === 'find') return false;
  if (qm === 'name' || qm === 'shape') return d.typeNames;
  if (qm === 'capital' || qm === 'code') return !d.forceChoice;
  return false;
}

/** The window one player would need on their own. */
function playerLimitMs(qm: ModeKey, dif: DiffKey): number {
  if (qm === 'find') return FIND_MS;
  return isTyped(qm, dif) ? TYPED_MS : CHOICE_MS;
}

/**
 * The round's clock, shared by both players.
 *
 * Taking the longer of the two windows means a handicapped pairing — one side
 * picking from four, the other typing blind — still ends the round together,
 * and both speed bonuses are measured against the same scale.
 */
export function roundLimitMs(qm: ModeKey, difs: DiffKey[]): number {
  return Math.max(...difs.map((d) => playerLimitMs(qm, d)));
}

/**
 * How many right answers in a row a player brings into `round`, read off a
 * sheet of verdicts by round: true for right, anything else for wrong, late
 * or never given. Both phones and the server compute it from the same rows,
 * so all three agree on what a streak is worth.
 */
export function streakBefore(verdicts: readonly (boolean | null | undefined)[], round: number): number {
  let n = 0;
  for (let i = round - 1; i >= 0 && verdicts[i] === true; i--) n++;
  return n;
}

/** What a streak adds to the next right answer. */
export const streakBonus = (streak: number): number =>
  STREAK_POINTS * Math.min(STREAK_CAP, Math.max(0, Math.floor(streak)));

/** Whether `round` is the match's last, which pays double. */
export const isFinalRound = (round: number, rounds: number): boolean =>
  rounds > 0 && round === rounds - 1;

/** What an answer brings with it beyond being right or wrong. */
export interface Bonus {
  /** Right answers in a row before this one. */
  streak?: number;
  /** The last round of the match. */
  final?: boolean;
}

/**
 * Points for one answer: the flat reward for being right, a bonus that decays
 * linearly to zero across the round's clock, and a little more for each
 * right answer in a row before it — all doubled on the last round.
 *
 * A wrong answer scores nothing and ends the streak — there is no penalty
 * for guessing, because on a twenty-second clock a guess already costs the
 * speed bonus on the next one.
 */
export function scoreAnswer(correct: boolean, ms: number, limitMs: number, bonus: Bonus = {}): number {
  if (!correct) return 0;
  const left = Math.max(0, 1 - Math.max(0, ms) / limitMs);
  const points = BASE_POINTS + Math.round(SPEED_POINTS * left) + streakBonus(bonus.streak ?? 0);
  return bonus.final ? points * FINAL_ROUND_MULTIPLIER : points;
}

/**
 * The parts one score is made of, for reading a reveal back: how much of it
 * was speed, how much the streak, and whether the round paid double.
 */
export function breakdown(points: number, bonus: Bonus = {}): { base: number; speed: number; streak: number; doubled: boolean } {
  if (points <= 0) return { base: 0, speed: 0, streak: 0, doubled: false };
  const doubled = !!bonus.final;
  const single = doubled ? points / FINAL_ROUND_MULTIPLIER : points;
  const streak = streakBonus(bonus.streak ?? 0);
  return { base: BASE_POINTS, speed: Math.max(0, single - BASE_POINTS - streak), streak, doubled };
}

/** Who won, from the two totals. */
export const outcomeOf = (mine: number, theirs: number): Outcome =>
  mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
