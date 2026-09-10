import { MODE_KEYS } from './data/modes';
import type { ModeKey } from './types';
import { CODE_LENGTH, normalizeCode } from './versus/room';

/**
 * Where the app is, as a URL.
 *
 * Every mode has a path of its own, so a link to a quiz opens that quiz and
 * the back button walks through the modes visited. Versus is `/versus`, and
 * a room is `/versus/CODE`: the code is in the path rather than a fragment so
 * that the server sees it and can put the room on the link's preview card.
 */
export type Route =
  | { kind: 'mode'; mode: ModeKey }
  | { kind: 'versus'; code: string | null };

/** The path each mode lives at. Learn modes under /learn, quizzes under /quiz. */
export const MODE_PATHS: Record<ModeKey, string> = {
  map:     '/learn/map',
  letter:  '/learn/letters',
  cards:   '/learn/cards',
  hooks:   '/learn/hooks',
  weak:    '/learn/progress',
  find:    '/quiz/find-it',
  name:    '/quiz/name-it',
  shape:   '/quiz/silhouette',
  roll:    '/quiz/roll-call',
  all50:   '/quiz/all-50',
  capital: '/quiz/capitals',
  code:    '/quiz/postal-codes',
  border:  '/quiz/borders',
  mixed:   '/quiz/mixed',
};

export const HOME: Route = { kind: 'mode', mode: 'map' };

export const modeRoute = (mode: ModeKey): Route => ({ kind: 'mode', mode });

export function pathOf(route: Route): string {
  if (route.kind === 'mode') return route.mode === 'map' ? '/' : MODE_PATHS[route.mode];
  return route.code ? `/versus/${route.code}` : '/versus';
}

/**
 * The route a URL names, or home for one that names nothing.
 *
 * The fragment is read for the old invite form, `#versus=CODE`, which links
 * sent before rooms had a path still carry.
 */
export function parseRoute(pathname: string, hash = ''): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/versus') return { kind: 'versus', code: null };
  const room = /^\/versus\/([^/]+)$/.exec(path);
  if (room) {
    const code = normalizeCode(decodeURIComponent(room[1]));
    return { kind: 'versus', code: code.length === CODE_LENGTH ? code : null };
  }
  const legacy = /[#&]versus=([A-Za-z0-9]+)/.exec(hash);
  if (legacy) {
    const code = normalizeCode(legacy[1]);
    return { kind: 'versus', code: code.length === CODE_LENGTH ? code : null };
  }
  if (path === '/') return HOME;
  const mode = MODE_KEYS.find((k) => MODE_PATHS[k] === path);
  return mode ? modeRoute(mode) : HOME;
}

export const sameRoute = (a: Route, b: Route): boolean => pathOf(a) === pathOf(b);

/* ---------------- the browser ---------------- */

export const currentRoute = (): Route => parseRoute(window.location.pathname, window.location.hash);

/**
 * Put a route in the address bar. A new entry by default, so back returns to
 * the mode before; `replace` when the URL is being corrected rather than
 * moved, as on load. The fragment is dropped: nothing lives there any more,
 * and an old-style invite has been read by the time this runs.
 */
export function writeRoute(route: Route, replace = false): void {
  const path = pathOf(route);
  if (window.location.pathname === path && !window.location.hash) return;
  const url = path + window.location.search;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

/** Hear the back and forward buttons. Returns the unsubscribe. */
export function onRouteChange(cb: (route: Route) => void): () => void {
  const onPop = () => cb(currentRoute());
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
