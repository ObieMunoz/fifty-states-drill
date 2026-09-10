import { CODE_LENGTH, normalizeCode } from '../src/versus/room';

/**
 * The page behind an invite link, `/versus/CODE`.
 *
 * It is the app's own index.html with the preview tags rewritten to name the
 * room, so that the card iMessage or Slack draws under the link says "Join
 * room ACDE" rather than describing the app. Nothing else changes: the same
 * scripts load, and the app reads the code out of the path as it would have
 * done anyway. No lookup is made — a code that names no room still gets a
 * card, and the app itself says the room is gone.
 */

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The room in a request's `code` query, if it is one. */
export function inviteCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const clean = normalizeCode(code);
  return clean.length === CODE_LENGTH ? clean : null;
}

/** The tags that change per room; the rest of the page is left as built. */
export function inviteHtml(template: string, code: string, origin: string): string {
  const title = `Join room ${code} · Fifty States Drill`;
  const description = `You're invited to a Versus match: two phones, the same 50-states questions, one clock. Tap to join room ${code}.`;
  const url = `${origin}/versus/${code}`;
  const set = (html: string, attr: 'property' | 'name', key: string, value: string) =>
    html.replace(
      new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`),
      (_, a: string, b: string) => `${a}${escape(value)}${b}`,
    );
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`);
  html = set(html, 'property', 'og:title', title);
  html = set(html, 'property', 'og:description', description);
  html = set(html, 'property', 'og:url', url);
  html = set(html, 'name', 'twitter:title', title);
  html = set(html, 'name', 'twitter:description', description);
  return html;
}
