import { loadProgress, lvl, saveProgress } from '../game/progress';
import type { Abbr, Progress, Track } from '../types';

/**
 * What a Versus match teaches this device.
 *
 * Every round is a graded retrieval attempt on a (state, track) pair, checked
 * by the server — and until now all of it was thrown away at the whistle. A
 * household playing Versus nightly accumulated nothing: the map never
 * deepened, `weakList` never learned which states kept being missed, and
 * Progress → "Drill these" stayed blank for the mode they actually play.
 */

/** Rounds already counted, so a reload cannot count one twice. */
const KEY = 'fiftyStatesDrill.versus.studied.v1';

/** Enough to cover a long evening without growing without bound. */
const MAX_SEEN = 200;

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function noteSeen(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...loadSeen().filter((s) => s !== id)].slice(0, MAX_SEEN)));
  } catch {
    // Storage unavailable: the guard holds for this page load only.
  }
}

/**
 * One settled round, folded into a progress record.
 *
 * What goes in is the attempt tally — which is all `weakList` and the
 * accuracy readout consult — and, for a right answer, one level of mastery
 * capped by the level it was played at, exactly as the solo game caps it.
 *
 * What deliberately stays out is the solo game's penalty for a wrong answer.
 * `recordAnswer` drops the level by two and raises `err`, and a raised `err`
 * is what paints a state with the dashed weak outline and weights it heavier
 * in every later draw — and it clears only on a full progress reset. A round
 * lost to a slow tap on a shared twenty-second clock is not evidence that a
 * player has forgotten a state they know, so it may cost them the round but
 * never their mastery of it.
 */
export function recordVersusRound(
  p: Progress, a: Abbr, track: Track, won: boolean, cap: number,
): Progress {
  const st = { ...(p.st ?? {}) };
  const forState = { ...(st[a] ?? {}) };
  const prev = forState[track] ?? { a: 0, c: 0 };
  forState[track] = { a: prev.a + 1, c: prev.c + (won ? 1 : 0) };
  st[a] = forState;

  if (!won) return { ...p, st };
  const cur = lvl(p, a, track);
  return { ...p, st, lv: { ...p.lv, [a]: { ...p.lv[a], [track]: Math.min(cap, cur + 1) } } };
}

/**
 * Record one round against this device's stored progress, once.
 *
 * A round is named by its match's seed and its number, so a reload, a second
 * snapshot, or a phone returning to a match in progress all offer the same
 * rounds again and are ignored.
 */
export function studyRound(
  seed: string, round: number, a: Abbr, track: Track, won: boolean, cap: number,
): void {
  const id = `${seed}#${round}`;
  if (loadSeen().includes(id)) return;
  noteSeen(id);
  saveProgress(recordVersusRound(loadProgress(), a, track, won, cap));
}
