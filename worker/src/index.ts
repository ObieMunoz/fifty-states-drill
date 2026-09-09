/**
 * Mints TURN credentials for Versus, so the site itself need hold no secret.
 *
 * Cloudflare's TURN service takes a key id and an API token and hands back
 * credentials good for a set time. Those two are Worker secrets; the site
 * calls this endpoint and gets only the short-lived result, which is all a
 * browser needs. Requests are limited to the site's own origin, so nobody
 * else's page can spend the allowance, and the reply is the list of ICE
 * servers in the shape `src/versus/turn.ts` reads.
 */
interface Env {
  TURN_KEY_ID: string;
  TURN_KEY_API_TOKEN: string;
  ALLOWED_ORIGINS: string;
}

/** How long a set of credentials stays good. A match connects within seconds. */
const TTL_SECONDS = 3600;

const CLOUDFLARE_API = 'https://rtc.live.cloudflare.com/v1/turn/keys';

const allowed = (origin: string | null, env: Env): boolean =>
  origin !== null && env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).includes(origin);

const reply = (body: unknown, status: number, origin: string | null): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin');
    if (!allowed(origin, env)) return reply({ error: 'origin not allowed' }, 403, null);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin as string,
          'access-control-allow-methods': 'GET',
          'access-control-max-age': '86400',
          vary: 'origin',
        },
      });
    }
    if (request.method !== 'GET') return reply({ error: 'method not allowed' }, 405, origin);

    const upstream = await fetch(
      `${CLOUDFLARE_API}/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );
    if (!upstream.ok) return reply({ error: 'could not mint credentials' }, 502, origin);

    // Cloudflare answers with one server entry under `iceServers`; the site
    // takes that as it is, or a list.
    const body = await upstream.json() as { iceServers: unknown };
    return reply({ iceServers: body.iceServers }, 200, origin);
  },
};
