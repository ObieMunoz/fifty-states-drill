import { STORAGE_KEY } from './game/progress';
import { THEME_KEY } from './hooks/useTheme';

/**
 * Bringing a device's saved state across from the old address.
 *
 * The app moved from GitHub Pages to its own domain, and localStorage does
 * not follow: a phone that had forty states at Solid would land on the new
 * site with a blank map. So the old address now redirects here with what it
 * held in the URL fragment, and this imports it once. Only the keys named
 * below are taken, and nothing already stored here is overwritten — a device
 * that has been on the new site a while and follows an old link keeps its
 * newer state.
 *
 * The fragment never reaches a server: browsers do not send it.
 */
export const HANDOFF_KEYS = [
  STORAGE_KEY,
  THEME_KEY,
  'fiftyStatesDrill.versus.name',
  'fiftyStatesDrill.versus.leaderboard.v1',
] as const;

const VERSION = 1;

interface Handoff {
  v: number;
  data: Record<string, unknown>;
}

const toBase64Url = (s: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (s: string): string => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** What the old page puts in the URL. Kept here so both ends agree. */
export function encodeHandoff(data: Record<string, string>): string {
  return toBase64Url(JSON.stringify({ v: VERSION, data } satisfies Handoff));
}

function decode(hash: string): Handoff | null {
  const m = /[#&]import=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(m[1]));
    if (!parsed || typeof parsed !== 'object') return null;
    const h = parsed as Partial<Handoff>;
    if (h.v !== VERSION || !h.data || typeof h.data !== 'object') return null;
    return h as Handoff;
  } catch {
    return null;
  }
}

/** Import what the fragment carries. Returns the keys actually written. */
export function importHandoff(hash: string): string[] {
  const h = decode(hash);
  if (!h) return [];
  const written: string[] = [];
  for (const key of HANDOFF_KEYS) {
    const value = h.data[key];
    if (typeof value !== 'string') continue;
    try {
      if (localStorage.getItem(key) !== null) continue;
      localStorage.setItem(key, value);
      written.push(key);
    } catch {
      // Storage unavailable: nothing to import into.
    }
  }
  return written;
}

/** Take the fragment off the URL once it has been read, so a reload is clean. */
export function clearHandoff(): void {
  if (!/[#&]import=/.test(window.location.hash)) return;
  const clean = window.location.hash.replace(/[#&]import=[A-Za-z0-9_-]*/g, '');
  history.replaceState(null, '', window.location.pathname + window.location.search
    + (clean && clean !== '#' ? clean : ''));
}
