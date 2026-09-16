// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VersusPlay } from '../components/versus/VersusPlay';
import { askFor } from '../versus/grade';
import { initialVersus } from '../versus/machine';
import { roundLimitMs } from '../versus/scoring';
import type { VersusApi } from '../versus/useVersus';
import type { PlannedRound, RoundAnswer } from '../versus/types';
import type { Abbr, DiffKey, ModeKey } from '../types';

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

const theirTile = (c: HTMLElement) => c.querySelector('.vs-score.them')!;

function asking(qm: ModeKey, abbr: Abbr, dif: DiffKey): VersusApi {
  const plan: PlannedRound[] = [{ qm, abbr }];
  const base = playing(null);
  return {
    ...base,
    state: {
      ...base.state,
      me: { ...base.state.me, dif },
      them: { ...base.state.them!, dif },
      cfg: { seed: SEED, mode: qm, rounds: 1, scope: 'all' },
      plan,
      difs: { 'me-1': dif, 'them-1': dif },
      myAnswers: [null],
      theirAnswers: [null],
    },
    ask: askFor(SEED, 0, plan[0], dif),
    theirAsk: askFor(SEED, 0, plan[0], dif),
    limitMs: roundLimitMs(qm, [dif, dif]),
  };
}

const canAnswer = (c: HTMLElement): boolean =>
  !!c.querySelector('.vs-stage') || !!c.querySelector('.vs-opts button');

describe('Versus play, Find It', () => {
  it('leaves the rows above the map untouched when the opponent locks in', () => {
    const { container, rerender } = render(<VersusPlay api={playing(null)} />);
    const before = rowsAboveMap(container);

    rerender(<VersusPlay api={playing(THEY_ARE_IN)} />);

    expect(rowsAboveMap(container)).toEqual(before);
  });

  it('swaps one mark for another on the opponent tile, never adding to it', () => {
    const { container, rerender } = render(<VersusPlay api={playing(null)} />);
    const before = theirTile(container).children.length;

    rerender(<VersusPlay api={playing(THEY_ARE_IN)} />);

    expect(theirTile(container).children.length).toBe(before);
  });

  it('shows nothing but the thinking dot while the opponent is still out', () => {
    const { container } = render(<VersusPlay api={playing(null)} />);

    expect(container.querySelector('.vs-score-in')).toBeNull();
    expect(theirTile(container).querySelector('i')).not.toBeNull();
  });

  it('puts the opponent time on their tile once they are in', () => {
    const { container } = render(<VersusPlay api={playing(THEY_ARE_IN)} />);

    expect(theirTile(container).querySelector('.vs-score-in')?.textContent).toBe('2.3s');
  });

  it('keeps the thinking dot when the opponent ran out of clock', () => {
    const timedOut: RoundAnswer = { correct: false, ms: 12000, points: 0, pick: null, timeout: true };
    const { container } = render(<VersusPlay api={playing(timedOut)} />);

    expect(container.querySelector('.vs-score-in')).toBeNull();
    expect(theirTile(container).querySelector('i')?.className).toBe('in');
  });

  it('announces the opponent landing to a screen reader', () => {
    const { container } = render(<VersusPlay api={playing(THEY_ARE_IN)} />);

    expect(container.querySelector('.sr[role="status"]')?.textContent).toBe('Alex is in.');
  });
});

describe('questions whose prompt is the map itself', () => {
  const levels: DiffKey[] = ['guided', 'standard', 'expert'];
  const shown: ModeKey[] = ['find', 'name', 'shape'];

  it.each(shown.flatMap((qm) => levels.map((dif) => [qm, dif] as const)))(
    'draws the target for %s at %s',
    (qm, dif) => {
      const { container } = render(<VersusPlay api={asking(qm, 'OH', dif)} />);

      expect(container.querySelector('.vs-stage')).not.toBeNull();
    },
  );

  it.each(levels)('leaves Name It at %s with a way to answer', (dif) => {
    const { container } = render(<VersusPlay api={asking('name', 'OH', dif)} />);

    expect(canAnswer(container)).toBe(true);
  });
});
