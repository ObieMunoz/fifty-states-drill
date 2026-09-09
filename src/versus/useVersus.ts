import {
  useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import { BY } from '../data/states';
import { DIFFS } from '../data/modes';
import { buildAsk, expectedText } from '../game/question';
import { near, norm } from '../lib/text';
import { askRng } from './plan';
import { roundLimitMs, scoreAnswer } from './scoring';
import {
  currentRound, initialVersus, matchResults, reducer, resolveHost, totalOf,
} from './machine';
import type { VersusState } from './machine';
import { cleanName, displayName, loadName, saveName } from './identity';
import { loadBoard, rankBoard, recordMatch } from './leaderboard';
import type { LeaderRow } from './leaderboard';
import {
  clearUrlCode, codeFromUrl, forgetHosted, isClosedRoom, isHostedHere, matchSeed, newRoomCode,
  normalizeCode, rememberClosed, rememberHosted, setUrlCode,
} from './room';
import { connect, peerId } from './net';
import type { Transport } from './net';
import { PROTOCOL_VERSION } from './types';
import type { MatchConfig, Msg, RoundAnswer } from './types';
import type { Abbr, Ask, DiffKey, ModeKey, Scope } from '../types';

/** Ticks down on screen before the first question. */
export const COUNTDOWN_MS = 3000;

/** How long both answers stay up before the next question. */
const REVEAL_MS = 2600;

/** After this side has answered, how long to wait on a straggling opponent. */
const GRACE_MS = 1500;

export interface VersusApi {
  state: VersusState;
  /** The question as this player sees it, built at their own level. */
  ask: Ask | null;
  /** Milliseconds left in the round, or null outside a live question. */
  msLeft: number | null;
  limitMs: number;
  /** Milliseconds until the first question, while counting down. */
  countdownMs: number;
  myTotal: number;
  theirTotal: number;
  /** True once this side has an answer in for the round on screen. */
  answered: boolean;
  /** This device's standings, refreshed the moment a match is folded in. */
  board: LeaderRow[];
  clearBoard: () => void;
  host: (name: string) => void;
  join: (code: string, name: string) => void;
  setName: (name: string) => void;
  setDif: (dif: DiffKey) => void;
  setReady: (ready: boolean) => void;
  setDraft: (draft: { mode?: ModeKey; rounds?: number; scope?: Scope }) => void;
  answerChoice: (abbr: Abbr) => void;
  answerText: (text: string) => void;
  answerMap: (abbr: Abbr) => void;
  rematch: () => void;
  leave: () => void;
}

/** Grade one answer exactly the way the solo game does. */
function grade(ask: Ask, qm: ModeKey, value: string): boolean {
  if (ask.choices || qm === 'find') return value === ask.answer;
  const expect = expectedText(ask, qm);
  // A two-letter code has no near-misses: one edit is a different state.
  if (qm === 'code' && !ask.rev) return norm(value) === norm(expect);
  return near(value, expect);
}

export function useVersus(): VersusApi {
  const [state, dispatch] = useReducer(
    reducer, undefined, () => initialVersus(loadName(), 'standard', codeFromUrl() ?? ''),
  );

  /** Latest state, so transport callbacks never read through a stale closure. */
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);

  const net = useRef<Transport | null>(null);
  /**
   * Messages raised before `connect` resolved. A peer can appear while the
   * promise is still in flight, and the introduction must not be dropped.
   */
  const outbox = useRef<Msg[]>([]);
  /**
   * A clock sampled often enough to animate the ring. It is state rather than
   * a ref because the countdown renders from it, and rendering may neither
   * read a ref nor call `Date.now` itself. What it is measured against —
   * `state.startedAt` — is set by the reducer from the action that starts it.
   */
  const [now, setNow] = useState(() => Date.now());
  /* Read once at mount, then replaced by whatever `recordMatch` returns. Kept
     here rather than in the results screen because the write has to happen
     before that screen reads it, and child effects run before parent ones. */
  const [board, setBoard] = useState<LeaderRow[]>(() => rankBoard(loadBoard()));
  /** The match already folded into the standings, so a re-render cannot double it. */
  const recorded = useRef('');

  const send = useCallback((msg: Msg) => {
    if (net.current) net.current.send(msg);
    else outbox.current.push(msg);
  }, []);

  /**
   * Tear the connection down. With `farewell`, the peer is told first, so a
   * departure on purpose is not mistaken for a dropped connection: a guest
   * hearing it from the host learns the room is closed, not merely quiet.
   */
  const dropLink = useCallback((farewell: boolean) => {
    const link = net.current;
    if (link) {
      if (farewell) link.send({ t: 'bye' });
      link.leave();
    }
    net.current = null;
    outbox.current = [];
  }, []);

  /**
   * End the match: fold the result into this device's standings, then show it.
   *
   * Done here rather than in an effect on the results screen so the write
   * lands before anything reads it, and so a repeat cannot double-count. The
   * dependency list is empty, so this is stable for the life of the session.
   */
  const finishMatch = useCallback(() => {
    const s = live.current;
    if (s.cfg && recorded.current !== s.cfg.seed) {
      recorded.current = s.cfg.seed;
      const { mine, theirs, outcome } = matchResults(s);
      setBoard(recordMatch([
        { name: displayName(s.me.name), ...mine, outcome },
        {
          name: displayName(s.them?.name ?? '', 'Opponent'),
          ...theirs,
          outcome: outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw',
        },
      ]));
    }
    dispatch({ type: 'finish' });
  }, []);

  /* ---------------- protocol ---------------- */

  const handleMessage = useCallback((msg: Msg, id: string) => {
    const s = live.current;
    switch (msg.t) {
      case 'hi': {
        // Which side hosts is settled here too, so this reads the reconciled
        // answer rather than the claim the button press left in state.
        const isHost = resolveHost(s.isHost, msg.host, s.me.id, id);
        dispatch({ type: 'peerHello', id, name: msg.name, dif: msg.dif, host: msg.host });
        // The host owns the settings, so it pushes them on introduction.
        if (isHost) {
          send({ t: 'cfg', mode: s.draft.mode, rounds: s.draft.rounds, scope: s.draft.scope });
        }
        break;
      }
      case 'cfg':
        if (!s.isHost) {
          dispatch({ type: 'setDraft', draft: { mode: msg.mode, rounds: msg.rounds, scope: msg.scope } });
        }
        break;
      case 'dif':
        dispatch({ type: 'setPeerDif', dif: msg.dif });
        break;
      case 'rdy':
        dispatch({ type: 'setPeerReady', ready: msg.ready });
        break;
      case 'go':
        dispatch({ type: 'startMatch', cfg: msg.cfg, difs: msg.difs, at: Date.now() });
        break;
      case 'ans':
        dispatch({
          type: 'peerAnswer',
          round: msg.round,
          answer: {
            correct: msg.correct, ms: msg.ms, points: msg.points,
            pick: msg.pick, timeout: msg.timeout,
          },
        });
        break;
      case 'nxt':
        dispatch({ type: 'advance', round: msg.round, at: Date.now() });
        break;
      case 'end':
        finishMatch();
        break;
      case 'again':
        // The host owns the restart: it takes both sides back to the lobby,
        // and a guest asking only registers as interest on the host's screen.
        if (s.isHost) dispatch({ type: 'peerWantsAgain' });
        else dispatch({ type: 'rematch' });
        break;
      case 'bye':
        // A guest leaving on purpose hands the host back the waiting room:
        // the code stays good for the next player. The host leaving closes
        // the room: nobody can take the code over, so the guest is sent home
        // and told why, and this device notes the code so a second try at
        // the same invite is refused without a search.
        if (s.isHost) {
          dispatch({ type: 'peerQuit' });
          break;
        }
        rememberClosed(s.code);
        dropLink(false);
        clearUrlCode();
        dispatch({ type: 'roomClosed', error: 'The host closed the room.' });
        break;
    }
  }, [send, finishMatch, dropLink]);

  /** Kept in a ref so `connect`'s callbacks always reach the current handler. */
  const onMsg = useRef(handleMessage);
  useEffect(() => { onMsg.current = handleMessage; }, [handleMessage]);

  /* ---------------- connection ---------------- */

  const open = useCallback(async (code: string, name: string, asHost: boolean) => {
    if (net.current) return;
    const clean = displayName(name);
    saveName(clean);
    dispatch({ type: 'setName', name: clean });
    dispatch(asHost
      ? { type: 'hostRoom', code, id: '' }
      : { type: 'joinRoom', code, id: '' });
    // A reload should come back to this room, not to the menu — and for the
    // creator, come back as its host, whichever way they return to it.
    setUrlCode(code);
    if (asHost) rememberHosted(code);
    /* This device's own id is half of what settles which side hosts, so it has
       to be in hand before a peer can introduce itself. Asked for here rather
       than read off the transport afterwards: `connect` waits on this same
       module load before it joins a network, so this lands first — while there
       is still nothing to have met. */
    void peerId()
      .then((id) => dispatch({ type: 'setSelfId', id }))
      .catch(() => { /* the same load failing inside `connect` is what reports it */ });

    try {
      const transport = await connect(code, {
        onPeer: () => {
          send({
            t: 'hi',
            name: displayName(live.current.me.name),
            dif: live.current.me.dif,
            host: live.current.isHost,
            ver: PROTOCOL_VERSION,
          });
        },
        onPeerLeave: () => dispatch({ type: 'peerLeft' }),
        onMessage: (msg, id) => onMsg.current(msg, id),
        onStatus: (s) => {
          if (live.current.them) return;
          // Blocked outranks the timeout: the other player is there, so the
          // code is not the problem and should not be blamed.
          if (s.blocked) {
            dispatch({ type: 'setLink', link: 'error' });
            dispatch({
              type: 'setError',
              error: 'Your phones found each other, but the connection between them was blocked. '
                + 'Some mobile networks do this: put both phones on the same Wi-Fi, or keep this '
                + 'open and it will keep trying.',
            });
          } else if (s.gaveUp) {
            dispatch({ type: 'setLink', link: 'error' });
            dispatch({
              type: 'setError',
              error: asHost
                ? 'No one has joined yet. Keep this open, or start over if the code went stale.'
                : 'No host answered, so that room has expired or been closed. '
                  + 'Check the code, or ask for a fresh one.',
            });
          }
        },
      });
      net.current = transport;
      // Re-issue anything raised while the connection was still opening.
      const queued = outbox.current;
      outbox.current = [];
      for (const m of queued) transport.send(m);
    } catch {
      dispatch({ type: 'setLink', link: 'error' });
      dispatch({ type: 'setError', error: 'Could not reach the network. Check your connection and try again.' });
    }
  }, [send]);

  const host = useCallback((name: string) => { void open(newRoomCode(), name, true); }, [open]);
  const join = useCallback((code: string, name: string) => {
    const clean = normalizeCode(code);
    // A room this device has seen close has no host to find; say so now.
    if (isClosedRoom(clean)) {
      dispatch({ type: 'setError', error: 'That room has closed: its host left. Ask them for a fresh code.' });
      return;
    }
    void open(clean, name, isHostedHere(clean));
  }, [open]);

  /* An invite link or a scanned code lands straight in the room: nobody
     should have to press Join on a code they never typed. It takes a name in
     hand, and with none saved the menu asks first and joins on the answer. A
     layout effect rather than a plain one, so a saved name goes from the
     loading screen into the room without a flash of the menu between. */
  const autoJoined = useRef(false);
  useLayoutEffect(() => {
    // Once only: development's double-mount would otherwise open two links.
    if (autoJoined.current) return;
    autoJoined.current = true;
    const s = live.current;
    if (s.phase === 'menu' && s.code && cleanName(s.me.name)) join(s.code, s.me.name);
  }, [join]);

  /* ---------------- the question this player sees ---------------- */

  const round = currentRound(state);
  const inMatch = state.phase === 'question' || state.phase === 'reveal';

  const ask = useMemo(() => {
    if (!round || !state.cfg) return null;
    // The state and question type are already agreed; the scaffolding around
    // them is this player's own, from a generator of its own, so the opponent's
    // level cannot perturb these options.
    return buildAsk(
      BY[round.abbr], round.qm, DIFFS[state.me.dif], askRng(state.cfg.seed, state.round),
    );
  }, [round, state.cfg, state.me.dif, state.round]);

  const limitMs = useMemo(() => {
    if (!round) return 0;
    // Levels are locked at kick-off; before then, use what the lobby shows.
    const locked = Object.values(state.difs);
    const difs = locked.length
      ? locked
      : [state.me.dif, ...(state.them ? [state.them.dif] : [])];
    return roundLimitMs(round.qm, difs);
  }, [round, state.difs, state.me.dif, state.them]);

  /* Sample the clock while one is on screen. The first sample is taken up
     front so the ring starts full rather than a tick behind. */
  useEffect(() => {
    if (state.phase !== 'question' && state.phase !== 'countdown') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [state.phase, state.round]);

  const elapsed = Math.max(0, now - state.startedAt);

  const msLeft = state.phase === 'question' && state.startedAt
    ? Math.max(0, limitMs - elapsed)
    : null;

  const countdownMs = state.phase === 'countdown' && state.startedAt
    ? Math.max(0, COUNTDOWN_MS - elapsed)
    : COUNTDOWN_MS;

  /* ---------------- answering ---------------- */

  const submit = useCallback((value: string | null, correct: boolean, timeout: boolean) => {
    const s = live.current;
    if (s.phase !== 'question' || s.myAnswers[s.round] != null) return;
    const ms = Date.now() - s.startedAt;
    const points = scoreAnswer(correct, ms, limitMs || 1);
    const answer: RoundAnswer = { correct, ms, points, pick: value, timeout };
    dispatch({ type: 'answer', round: s.round, answer });
    send({ t: 'ans', round: s.round, correct, ms, points, pick: value, timeout });
    // A short buzz for right, a stutter for wrong. Silent where unsupported.
    if (!timeout && navigator.vibrate) navigator.vibrate(correct ? 18 : [0, 35, 55, 35]);
  }, [limitMs, send]);

  const answerChoice = useCallback((abbr: Abbr) => {
    if (ask) submit(abbr, abbr === ask.answer, false);
  }, [ask, submit]);

  const answerMap = useCallback((abbr: Abbr) => {
    if (ask) submit(abbr, abbr === ask.answer, false);
  }, [ask, submit]);

  const answerText = useCallback((text: string) => {
    if (!ask || !round) return;
    const v = text.trim();
    if (v) submit(v, grade(ask, round.qm, v), false);
  }, [ask, round, submit]);

  /* The clock running out counts as an answer, so the round can end. */
  useEffect(() => {
    if (state.phase !== 'question' || msLeft === null) return;
    if (msLeft > 0 || state.myAnswers[state.round] != null) return;
    submit(null, false, true);
  }, [state.phase, state.round, state.myAnswers, msLeft, submit]);

  /* ---------------- round and match flow ---------------- */

  /* Both answers in ends the round at once. One answer in starts a grace
     period, so a peer that has gone quiet cannot stall the match. */
  useEffect(() => {
    if (state.phase !== 'question') return;
    const mine = state.myAnswers[state.round];
    const theirs = state.theirAnswers[state.round];
    if (mine && theirs) {
      dispatch({ type: 'reveal' });
      return;
    }
    if (!mine) return;
    const id = setTimeout(() => dispatch({ type: 'reveal' }), (msLeft ?? 0) + GRACE_MS);
    return () => clearTimeout(id);
    // `msLeft` is deliberately excluded: it changes ten times a second, and
    // restarting this timer on every tick would push the deadline forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.myAnswers, state.theirAnswers]);

  /* Only the host decides when to move on, so the two screens stay in step. */
  useEffect(() => {
    if (state.phase !== 'reveal' || !state.isHost) return;
    const id = setTimeout(() => {
      const next = live.current.round + 1;
      if (next >= live.current.plan.length) {
        send({ t: 'end' });
        finishMatch();
      } else {
        send({ t: 'nxt', round: next });
        dispatch({ type: 'advance', round: next, at: Date.now() });
      }
    }, REVEAL_MS);
    return () => clearTimeout(id);
  }, [state.phase, state.round, state.isHost, send, finishMatch]);

  /* The countdown hands off to the first question. */
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    const id = setTimeout(
      () => dispatch({ type: 'beginQuestions', at: Date.now() }),
      Math.max(0, COUNTDOWN_MS - (Date.now() - state.startedAt)),
    );
    return () => clearTimeout(id);
  }, [state.phase, state.startedAt]);

  /* Both ready in the lobby: the host starts the match. */
  useEffect(() => {
    if (!state.isHost || state.phase !== 'lobby') return;
    if (!state.me.ready || !state.them?.ready || !state.me.id) return;
    const cfg: MatchConfig = {
      seed: matchSeed(state.code, state.matchNo),
      mode: state.draft.mode,
      rounds: state.draft.rounds,
      scope: state.draft.scope,
    };
    const difs = { [state.me.id]: state.me.dif, [state.them.id]: state.them.dif };
    send({ t: 'go', cfg, difs });
    dispatch({ type: 'startMatch', cfg, difs, at: Date.now() });
  }, [state.isHost, state.phase, state.me.ready, state.me.id, state.me.dif,
    state.them, state.code, state.matchNo, state.draft, send]);

  /* ---------------- outward actions ---------------- */

  const setName = useCallback((name: string) => {
    saveName(name);
    dispatch({ type: 'setName', name });
  }, []);

  const setDif = useCallback((dif: DiffKey) => {
    dispatch({ type: 'setDif', dif });
    send({ t: 'dif', dif });
  }, [send]);

  const setReady = useCallback((ready: boolean) => {
    dispatch({ type: 'setReady', ready });
    send({ t: 'rdy', ready });
  }, [send]);

  const setDraft = useCallback((draft: { mode?: ModeKey; rounds?: number; scope?: Scope }) => {
    dispatch({ type: 'setDraft', draft });
    const next = { ...live.current.draft, ...draft };
    send({ t: 'cfg', mode: next.mode, rounds: next.rounds, scope: next.scope });
  }, [send]);

  const rematch = useCallback(() => {
    send({ t: 'again' });
    // The host restarts both sides; a guest is taken back when the host does.
    if (live.current.isHost) dispatch({ type: 'rematch' });
  }, [send]);

  /* Leaving on purpose is the one thing that closes a room. A reload, a
     discarded tab or a dropped connection is deliberately not treated as one:
     the peer sees a plain disconnect and waits, the URL still carries the
     code, and whoever dropped comes back on it. Sending a farewell from the
     unload events instead would tell the guest the room had closed and note
     it as closed here, while the guest's screen — if the farewell never got
     through — kept waiting for a host their own device now refuses to let
     back in. Those two screens must never disagree, so unload sends nothing. */
  const leave = useCallback(() => {
    const s = live.current;
    // The host's leaving closes the room for good; note it on this side too,
    // so opening the old invite here is refused rather than searched.
    if (s.isHost && s.phase !== 'menu') {
      rememberClosed(s.code);
      forgetHosted();
    }
    dropLink(true);
    clearUrlCode();
    dispatch({ type: 'leave' });
  }, [dropLink]);

  useEffect(() => () => { dropLink(true); }, [dropLink]);

  return {
    state,
    ask: inMatch ? ask : null,
    msLeft,
    limitMs,
    countdownMs,
    myTotal: totalOf(state.myAnswers),
    theirTotal: totalOf(state.theirAnswers),
    answered: state.myAnswers[state.round] != null,
    board,
    clearBoard: () => setBoard([]),
    host, join, setName, setDif, setReady, setDraft,
    answerChoice, answerText, answerMap, rematch, leave,
  };
}
