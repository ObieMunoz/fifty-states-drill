import { beforeEach, describe, expect, it } from 'vitest';
import { BY, ST } from '../data/states';
import { DIFFS, MIXPOOL } from '../data/modes';
import { buildAsk } from '../game/question';
import { hashSeed, mulberry32, pickRnd, shuffle, weightedIndex } from '../lib/random';
import { askRng, matchPool, planMatch } from '../versus/plan';
import {
  BASE_POINTS, SPEED_POINTS, isTyped, outcomeOf, roundLimitMs, scoreAnswer,
} from '../versus/scoring';
import {
  CODE_LENGTH, codeFromUrl, isCompleteCode, matchSeed, newRoomCode, normalizeCode,
} from '../versus/room';
import { playerId } from '../versus/player';
import { cleanName, displayName } from '../versus/identity';
import { accuracy, loadBoard, rankBoard, recordMatch, resetBoard } from '../versus/leaderboard';
import { askFor, pickLabel } from '../versus/grade';
import { pinsFor, stateClass } from '../versus/marks';
import type { MatchConfig } from '../versus/types';

const cfg = (over: Partial<MatchConfig> = {}): MatchConfig =>
  ({ seed: 'ACDE:1', mode: 'mixed', rounds: 10, scope: 'all', ...over });

