import { describe, expect, it } from 'vitest';
import { ABBRS } from '../data/abbr';
import { BY, DIVS, LETTERS, REGS, ST } from '../data/states';

describe('state data', () => {
  it('has fifty states with unique names and codes', () => {
    expect(ST).toHaveLength(50);
    expect(new Set(ST.map((s) => s.a)).size).toBe(50);
    expect(new Set(ST.map((s) => s.n)).size).toBe(50);
  });

  it('matches the generated abbreviation union', () => {
    expect(ST.map((s) => s.a)).toEqual([...ABBRS]);
  });

  it('places every state in a known region and division', () => {
    for (const s of ST) {
      expect(REGS).toContain(s.reg);
      expect(DIVS).toContain(s.div);
    }
  });

  it('numbers admission order 1 through 50', () => {
    expect(ST.map((s) => s.ord).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it('has symmetric borders that name real states', () => {
    for (const s of ST) {
      for (const n of s.nb) {
        expect(BY[n], `${s.a} borders unknown ${n}`).toBeDefined();
        expect(BY[n].nb, `${n} should border ${s.a} back`).toContain(s.a);
      }
    }
  });

  it('includes each state its own neighbours-of-neighbours pool', () => {
    for (const s of ST) {
      // `nr` seeds the decoy pool, so every direct neighbour must appear in it.
      for (const n of s.nb) expect(s.nr).toContain(n);
      expect(s.nr).not.toContain(s.a);
    }
  });

  it('gives every state geometry and a label anchor inside its box', () => {
    for (const s of ST) {
      expect(s.d.length).toBeGreaterThan(20);
      const [x, y] = s.c;
      const [x0, y0, x1, y1] = s.bb;
      expect(x).toBeGreaterThanOrEqual(x0);
      expect(x).toBeLessThanOrEqual(x1);
      expect(y).toBeGreaterThanOrEqual(y0);
      expect(y).toBeLessThanOrEqual(y1);
      expect(s.ar).toBeGreaterThan(0);
    }
  });

  it('derives nineteen first letters', () => {
    expect(LETTERS).toHaveLength(19);
    for (const skipped of ['B', 'E', 'J', 'Q', 'X', 'Y', 'Z']) {
      expect(LETTERS).not.toContain(skipped);
    }
  });
});
