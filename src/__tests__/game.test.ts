import { describe, expect, it } from 'vitest';
import { BY, ST } from '../data/states';
import { HOOKS } from '../data/hooks';
import { DIFFS } from '../data/modes';
import { buildAsk, choicesFor, expectedText } from '../game/question';
import {
  accuracyByTrack, emptyProgress, levelFor, lvl, overall, recordAnswer, solidCount, weakList,
} from '../game/progress';
import { bestKey, inScope, poolFor, scopeLabel } from '../game/scope';
import { initialState, nextQuestion, reducer, scopeBox } from '../game/state';
import type { GameState } from '../game/state';
import type { Abbr, ModeKey, Progress } from '../types';

const start = (): GameState => initialState(emptyProgress());

/** Apply a sequence of actions, so a test reads as the steps a player takes. */
const run = (s: GameState, ...actions: Parameters<typeof reducer>[1][]): GameState =>
  actions.reduce(reducer, s);

describe('progress', () => {
  it('starts every state at zero on every track', () => {
    const p = emptyProgress();
    expect(Object.keys(p.lv)).toHaveLength(50);
    expect(overall(p, 'CA')).toBe(0);
    expect(solidCount(p, null)).toBe(0);
  });

  it('climbs one level per right answer and drops two per wrong one', () => {
    let p: Progress = emptyProgress();
    p = recordAnswer(p, 'CA', 'find', true, 3);
    p = recordAnswer(p, 'CA', 'find', true, 3);
    expect(lvl(p, 'CA', 'find')).toBe(2);
    p = recordAnswer(p, 'CA', 'find', false, 3);
    expect(lvl(p, 'CA', 'find')).toBe(0);
  });

  it('caps mastery at the difficulty ceiling', () => {
    let p: Progress = emptyProgress();
    for (let i = 0; i < 6; i++) p = recordAnswer(p, 'CA', 'find', true, 2);
    expect(lvl(p, 'CA', 'find')).toBe(2);
  });

  it('never mutates the progress it is given', () => {
    const before = emptyProgress();
    const snapshot = JSON.stringify(before);
    recordAnswer(before, 'CA', 'find', true, 3);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('counts a state solid only once every track is solid, on the overall view', () => {
    let p: Progress = emptyProgress();
    for (const t of ['find', 'name', 'shape', 'capital', 'code', 'border'] as const) {
      for (let i = 0; i < 3; i++) p = recordAnswer(p, 'CA', t, true, 3);
    }
    expect(overall(p, 'CA')).toBe(3);
    expect(solidCount(p, null)).toBe(1);
    expect(solidCount(p, 'find')).toBe(1);
  });

  it('surfaces a weak spot only after two attempts below 70%', () => {
    let p: Progress = emptyProgress();
    p = recordAnswer(p, 'IA', 'name', false, 3);
    expect(weakList(p)).toHaveLength(0);
    p = recordAnswer(p, 'IA', 'name', false, 3);
    expect(weakList(p).map((w) => w.s.a)).toEqual(['IA']);
  });

  it('orders weak spots worst first', () => {
    let p: Progress = emptyProgress();
    for (let i = 0; i < 4; i++) p = recordAnswer(p, 'IA', 'name', false, 3);
    p = recordAnswer(p, 'OH', 'name', false, 3);
    p = recordAnswer(p, 'OH', 'name', false, 3);
    p = recordAnswer(p, 'OH', 'name', true, 3);
    expect(weakList(p).map((w) => w.s.a)).toEqual(['IA', 'OH']);
  });

  it('totals accuracy per track across states', () => {
    let p: Progress = emptyProgress();
    p = recordAnswer(p, 'IA', 'name', true, 3);
    p = recordAnswer(p, 'OH', 'name', false, 3);
    expect(accuracyByTrack(p)).toEqual([{ t: 'name', a: 2, c: 1 }]);
  });

  it('reports overall level when no track is in play', () => {
    let p: Progress = emptyProgress();
    p = recordAnswer(p, 'CA', 'find', true, 3);
    expect(levelFor(p, 'CA', 'find')).toBe(1);
    expect(levelFor(p, 'CA', null)).toBe(0); // one of six tracks, rounded
  });
});

describe('scope', () => {
  const p = emptyProgress();

  it('reads all four scope forms', () => {
    expect(poolFor('all', p)).toHaveLength(50);
    expect(poolFor('r:Northeast', p).every((s) => s.reg === 'Northeast')).toBe(true);
    expect(poolFor('New England', p)).toHaveLength(6);
    expect(poolFor('weak', p)).toHaveLength(0);
    expect(inScope(BY.ME, 'New England', p)).toBe(true);
    expect(inScope(BY.TX, 'New England', p)).toBe(false);
  });

  it('labels each scope the way the control card reads it', () => {
    expect(scopeLabel('all', p)).toBe('all 50 states');
    expect(scopeLabel('r:West', p)).toBe('13 states in the West');
    expect(scopeLabel('New England', p)).toBe('6 New England states');
    expect(scopeLabel('weak', p)).toBe('0 weak states');
  });

  it('keys best times per scope', () => {
    expect(bestKey('all')).toBe('all50:us');
    expect(bestKey('New England')).toBe('all50:New England');
  });

  it('frames the whole map for "all" and just the region otherwise', () => {
    expect(scopeBox('all', p)).toEqual({ x: 0, y: 0, w: 975, h: 622 });
    expect(scopeBox('New England', p).w).toBeLessThan(975);
  });
});

describe('question building', () => {
  it('offers four unique options including the answer', () => {
    for (const s of ST) {
      for (const easy of [true, false]) {
        const c = choicesFor(s, easy);
        expect(c, s.a).toHaveLength(4);
        expect(new Set(c).size, s.a).toBe(4);
        expect(c, s.a).toContain(s.a);
      }
    }
  });

  it('draws easy decoys from other regions and hard ones from nearby', () => {
    const easy = choicesFor(BY.ME, true).filter((a) => a !== 'ME');
    expect(easy.every((a) => BY[a].reg !== 'Northeast')).toBe(true);
    const hard = choicesFor(BY.CO, false).filter((a) => a !== 'CO');
    expect(hard.some((a) => BY.CO.nr.includes(a))).toBe(true);
  });

  it('highlights the target on Standard but not on Expert', () => {
    expect(buildAsk(BY.OH, 'capital', DIFFS.standard).show).toBe('OH');
    expect(buildAsk(BY.OH, 'capital', DIFFS.expert).show).toBeNull();
  });

  it('runs Codes backwards on Expert only', () => {
    expect(buildAsk(BY.DE, 'code', DIFFS.expert).rev).toBe(true);
    expect(buildAsk(BY.DE, 'code', DIFFS.expert).answer).toBe('Delaware');
    expect(buildAsk(BY.DE, 'code', DIFFS.standard).rev).toBe(false);
  });

  it('offers choices on Guided where Standard asks for typing', () => {
    expect(buildAsk(BY.OH, 'capital', DIFFS.guided).choices).toHaveLength(4);
    expect(buildAsk(BY.OH, 'capital', DIFFS.guided).labelBy).toBe('cap');
    expect(buildAsk(BY.OH, 'capital', DIFFS.standard).choices).toBeNull();
  });

  it('asks for a typed name on Expert in Name It and Silhouette', () => {
    expect(buildAsk(BY.OH, 'name', DIFFS.expert).choices).toBeNull();
    expect(buildAsk(BY.OH, 'shape', DIFFS.standard).choices).toHaveLength(4);
  });

  it('always picks a real neighbour as the Borders answer', () => {
    for (const s of ST.filter((x) => x.nb.length)) {
      const ask = buildAsk(s, 'border', DIFFS.standard);
      expect(s.nb, s.a).toContain(ask.answer);
      const decoys = ask.choices!.filter((a) => a !== ask.answer);
      expect(decoys.every((a) => !s.nb.includes(a)), s.a).toBe(true);
    }
  });

  it('compares typed answers against the text actually asked for', () => {
    expect(expectedText(buildAsk(BY.OH, 'capital', DIFFS.standard), 'capital')).toBe('Columbus');
    expect(expectedText(buildAsk(BY.OH, 'code', DIFFS.standard), 'code')).toBe('OH');
    expect(expectedText(buildAsk(BY.OH, 'code', DIFFS.expert), 'code')).toBe('Ohio');
  });
});

describe('the reducer', () => {
  it('turns on map labels for study modes and off for quizzes', () => {
    expect(run(start(), { type: 'setMode', mode: 'map' }).labels).toBe(true);
    expect(run(start(), { type: 'setMode', mode: 'cards' }).labels).toBe(false);
    expect(run(start(), { type: 'setMode', mode: 'find' }).labels).toBe(false);
  });

  it('resets the session tallies on a mode change but not a region change', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' });
    s = reducer(s, nextQuestion(s));
    s = reducer(s, { type: 'submitChoice', abbr: s.ask!.answer! as never });
    expect(s.run.asked).toBe(1);
    expect(run(s, { type: 'setScope', scope: 'r:West' }).run.asked).toBe(1);
    expect(run(s, { type: 'setMode', mode: 'code' }).run.asked).toBe(0);
  });

  it('grades a right answer, tracks the streak and remembers the best', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' });
    for (let i = 0; i < 3; i++) {
      s = reducer(s, nextQuestion(s));
      s = reducer(s, { type: 'submitChoice', abbr: s.ask!.answer! as never });
    }
    expect(s.run).toMatchObject({ right: 3, asked: 3, streak: 3, best: 3 });
  });

  it('breaks the streak on a wrong answer but keeps the best', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' });
    s = reducer(s, nextQuestion(s));
    s = reducer(s, { type: 'submitChoice', abbr: s.ask!.answer! as never });
    s = reducer(s, { type: 'nextQuestion' });
    s = reducer(s, nextQuestion(s));
    const wrong = s.ask!.choices!.find((a) => a !== s.ask!.answer)!;
    s = reducer(s, { type: 'submitChoice', abbr: wrong });
    expect(s.run).toMatchObject({ right: 1, asked: 2, streak: 0, best: 1 });
    expect(s.ask!.won).toBe(false);
  });

  it('ignores a second answer once the question is locked', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' });
    s = reducer(s, nextQuestion(s));
    s = reducer(s, { type: 'submitChoice', abbr: s.ask!.answer! as never });
    const after = reducer(s, { type: 'submitChoice', abbr: s.ask!.choices![0] });
    expect(after).toBe(s);
  });

  it('lets Find It run down its try budget before revealing', () => {
    let s = run(start(), { type: 'setMode', mode: 'find' });
    s = reducer(s, nextQuestion(s));
    const wrong = ST.find((x) => x.a !== s.ask!.answer)!.a;
    s = reducer(s, { type: 'tapState', abbr: wrong });
    expect(s.locked).toBe(false);
    expect(s.tries).toBe(1);
    s = reducer(s, { type: 'tapState', abbr: wrong });
    expect(s.locked).toBe(true); // Standard allows two tries
    expect(s.ask!.won).toBe(false);
  });

  /**
   * Ask about one named state rather than drawing at random, so a test about
   * answer matching does not depend on which state came up.
   */
  const askAbout = (abbr: Abbr, qm: ModeKey = 'capital'): GameState => {
    const s = run(start(), { type: 'setMode', mode: qm });
    const ask = buildAsk(BY[abbr], qm, DIFFS.standard);
    return reducer(s, { type: 'setQuestion', qm, ask, zoom: s.zoom, scope: s.scope });
  };

  it('accepts a forgiving spelling but not a different capital', () => {
    const s = askAbout('CA');
    expect(reducer(s, { type: 'submitText', text: 'Sacrament' }).ask!.won).toBe(true);
    expect(reducer(s, { type: 'submitText', text: 'Sacramento' }).ask!.won).toBe(true);
    expect(reducer(s, { type: 'submitText', text: 'Nowhere City' }).ask!.won).toBe(false);
  });

  it('holds short capitals to an exact spelling', () => {
    // `near` only forgives an edit once the answer is five letters or more:
    // below that, one edit is usually a different word rather than a slip.
    // Dover, Boise and Salem are the three capitals this bites on.
    const s = askAbout('DE');
    expect(reducer(s, { type: 'submitText', text: 'Dover' }).ask!.won).toBe(true);
    expect(reducer(s, { type: 'submitText', text: 'Dove' }).ask!.won).toBe(false);
  });

  it('does nothing when an empty answer is submitted', () => {
    let s = run(start(), { type: 'setMode', mode: 'capital' });
    s = reducer(s, nextQuestion(s));
    expect(reducer(s, { type: 'submitText', text: '  ' })).toBe(s);
  });

  it('marks a revealed answer wrong without a guess', () => {
    let s = run(start(), { type: 'setMode', mode: 'capital' });
    s = reducer(s, nextQuestion(s));
    s = reducer(s, { type: 'reveal' });
    expect(s.locked).toBe(true);
    expect(s.ask!.gave).toBe(true);
    expect(s.run.asked).toBe(1);
    expect(s.run.right).toBe(0);
  });

  it('frames every silhouette question on its own state', () => {
    let s = run(start(), { type: 'setMode', mode: 'shape' });
    for (let i = 0; i < 5; i++) {
      s = reducer(s, nextQuestion(s));
      expect(s.zoom.w).toBeLessThan(975);
      s = reducer(s, { type: 'nextQuestion' });
    }
  });

  it('opens the map back out when Mixed leaves a silhouette behind', () => {
    let s = run(start(), { type: 'setMode', mode: 'shape' });
    s = reducer(s, nextQuestion(s));
    expect(s.zoom.w).toBeLessThan(975);

    // Only Mixed can follow a silhouette with a question that needs the map.
    s = reducer({ ...s, mode: 'mixed' }, { type: 'nextQuestion' });
    expect(s.refit).toBe('scope');
    let next = nextQuestion(s);
    while (next.qm === 'shape') next = nextQuestion(s);
    s = reducer(s, next);
    expect(s.zoom).toEqual({ x: 0, y: 0, w: 975, h: 622 });
  });

  it('falls back to all 50 when the chosen scope has emptied out', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' }, { type: 'setScope', scope: 'weak' });
    expect(poolFor('weak', s.progress)).toHaveLength(0);
    s = reducer(s, nextQuestion(s));
    expect(s.scope).toBe('all');
    expect(s.ask).not.toBeNull();
  });

  it('only asks about states in the chosen region', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' }, { type: 'setScope', scope: 'New England' });
    for (let i = 0; i < 40; i++) {
      s = reducer(s, nextQuestion(s));
      expect(s.ask!.s.div).toBe('New England');
      s = reducer(s, { type: 'nextQuestion' });
    }
  });

  it('never asks Borders about a state with no neighbours', () => {
    let s = run(start(), { type: 'setMode', mode: 'border' });
    for (let i = 0; i < 200; i++) {
      s = reducer(s, nextQuestion(s));
      expect(s.ask!.s.nb.length).toBeGreaterThan(0);
      s = reducer(s, { type: 'nextQuestion' });
    }
  });

  it('suppresses recently asked states', () => {
    let s = run(start(), { type: 'setMode', mode: 'name' });
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      s = reducer(s, nextQuestion(s));
      seen.push(s.ask!.s.a);
      s = reducer(s, { type: 'nextQuestion' });
    }
    for (let i = 6; i < seen.length; i++) {
      expect(seen.slice(i - 6, i)).not.toContain(seen[i]);
    }
  });
});

