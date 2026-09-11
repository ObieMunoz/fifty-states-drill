/**
 * Room codes.
 *
 * The common case is two people in the same room, where the code gets read
 * aloud or scanned off a screen. That rules out anything long, and it rules
 * out the character pairs people mishear or mistype: no O/0, no I/1/L, no
 * S/5, no B/8.
 */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

/** Four characters of this alphabet is ~390k codes — plenty for a living room. */
export const CODE_LENGTH = 4;

/** Characters people reliably substitute, folded to the one we keep. */
const CONFUSIONS: Record<string, string> = {
  O: 'Q', '0': 'Q', I: 'J', '1': 'J', L: 'J', S: '4', '5': '4', B: '3', '8': '3', Z: '7', '2': '7',
};

export function newRoomCode(len = CODE_LENGTH): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Fold typed input towards a real code: uppercase, drop anything that is not a
 * letter or digit, and map the characters people commonly substitute.
 */
export function normalizeCode(raw: string): string {
  const up = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = '';
  for (const ch of up) {
    const mapped = CONFUSIONS[ch] ?? ch;
    if (ALPHABET.includes(mapped)) out += mapped;
  }
  return out.slice(0, CODE_LENGTH);
}

export const isCompleteCode = (code: string): boolean =>
  normalizeCode(code).length === CODE_LENGTH;

/** The link a guest opens to land straight in the room. */
export function joinUrl(code: string, origin = window.location.origin): string {
  return `${origin}/versus/${normalizeCode(code)}`;
}

/**
 * The room code in a URL, if the page was opened from an invite. Rooms live
 * at `/versus/CODE`; the fragment form, `#versus=CODE`, is what invites
 * carried before rooms had a path, and those links still work.
 */
export function codeFromUrl(
  pathname = window.location.pathname,
  hash = window.location.hash,
): string | null {
  const m = /^\/versus\/([^/]+)\/?$/.exec(pathname) ?? /[#&]versus=([A-Za-z0-9]+)/.exec(hash);
  if (!m) return null;
  const code = normalizeCode(decodeURIComponent(m[1]));
  return code.length === CODE_LENGTH ? code : null;
}

/**
 * Put the room in the URL, so a reload lands back in it rather than on the
 * menu. A guest who arrived by invite already has it; this gives the host,
 * and a guest who typed the code, the same way back after a dropped tab.
 * Replaces rather than pushes: the room is where /versus led, not a step past it.
 */
export function setUrlCode(code: string): void {
  history.replaceState(null, '', `/versus/${normalizeCode(code)}${window.location.search}`);
}

/**
 * Drop the room from the URL on the way out, so a reload does not rejoin
 * it. Given the room being left, a URL naming another room is left alone:
 * the next room's screen may already have written its own code there — a
 * tapped notification opens the new room while the old one is still on its
 * way out — and that has to stand.
 */
export function clearUrlCode(code?: string): void {
  if (!/^\/versus\//.test(window.location.pathname) && !window.location.hash) return;
  const named = codeFromUrl();
  if (code && named && named !== normalizeCode(code)) return;
  history.replaceState(null, '', `/versus${window.location.search}`);
}

/**
 * The seed for one match in a room.
 *
 * The room code alone would make every match in a room identical, so the
 * match number goes in too. The host sends the result, so both sides agree
 * even though only one of them computed it.
 */
export const matchSeed = (code: string, matchNo: number): string =>
  `${normalizeCode(code)}:${matchNo}`;
