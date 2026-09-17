import { describe, expect, it } from 'vitest';
import { BY } from '../data/states';
import { matchPool } from '../versus/plan';
import { awardsFor, bestStreakOf, raceAwards, raceStats, sideStats } from '../versus/stats';
import type { PlannedRound, RoundAnswer } from '../versus/types';

const ans = (points: number, over: Partial<RoundAnswer> = {}): RoundAnswer =>
  ({ correct: points > 0, ms: 1000, points, pick: 'CA', timeout: false, ...over });

const miss = (over: Partial<RoundAnswer> = {}): RoundAnswer =>
  ({ correct: false, ms: 1000, points: 0, pick: 'XX', timeout: false, ...over });

const out = (): RoundAnswer => ({ correct: false, ms: 20000, points: 0, pick: null, timeout: true });

const plan = (n: number): PlannedRound[] =>
  ['CA', 'TX', 'NY', 'FL', 'OH', 'WA', 'CO', 'GA', 'MI', 'PA'].slice(0, n).map((abbr) => ({ qm: 'find', abbr } as PlannedRound));

const limits = (n: number, limit = 20000): number[] => Array.from({ length: n }, () => limit);

const keys = (a: ReturnType<typeof awardsFor>) => a.map((x) => x.key);

describe('a side’s statistics', () => {
  it('reads the sheet: score, hits, fastest, average, streak, rounds won', () => {
    const mine = [ans(150, { ms: 800 }), miss({ ms: 4000 }), ans(130, { ms: 2400 }), ans(140, { ms: 1600 }), out()];
    const theirs = [ans(100), ans(145), miss(), ans(110), ans(130)];
    expect(sideStats(mine, theirs)).toEqual({
      points: 420, correct: 3, asked: 5, fastestMs: 800, avgMs: 2200, bestStreak: 2, roundsWon: 3,
    });
  });

  it('has no times before anything is answered', () => {
    expect(sideStats([null, null], [null, null])).toMatchObject({ fastestMs: null, avgMs: null, bestStreak: 0, roundsWon: 0 });
    expect(sideStats([out(), out()], [null, null])).toMatchObject({ fastestMs: null, avgMs: null });
  });

  it('finds the longest run of right answers', () => {
    expect(bestStreakOf([])).toBe(0);
    expect(bestStreakOf([ans(1), ans(1), miss(), ans(1), ans(1), ans(1), null])).toBe(3);
    expect(bestStreakOf([miss(), out()])).toBe(0);
  });
});

