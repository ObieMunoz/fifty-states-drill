import { describe, expect, it } from 'vitest';
import { ASPECT, fitBox, fullBox, shapeBox } from '../lib/geo';
import { fmtTime, lev, near, norm, ordSuf } from '../lib/text';
import { weightedIndex } from '../lib/random';
import { BY, ST } from '../data/states';

describe('answer matching', () => {
  it('folds case, punctuation, accents and Saint spellings', () => {
    expect(norm('St. Paul')).toBe(norm('Saint Paul'));
    expect(norm('Montgomery')).toBe('montgomery');
    expect(norm('Ságo')).toBe('sago');
  });

  it('accepts a one-letter slip in a long name', () => {
    expect(near('Tallahasse', 'Tallahassee')).toBe(true);
    expect(near('MISSISIPPI', 'Mississippi')).toBe(true);
  });

  it('rejects short near-misses, where one letter changes the answer', () => {
    // Four letters, one edit apart: forgiving here would accept the wrong state.
    expect(near('Ohio', 'Iowa')).toBe(false);
    expect(near('Utah', 'Utat')).toBe(false);
  });

  it('keeps Denver and Dover, Columbus and Columbia apart', () => {
    expect(near('Denver', 'Dover')).toBe(false);
    expect(near('Columbus', 'Columbia')).toBe(false);
  });

  it('bails out of the edit distance when lengths differ by more than one', () => {
    expect(lev('abc', 'abcde')).toBe(9);
    expect(lev('kitten', 'sitten')).toBe(1);
  });

  it('formats ordinals and times', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 50].map(ordSuf))
      .toEqual(['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'st', 'nd', 'th']);
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(65_000)).toBe('1:05');
    expect(fmtTime(600_000)).toBe('10:00');
  });
});

describe('map framing', () => {
  it('frames the whole map by default', () => {
    expect(fullBox()).toEqual({ x: 0, y: 0, w: 975, h: 622 });
  });

  it('always produces the map aspect ratio, so nothing is squashed', () => {
    for (const s of [BY.RI, BY.TX, BY.AK, BY.HI]) {
      const b = fitBox([s], 0.06);
      expect(b.w / b.h).toBeCloseTo(ASPECT, 6);
    }
  });

  it('contains every state it is asked to frame', () => {
    const box = fitBox([BY.CT, BY.ME, BY.VT]);
    for (const s of [BY.CT, BY.ME, BY.VT]) {
      expect(s.bb[0]).toBeGreaterThanOrEqual(box.x);
      expect(s.bb[2]).toBeLessThanOrEqual(box.x + box.w);
    }
  });

  it('pads a small state proportionally rather than by a fixed margin', () => {
    // The default fixed padding swamps the frame for somewhere Rhode Island's size.
    const tight = fitBox([BY.RI], 0.06);
    const loose = fitBox([BY.RI]);
    expect(tight.w).toBeLessThan(loose.w);
  });

  it('falls back to the full map when given nothing', () => {
    expect(fitBox([])).toEqual(fullBox());
  });

  it('frames a silhouette around its own bounding box', () => {
    const [x, y, w, h] = shapeBox(BY.MI).split(' ').map(Number);
    expect(x).toBeLessThan(BY.MI.bb[0]);
    expect(y).toBeLessThan(BY.MI.bb[1]);
    expect(x + w).toBeGreaterThan(BY.MI.bb[2]);
    expect(y + h).toBeGreaterThan(BY.MI.bb[3]);
  });
});

describe('weighted picking', () => {
  it('never returns an out-of-range index', () => {
    for (let i = 0; i < 500; i++) {
      const n = weightedIndex([1, 0, 3, 0.5]);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
    }
  });

  it('covers the whole list given equal weights', () => {
    const seen = new Set<number>();
    const weights = ST.map(() => 1);
    for (let i = 0; i < 5000; i++) seen.add(weightedIndex(weights));
    expect(seen.size).toBe(ST.length);
  });
});