describe('hooks', () => {
  it('lights exactly the states a hook names', () => {
    const s = run(start(),
      { type: 'setMode', mode: 'hooks' },
      { type: 'selectHook', group: 0, item: 0 });
    expect(s.sel).toBe('h0-0');
    expect([...s.hookSet!].sort()).toEqual([...HOOKS[0].items[0].s].sort());
  });

  it('closes the open hook when it is tapped again', () => {
    const open = run(start(),
      { type: 'setMode', mode: 'hooks' },
      { type: 'selectHook', group: 0, item: 0 });
    const closed = reducer(open, { type: 'selectHook', group: 0, item: 0 });
    expect(closed.sel).toBeNull();
    expect(closed.hookSet).toBeNull();
    expect(closed.zoom).toEqual(scopeBox(closed.scope, closed.progress));
  });

  it('moves the selection when a different hook is tapped', () => {
    const s = run(start(),
      { type: 'setMode', mode: 'hooks' },
      { type: 'selectHook', group: 0, item: 0 },
      { type: 'selectHook', group: 0, item: 1 });
    expect(s.sel).toBe('h0-1');
    expect([...s.hookSet!].sort()).toEqual([...HOOKS[0].items[1].s].sort());
  });
});

describe('Roll Call', () => {
  const enter = () => run(start(), { type: 'setMode', mode: 'roll' });

  it('opens on the first letter with states behind it', () => {
    expect(enter().roll!.letter).toBe('A');
  });

  it('accepts a state under its own letter', () => {
    const s = run(enter(), { type: 'rollAccept', abbr: 'AL' });
    expect(s.roll!.got.has('AL')).toBe(true);
    expect(s.roll!.msg).toBe('');
  });

  it('corrects a state offered under the wrong letter', () => {
    const s = run(enter(), { type: 'rollAccept', abbr: 'TX' });
    expect(s.roll!.got.has('TX')).toBe(false);
    expect(s.roll!.msg).toBe('Texas starts with T, not A.');
  });

  it('says so when a state is already up there', () => {
    const s = run(enter(), { type: 'rollAccept', abbr: 'AL' }, { type: 'rollAccept', abbr: 'AL' });
    expect(s.roll!.msg).toBe('Alabama is already up there.');
    expect(s.roll!.got.size).toBe(1);
  });

  it('moves on once a letter is complete', () => {
    const s = run(enter(),
      { type: 'rollAccept', abbr: 'AL' }, { type: 'rollAccept', abbr: 'AK' },
      { type: 'rollAccept', abbr: 'AZ' }, { type: 'rollAccept', abbr: 'AR' });
    expect(s.roll!.letter).toBe('C');
  });

  it('reveals a group, then advances on the second press', () => {
    let s = run(enter(), { type: 'rollReveal' });
    expect(s.roll!.shown.has('A')).toBe(true);
    expect(s.roll!.letter).toBe('A');
    s = reducer(s, { type: 'rollReveal' });
    expect(s.roll!.letter).toBe('C');
  });
});

