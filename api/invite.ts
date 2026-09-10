import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inviteCode, inviteHtml } from '../server/invite';
import { sendHtml } from '../server/http';
import type { Req, Res } from '../server/http';

/**
 * `GET /versus/CODE`, by a rewrite in vercel.json: the app's page with the
 * room on its preview card. See server/invite.ts.
 *
 * The built page is bundled in with the function (`includeFiles`, also in
 * vercel.json). Should it be missing — a local run before a build — the
 * page is fetched from the deployment itself instead, so the link still
 * opens the app either way.
 */

let template: Promise<string> | null = null;

function loadTemplate(host: string, proto: string): Promise<string> {
  template ??= readFile(join(process.cwd(), 'dist', 'index.html'), 'utf8').catch(async () => {
    const res = await fetch(`${proto}://${host}/index.html`);
    if (!res.ok) throw new Error(`index.html: ${res.status}`);
    return res.text();
  });
  // A failure is not kept: the next request tries again.
  template.catch(() => { template = null; });
  return template;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'fifty-states-drill.vercel.app');
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https');
  const url = new URL(req.url ?? '/', `${proto}://${host}`);
  const code = inviteCode(url.searchParams.get('code'));
  if (!code) {
    // Not a room code at all: the app decides what to show.
    res.statusCode = 302;
    res.setHeader('location', '/versus');
    res.end();
    return;
  }
  try {
    const page = inviteHtml(await loadTemplate(host, proto), code, `${proto}://${host}`);
    // The card for a code never changes; let the edge keep it for a day.
    sendHtml(res, 200, page, 86400);
  } catch (err) {
    console.error(err);
    res.statusCode = 302;
    res.setHeader('location', '/versus');
    res.end();
  }
}
