import { beforeEach, describe, expect, it } from 'vitest';
import { HANDOFF_KEYS, encodeHandoff, importHandoff } from '../migrate';

const store = new Map<string, string>();

describe('progress handoff from the old origin', () => {
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('carries every remembered key across and reports what it imported', () => {
    const data = {
      'fiftyStatesDrill.v1': '{"lv":{"CA":{"find":2}},"err":{},"best":{}}',
      'fiftyStatesDrill.theme': 'dark',
      'fiftyStatesDrill.versus.name': 'Obie',
    };
    const hash = `#import=${encodeHandoff(data)}`;
    expect(importHandoff(hash)).toEqual(Object.keys(data));
    for (const [k, v] of Object.entries(data)) expect(store.get(k)).toBe(v);
  });

  it('never overwrites what this origin already has', () => {
    store.set('fiftyStatesDrill.v1', 'mine');
    const hash = `#import=${encodeHandoff({ 'fiftyStatesDrill.v1': 'theirs', 'fiftyStatesDrill.theme': 'light' })}`;
    expect(importHandoff(hash)).toEqual(['fiftyStatesDrill.theme']);
    expect(store.get('fiftyStatesDrill.v1')).toBe('mine');
  });

  it('takes only the keys it knows', () => {
    const hash = `#import=${encodeHandoff({ evil: 'x', 'fiftyStatesDrill.theme': 'dark' })}`;
    expect(importHandoff(hash)).toEqual(['fiftyStatesDrill.theme']);
    expect(store.has('evil')).toBe(false);
  });

  it('survives unicode in a name', () => {
    const hash = `#import=${encodeHandoff({ 'fiftyStatesDrill.versus.name': 'Zoë' })}`;
    importHandoff(hash);
    expect(store.get('fiftyStatesDrill.versus.name')).toBe('Zoë');
  });

  it('ignores a hash with nothing to import, or one that is garbled', () => {
    expect(importHandoff('')).toEqual([]);
    expect(importHandoff('#versus=ACDE')).toEqual([]);
    expect(importHandoff('#import=')).toEqual([]);
    expect(importHandoff('#import=!!!notbase64')).toEqual([]);
    expect(importHandoff(`#import=${btoa('"a string"')}`)).toEqual([]);
    expect(importHandoff(`#import=${btoa('{"v":9,"data":{}}')}`)).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('drops values that are not strings', () => {
    const hash = `#import=${btoa(JSON.stringify({ v: 1, data: { 'fiftyStatesDrill.theme': 7 } }))}`;
    expect(importHandoff(hash)).toEqual([]);
  });

  it('names the keys the old page has to gather', () => {
    expect(HANDOFF_KEYS).toContain('fiftyStatesDrill.v1');
    expect(HANDOFF_KEYS).toContain('fiftyStatesDrill.versus.leaderboard.v1');
  });
});
