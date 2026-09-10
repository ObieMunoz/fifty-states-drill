/**
 * A source of randomness in [0, 1). `Math.random` is the default everywhere;
 * versus mode passes a seeded generator instead so that two devices holding
 * the same seed draw the same questions.
 */
export type Rng = () => number;

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * The point is reproducibility, not cryptographic quality: given the same
 * seed it yields the same sequence in every browser, which is what lets two
 * phones and the server agree on a question order without sending the
 * questions themselves.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, so a room code or seed string becomes a 32-bit PRNG seed. */
export function hashSeed(s: string): number {
  let h = 0x811C9DC5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher-Yates, in place. Returns the same array for chaining. */
export function shuffle<T>(a: T[], rnd: Rng = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pickRnd = <T>(a: T[], rnd: Rng = Math.random): T => a[(rnd() * a.length) | 0];

/**
 * Index into `weights` chosen in proportion to the weights. Assumes at least
 * one entry and non-negative weights.
 */
export function weightedIndex(weights: number[], rnd: Rng = Math.random): number {
  const total = weights.reduce((n, w) => n + w, 0);
  let r = rnd() * total;
  let i = 0;
  while (i < weights.length - 1 && (r -= weights[i]) > 0) i++;
  return i;
}
