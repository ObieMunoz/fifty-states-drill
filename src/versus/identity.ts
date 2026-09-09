/**
 * The player's display name, remembered on this device.
 *
 * Nobody signs in; the name exists so the scoreboard and the leaderboard can
 * say "Obie" rather than "You". It is pre-filled on every later match and can
 * be changed or cleared from the lobby.
 */
const NAME_KEY = 'fiftyStatesDrill.versus.name';

/** Long enough for a real name, short enough to fit a scoreboard on a phone. */
export const MAX_NAME = 14;

/** Trim, collapse whitespace, and cap the length. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

export function loadName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    // Private mode or blocked storage: the player just types a name again.
    return '';
  }
}

export function saveName(name: string): void {
  const v = cleanName(name);
  try {
    if (v) localStorage.setItem(NAME_KEY, v);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Nothing to do; the name still holds for this session.
  }
}

export function clearName(): void {
  try {
    localStorage.removeItem(NAME_KEY);
  } catch {
    // Ignored, as above.
  }
}

/** A stand-in so an empty name never reaches the wire or the leaderboard. */
export const displayName = (name: string, fallback = 'Player'): string =>
  cleanName(name) || fallback;
