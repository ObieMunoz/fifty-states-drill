// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProgress, loadProgress, lvl, recordAnswer, weakList } from '../game/progress';
import { recordVersusRound, studyRound } from '../versus/learning';
import type { Progress } from '../types';

beforeEach(() => { localStorage.clear(); });

const levelled = (level: number): Progress => {
  const p = emptyProgress();
  p.lv.OH = { capital: level };
  return p;
};

describe('folding a Versus round into the study record', () => {
  it('counts a right answer as an attempt and a hit', () => {
    const p = recordVersusRound(emptyProgress(), 'OH', 'capital', true, 3);

    expect(p.st?.OH?.capital).toEqual({ a: 1, c: 1 });
  });

  it('counts a wrong answer as an attempt without a hit', () => {
    const p = recordVersusRound(emptyProgress(), 'OH', 'capital', false, 3);

    expect(p.st?.OH?.capital).toEqual({ a: 1, c: 0 });
  });

  it('moves a right answer up one level, capped by the level it was played at', () => {
    expect(lvl(recordVersusRound(levelled(0), 'OH', 'capital', true, 3), 'OH', 'capital')).toBe(1);
    expect(lvl(recordVersusRound(levelled(2), 'OH', 'capital', true, 2), 'OH', 'capital')).toBe(2);
  });

  it('never un-masters a state on a wrong answer, where the solo game would', () => {
    const solo = recordAnswer(levelled(3), 'OH', 'capital', false, 3);
    expect(lvl(solo, 'OH', 'capital')).toBe(1);

    const versus = recordVersusRound(levelled(3), 'OH', 'capital', false, 3);

    expect(lvl(versus, 'OH', 'capital')).toBe(3);
  });

  it('never raises the error flag that paints a state weak for good', () => {
    const solo = recordAnswer(emptyProgress(), 'OH', 'capital', false, 3);
    expect(solo.err.OH).toBe(1);

    const versus = recordVersusRound(emptyProgress(), 'OH', 'capital', false, 3);

    expect(versus.err.OH).toBe(0);
  });

  it('teaches the weak list what a match found out', () => {
    let p = emptyProgress();
    for (let i = 0; i < 3; i++) p = recordVersusRound(p, 'OH', 'capital', false, 3);

    const weak = weakList(p);

    expect(weak[0].s.a).toBe('OH');
    expect(weak[0].track).toBe('capital');
    expect(weak[0].a).toBe(3);
  });
});

describe('recording a round against the stored progress', () => {
  it('writes it to storage', () => {
    studyRound('ACDE:0', 0, 'OH', 'capital', true, 3);

    expect(loadProgress().st?.OH?.capital).toEqual({ a: 1, c: 1 });
  });

  it('counts the same round once, however often it is offered', () => {
    studyRound('ACDE:0', 0, 'OH', 'capital', true, 3);
    studyRound('ACDE:0', 0, 'OH', 'capital', true, 3);
    studyRound('ACDE:0', 0, 'OH', 'capital', true, 3);

    expect(loadProgress().st?.OH?.capital).toEqual({ a: 1, c: 1 });
  });

  it('counts a different round of the same match', () => {
    studyRound('ACDE:0', 0, 'OH', 'capital', true, 3);
    studyRound('ACDE:0', 1, 'OH', 'capital', false, 3);

    expect(loadProgress().st?.OH?.capital).toEqual({ a: 2, c: 1 });
  });

  it('counts the same round of the next match', () => {
    studyRound('ACDE:0', 0, 'OH', 'capital', true, 3);
    studyRound('ACDE:1', 0, 'OH', 'capital', true, 3);

    expect(loadProgress().st?.OH?.capital).toEqual({ a: 2, c: 2 });
  });
});
