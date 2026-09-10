/**
 * Who this device is, to the server.
 *
 * Nobody signs in. A random id, drawn once and kept, is enough for the server
 * to tell the two phones in a room apart, to know which of them hosts, and
 * to seat a phone that reloads back where it was. It is not a secret and it
 * identifies nobody: it is the same id whatever name the player types.
 */
const KEY = 'fiftyStatesDrill.versus.player';

let cached: string | null = null;

const draw = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export function playerId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return (cached = stored);
    const id = draw();
    localStorage.setItem(KEY, id);
    return (cached = id);
  } catch {
    // Blocked storage: the id lasts for this page load, which is enough to play.
    return (cached = draw());
  }
}
