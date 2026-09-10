import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The little that a Vercel function needs of Node's request and response.
 *
 * Vercel parses a JSON body into `req.body` before the handler runs; when it
 * has not — a different content type, or none — the raw text is read here.
 */
export type Req = IncomingMessage & { body?: unknown };

export type Res = ServerResponse;

export function send(res: Res, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/** A page. Shared caches may keep it for `sMaxAge` seconds; browsers never do. */
export function sendHtml(res: Res, status: number, html: string, sMaxAge = 0): void {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', sMaxAge > 0 ? `public, max-age=0, s-maxage=${sMaxAge}` : 'no-store');
  res.end(html);
}

/** The request's JSON body, or undefined if there is none worth the name. */
export async function readJson(req: Req): Promise<unknown> {
  if (req.body !== undefined && typeof req.body !== 'string') return req.body;
  let text = typeof req.body === 'string' ? req.body : '';
  if (!text) {
    for await (const chunk of req) text += chunk;
  }
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