describe('Name All 50', () => {
  const enter = () => run(start(), { type: 'setMode', mode: 'all50' });

  it('counts the pool it has to name', () => {
    expect(enter().recall!.total).toBe(50);
    expect(run(enter(), { type: 'setScope', scope: 'New England' }).recall!.total).toBe(6);
  });

  it('records a best time when the run completes', () => {
    let s = run(start(), { type: 'setMode', mode: 'all50' }, { type: 'setScope', scope: 'New England' });
    const start0 = s.recall!.t0;
    for (const a of ['CT', 'ME', 'MA', 'NH', 'RI'] as const) {
      s = reducer(s, { type: 'recallAccept', abbr: a, now: start0 + 1000 });
      expect(s.recall!.done).toBe(false);
    }
    s = reducer(s, { type: 'recallAccept', abbr: 'VT', now: start0 + 9000 });
    expect(s.recall!.done).toBe(true);
    expect(s.recall!.record).toBe(true);
    expect(s.progress.best[bestKey('New England')]).toBe(9000);
  });

  it('keeps the old best when a later run is slower', () => {
    let s = run(start(), { type: 'setMode', mode: 'all50' }, { type: 'setScope', scope: 'New England' });
    const finish = (ms: number) => {
      for (const a of ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'] as const) {
        s = reducer(s, { type: 'recallAccept', abbr: a, now: s.recall!.t0 + ms });
      }
    };
    finish(5000);
    s = reducer(s, { type: 'recallRestart' });
    finish(20_000);
    expect(s.recall!.record).toBeUndefined();
    expect(s.progress.best[bestKey('New England')]).toBe(5000);
  });

  it('stops the clock when the player gives up', () => {
    const s = run(start(), { type: 'setMode', mode: 'all50' });
    const done = reducer(s, { type: 'recallGiveUp', now: s.recall!.t0 + 3000 });
    expect(done.recall!.done).toBe(true);
    expect(done.recall!.stopAt).toBe(s.recall!.t0 + 3000);
  });
});

