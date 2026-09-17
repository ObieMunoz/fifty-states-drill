// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { VersusFinal } from '../components/versus/VersusFinal';
import { VersusTrial } from '../components/versus/VersusTrial';
import { BY } from '../data/states';
import { initialVersus } from '../versus/machine';
import type { VersusState } from '../versus/machine';
import { matchPool, planMatch } from '../versus/plan';
import { TRIAL_MS } from '../versus/trial';
import type { VersusApi } from '../versus/useVersus';
import type { RoundAnswer } from '../versus/types';

vi.mock('../versus/sound', () => ({
  play: vi.fn(),
  unlockAudio: vi.fn(),
  soundOn: () => false,
  setSoundOn: vi.fn(),
  onSoundChange: () => () => {},
}));

afterEach(cleanup);

const noop = () => {};
const SEED = 'ACDE:0';

const entry = (pick: string, ms: number): RoundAnswer =>
  ({ correct: true, ms, points: 1, pick, timeout: false });

function trial(
  mine: RoundAnswer[], theirs: RoundAnswer[], over: Partial<VersusState> = {}, extra: Partial<VersusApi> = {},
): VersusApi {
  const base = initialVersus('Obie', 'standard', 'ACDE', 'me');
  const state: VersusState = {
    ...base,
    phase: 'question',
    link: 'linked',
    isHost: true,
    synced: true,
    them: { id: 'them', name: 'Sam', color: 'coral', dif: 'standard', ready: true, present: true },
    cfg: { seed: SEED, mode: 'trial', rounds: 50, scope: 'all' },
    plan: [],
    difs: { me: 'standard', them: 'standard' },
    myAnswers: mine,
    theirAnswers: theirs,
    ...over,
  };
  return {
    state,
    ask: null,
    theirAsk: null,
    msLeft: TRIAL_MS,
    limitMs: TRIAL_MS,
    countdownMs: 0,
    myTotal: mine.length,
    theirTotal: theirs.length,
    myStreak: 0,
    theirStreak: 0,
    worth: 0,
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
    answerName: noop,
    answerMap: noop,
    rematch: noop,
    leave: noop,
    ...extra,
  };
}

const text = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ');
const filled = (c: HTMLElement) => c.querySelectorAll('.st.done').length;

describe('the Time Trial screen', () => {
  it('offers a box to type into and no question', () => {
    const { container } = render(<VersusTrial api={trial([], [])} />);

    expect(container.querySelector('.vs-entry input')).not.toBeNull();
    expect(container.querySelector('.vs-ask')).toBeNull();
    expect(container.querySelector('.vs-choices')).toBeNull();
  });

  it('starts from a blank map and counts nothing named', () => {
    const { container } = render(<VersusTrial api={trial([], [])} />);

    expect(filled(container)).toBe(0);
    expect(text(container)).toContain('0 of 50 named');
  });

  it('fills the map with every state this player has named', () => {
    const mine = [entry('OH', 1000), entry('NV', 2000), entry('TX', 3000)];
    const { container } = render(<VersusTrial api={trial(mine, [])} />);

    expect(filled(container)).toBe(3);
    expect(text(container)).toContain('3 of 50 named');
  });

  it('calls out the last one in and how many are left', () => {
    const { container } = render(<VersusTrial api={trial([entry('OH', 1000)], [])} />);

    expect(text(container)).toContain('Ohio');
    expect(text(container)).toContain('49 to go');
  });

  it('shows both counts so a player knows where they stand', () => {
    const { container } = render(<VersusTrial api={trial(
      [entry('OH', 1000)], [entry('NV', 900), entry('TX', 1200)],
    )} />);

    expect(container.querySelector('.vs-score.me b')?.textContent).toBe('1');
    expect(container.querySelector('.vs-score.them b')?.textContent).toBe('2');
  });

  it('sends a typed name and clears the box', () => {
    const answerName = vi.fn();
    const { container } = render(<VersusTrial api={trial([], [], {}, { answerName })} />);
    const input = container.querySelector('.vs-entry input') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Ohio' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(answerName).toHaveBeenCalledWith('Ohio');
    expect(input.value).toBe('');
  });

  it('sends nothing for an empty box', () => {
    const answerName = vi.fn();
    const { container } = render(<VersusTrial api={trial([], [], {}, { answerName })} />);

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(answerName).not.toHaveBeenCalled();
  });

  it('counts the clock down in minutes and seconds', () => {
    const { container } = render(<VersusTrial api={trial([], [], {}, { msLeft: 90_000 })} />);

    expect(container.querySelector('.vs-secs')?.textContent).toBe('1:30');
  });

  it('keeps the two seats in different colours', () => {
    const { container } = render(<VersusTrial api={trial([], [])} />);

    expect(container.querySelector('.vs-score.me')?.getAttribute('data-pc')).toBe('teal');
    expect(container.querySelector('.vs-score.them')?.getAttribute('data-pc')).toBe('coral');
  });

  it('holds the opponent’s seat colour while their row is missing, on either phone', () => {
    // The guest's own seat is coral, so falling back to coral for the
    // opponent painted both cards, and both halves of the map, the same.
    const asGuest = trial([], [], {
      isHost: false,
      me: { id: 'me', name: 'Obie', color: 'coral', dif: 'standard', ready: true, present: true },
      them: null,
      lastOpponent: 'Sam',
    });
    const { container } = render(<VersusTrial api={asGuest} />);

    expect(container.querySelector('.vs-score.me')?.getAttribute('data-pc')).toBe('coral');
    expect(container.querySelector('.vs-score.them')?.getAttribute('data-pc')).toBe('teal');
    expect(text(container)).toContain('Sam');
  });
});

