import { describe, expect, it } from 'vitest';
import { ST } from '../data/states';

import { matchPool, planMatch, roundsForMode } from '../versus/plan';
import { askFor, grade } from '../versus/grade';
import { isTyped, roundLimitMs } from '../versus/scoring';
import { stateClass } from '../versus/marks';
import { VERSUS_MODES } from '../versus/types';
import { BY } from '../data/states';
import type { Abbr } from '../types';

const cfg = (over = {}) => ({ seed: 'ACDE:0', mode: 'place' as const, rounds: 50, scope: 'all', ...over });

describe('Place It is a mode Versus offers', () => {
  it('is on the Versus menu', () => {
    expect(VERSUS_MODES).toContain('place');
  });

  it('runs one round per state in the scope', () => {
    expect(roundsForMode('place', 'all')).toBe(50);
    expect(roundsForMode('place', 'r:Northeast')).toBe(matchPool('r:Northeast').length);
  });

  it('leaves every other mode to the lobby’s round choice', () => {
    expect(roundsForMode('find', 'all', 15)).toBe(15);
    expect(roundsForMode('mixed', 'r:West', 5)).toBe(5);
  });
});

describe('the Place It plan', () => {
  it('asks for all fifty states, each exactly once', () => {
    const plan = planMatch(cfg());

    expect(plan).toHaveLength(50);
    expect(new Set(plan.map((r) => r.abbr)).size).toBe(50);
    expect(plan.every((r) => r.qm === 'place')).toBe(true);
  });

  it('fills a region exactly once through when scoped to one', () => {
    const pool = matchPool('r:Northeast');
    const plan = planMatch(cfg({ scope: 'r:Northeast', rounds: pool.length }));

    expect(new Set(plan.map((r) => r.abbr)).size).toBe(pool.length);
  });

  it('deals the same order to both phones from one seed', () => {
    expect(planMatch(cfg()).map((r) => r.abbr)).toEqual(planMatch(cfg()).map((r) => r.abbr));
  });

  it('deals a different order from a different seed', () => {
    const a = planMatch(cfg()).map((r) => r.abbr).join(',');
    const b = planMatch(cfg({ seed: 'ACDE:1' })).map((r) => r.abbr).join(',');

    expect(a).not.toBe(b);
  });
});

describe('answering a Place It round', () => {
  const round = { qm: 'place' as const, abbr: 'OH' as Abbr };

  it('is answered on the map, never typed, at every level', () => {
    for (const dif of ['guided', 'standard', 'expert'] as const) {
      expect(isTyped('place', dif)).toBe(false);
      expect(askFor('ACDE:0', 0, round, dif).choices).toBeNull();
    }
  });

  it('takes the tapped state as the answer', () => {
    const ask = askFor('ACDE:0', 0, round, 'standard');

    expect(grade(ask, 'place', 'OH')).toBe(true);
    expect(grade(ask, 'place', 'PA')).toBe(false);
  });

  it('gives the round the same clock as Find It', () => {
    expect(roundLimitMs('place', ['standard', 'standard']))
      .toBe(roundLimitMs('find', ['standard', 'standard']));
  });

  it('never gives the target away on the map', () => {
    expect(askFor('ACDE:0', 0, round, 'guided').show).toBeNull();
    expect(askFor('ACDE:0', 0, round, 'expert').show).toBeNull();
  });
});

describe('the map filling up', () => {
  const s = (a: Abbr) => BY[a];

  it('keeps a state placed in an earlier round filled', () => {
    const placed = new Set<Abbr>(['OH']);

    expect(stateClass(s('OH'), { placed })).toContain('done');
  });

  it('leaves a state still to come empty', () => {
    expect(stateClass(s('NV'), { placed: new Set<Abbr>(['OH']) })).toBe('st');
  });

  it('lets the round in play speak over what is already placed', () => {
    const placed = new Set<Abbr>(['OH']);

    expect(stateClass(s('OH'), { placed, picked: 'OH' })).toContain('pick');
    expect(stateClass(s('OH'), { placed, revealed: true, answer: 'OH' })).toContain('ok');
  });

  it('still paints a wrong tap wrong, even on a state already placed', () => {
    const placed = new Set<Abbr>(['OH']);

    expect(stateClass(s('OH'), { placed, revealed: true, answer: 'NV', picked: 'OH' })).toContain('bad');
  });

  it('starts from a blank map', () => {
    expect(ST.every((st) => stateClass(st, {}) === 'st')).toBe(true);
  });
});
