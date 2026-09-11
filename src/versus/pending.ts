import { CODE_LENGTH, normalizeCode } from './room';

/**
 * The room a tapped notification named, written down where the page can
 * find it for itself.
 *
 * The worker cannot count on reaching the page. An installed app in the
 * background is asleep when the tap comes, and on iOS a message posted to
 * it then is lost as often as not, as is a navigation asked of it; the
 * phone may even throw the page away and reload it on the way to the
 * front. What does work is bringing the app forward. So the room is left
 * here, in the one store a worker and a page share, and the page looks
 * for it on its own whenever it starts or comes to the front (src/pwa.ts).
 */
const CACHE = 'versus-pending';
const KEY = '/_pending-room';

/** Older than this, a note is a tap from another day, not an invitation to act on. */
export const PENDING_TTL_MS = 5 * 60 * 1000;

interface Note {
  code: string;
  /** Epoch ms of the tap. */
  at: number;
}

/** Leave the room for the page. Written by the worker. */
export async function rememberRoom(code: string, at = Date.now()): Promise<void> {
  const cache = await caches.open(CACHE);
  const note: Note = { code, at };
  await cache.put(KEY, new Response(JSON.stringify(note), {
    headers: { 'content-type': 'application/json' },
  }));
}

/** The room left for this page, if one is still worth acting on. Reading it takes it. */
export async function takePendingRoom(now = Date.now()): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match(KEY);
    if (!res) return null;
    await cache.delete(KEY);
    return pendingCode(await res.json(), now);
  } catch {
    return null;
  }
}

/** Tear the note up unread: the page has been told another way. */
export async function forgetPendingRoom(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE);
    await cache.delete(KEY);
  } catch {
    // No store, or nothing in it; either way there is nothing left to act on.
  }
}

/** A note's room, or null for one that is malformed or stale. */
export function pendingCode(raw: unknown, now = Date.now()): string | null {
  const n = raw as Partial<Note> | null;
  if (!n || typeof n.code !== 'string' || typeof n.at !== 'number') return null;
  if (now - n.at > PENDING_TTL_MS) return null;
  const code = normalizeCode(n.code);
  return code.length === CODE_LENGTH ? code : null;
}
