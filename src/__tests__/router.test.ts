import { describe, expect, it } from 'vitest';
import { MODE_KEYS } from '../data/modes';
import { HOME, MODE_PATHS, modeRoute, parseRoute, pathOf } from '../router';

describe('routes', () => {
  it('gives every mode a path of its own, and reads each one back', () => {
    const paths = new Set(MODE_KEYS.map((k) => MODE_PATHS[k]));
    expect(paths.size).toBe(MODE_KEYS.length);
    for (const k of MODE_KEYS) {
      expect(parseRoute(MODE_PATHS[k])).toEqual(modeRoute(k));
      expect(parseRoute(pathOf(modeRoute(k)))).toEqual(modeRoute(k));
    }
  });

  it('keeps the map at the root', () => {
    expect(pathOf(HOME)).toBe('/');
    expect(parseRoute('/')).toEqual(HOME);
    expect(parseRoute('/learn/map')).toEqual(HOME);
  });

  it('forgives a trailing slash and falls back to home for anything unknown', () => {
    expect(parseRoute('/quiz/capitals/')).toEqual(modeRoute('capital'));
    expect(parseRoute('/nothing/here')).toEqual(HOME);
    expect(parseRoute('/quiz')).toEqual(HOME);
  });

  it('puts Versus and its rooms under /versus', () => {
    expect(pathOf({ kind: 'versus', code: null })).toBe('/versus');
    expect(pathOf({ kind: 'versus', code: 'ACDE' })).toBe('/versus/ACDE');
    expect(parseRoute('/versus')).toEqual({ kind: 'versus', code: null });
    expect(parseRoute('/versus/ACDE')).toEqual({ kind: 'versus', code: 'ACDE' });
    expect(parseRoute('/versus/acde')).toEqual({ kind: 'versus', code: 'ACDE' });
    // Not a code: the menu, which is where the app can say so.
    expect(parseRoute('/versus/AC')).toEqual({ kind: 'versus', code: null });
  });

  it('still reads the invite fragment links carried before rooms had a path', () => {
    expect(parseRoute('/', '#versus=ACDE')).toEqual({ kind: 'versus', code: 'ACDE' });
    expect(parseRoute('/', '#import=abc&versus=ACDE')).toEqual({ kind: 'versus', code: 'ACDE' });
    expect(parseRoute('/', '#import=abc')).toEqual(HOME);
  });
});
