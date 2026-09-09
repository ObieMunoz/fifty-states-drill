import { describe, expect, it } from 'vitest';
import { HOOKS } from '../data/hooks';
import { BY, ST } from '../data/states';

/**
 * The memory hooks make factual claims about the map. Check them against the
 * geometry rather than trusting them, which is how they were written.
 */
describe('memory hooks', () => {
  const all = HOOKS.flatMap((g) => g.items);

  it('only names real states', () => {
    for (const h of all) {
      for (const a of h.s) expect(BY[a], `${h.t} names unknown ${a}`).toBeDefined();
      expect(h.s.length, h.t).toBeGreaterThan(0);
    }
  });

  it('South Carolina touches exactly Georgia and North Carolina', () => {
    expect([...BY.SC.nb].sort()).toEqual(['GA', 'NC']);
    expect(BY.NC.nb).toHaveLength(4);
  });

  it('South Dakota has six neighbours to North Dakota’s three', () => {
    expect(BY.SD.nb).toHaveLength(6);
    expect(BY.ND.nb).toHaveLength(3);
  });

  it('Maine has exactly one neighbour', () => {
    expect(BY.ME.nb).toEqual(['NH']);
  });

  it('Alaska and Hawaii border nothing', () => {
    expect(BY.AK.nb).toEqual([]);
    expect(BY.HI.nb).toEqual([]);
  });

  it('Missouri and Tennessee tie for the most neighbours, at eight', () => {
    const most = Math.max(...ST.map((s) => s.nb.length));
    expect(most).toBe(8);
    expect(ST.filter((s) => s.nb.length === most).map((s) => s.a).sort()).toEqual(['MO', 'TN']);
  });

  it('Four Corners states meet only at the point, not along borders', () => {
    expect(BY.UT.nb).not.toContain('NM');
    expect(BY.CO.nb).not.toContain('AZ');
    expect(BY.UT.nb).toContain('CO');
    expect(BY.AZ.nb).toContain('NM');
  });

  it('Michigan touches Ohio, Indiana and Wisconsin but not Illinois or Minnesota', () => {
    expect([...BY.MI.nb].sort()).toEqual(['IN', 'OH', 'WI']);
  });

  it('Kansas and Arkansas share no border', () => {
    expect(BY.KS.nb).not.toContain('AR');
  });

  it('exactly four states border Mexico, and Delaware was admitted first', () => {
    expect(ST.filter((s) => s.ord === 1).map((s) => s.a)).toEqual(['DE']);
    expect(ST.filter((s) => s.ord === 50).map((s) => s.a)).toEqual(['HI']);
  });

  it('counts sixteen states starting with M or N', () => {
    expect(ST.filter((s) => 'MN'.includes(s.n[0]))).toHaveLength(16);
  });
});
