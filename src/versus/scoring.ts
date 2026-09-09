import { DIFFS } from '../data/modes';
import type { DiffKey, ModeKey } from '../types';

/** A right answer is worth this before any speed bonus. */
export const BASE_POINTS = 100;

/** The most a fast answer can add on top. */
export const SPEED_POINTS = 50;

/** How long a round runs when both players are picking from options. */
const CHOICE_MS = 20_000;

/** Typing a capital takes longer than tapping one of four. */
const TYPED_MS = 30_000;

/** Find It: the eye has to travel to the map and back. */
const FIND_MS = 25_000;

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
 * Points for one answer: the flat reward for being right, plus a bonus that
 * decays linearly to zero across the round's clock.
 *
 * A wrong answer scores nothing — there is no penalty for guessing, because on
 * a twenty-second clock a guess already costs the speed bonus on the next one.
 */
export function scoreAnswer(correct: boolean, ms: number, limitMs: number): number {
  if (!correct) return 0;
  const left = Math.max(0, 1 - Math.max(0, ms) / limitMs);
  return BASE_POINTS + Math.round(SPEED_POINTS * left);
}

/** Who won, from the two totals. */
export const outcomeOf = (mine: number, theirs: number): 'win' | 'loss' | 'draw' =>
  mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
