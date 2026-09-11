import {
  useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import { askFor, grade } from './grade';
import { isFinalRound, roundLimitMs, scoreAnswer, streakBefore } from './scoring';
import {
  currentRound, initialVersus, matchResults, reducer, settledTotal, streakInto, verdictsOf,
} from './machine';
import type { VersusState } from './machine';
import { cleanName, displayName, loadName, saveName } from './identity';
import { loadBoard, rankBoard, recordMatch } from './leaderboard';
import type { LeaderRow } from './leaderboard';
import { addFriend as keepFriend, loadFriends, removeFriend as dropFriend, touchFriend } from './friends';
import type { Friend } from './friends';
import { clearUrlCode, codeFromUrl, normalizeCode, setUrlCode } from './room';
import { clearSeries, loadSeries, saveSeries } from './series';
import { ApiError, OFFLINE, callPhone, callVersus } from './client';
import { openLive } from './live';
import type { Live } from './live';
import { playerId } from './player';
import { REACT_GAP_MS, REACT_TTL_MS } from './reactions';
import type { Emoji } from './reactions';
import { haptic } from './haptics';
import { play, unlockAudio } from './sound';
import { COUNTDOWN_MS, GRACE_MS, REVEAL_MS } from './timing';
import { outcomeOf } from './scoring';
import type { RoundAnswer, Snapshot } from './types';
import type { Abbr, Ask, DiffKey, ModeKey, Scope } from '../types';

/** How long the host waits before asking the server again to move on. */
const ADVANCE_RETRY_MS = 400;

/** How many times it asks: the server holds a round open a little longer than this phone. */
const ADVANCE_TRIES = 5;

/** The streaks that get a cue of their own at the reveal. */
const STREAK_CHEERS = new Set([3, 5]);

/** An emoji on its way across the screen, and whose it is. */
export interface FloatingReaction {
  id: number;
  from: 'me' | 'them';
  emoji: Emoji;
  /** Epoch ms it was sent or arrived. */
  at: number;
}

/** How many float at once before the oldest is dropped. */
const MAX_FLOATING = 8;

export interface VersusApi {
  state: VersusState;
  /** The question as this player sees it, built at their own level. */
  ask: Ask | null;
  /** The same round as the opponent saw it, so their pick can be read back in its own words. */
  theirAsk: Ask | null;
  /** Milliseconds left in the round, or null outside a live question. */
  msLeft: number | null;
  limitMs: number;
  /** Milliseconds until the first question, while counting down. */
  countdownMs: number;
  /** Points from rounds already revealed; the round in play is not yet counted. */
  myTotal: number;
  theirTotal: number;
  /** Right answers in a row each side carries, as of the rounds revealed. */
  myStreak: number;
  theirStreak: number;
  /** What a right answer is worth this instant, while the question is live and unanswered. */
  worth: number;
  /** True once this side has an answer in for the round on screen. */
  answered: boolean;
  /** Emoji in flight on this screen, oldest first. */
  reactions: FloatingReaction[];
  /** Send the other phone an emoji, and float it here too. */
  react: (emoji: Emoji) => void;
  /** This device's standings, refreshed the moment a match is folded in. */
  board: LeaderRow[];
  clearBoard: () => void;
  /** Opponents this device has chosen to keep, most recently played first. */
  friends: Friend[];
  /** Keep the opponent of the match just finished. */
  addFriend: () => void;
  /** Drop them here, and cut the link on the server so neither side can ping the other. */
  removeFriend: (id: string) => void;
  /** Open a room and send a friend a notification about it, playing under `name`. */
  requestRematch: (friend: Friend, name?: string) => void;
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

/** Sum one player's rows in a snapshot, for the standings. */
function tally(snap: Snapshot, id: string | undefined): { points: number; correct: number } {
  return snap.answers
    .filter((a) => a.player_id === id)
    .reduce((t, a) => ({ points: t.points + a.points, correct: t.correct + (a.correct ? 1 : 0) }), { points: 0, correct: 0 });
}

export function useVersus(): VersusApi {
  const [state, dispatch] = useReducer(
    reducer, undefined,
    () => {
      const code = codeFromUrl() ?? '';
      return initialVersus(loadName(), 'standard', code, playerId(), loadSeries(code));
    },
  );

  /** Latest state, so callbacks never read through a stale closure. */
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);

  /**
   * False once this screen is gone, so a reply that lands late is let drop.
   * A tapped notification remounts Versus for the new room while the old
   * screen's requests may still be in flight; those must not open a channel
   * nothing will close, or write the old room over the new one's URL.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** The room as the server pushes it, once this side has joined one. */
  const room = useRef<Live | null>(null);
  /**
   * A clock sampled often enough to animate the ring. It is state rather than
   * a ref because the countdown renders from it, and rendering may neither
   * read a ref nor call `Date.now` itself. What it is measured against —
   * `state.startedAt` — is set by the reducer from the action that starts it.
   */
  const [now, setNow] = useState(() => Date.now());
  /* Read once at mount, then replaced by whatever `recordMatch` returns. */
  const [board, setBoard] = useState<LeaderRow[]>(() => rankBoard(loadBoard()));
  const [friends, setFriends] = useState<Friend[]>(() => loadFriends());
  /** The match already folded into the standings, so a repeat cannot double it. */
  const recorded = useRef('');

  /* ---------------- reactions ---------------- */

  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const reactionId = useRef(0);
  const lastReact = useRef(0);

  const float = useCallback((from: 'me' | 'them', emoji: Emoji) => {
    const next: FloatingReaction = { id: ++reactionId.current, from, emoji, at: Date.now() };
    setReactions((rs) => [...rs.slice(1 - MAX_FLOATING), next]);
  }, []);

  /* Each one is forgotten once it has floated away. */
  useEffect(() => {
    if (!reactions.length) return;
    const due = reactions[0].at + REACT_TTL_MS - Date.now();
    const id = setTimeout(() => {
      const cutoff = Date.now() - REACT_TTL_MS;
      setReactions((rs) => rs.filter((r) => r.at > cutoff));
    }, Math.max(0, due));
    return () => clearTimeout(id);
  }, [reactions]);

  const react = useCallback((emoji: Emoji) => {
    const t = Date.now();
    // One at a time: a thumb drumming on the tray is not six reactions.
    if (t - lastReact.current < REACT_GAP_MS) return;
    lastReact.current = t;
    unlockAudio();
    float('me', emoji);
    room.current?.react(emoji);
  }, [float]);

  /**
   * Fold a finished match into this device's standings, once per seed. Done
   * as the snapshot lands rather than from the result screen, so the write
   * is there before anything reads it.
   */
  const noteFinal = useCallback((snap: Snapshot) => {
    const { room: r, players } = snap;
    if (r.status !== 'final' || !r.seed || recorded.current === r.seed) return;
    recorded.current = r.seed;
    const myId = live.current.me.id;
    const them = players.find((p) => p.id !== myId);
    const mine = tally(snap, myId);
    const theirs = tally(snap, them?.id);
    const outcome = outcomeOf(mine.points, theirs.points);
    setBoard(recordMatch([
      { name: displayName(live.current.me.name), ...mine, asked: r.rounds, outcome },
      {
        name: displayName(them?.name ?? live.current.lastOpponent, 'Opponent'),
        ...theirs,
        asked: r.rounds,
        outcome: outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw',
      },
    ]));
    // A friend's line moves to the top and takes the name they used today.
    if (them) setFriends(touchFriend({ id: them.id, name: displayName(them.name) }));
  }, []);

  const takeSnapshot = useCallback((snap: Snapshot) => {
    noteFinal(snap);
    // The live room takes it as the truth and hands it back through the same
    // path a pushed change takes; before there is one, it goes straight in.
    if (room.current) room.current.seed(snap);
    else dispatch({ type: 'snapshot', snap: { ...snap, receivedAt: Date.now() }, at: Date.now() });
  }, [noteFinal]);

  const dropRoom = useCallback(() => {
    room.current?.leave();
    room.current = null;
  }, []);

  /**
   * One call to the room. The room comes back and is applied; a refusal
   * becomes the message on screen. No room to be in — gone, closed, full —
   * means back to the front door with the reason.
   */
  const call = useCallback(async (input: Record<string, unknown>): Promise<Snapshot | null> => {
    const s = live.current;
    try {
      const snap = await callVersus({ code: s.code, playerId: s.me.id, ...input });
      takeSnapshot(snap);
      return snap;
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, OFFLINE);
      if (e.status === 404 || e.status === 409 || e.status === 410) {
        dropRoom();
        clearUrlCode(s.code);
        clearSeries();
        dispatch({ type: 'roomClosed', error: e.message });
      } else {
        dispatch({ type: 'setError', error: e.message });
      }
      return null;
    }
  }, [takeSnapshot, dropRoom]);

  const listen = useCallback((code: string) => {
    dropRoom();
    room.current = openLive(code, live.current.me.id, {
      onSnapshot: (snap) => {
        noteFinal(snap);
        dispatch({ type: 'snapshot', snap, at: Date.now() });
      },
      onPresence: (ids) => dispatch({ type: 'presence', ids }),
      onLink: (link) => {
        const was = live.current.link;
        dispatch({ type: 'setLink', link });
        // Back after a loss: whatever happened meanwhile is on the server.
        if (link === 'linked' && was === 'lost') void call({ action: 'sync' });
      },
      onReaction: (r) => {
        float('them', r.emoji);
        play('react');
        haptic('react');
      },
    });
  }, [dropRoom, noteFinal, call, float]);

  /* ---------------- getting into a room ---------------- */

  const open = useCallback(async (code: string, name: string, asHost: boolean) => {
    if (live.current.phase !== 'menu') return;
    unlockAudio();
    const clean = displayName(name);
    saveName(clean);
    dispatch({ type: 'setName', name: clean });
    dispatch({ type: 'enter', code, asHost });
    if (code) setUrlCode(code);
    const dif = live.current.me.dif;
    const snap = await call(asHost
      ? { action: 'create', name: clean, dif }
      : { action: 'join', code, name: clean, dif });
    if (!mounted.current) return;
    if (!snap) {
      clearUrlCode(code);
      return;
    }
    // A reload should come back to this room, not to the menu.
    setUrlCode(snap.room.code);
    try {
      listen(snap.room.code);
      room.current?.seed(snap);
    } catch (err) {
      dispatch({ type: 'setError', error: err instanceof Error ? err.message : String(err) });
    }
  }, [call, listen]);

  const host = useCallback((name: string) => { void open('', name, true); }, [open]);
  const join = useCallback((code: string, name: string) => {
    void open(normalizeCode(code), name, false);
  }, [open]);

  /* An invite link or a scanned code lands straight in the room: nobody
     should have to press Join on a code they never typed. It takes a name in
     hand, and with none saved the menu asks first and joins on the answer. A
     layout effect rather than a plain one, so a saved name goes from the
     loading screen into the room without a flash of the menu between. */
  const autoJoined = useRef(false);
  useLayoutEffect(() => {
    // Once only: development's double-mount would otherwise open two rooms.
    if (autoJoined.current) return;
    autoJoined.current = true;
    const s = live.current;
    if (s.phase === 'menu' && s.code && cleanName(s.me.name)) join(s.code, s.me.name);
  }, [join]);

  /* Coming back to the foreground: a phone that slept through a round or two
     asks where things stand rather than trusting what it last saw. */
  useEffect(() => {
    const onVisible = () => {
      const s = live.current;
      if (document.visibilityState === 'visible' && s.synced && s.phase !== 'menu') {
        void call({ action: 'sync' });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [call]);

  /* Going away without leaving keeps the seat: a reload comes back to it. */
  useEffect(() => () => { dropRoom(); }, [dropRoom]);

  /* And the series comes back with it. */
  useEffect(() => {
    if (state.synced && state.code) saveSeries(state.code, state.series);
  }, [state.synced, state.code, state.series]);

  /* Somebody sat down across the table. */
  const seated = useRef<string | null>(null);
  useEffect(() => {
    const id = state.them?.id ?? null;
    if (state.phase === 'lobby' && id && seated.current !== id) {
      play('join');
      haptic('join');
    }
    seated.current = id;
  }, [state.phase, state.them?.id]);

  /* ---------------- the question this player sees ---------------- */

  const round = currentRound(state);
  const inMatch = state.phase === 'question' || state.phase === 'reveal';

  const ask = useMemo(() => {
    if (!round || !state.cfg) return null;
    // The state and question type are already agreed; the scaffolding around
    // them is this player's own, from a generator of its own, so the opponent's
    // level cannot perturb these options.
    return askFor(state.cfg.seed, state.round, round, state.me.dif);
  }, [round, state.cfg, state.me.dif, state.round]);

  const theirAsk = useMemo(() => {
    if (!round || !state.cfg) return null;
    // Their level is the one locked at kick-off; before it is, the lobby's.
    const dif = (state.them && state.difs[state.them.id]) ?? state.them?.dif ?? 'standard';
    return askFor(state.cfg.seed, state.round, round, dif);
  }, [round, state.cfg, state.difs, state.them, state.round]);

  const limitMs = useMemo(() => {
    if (!round) return 0;
    // Levels are locked at kick-off; before then, use what the lobby shows.
    const locked = Object.values(state.difs);
    const difs = locked.length
      ? locked
      : [state.me.dif, ...(state.them ? [state.them.dif] : [])];
    return roundLimitMs(round.qm, difs);
  }, [round, state.difs, state.me.dif, state.them]);

  /* Sample the clock while one is on screen. */
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

  const answered = state.myAnswers[state.round] != null;
  const myStreak = streakInto(state, state.myAnswers);
  const theirStreak = streakInto(state, state.theirAnswers);
  const finalRound = isFinalRound(state.round, state.plan.length);

  /* What the clock is costing: the points a right answer would bank right now. */
  const worth = state.phase === 'question' && !answered && limitMs > 0
    ? scoreAnswer(true, elapsed, limitMs, { streak: myStreak, final: finalRound })
    : 0;

  /* ---------------- answering ---------------- */

  const submit = useCallback((value: string | null, correct: boolean, timeout: boolean) => {
    const s = live.current;
    if (s.phase !== 'question' || s.myAnswers[s.round] != null) return;
    const ms = Date.now() - s.startedAt;
    // Graded here for an instant reveal; the server grades again from the
    // same seed and the same rows, and its row replaces this one when it lands.
    const points = scoreAnswer(correct, ms, limitMs || 1, {
      streak: streakBefore(verdictsOf(s.myAnswers), s.round),
      final: isFinalRound(s.round, s.plan.length),
    });
    const answer: RoundAnswer = { correct, ms, points, pick: value, timeout };
    dispatch({ type: 'answer', round: s.round, answer });
    void call({ action: 'answer', round: s.round, pick: value, ms, timeout });
    // One short tick to say the tap landed. Right or wrong waits for the
    // reveal, like everything else about the round. Silent where unsupported.
    if (!timeout) {
      haptic('tap');
      play('lock');
    }
  }, [limitMs, call]);

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
     period, so an opponent who has gone quiet cannot stall the match. */
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

  /* The verdict lands with the reveal: a short buzz and a rising note for
     right, a stutter and a low one for wrong, and a cheer at a streak worth
     one. */
  useEffect(() => {
    if (state.phase !== 'reveal') return;
    const s = live.current;
    const mine = s.myAnswers[s.round];
    if (!mine || mine.timeout) {
      play('miss');
      haptic('miss');
      return;
    }
    if (mine.correct) {
      const run = streakBefore(verdictsOf(s.myAnswers), s.round) + 1;
      const cheer = STREAK_CHEERS.has(run);
      play(cheer ? 'streak' : 'right');
      haptic(cheer ? 'streak' : 'right');
    } else {
      play('wrong');
      haptic('wrong');
    }
  }, [state.phase, state.round]);

  /* The result gets its fanfare once, a beat after the screen lands. */
  const cheered = useRef('');
  useEffect(() => {
    if (state.phase !== 'final' || !state.cfg || cheered.current === state.cfg.seed) return;
    cheered.current = state.cfg.seed;
    const { outcome } = matchResults(state);
    const id = setTimeout(() => { play(outcome); haptic(outcome); }, 350);
    return () => clearTimeout(id);
  }, [state]);

  /* Only the host moves the match on, so the two screens stay in step. The
     server has the last word on whether the round is over, and its clock
     started a beat before this one did, so a refusal is asked again shortly. */
  useEffect(() => {
    if (state.phase !== 'reveal' || !state.isHost) return;
    let cancelled = false;
    let tries = 0;
    const attempt = async () => {
      const s = live.current;
      if (cancelled || s.phase !== 'reveal') return;
      try {
        takeSnapshot(await callVersus({ action: 'advance', code: s.code, playerId: s.me.id }));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 422 && ++tries < ADVANCE_TRIES) {
          setTimeout(() => { void attempt(); }, ADVANCE_RETRY_MS);
        } else {
          dispatch({ type: 'setError', error: err instanceof ApiError ? err.message : OFFLINE });
        }
      }
    };
    const id = setTimeout(() => { void attempt(); }, REVEAL_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [state.phase, state.round, state.isHost, takeSnapshot]);

  /* The countdown hands off to the first question. */
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    const id = setTimeout(
      () => {
        dispatch({ type: 'beginQuestions', at: Date.now() });
        play('go');
      },
      Math.max(0, COUNTDOWN_MS - (Date.now() - state.startedAt)),
    );
    return () => clearTimeout(id);
  }, [state.phase, state.startedAt]);

  /* ---------------- outward actions ---------------- */

  const setName = useCallback((name: string) => {
    saveName(name);
    dispatch({ type: 'setName', name });
  }, []);

  const setDif = useCallback((dif: DiffKey) => {
    dispatch({ type: 'setDif', dif });
    void call({ action: 'player', dif });
  }, [call]);

  const setReady = useCallback((ready: boolean) => {
    // The tap that starts a match is the gesture the phone wants before it
    // will play a sound later.
    unlockAudio();
    dispatch({ type: 'setReady', ready });
    void call({ action: 'player', ready });
  }, [call]);

  const setDraft = useCallback((draft: { mode?: ModeKey; rounds?: number; scope?: Scope }) => {
    dispatch({ type: 'setDraft', draft });
    void call({ action: 'settings', ...draft });
  }, [call]);

  /* The host restarts both sides; a guest's ask registers on the host's screen. */
  const rematch = useCallback(() => {
    unlockAudio();
    void call({ action: 'again' });
  }, [call]);

  /* ---------------- friends ---------------- */

  const addFriend = useCallback(() => {
    const s = live.current;
    const who = s.them ?? (s.lastOpponentId ? { id: s.lastOpponentId, name: s.lastOpponent } : null);
    if (who) setFriends(keepFriend({ id: who.id, name: displayName(who.name, 'Opponent') }));
  }, []);

  const removeFriend = useCallback((id: string) => {
    setFriends(dropFriend(id));
    void callPhone({ action: 'forget', playerId: live.current.me.id, to: id }).catch(() => {
      // The list here is what the player sees; the server link goes when it can.
    });
  }, []);

  /**
   * A rematch request is hosting a room with a friend told about it. It
   * leaves any room this side is still in — a finished match's, usually —
   * since the request opens a fresh one, and a refusal comes back to the
   * menu with the reason rather than leaving an empty waiting room up.
   */
  const requestRematch = useCallback(async (friend: Friend, name = live.current.me.name) => {
    const s = live.current;
    unlockAudio();
    if (s.phase !== 'menu' && s.code) {
      void callVersus({ action: 'leave', code: s.code, playerId: s.me.id }).catch(() => { /* gone anyway */ });
    }
    dropRoom();
    const clean = displayName(name);
    saveName(clean);
    dispatch({ type: 'setName', name: clean });
    dispatch({ type: 'enter', code: '', asHost: true, invite: friend.name });
    let snap: Snapshot;
    try {
      snap = await callVersus({ action: 'rematch', playerId: s.me.id, to: friend.id, name: clean, dif: s.me.dif });
    } catch (err) {
      if (!mounted.current) return;
      clearUrlCode(s.code);
      dispatch({ type: 'leave' });
      dispatch({ type: 'setError', error: err instanceof ApiError ? err.message : OFFLINE });
      return;
    }
    if (!mounted.current) return;
    setUrlCode(snap.room.code);
    try {
      listen(snap.room.code);
      room.current?.seed(snap);
    } catch (err) {
      dispatch({ type: 'setError', error: err instanceof Error ? err.message : String(err) });
    }
    dispatch({ type: 'invited', sent: snap.notified ?? 'undelivered' });
  }, [dropRoom, listen]);

  /* Leaving on purpose is the one thing that gives a seat up: the host's
     leaving closes the room, a guest's hands the host the waiting room. The
     server is told and not waited for; this screen is gone either way. */
  const leave = useCallback(() => {
    const s = live.current;
    if (s.code && s.phase !== 'menu') {
      void callVersus({ action: 'leave', code: s.code, playerId: s.me.id }).catch(() => { /* gone anyway */ });
    }
    dropRoom();
    clearUrlCode(s.code);
    clearSeries();
    setReactions([]);
    dispatch({ type: 'leave' });
  }, [dropRoom]);

  return {
    state,
    ask: inMatch ? ask : null,
    theirAsk: inMatch ? theirAsk : null,
    msLeft,
    limitMs,
    countdownMs,
    myTotal: settledTotal(state, state.myAnswers),
    theirTotal: settledTotal(state, state.theirAnswers),
    myStreak,
    theirStreak,
    worth,
    answered,
    reactions,
    react,
    board,
    clearBoard: () => setBoard([]),
    friends, addFriend, removeFriend,
    requestRematch: (friend, name) => { void requestRematch(friend, name); },
    host, join, setName, setDif, setReady, setDraft,
    answerChoice, answerText, answerMap, rematch, leave,
  };
}