describe('seeded randomness', () => {
  it('replays the same sequence for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = Array.from({ length: 20 }, mulberry32(1));
    const b = Array.from({ length: 20 }, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 2000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashes a string to a stable 32-bit seed', () => {
    expect(hashSeed('ACDE:1')).toBe(hashSeed('ACDE:1'));
    expect(hashSeed('ACDE:1')).not.toBe(hashSeed('ACDE:2'));
    expect(hashSeed('x')).toBeGreaterThanOrEqual(0);
    expect(hashSeed('x')).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('makes shuffle, pickRnd and weightedIndex reproducible', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle([...src], mulberry32(7))).toEqual(shuffle([...src], mulberry32(7)));
    expect(pickRnd(src, mulberry32(7))).toBe(pickRnd(src, mulberry32(7)));
    const w = [1, 5, 2, 9];
    expect(weightedIndex(w, mulberry32(7))).toBe(weightedIndex(w, mulberry32(7)));
  });

  it('leaves the unseeded callers on Math.random', () => {
    // No generator passed: still shuffles, just not reproducibly.
    const out = shuffle([1, 2, 3, 4, 5]);
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('match planning', () => {
  it('produces an identical plan on both devices', () => {
    const a = planMatch(cfg());
    const b = planMatch(cfg());
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
  });

  it('changes completely when the seed changes', () => {
    const a = planMatch(cfg({ seed: 'ACDE:1' }));
    const b = planMatch(cfg({ seed: 'ACDE:2' }));
    expect(a).not.toEqual(b);
  });

  it('never repeats a state inside one match', () => {
    const plan = planMatch(cfg({ rounds: 15 }));
    expect(new Set(plan.map((r) => r.abbr)).size).toBe(15);
  });

  it('recycles the pool rather than running dry in a small scope', () => {
    // New England has six states; a ten-round match has to reuse some.
    const plan = planMatch(cfg({ rounds: 10, scope: 'New England' }));
    expect(plan).toHaveLength(10);
    for (const r of plan) expect(BY[r.abbr].div).toBe('New England');
  });

  it('only asks Borders about states that have one', () => {
    const plan = planMatch(cfg({ mode: 'border', rounds: 15 }));
    for (const r of plan) {
      expect(r.qm).toBe('border');
      expect(BY[r.abbr].nb.length).toBeGreaterThan(0);
    }
  });

  it('keeps every round on the chosen mode outside Mixed', () => {
    for (const mode of ['find', 'name', 'shape', 'capital', 'code'] as const) {
      const plan = planMatch(cfg({ mode, rounds: 8 }));
      expect(plan.every((r) => r.qm === mode)).toBe(true);
    }
  });

  it('draws from the six tracks in Mixed', () => {
    const plan = planMatch(cfg({ mode: 'mixed', rounds: 15 }));
    for (const r of plan) expect(MIXPOOL).toContain(r.qm);
    // Fifteen rounds should not all land on one type.
    expect(new Set(plan.map((r) => r.qm)).size).toBeGreaterThan(1);
  });

  it('stays inside a regional scope', () => {
    const plan = planMatch(cfg({ scope: 'r:West', rounds: 10 }));
    for (const r of plan) expect(BY[r.abbr].reg).toBe('West');
  });

  it('ignores player progress entirely', () => {
    // matchPool is scope-only, so it cannot diverge with a device's history.
    expect(matchPool('all')).toHaveLength(50);
    expect(matchPool('r:Northeast').every((s) => s.reg === 'Northeast')).toBe(true);
  });

  it('falls back to all fifty for an unknown scope', () => {
    expect(matchPool('not-a-real-scope')).toHaveLength(ST.length);
  });
});

describe('per-player question building', () => {
  it('asks both players about the same state at different levels', () => {
    const plan = planMatch(cfg({ mode: 'capital', rounds: 5 }));
    const round = plan[0];
    const state = BY[round.abbr];

    const guided = buildAsk(state, round.qm, DIFFS.guided, askRng(cfg().seed, 0));
    const expert = buildAsk(state, round.qm, DIFFS.expert, askRng(cfg().seed, 0));

    // Same question, different scaffolding.
    expect(guided.s.a).toBe(expert.s.a);
    expect(guided.choices).not.toBeNull();
    expect(expert.choices).toBeNull();
  });

  it('gives a player the same options twice for the same round', () => {
    const state = BY.CA;
    const a = buildAsk(state, 'name', DIFFS.standard, askRng('seed', 3));
    const b = buildAsk(state, 'name', DIFFS.standard, askRng('seed', 3));
    expect(a.choices).toEqual(b.choices);
  });

  it('always includes the answer among the options', () => {
    const plan = planMatch(cfg({ mode: 'mixed', rounds: 15 }));
    plan.forEach((r, i) => {
      const ask = buildAsk(BY[r.abbr], r.qm, DIFFS.guided, askRng(cfg().seed, i));
      if (ask.choices) expect(ask.choices).toContain(ask.answer);
    });
  });
});

describe('scoring', () => {
  it('gives nothing for a wrong answer however fast', () => {
    expect(scoreAnswer(false, 0, 20000)).toBe(0);
    expect(scoreAnswer(false, 19000, 20000)).toBe(0);
  });

  it('pays the full bonus for an instant answer', () => {
    expect(scoreAnswer(true, 0, 20000)).toBe(BASE_POINTS + SPEED_POINTS);
  });

  it('decays the bonus to zero across the round', () => {
    expect(scoreAnswer(true, 10000, 20000)).toBe(BASE_POINTS + SPEED_POINTS / 2);
    expect(scoreAnswer(true, 20000, 20000)).toBe(BASE_POINTS);
  });

  it('never drops below the base for a slow but correct answer', () => {
    expect(scoreAnswer(true, 99000, 20000)).toBe(BASE_POINTS);
  });

  it('treats a negative clock reading as instant rather than a bonus', () => {
    expect(scoreAnswer(true, -50, 20000)).toBe(BASE_POINTS + SPEED_POINTS);
  });

  it('gives a handicapped pair the longer of the two clocks', () => {
    // Guided picks capitals from four; Expert types them.
    const mixed = roundLimitMs('capital', ['guided', 'expert']);
    expect(mixed).toBe(roundLimitMs('capital', ['expert', 'expert']));
    expect(mixed).toBeGreaterThan(roundLimitMs('capital', ['guided', 'guided']));
  });

  it('knows which modes are typed at which level', () => {
    expect(isTyped('capital', 'guided')).toBe(false);
    expect(isTyped('capital', 'standard')).toBe(true);
    expect(isTyped('name', 'standard')).toBe(false);
    expect(isTyped('name', 'expert')).toBe(true);
    expect(isTyped('find', 'expert')).toBe(false);
    expect(isTyped('border', 'expert')).toBe(false);
  });

  it('reads the result off the two totals', () => {
    expect(outcomeOf(500, 400)).toBe('win');
    expect(outcomeOf(400, 500)).toBe('loss');
    expect(outcomeOf(450, 450)).toBe('draw');
  });
});

describe('room codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const c = newRoomCode();
      expect(c).toHaveLength(CODE_LENGTH);
      expect(c).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]+$/);
    }
  });

  it('folds the characters people mistype', () => {
    expect(normalizeCode('0OQq')).toBe('QQQQ');
    expect(normalizeCode('1ILj')).toBe('JJJJ');
    expect(normalizeCode('5S4')).toBe('444');
    expect(normalizeCode('8B3')).toBe('333');
    expect(normalizeCode('2Z7')).toBe('777');
  });

  it('ignores spaces, dashes and case', () => {
    expect(normalizeCode(' a c-d e ')).toBe('ACDE');
    expect(normalizeCode('acde')).toBe('ACDE');
  });

  it('caps at the code length', () => {
    expect(normalizeCode('ACDEFGHJ')).toHaveLength(CODE_LENGTH);
  });

  it('reports completeness', () => {
    expect(isCompleteCode('ACD')).toBe(false);
    expect(isCompleteCode('ACDE')).toBe(true);
    expect(isCompleteCode('a-c-d-e')).toBe(true);
  });

  it('gives this device one player id and keeps it', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    const id = playerId();
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(playerId()).toBe(id);
    expect(store.get('fiftyStatesDrill.versus.player')).toBe(id);
  });

  it('reads a code out of an invite hash', () => {
    expect(codeFromUrl('#versus=ACDE')).toBe('ACDE');
    expect(codeFromUrl('#versus=acde')).toBe('ACDE');
    expect(codeFromUrl('#other=1&versus=ACDE')).toBe('ACDE');
    expect(codeFromUrl('#versus=AC')).toBeNull();
    expect(codeFromUrl('')).toBeNull();
    expect(codeFromUrl('#nothing')).toBeNull();
  });

  it('seeds each match in a room differently', () => {
    expect(matchSeed('ACDE', 1)).toBe('ACDE:1');
    expect(matchSeed('ACDE', 1)).not.toBe(matchSeed('ACDE', 2));
    expect(planMatch(cfg({ seed: matchSeed('ACDE', 1) })))
      .not.toEqual(planMatch(cfg({ seed: matchSeed('ACDE', 2) })));
  });
});

