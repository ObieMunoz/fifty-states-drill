// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VersusFinal } from '../components/versus/VersusFinal';
import { VersusLobby } from '../components/versus/VersusLobby';
import { VersusMenu } from '../components/versus/VersusMenu';
import { initialVersus } from '../versus/machine';
import type { VersusState } from '../versus/machine';
import { roundLimitMs } from '../versus/scoring';
import type { VersusApi } from '../versus/useVersus';
import type { PlannedRound, RoundAnswer } from '../versus/types';

vi.mock('../versus/sound', () => ({
  play: vi.fn(),
  unlockAudio: vi.fn(),
  soundOn: () => false,
  setSoundOn: vi.fn(),
  onSoundChange: () => () => {},
}));

vi.mock('../versus/usePush', () => ({
  usePush: () => ({ supported: false, enabled: false, busy: false, error: null, needsInstall: false, toggle: vi.fn() }),
}));

afterEach(cleanup);

const SEED = 'ACDE:0';
const PLAN: PlannedRound[] = Array.from({ length: 5 }, (_, i) => ({ qm: 'find', abbr: i % 2 ? 'NV' : 'OH' }));
const noop = () => {};

const ans = (points: number): RoundAnswer =>
  ({ correct: points > 0, ms: 2000, points, pick: 'OH', timeout: false });

function api(over: Partial<VersusState> = {}, extra: Partial<VersusApi> = {}): VersusApi {
  const base = initialVersus('Obie', 'standard', 'ACDE', 'me');
  const state: VersusState = {
    ...base,
    phase: 'lobby',
    link: 'linked',
    isHost: true,
    synced: true,
    them: { id: 'them', name: 'Sam', color: 'coral', dif: 'guided', ready: false, present: true },
    cfg: { seed: SEED, mode: 'find', rounds: 5, scope: 'all' },
    plan: PLAN,
    difs: { me: 'standard', them: 'guided' },
    myAnswers: [],
    theirAnswers: [],
    ...over,
  };
  return {
    state,
    ask: null,
    theirAsk: null,
    msLeft: null,
    limitMs: roundLimitMs('find', ['standard', 'guided']),
    countdownMs: 0,
    myTotal: 0,
    theirTotal: 0,
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

describe('the lobby', () => {
  it('lets the host set the rules', () => {
    const { container } = render(<VersusLobby api={api({ isHost: true })} />);

    expect(container.querySelectorAll('button').length).toBeGreaterThan(3);
    expect(text(container)).toContain('Sam');
  });

  it('shows a guest the rules without controls to change them', () => {
    const host = render(<VersusLobby api={api({ isHost: true })} />).container.querySelectorAll('button').length;
    cleanup();

    const { container } = render(<VersusLobby api={api({ isHost: false })} />);

    expect(container.querySelectorAll('button').length).toBeLessThan(host);
  });

  it('waits on the other player when only this side is ready', () => {
    const { container } = render(<VersusLobby api={api({
      me: { id: 'me', name: 'Obie', color: 'teal', dif: 'standard', ready: true, present: true },
    })} />);

    expect(text(container)).toContain('Waiting for Sam');
  });

  it('says it is starting once both are ready', () => {
    const { container } = render(<VersusLobby api={api({
      me: { id: 'me', name: 'Obie', color: 'teal', dif: 'standard', ready: true, present: true },
      them: { id: 'them', name: 'Sam', color: 'coral', dif: 'guided', ready: true, present: true },
    })} />);

    expect(text(container)).toContain('Starting');
  });

  it('waits on a phone that has dropped off the room', () => {
    const { container } = render(<VersusLobby api={api({
      them: { id: 'them', name: 'Sam', color: 'coral', dif: 'guided', ready: false, present: false },
    })} />);

    expect(text(container)).toContain('reconnect');
  });
});

describe('the result screen', () => {
  const finished = (over: Partial<VersusState> = {}, extra: Partial<VersusApi> = {}) => api({
    phase: 'final',
    myAnswers: [ans(140), ans(140), ans(140), ans(0), ans(140)],
    theirAnswers: [ans(0), ans(100), ans(0), ans(120), ans(0)],
    ...over,
  }, { myTotal: 560, theirTotal: 220, ...extra });

  it('offers to keep an opponent who is not yet a friend', () => {
    const { container } = render(<VersusFinal api={finished()} />);

    expect(text(container)).toContain('Add Sam as a friend');
  });

  it('offers a plain rematch while they are still here', () => {
    const { container } = render(<VersusFinal api={finished()} />);

    expect(text(container)).toContain('Play again');
    expect(text(container)).not.toContain('Send Sam a rematch request');
  });

  it('says so when they have left and are nobody’s friend', () => {
    const { container } = render(<VersusFinal api={finished({ them: null, lastOpponent: 'Sam', lastOpponentId: 'them' })} />);

    expect(text(container)).toContain('Sam has left.');
    expect(text(container)).not.toContain('Send Sam a rematch request');
  });

  it('offers to reach a friend who has left', () => {
    const { container } = render(<VersusFinal api={finished(
      { them: null, lastOpponent: 'Sam', lastOpponentId: 'them' },
      { friends: [{ id: 'them', name: 'Sam', last: 1 }] },
    )} />);

    expect(text(container)).toContain('Send Sam a rematch request');
  });

  it('passes on that the other side has already asked', () => {
    const { container } = render(<VersusFinal api={finished({ theyWantAgain: true })} />);

    expect(text(container)).toContain('Sam wants another.');
  });
});

describe('the menu', () => {
  it('offers the two ways into a room', () => {
    const { container } = render(<VersusMenu api={api({ phase: 'menu', them: null, code: '' })} onExit={noop} />);

    expect(text(container)).toMatch(/Host|Start/i);
    expect(text(container)).toMatch(/Join/i);
  });

  it('offers the invited room straight away when one was tapped', () => {
    const { container } = render(<VersusMenu api={api({
      phase: 'menu', them: null, code: 'ACDE', invite: { name: 'Sam', sent: null },
    })} onExit={noop} />);

    expect(text(container)).toContain('Join room ACDE');
    expect(text(container)).toContain('Not this room');
  });

  it('shows why the last room could not be joined', () => {
    const { container } = render(<VersusMenu api={api({
      phase: 'menu', them: null, code: '', error: 'That room is full.',
    })} onExit={noop} />);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('That room is full.');
  });
});