describe('the result of a Time Trial', () => {
  // A trial's plan is fifty rounds the seed drew and nobody was ever asked;
  // production has one, so the result screen is tested against one.
  const PLAN = planMatch({ seed: SEED, mode: 'trial', rounds: 50, scope: 'all' });

  const pad = (a: RoundAnswer[]): (RoundAnswer | null)[] =>
    [...a, ...Array<null>(Math.max(0, 50 - a.length)).fill(null)];

  const finished = (mine: RoundAnswer[], theirs: RoundAnswer[]) =>
    trial([], [], {
      phase: 'final', plan: PLAN, myAnswers: pad(mine), theirAnswers: pad(theirs),
    }, { myTotal: mine.length, theirTotal: theirs.length });

  // Real abbreviations: the server only ever records a state it matched, and
  // the result screen looks each one up to name it.
  const POOL = matchPool('all').map((st) => st.a);
  const many = (n: number, step = 1000) =>
    Array.from({ length: n }, (_, i) => entry(POOL[i], (i + 1) * step));

  it('counts a trial in states, not points', () => {
    const { container } = render(<VersusFinal api={finished(many(31), many(28))} />);

    expect(text(container)).toContain('By 3 states');
    expect(text(container)).not.toContain('points');
  });

  it('says so when a player named them all, and how long it took', () => {
    const { container } = render(<VersusFinal api={finished(many(50, 2000), many(41))} />);

    expect(text(container)).toContain('All 50 in');
    expect(text(container)).toContain('You win');
  });

  it('reads a level trial as level on states', () => {
    const { container } = render(<VersusFinal api={finished(many(20, 1000), many(20, 1000))} />);

    expect(text(container)).toContain('Level on 20 states');
  });

  it('lists the states each player actually named, not the ones the plan drew', () => {
    const mine = [entry('OH', 3000), entry('TX', 6000), entry('NV', 9000)];
    const theirs = [entry('ME', 4000), entry('FL', 8000)];
    const { container } = render(<VersusFinal api={finished(mine, theirs)} />);
    const strip = text(container.querySelector('.vs-strip') as HTMLElement);

    for (const name of ['Ohio', 'Texas', 'Nevada', 'Maine', 'Florida']) {
      expect(strip).toContain(name);
    }
    // The plan's first few states were never put to either player.
    const unasked = PLAN.map((r) => r.abbr).filter((a) => !['OH', 'TX', 'NV', 'ME', 'FL'].includes(a));
    expect(strip).not.toContain(BY[unasked[0]].n);
    expect(container.querySelectorAll('.vs-strip li')).toHaveLength(3);
  });

  it('numbers the names by when they landed, whatever order the rows came in', () => {
    const mine = [entry('TX', 6000), entry('OH', 3000)];
    const { container } = render(<VersusFinal api={finished(mine, [])} />);
    const rows = [...container.querySelectorAll('.vs-strip li')].map((li) => text(li as HTMLElement));

    expect(rows[0]).toContain('Ohio');
    expect(rows[1]).toContain('Texas');
  });

  it('counts a trial in states named rather than rounds got right', () => {
    const { container } = render(<VersusFinal api={finished(many(31), many(28))} />);

    expect(text(container)).toContain('31 of 50 named');
    expect(text(container)).not.toContain('right');
  });

  it('compares the two on things a race has, and not on rounds', () => {
    const { container } = render(<VersusFinal api={finished(many(20, 1000), many(10, 3000))} />);
    const stats = text(container.querySelector('.vs-stats') as HTMLElement);

    expect(stats).toContain('Named');
    expect(stats).toContain('First in');
    expect(stats).toContain('Last in');
    expect(stats).not.toContain('Rounds won');
    expect(stats).not.toContain('Best streak');
    expect(stats).not.toContain('Average');
    expect(stats).toContain('20/50');
  });

  it('hands out no award a race cannot earn', () => {
    const { container } = render(<VersusFinal api={finished(many(31), many(28))} />);
    const awards = [...container.querySelectorAll('.vs-award')].map((li) => text(li as HTMLElement));

    for (const wrong of ['Clutch', 'Comeback', 'Buzzer beater', 'On fire', 'Fastest finger']) {
      expect(awards.join(' ')).not.toContain(wrong);
    }
  });

  it('calls a trial decided by one state a photo finish, and a full map a sweep', () => {
    const close = render(<VersusFinal api={finished(many(31), many(30))} />);
    expect(text(close.container)).toContain('Photo finish');
    cleanup();

    const swept = render(<VersusFinal api={finished(many(50, 2000), many(41))} />);
    expect(text(swept.container)).toContain('Clean sweep');
    expect(text(swept.container)).toContain('All 50 named');
  });
});
