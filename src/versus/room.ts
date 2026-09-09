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

/**
 * The trystero room id. Namespaced so a code cannot collide with any other
 * room this app might use later.
 */
export const roomIdFor = (code: string): string => `fsd-versus-${normalizeCode(code)}`;

/** The link a guest opens to land straight in the room. */
export function joinUrl(code: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#versus=${normalizeCode(code)}`;
}

/** The room code in the current URL, if the page was opened from an invite. */
export function codeFromUrl(hash = window.location.hash): string | null {
  const m = /[#&]versus=([A-Za-z0-9]+)/.exec(hash);
  if (!m) return null;
  const code = normalizeCode(m[1]);
  return code.length === CODE_LENGTH ? code : null;
}

/**
 * Put the room in the URL, so a reload lands back in it rather than on the
 * menu. A guest who arrived by invite already has it; this gives the host,
 * and a guest who typed the code, the same way back after a dropped tab.
 */
export function setUrlCode(code: string): void {
  const { pathname, search } = window.location;
  history.replaceState(null, '', `${pathname}${search}#versus=${normalizeCode(code)}`);
}

/** Drop the room from the URL on the way out, so a reload does not rejoin it. */
export function clearUrlCode(): void {
  if (!window.location.hash) return;
  const clean = window.location.hash.replace(/[#&]versus=[A-Za-z0-9]*/g, '');
  history.replaceState(null, '', window.location.pathname + window.location.search
    + (clean && clean !== '#' ? clean : ''));
}

/**
 * Rooms this device has seen close, so a stale invite can be refused at once.
 *
 * There is no server to ask whether a room is still open. What is known is
 * that a room does not outlive its host: hosting again draws a fresh code, and
 * nobody else can take the old one over. So the host notes the code when it
 * leaves, and a guest notes it when told the host has gone. Joining that code
 * again from either device is then refused on the spot, rather than after a
 * thirty-second search for a host who is not coming. A device with no such
 * note gets the search, and then the same explanation.
 *
 * Only leaving on purpose counts. A reload, a discarded tab or a dropped
 * connection is not the host giving the room up: the guest waits for them,
 * and they come back on the same code — as a guest by claim, with the host
 * role settled again on meeting — so nothing is noted then.
 *
 * Notes expire after a day. Codes are dealt at random and one will come round
 * again eventually; a day is long past when anyone would still be holding it.
 */
const CLOSED_KEY = 'fiftyStatesDrill.versus.closed.v1';

const CLOSED_TTL_MS = 24 * 60 * 60 * 1000;

/** The codes still worth remembering, keyed to when each closed. */
function readClosed(now: number): Record<string, number> {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '{}');
  } catch {
    return {};
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const live: Record<string, number> = {};
  for (const [code, at] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof at === 'number' && now - at < CLOSED_TTL_MS) live[code] = at;
  }
  return live;
}

export function rememberClosed(code: string, now = Date.now()): void {
  const clean = normalizeCode(code);
  if (clean.length !== CODE_LENGTH) return;
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify({ ...readClosed(now), [clean]: now }));
  } catch {
    // Storage is unavailable; a rejoin will search and time out instead.
  }
}

export function isClosedRoom(code: string, now = Date.now()): boolean {
  try {
    return normalizeCode(code) in readClosed(now);
  } catch {
    return false;
  }
}

/**
 * The room this device is hosting, so coming back to it claims the host role.
 *
 * Which side hosts is settled when the two devices meet, from what each one
 * claims. A creator who reloads, or opens a fresh tab and types their own
 * code, would otherwise come back claiming nothing, and the role would fall
 * to whichever peer id sorts lower — sometimes the guest. Then the creator's
 * Leave would read as a guest's, and the guest would be left waiting for a
 * host who had just closed the room on purpose. Noted here so the creator
 * claims the room again on return; cleared when they leave it on purpose.
 */
const HOSTED_KEY = 'fiftyStatesDrill.versus.hosted';

export function rememberHosted(code: string): void {
  try {
    localStorage.setItem(HOSTED_KEY, normalizeCode(code));
  } catch {
    // Storage is unavailable; the role falls back to the tie-break on return.
  }
}

export function forgetHosted(): void {
  try {
    localStorage.removeItem(HOSTED_KEY);
  } catch {
    // Ignored, as above.
  }
}

export function isHostedHere(code: string): boolean {
  try {
    return localStorage.getItem(HOSTED_KEY) === normalizeCode(code);
  } catch {
    return false;
  }
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
