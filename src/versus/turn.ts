/**
 * TURN credentials, fetched fresh for each search.
 *
 * A static site has nowhere to keep a secret, and no TURN service worth
 * relying on hands out credentials that never expire — the free one this
 * app shipped with turned out to reject them. So the credentials come from
 * an endpoint that holds the secret and mints short-lived ones on request:
 * the Cloudflare Worker in `worker/`, or a hosted service that offers the
 * same thing. Its address is `VITE_TURN_URL` at build time. With none set,
 * the search runs on STUN alone and two phones on cellular will not connect.
 *
 * The reply is either a list of ICE servers, or an object with one under
 * `iceServers`, which is what the Cloudflare API itself returns; both are
 * taken, so the endpoint can pass Cloudflare's answer straight through.
 */
export interface TurnServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Longer than this and the search is better off starting without it. */
const FETCH_TIMEOUT_MS = 4000;

const isServer = (v: unknown): v is TurnServer => {
  if (!v || typeof v !== 'object') return false;
  const urls = (v as { urls?: unknown }).urls;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'));
};

function parse(body: unknown): TurnServer[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && 'iceServers' in body
      ? [(body as { iceServers: unknown }).iceServers].flat()
      : [];
  return list.filter(isServer);
}

export async function fetchTurnServers(
  url: string | undefined, timeoutMs = FETCH_TIMEOUT_MS,
): Promise<TurnServer[]> {
  if (!url) return [];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: abort.signal });
    if (!res.ok) return [];
    return parse(await res.json());
  } catch {
    // Offline, refused, cut off or garbled: the search goes on without it.
    return [];
  } finally {
    clearTimeout(timer);
  }
}
