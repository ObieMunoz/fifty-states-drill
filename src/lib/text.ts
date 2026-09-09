/**
 * Fold a typed answer down to bare lowercase letters so that punctuation,
 * accents and "Saint"/"St." spellings all compare equal.
 */
export const norm = (s: string): string =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '').replace(/^saint/, 'st');

/**
 * Levenshtein distance, but bailing out at 9 once the lengths differ by more
 * than one — every caller only cares whether the answer is within one edit.
 */
export function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Forgiving equality for typed answers: misspelling a state you plainly know
 * is not a knowledge failure.
 *
 * Denver/Dover and Columbus/Columbia are only 2 edits apart, so never accept
 * more than 1.
 */
export const near = (a: string, b: string): boolean => {
  const x = norm(a);
  const y = norm(b);
  return x === y || (x.length >= 5 && lev(x, y) <= 1);
};

/** Ordinal suffix for admission order: 1st, 2nd, 3rd, 11th, 22nd. */
export const ordSuf = (n: number): string =>
  (n % 100 >= 11 && n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');

/** Elapsed milliseconds as m:ss. */
export const fmtTime = (ms: number): string => {
  const t = Math.floor(ms / 1000);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
};
