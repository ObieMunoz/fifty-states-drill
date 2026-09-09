import { ST } from '../data/states';
import { TRACKS } from '../data/modes';
import type { Abbr, DiffKey, Progress, Track, WeakSpot } from '../types';

/**
 * localStorage key. Unchanged from the pre-React version — and the stored
 * shape is unchanged with it — so progress survives the rewrite.
 */
export const STORAGE_KEY = 'fiftyStatesDrill.v1';

/** A fresh, fully-populated progress record. */
export function emptyProgress(): Progress {
  const p: Progress = { lv: {}, err: {}, best: {} };
  for (const s of ST) {
    p.lv[s.a] = {};
    p.err[s.a] = 0;
  }
  return p;
}

/** Fill in any state the stored record is missing, e.g. after a data change. */
function normalise(p: Progress): Progress {
  for (const s of ST) {
    p.lv[s.a] = p.lv[s.a] ?? {};
    p.err[s.a] = p.err[s.a] ?? 0;
  }
  return p;
}

export function loadProgress(): Progress {
  const base = emptyProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<Progress> | null;
    if (o && o.lv) return normalise({ ...base, ...o } as Progress);
  } catch {
    // Private mode or blocked storage: run without saved progress.
  }
  return base;
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Nothing to do if storage is unavailable; the session still works.
  }
}

/** Mastery level 0–3 for one state on one track. */
export const lvl = (p: Progress, a: Abbr, t: Track): number => p.lv[a]?.[t] ?? 0;

/** Mean mastery across all six tracks, rounded. */
export const overall = (p: Progress, a: Abbr): number =>
  Math.round(TRACKS.reduce((n, t) => n + lvl(p, a, t), 0) / TRACKS.length);

/** Mastery on `track` if given, otherwise the state's overall level. */
export const levelFor = (p: Progress, a: Abbr, track: Track | null): number =>
  track ? lvl(p, a, track) : overall(p, a);

/** How many states have reached Solid on `track`, or overall. */
export const solidCount = (p: Progress, track: Track | null): number =>
  ST.filter((s) => levelFor(p, s.a, track) >= 3).length;

/**
 * Every state with a track it is measurably bad at — at least two attempts and
 * under 70% right — worst first, then by how much evidence there is.
 */
export function weakList(p: Progress): WeakSpot[] {
  const out: WeakSpot[] = [];
  for (const s of ST) {
    let worst: WeakSpot | null = null;
    for (const t of TRACKS) {
      const r = p.st?.[s.a]?.[t];
      if (!r || r.a < 2) continue;
      const rate = r.c / r.a;
      if (rate >= 0.7) continue;
      if (!worst || rate < worst.rate) worst = { s, track: t, rate, a: r.a, c: r.c };
    }
    if (worst) out.push(worst);
  }
  return out.sort((x, y) => x.rate - y.rate || y.a - x.a);
}

/** Total attempts and correct answers per track, across all states. */
export function accuracyByTrack(p: Progress): { t: Track; a: number; c: number }[] {
  return TRACKS.map((t) => {
    let a = 0;
    let c = 0;
    for (const s of ST) {
      const r = p.st?.[s.a]?.[t];
      if (r) { a += r.a; c += r.c; }
    }
    return { t, a, c };
  }).filter((x) => x.a > 0);
}

/**
 * Record one answer. A right answer moves the state one level up, capped by
 * the difficulty; a wrong one drops it two, which is what makes a state
 * resurface quickly after a miss.
 */
export function recordAnswer(p: Progress, a: Abbr, track: Track, won: boolean, cap: number): Progress {
  const st = { ...(p.st ?? {}) };
  const forState = { ...(st[a] ?? {}) };
  const prev = forState[track] ?? { a: 0, c: 0 };
  forState[track] = { a: prev.a + 1, c: prev.c + (won ? 1 : 0) };
  st[a] = forState;

  const cur = lvl(p, a, track);
  return {
    ...p,
    st,
    lv: { ...p.lv, [a]: { ...p.lv[a], [track]: won ? Math.min(cap, cur + 1) : Math.max(0, cur - 2) } },
    err: won ? p.err : { ...p.err, [a]: (p.err[a] ?? 0) + 1 },
  };
}

/** Flag a state for extra drilling, as the flashcards' "Need work" does. */
export const flagForReview = (p: Progress, a: Abbr): Progress =>
  ({ ...p, err: { ...p.err, [a]: (p.err[a] ?? 0) + 1 } });

export const setBest = (p: Progress, key: string, ms: number): Progress =>
  ({ ...p, best: { ...p.best, [key]: ms } });

export const setStoredDiff = (p: Progress, dif: DiffKey): Progress => ({ ...p, dif });
