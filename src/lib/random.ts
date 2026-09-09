/** Fisher-Yates, in place. Returns the same array for chaining. */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pickRnd = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];

/**
 * Index into `weights` chosen in proportion to the weights. Assumes at least
 * one entry and non-negative weights.
 */
export function weightedIndex(weights: number[]): number {
  const total = weights.reduce((n, w) => n + w, 0);
  let r = Math.random() * total;
  let i = 0;
  while (i < weights.length - 1 && (r -= weights[i]) > 0) i++;
  return i;
}