describe('flashcards', () => {
  it('deals the in-scope states in map order', () => {
    const s = run(start(), { type: 'setMode', mode: 'cards' });
    expect(s.deck).toHaveLength(50);
    expect(s.card).toBe(0);
    expect(s.deck[0].a).toBe('AL');
  });

  it('wraps around in both directions and lands face up', () => {
    let s = run(start(), { type: 'setMode', mode: 'cards' }, { type: 'cardFlip' });
    expect(s.cardBack).toBe(true);
    s = reducer(s, { type: 'cardMove', delta: -1 });
    expect(s.card).toBe(49);
    expect(s.cardBack).toBe(false);
    expect(reducer(s, { type: 'cardMove', delta: 1 }).card).toBe(0);
  });

  it('flags a state for review and moves on', () => {
    const s = run(start(), { type: 'setMode', mode: 'cards' }, { type: 'cardFlag' });
    expect(s.progress.err.AL).toBe(1);
    expect(s.card).toBe(1);
  });

  it('rebuilds the deck for a new region, keeping the current card if it survives', () => {
    let s = run(start(), { type: 'setMode', mode: 'cards' });
    s = reducer(s, { type: 'setScope', scope: 'New England' });
    expect(s.deck).toHaveLength(6);
    expect(s.deck.every((d) => d.div === 'New England')).toBe(true);
  });

  it('leaves a shuffled deck alone when nothing about the pool changed', () => {
    let s = run(start(), { type: 'setMode', mode: 'cards' });
    const shuffled = [...s.deck].reverse();
    s = reducer(s, { type: 'cardSetDeck', deck: shuffled });
    expect(reducer(s, { type: 'syncDeck' })).toBe(s);
  });
});

describe('progress panel actions', () => {
  it('narrows every quiz to the weak spots', () => {
    let s = start();
    let p = s.progress;
    for (let i = 0; i < 3; i++) p = recordAnswer(p, 'IA', 'name', false, 3);
    s = { ...s, progress: p };
    s = reducer(s, { type: 'drillWeak' });
    expect(s.scope).toBe('weak');
    expect(s.mode).toBe('mixed');
  });

  it('clears mastery but keeps the difficulty preference', () => {
    let s = run(start(), { type: 'setDiff', dif: 'expert' }, { type: 'setMode', mode: 'name' });
    s = reducer(s, nextQuestion(s));
    s = reducer(s, { type: 'submitText', text: s.ask!.s.n });
    expect(weakList(s.progress)).toHaveLength(0);
    expect(s.progress.st).toBeDefined();
    s = reducer(s, { type: 'resetProgress' });
    expect(s.progress.st).toBeUndefined();
    expect(s.progress.dif).toBe('expert');
    expect(solidCount(s.progress, null)).toBe(0);
  });
});
