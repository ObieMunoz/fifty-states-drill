import type { Outcome } from './scoring';

/**
 * The room's series, kept on this device while the room is open.
 *
 * A reload, a locked phone or a tapped notification brings a phone straight
 * back into its room, and the running score of the evening should come back
 * with it rather than start over at match one. One room at a time is kept;
 * leaving clears it.
 */
const KEY = 'fiftyStatesDrill.versus.series';

const OUTCOMES = new Set<string>(['win', 'loss', 'draw']);

export function loadSeries(code: string): Record<string, Outcome> {
  if (!code) return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { code?: unknown; series?: unknown } | null;
    if (!parsed || parsed.code !== code || !parsed.series || typeof parsed.series !== 'object') return {};
    const out: Record<string, Outcome> = {};
    for (const [seed, o] of Object.entries(parsed.series as Record<string, unknown>)) {
      if (typeof o === 'string' && OUTCOMES.has(o)) out[seed] = o as Outcome;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSeries(code: string, series: Record<string, Outcome>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, series }));
  } catch {
    // Storage unavailable: the series holds for this page load.
  }
}

export function clearSeries(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignored, as above.
  }
}