describe('awards', () => {
  it('gives nothing for an empty match', () => {
    expect(awardsFor([], [], [], [])).toEqual([]);
  });

  it('notices a clean sweep, from either side or both', () => {
    const sweep = [ans(150), ans(140), ans(130)];
    const one = awardsFor(plan(3), sweep, [ans(150), miss(), ans(130)], limits(3));
    expect(one[0]).toMatchObject({ key: 'sweep', who: 'me', note: 'All 3 right' });
    const both = awardsFor(plan(3), sweep, [ans(150), ans(140), ans(130)], limits(3));
    expect(both[0]).toMatchObject({ key: 'sweep', who: 'both' });
    // Two rounds is too short to be a sweep.
    expect(keys(awardsFor(plan(2), [ans(150), ans(140)], [miss(), miss()], limits(2)))).not.toContain('sweep');
  });

  it('calls a comeback when the winner was well behind at some point', () => {
    // Behind by 150 after two rounds, then clears it.
    const mine = [miss(), miss(), ans(150), ans(150), ans(150)];
    const theirs = [ans(100), ans(50), miss(), miss(), miss()];
    const a = awardsFor(plan(5), mine, theirs, limits(5));
    expect(a.find((x) => x.key === 'comeback')).toMatchObject({ who: 'me', note: 'Down 150, won anyway' });
    // A deficit at the very end is a loss, not a comeback.
    const lost = awardsFor(plan(5), theirs, mine, limits(5));
    expect(lost.find((x) => x.key === 'comeback')).toMatchObject({ who: 'them' });
  });

  it('calls a clutch finish when the lead changed on the last round', () => {
    const mine = [ans(100), ans(100), ans(300)];
    const theirs = [ans(150), ans(100), miss()];
    const a = awardsFor(plan(3), mine, theirs, limits(3));
    expect(keys(a)).toContain('clutch');
    // Ahead before the last round: no clutch, whatever the margin.
    const ahead = awardsFor(plan(3), [ans(150), ans(150), ans(300)], [ans(100), ans(100), ans(100)], limits(3));
    expect(keys(ahead)).not.toContain('clutch');
  });

  it('calls a photo finish on a close result, and never on a draw', () => {
    const close = awardsFor(plan(3), [ans(150), ans(140), ans(130)], [ans(150), ans(140), ans(110)], limits(3));
    expect(close.find((x) => x.key === 'photo')).toMatchObject({ who: 'me', note: 'Decided by 20' });
    const drawn = awardsFor(plan(3), [ans(150), ans(140), ans(130)], [ans(150), ans(140), ans(130)], limits(3));
    expect(keys(drawn)).not.toContain('photo');
    expect(keys(drawn)).not.toContain('clutch');
    expect(keys(drawn)).not.toContain('comeback');
  });

  it('notices a streak worth mentioning, to whoever has the longer one', () => {
    const mine = [ans(1), ans(1), ans(1), miss(), ans(1)];
    const theirs = [ans(1), ans(1), miss(), ans(1), ans(1)];
    const a = awardsFor(plan(5), mine, theirs, limits(5));
    expect(a.find((x) => x.key === 'streak')).toMatchObject({ who: 'me', note: '3 in a row' });
    expect(keys(awardsFor(plan(5), theirs, theirs, limits(5)))).not.toContain('streak');
  });

  it('names the fastest right answer and the state it was on', () => {
    const mine = [ans(150, { ms: 900 }), ans(140, { ms: 3000 }), ans(130, { ms: 4000 })];
    const theirs = [ans(150, { ms: 1500 }), miss({ ms: 400 }), ans(130, { ms: 700 })];
    const a = awardsFor(plan(3), mine, theirs, limits(3));
    expect(a.find((x) => x.key === 'fastest')).toMatchObject({ who: 'them', note: `0.7s on ${BY.NY.n}` });
  });

  it('notices a right answer that only just made the clock', () => {
    const mine = [ans(101, { ms: 19200 }), ans(140), ans(130)];
    const theirs = [ans(150), miss({ ms: 19900 }), ans(130)];
    const a = awardsFor(plan(3), mine, theirs, limits(3));
    expect(a.find((x) => x.key === 'buzzer')).toMatchObject({ who: 'me', note: 'Right with 0.8s to spare' });
    // Comfortably inside the clock is not a buzzer beater.
    expect(keys(awardsFor(plan(3), [ans(120, { ms: 15000 }), ans(1), ans(1)], theirs, limits(3)))).not.toContain('buzzer');
  });

  it('lists what applies in a fixed order', () => {
    // Down 300 after two rounds, level going into the last, and wins it late.
    const mine = [miss(), miss(), ans(150, { ms: 600 }), ans(150), ans(340, { ms: 18500 })];
    const theirs = [ans(150), ans(150), miss(), miss(), ans(300)];
    expect(keys(awardsFor(plan(5), mine, theirs, limits(5)))).toEqual(['comeback', 'clutch', 'streak', 'fastest', 'buzzer']);
  });
});

describe('a race, which has no rounds to read', () => {
  const name = (abbr: string, ms: number): RoundAnswer =>
    ({ correct: true, ms, points: 1, pick: abbr, timeout: false });

  const list = (abbrs: string[], step: number): (RoundAnswer | null)[] =>
    [...abbrs.map((a, i) => name(a, (i + 1) * step)), ...Array<null>(50 - abbrs.length).fill(null)];

  it('counts the names, and when the first and last of them landed', () => {
    expect(raceStats(list(['CA', 'TX', 'NY', 'FL'], 3000), 50)).toEqual({
      named: 4, target: 50, firstMs: 3000, lastMs: 12000,
    });
  });

  it('has nothing to say about a player who named nothing', () => {
    expect(raceStats(Array<null>(50).fill(null), 50)).toEqual({
      named: 0, target: 50, firstMs: null, lastMs: null,
    });
  });

  it('gives only the awards a race can earn', () => {
    const a = raceAwards(list(['CA', 'TX', 'NY'], 2000), list(['OH', 'WA'], 5000), 50);
    expect(a.map((x) => x.key)).toEqual(['photo']);
    expect(a[0]).toMatchObject({ who: 'me', note: 'Decided by 1 state' });
  });

  it('gives nothing to a player who named two states and stopped', () => {
    // Two names in the first five seconds is not a performance worth an
    // award beside forty over four minutes, however quickly the two landed.
    const quitter = list(['CA', 'TX'], 2500);
    const grinder = list(matchPool('all').slice(0, 40).map((st) => st.a), 5500);
    const a = raceAwards(quitter, grinder, 50);

    expect(a.filter((x) => x.who === 'me' || x.who === 'both')).toEqual([]);
  });

  it('calls naming the whole map a clean sweep', () => {
    const all = list(['CA', 'TX', 'NY'], 1000).slice(0, 3);
    const a = raceAwards(all, [], 3);
    expect(a.find((x) => x.key === 'sweep')).toMatchObject({ who: 'me', note: 'All 3 named' });
  });

  it('gives nothing at all when neither player named a thing', () => {
    expect(raceAwards([null, null], [null, null], 50)).toEqual([]);
  });

  it('gives a level race no winner to name', () => {
    const a = raceAwards(list(['CA', 'TX'], 4000), list(['OH', 'WA'], 4000), 50);
    expect(a.map((x) => x.key)).toEqual([]);
  });
});