describe('player name', () => {
  it('trims, collapses and caps', () => {
    expect(cleanName('  Obie   Munoz  ')).toBe('Obie Munoz');
    expect(cleanName('a'.repeat(40))).toHaveLength(14);
    expect(cleanName('   ')).toBe('');
  });

  it('falls back rather than showing an empty name', () => {
    expect(displayName('')).toBe('Player');
    expect(displayName('  ', 'Guest')).toBe('Guest');
    expect(displayName('Obie')).toBe('Obie');
  });
});

describe('leaderboard', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    // The suite runs in node, where localStorage does not exist.
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    } as Storage;
    resetBoard();
  });

  it('starts empty', () => {
    expect(loadBoard()).toEqual([]);
  });

  it('records both players from one match', () => {
    const rows = recordMatch([
      { name: 'Obie', points: 900, correct: 8, asked: 10, outcome: 'win' },
      { name: 'Sam', points: 700, correct: 6, asked: 10, outcome: 'loss' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Obie');
    expect(rows[0].wins).toBe(1);
    expect(rows[1].losses).toBe(1);
  });

  it('accumulates across matches', () => {
    recordMatch([
      { name: 'Obie', points: 900, correct: 8, asked: 10, outcome: 'win' },
      { name: 'Sam', points: 700, correct: 6, asked: 10, outcome: 'loss' },
    ]);
    const rows = recordMatch([
      { name: 'Obie', points: 500, correct: 4, asked: 10, outcome: 'loss' },
      { name: 'Sam', points: 800, correct: 9, asked: 10, outcome: 'win' },
    ]);
    const obie = rows.find((r) => r.name === 'Obie')!;
    expect(obie.matches).toBe(2);
    expect(obie.points).toBe(1400);
    expect(obie.best).toBe(900);
    expect(obie.wins).toBe(1);
    expect(obie.losses).toBe(1);
    expect(obie.asked).toBe(20);
  });

  it('treats names case-insensitively but keeps the latest spelling', () => {
    recordMatch([{ name: 'obie', points: 100, correct: 1, asked: 1, outcome: 'win' }]);
    const rows = recordMatch([{ name: 'Obie', points: 100, correct: 1, asked: 1, outcome: 'win' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Obie');
    expect(rows[0].wins).toBe(2);
  });

  it('counts draws separately', () => {
    const rows = recordMatch([
      { name: 'Obie', points: 500, correct: 5, asked: 10, outcome: 'draw' },
      { name: 'Sam', points: 500, correct: 5, asked: 10, outcome: 'draw' },
    ]);
    expect(rows.every((r) => r.draws === 1 && r.wins === 0 && r.losses === 0)).toBe(true);
  });

  it('skips a blank name rather than creating an empty row', () => {
    const rows = recordMatch([{ name: '  ', points: 100, correct: 1, asked: 1, outcome: 'win' }]);
    expect(rows).toEqual([]);
  });

  it('ranks by wins, then win rate, then points', () => {
    const ranked = rankBoard([
      { ...base(), name: 'A', wins: 2, matches: 10, points: 100 },
      { ...base(), name: 'B', wins: 3, matches: 4, points: 50 },
      { ...base(), name: 'C', wins: 2, matches: 4, points: 100 },
    ]);
    expect(ranked.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });

  it('computes accuracy, and reports none before any answers', () => {
    expect(accuracy({ ...base(), correct: 7, asked: 10 })).toBe(70);
    expect(accuracy({ ...base(), correct: 0, asked: 0 })).toBeNull();
  });

  it('survives corrupt stored data', () => {
    localStorage.setItem('fiftyStatesDrill.versus.leaderboard.v1', '{ not json');
    expect(loadBoard()).toEqual([]);
    localStorage.setItem('fiftyStatesDrill.versus.leaderboard.v1', '[1,2,"x"]');
    expect(loadBoard()).toEqual([]);
  });

  it('clears on reset', () => {
    recordMatch([{ name: 'Obie', points: 100, correct: 1, asked: 1, outcome: 'win' }]);
    resetBoard();
    expect(loadBoard()).toEqual([]);
  });
});

const base = () => ({
  name: '', wins: 0, losses: 0, draws: 0, matches: 0,
  points: 0, best: 0, correct: 0, asked: 0, last: 0,
});

describe('versus map pins', () => {
  const colors = { mine: 'teal', theirs: 'coral' } as const;

  it('draws nothing before the reveal', () => {
    expect(pinsFor({ picked: 'NV', theirPick: 'CA' }, colors)).toEqual([]);
  });

  it('pins each tap in its player’s colour at the anchor', () => {
    const pins = pinsFor({ picked: 'NV', theirPick: 'CA', answer: 'CA', revealed: true }, colors);
    expect(pins.map((p) => [p.abbr, p.color])).toEqual([['NV', 'teal'], ['CA', 'coral']]);
    expect(pins[0]).toMatchObject({ x: BY.NV.c[0], y: BY.NV.c[1] });
    expect(pins[1]).toMatchObject({ x: BY.CA.c[0], y: BY.CA.c[1] });
  });

  it('sets two taps on one state side by side', () => {
    const pins = pinsFor({ picked: 'NV', theirPick: 'NV', revealed: true }, colors);
    expect(pins).toHaveLength(2);
    expect(pins[0].x).toBeLessThan(BY.NV.c[0]);
    expect(pins[1].x).toBeGreaterThan(BY.NV.c[0]);
    expect(pins[0].y).toBe(pins[1].y);
  });

  it('skips a side that did not tap', () => {
    expect(pinsFor({ picked: null, theirPick: 'CA', revealed: true }, colors).map((p) => p.color)).toEqual(['coral']);
    expect(pinsFor({ picked: 'CA', theirPick: null, revealed: true }, colors).map((p) => p.color)).toEqual(['teal']);
  });
});

describe('reading a pick back', () => {
  const planned = { qm: 'capital', abbr: 'CA' } as const;

  it('names a tapped state', () => {
    const ask = askFor('s', 0, { qm: 'find', abbr: 'CA' }, 'standard');
    expect(pickLabel(ask, 'find', 'NV')).toBe('Nevada');
  });

  it('labels a chosen option the way that player’s buttons did', () => {
    // Guided picks a capital from four; the pick is the state's code.
    const ask = askFor('s', 0, planned, 'guided');
    expect(ask.choices).not.toBeNull();
    expect(pickLabel(ask, 'capital', 'NV')).toBe('Carson City');
  });

  it('shows a typed answer as typed', () => {
    const ask = askFor('s', 0, planned, 'standard');
    expect(ask.choices).toBeNull();
    expect(pickLabel(ask, 'capital', 'Sacremento')).toBe('Sacremento');
  });

  it('leaves a code that names no state as it came', () => {
    const ask = askFor('s', 0, { qm: 'find', abbr: 'CA' }, 'standard');
    expect(pickLabel(ask, 'find', 'ZZ')).toBe('ZZ');
  });

  it('has nothing to say for no answer', () => {
    const ask = askFor('s', 0, planned, 'standard');
    expect(pickLabel(ask, 'capital', null)).toBeNull();
  });
});

describe('versus map marks', () => {
  const CA = BY.CA;  // Pacific
  const NV = BY.NV;  // Mountain
  const OR = BY.OR;  // Pacific

  it('shows your own tap while the round is still live', () => {
    // The bug this guards: between tapping and the reveal the map said nothing,
    // so on a phone you could not tell whether the tap had registered.
    expect(stateClass(NV, { picked: 'NV', answer: 'CA' }).split(' ')).toContain('pick');
  });

  it('says nothing about whether the live pick was right', () => {
    const wrong = stateClass(NV, { picked: 'NV', answer: 'CA' }).split(' ');
    const right = stateClass(CA, { picked: 'CA', answer: 'CA' }).split(' ');
    expect(wrong).not.toContain('bad');
    expect(right).not.toContain('ok');
    expect(right).toContain('pick');
  });

  it('grades both states once the round is revealed', () => {
    const marks = { picked: 'NV' as const, answer: 'CA' as const, revealed: true };
    expect(stateClass(CA, marks).split(' ')).toContain('ok');
    expect(stateClass(NV, marks).split(' ')).toContain('bad');
    expect(stateClass(NV, marks).split(' ')).not.toContain('pick');
  });

  it('does not mark a correct pick wrong at the reveal', () => {
    const marks = { picked: 'CA' as const, answer: 'CA' as const, revealed: true };
    expect(stateClass(CA, marks).split(' ')).toContain('ok');
    expect(stateClass(CA, marks).split(' ')).not.toContain('bad');
  });

  it('keeps the other side’s tap to itself until the reveal', () => {
    // Their row lands the moment they answer; painting it early would show a
    // player who has not answered yet where to tap.
    const live = stateClass(NV, { picked: null, theirPick: 'NV', answer: 'CA' }).split(' ');
    expect(live).not.toContain('pick');
    expect(live).not.toContain('bad');
    expect(stateClass(NV, { theirPick: 'NV', answer: 'CA', revealed: true }).split(' ')).toContain('bad');
    expect(stateClass(CA, { theirPick: 'CA', answer: 'CA', revealed: true }).split(' ')).toContain('ok');
  });

  it('keeps a pick outside the guided division legible', () => {
    // Guided dims everything but the answer's division. A dimmed pick is as
    // good as an invisible one, so the tap wins over the hint.
    const marks = { picked: 'NV' as const, divisionHint: 'Pacific' };
    expect(stateClass(NV, marks).split(' ')).not.toContain('mute');
    expect(stateClass(NV, marks).split(' ')).toContain('pick');
    expect(stateClass(OR, marks).split(' ')).not.toContain('mute');
  });

  it('still dims everything else outside the guided division', () => {
    expect(stateClass(NV, { divisionHint: 'Pacific' }).split(' ')).toContain('mute');
  });

  it('leaves the silhouette alone', () => {
    expect(stateClass(CA, { solo: 'CA', picked: 'NV' })).toBe('st solo');
    expect(stateClass(NV, { solo: 'CA', picked: 'NV' })).toBe('st');
  });
});
