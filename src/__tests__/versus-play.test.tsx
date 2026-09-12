// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VersusPlay } from '../components/versus/VersusPlay';
import { askFor } from '../versus/grade';
import { initialVersus } from '../versus/machine';
import { roundLimitMs } from '../versus/scoring';
import type { VersusApi } from '../versus/useVersus';
import type { PlannedRound, RoundAnswer } from '../versus/types';

const SEED = 'ACDE:1';
const PLAN: PlannedRound[] = [{ qm: 'find', abbr: 'OH' }, { qm: 'find', abbr: 'NV' }];

const THEY_ARE_IN: RoundAnswer = { correct: true, ms: 2300, points: 40, pick: 'OH', timeout: false };

const noop = () => {};

function playing(theirs: RoundAnswer | null): VersusApi {
  const base = initialVersus('You', 'standard', 'ACDE', 'me-1');
  const ask = askFor(SEED, 0, PLAN[0], 'standard');
  return {
    state: {
      ...base,
      phase: 'question',
      link: 'linked',
      isHost: true,
      them: { id: 'them-1', name: 'Alex', color: 'coral', dif: 'standard', ready: true, present: true },
      cfg: { seed: SEED, mode: 'find', rounds: PLAN.length, scope: 'all' },
      plan: PLAN,
      difs: { 'me-1': 'standard', 'them-1': 'standard' },
      startedAt: 1000,
      myAnswers: [null, null],
      theirAnswers: [theirs, null],
      synced: true,
    },
    ask,
    theirAsk: ask,
    msLeft: 8000,
    limitMs: roundLimitMs('find', ['standard', 'standard']),
    countdownMs: 0,
    myTotal: 0,
    theirTotal: 0,
    myStreak: 0,
    theirStreak: 0,
    worth: 30,
    answered: false,
    reactions: [],
    react: noop,
    board: [],
    clearBoard: noop,
    friends: [],
    addFriend: noop,
    removeFriend: noop,
    requestRematch: noop,
    host: noop,
    join: noop,
    setName: noop,
    setDif: noop,
    setReady: noop,
    setDraft: noop,
    answerChoice: noop,
    answerText: noop,
    answerMap: noop,
    rematch: noop,
    leave: noop,
  };
}

function rowsAboveMap(container: HTMLElement): string[] {
  const sheet = container.querySelector('.vs-play');
  if (!sheet) throw new Error('the play sheet did not render');
  const rows = [...sheet.children];
  const stage = rows.findIndex((el) => el.classList.contains('vs-stage'));
  if (stage < 0) throw new Error('the map did not render');
  return rows.slice(0, stage).map((el) => `${el.tagName}.${el.classList[0]}`);
}

afterEach(cleanup);

describe('Versus play, Find It', () => {
  it('leaves the rows above the map untouched when the opponent locks in', () => {
    const { container, rerender } = render(<VersusPlay api={playing(null)} />);
    const before = rowsAboveMap(container);

    rerender(<VersusPlay api={playing(THEY_ARE_IN)} />);

    expect(rowsAboveMap(container)).toEqual(before);
  });

  it('holds the opponent notice row empty until they are in', () => {
    const { container } = render(<VersusPlay api={playing(null)} />);

    expect(container.querySelector('.vs-pressure')?.textContent).toBe('');
  });

  it('names the opponent and their time once they are in', () => {
    const { container } = render(<VersusPlay api={playing(THEY_ARE_IN)} />);

    expect(container.querySelector('.vs-pressure')?.textContent).toBe('Alex is in · 2.3s');
  });
});
