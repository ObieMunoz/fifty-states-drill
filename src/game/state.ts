import { BY, ST } from '../data/states';
import { DIFFS, MODES, TRACKS, isTrack } from '../data/modes';
import { HOOKS } from '../data/hooks';
import { fitBox, fullBox } from '../lib/geo';
import type {
  Abbr, Ask, Box, DiffKey, ModeKey, Progress, Recall, Roll, Run, Scope, State,
} from '../types';
import {
  emptyProgress, flagForReview, recordAnswer, setBest, setStoredDiff,
} from './progress';
import { bestKey, poolFor } from './scope';
import { buildAsk, expectedText, pickState, questionType } from './question';
import { elapsed, startRecall } from './recall';
import { lettersGroup, nextLetter } from './roll';
import { near, norm } from '../lib/text';

/**
 * Whether the next question should reset the map to the whole scope.
 *
 * `scope` comes from entering a quiz mode, or from leaving a silhouette
 * question — both cases where the map is framed on one state and needs to open
 * back out, *unless* the new question is itself a silhouette. `force` comes
 * from changing the region, which reframes the map whatever the question is.
 */
type Refit = 'none' | 'scope' | 'force';

export interface GameState {
  progress: Progress;
  dif: DiffKey;
  /** The tab the player picked. */
  mode: ModeKey;
  /** The question type actually on screen; differs from `mode` only in Mixed. */
  qm: ModeKey;
  scope: Scope;
  ask: Ask | null;
  /** The answer is in and the verdict is showing. */
  locked: boolean;
  tries: number;
  /** Selected state abbreviation, or `h<group>-<item>` for a memory hook. */
  sel: string | null;
  letter: string;
  /** Postal-code labels on the map. */
  labels: boolean;
  run: Run;
  /** Recently asked states, suppressed so the drill does not cycle. */
  recent: Abbr[];
  recall: Recall | null;
  roll: Roll | null;
  deck: State[];
  card: number;
  cardBack: boolean;
  hookSet: Set<Abbr> | null;
  refit: Refit;
  /** Desired map viewport. A new object value starts the zoom animation. */
  zoom: Box;
}

const freshRun = (): Run => ({ right: 0, asked: 0, streak: 0, best: 0 });

/** The viewport that frames the current scope: the whole map, or just its states. */
export const scopeBox = (scope: Scope, p: Progress): Box =>
  scope === 'all' ? fullBox() : fitBox(poolFor(scope, p));

/** Quiz modes that ask one question at a time, as opposed to Roll Call and All 50. */
export const asksQuestions = (mode: ModeKey): boolean => {
  const m = MODES[mode];
  return m.g === 'quiz' && m.kind !== 'roll' && m.kind !== 'recall';
};

export function initialState(progress: Progress): GameState {
  const dif: DiffKey = progress.dif && DIFFS[progress.dif] ? progress.dif : 'standard';
  return {
    progress, dif,
    mode: 'map', qm: 'map', scope: 'all',
    ask: null, locked: false, tries: 0,
    sel: null, letter: 'M', labels: true,
    run: freshRun(), recent: [],
    recall: null, roll: null,
    deck: [], card: 0, cardBack: false,
    hookSet: null,
    refit: 'none',
    zoom: fullBox(),
  };
}

/**
 * Clear the current question and ask for a new one. The question itself is
 * built outside the reducer — see `nextQuestion` — so that the reducer stays
 * pure and the random draw happens exactly once.
 */
function requestQuestion(s: GameState): GameState {
  return {
    ...s,
    ask: null, locked: false, tries: 0, sel: null,
    refit: s.refit !== 'none' ? s.refit : (s.qm === 'shape' && s.ask ? 'scope' : 'none'),
  };
}

/** Cards run through the in-scope states in map order; only Shuffle reorders them. */
function buildDeck(s: GameState, keepPos: boolean): GameState {
  const prev = s.deck[s.card];
  const deck = poolFor(s.scope, s.progress);
  if (!keepPos) return { ...s, deck, card: 0, cardBack: false };
  const i = prev ? deck.findIndex((x) => x.a === prev.a) : -1;
  return { ...s, deck, card: i < 0 ? 0 : i };
}

export type Action =
  | { type: 'setMode'; mode: ModeKey }
  | { type: 'setScope'; scope: Scope }
  | { type: 'setDiff'; dif: DiffKey }
  | { type: 'setQuestion'; qm: ModeKey; ask: Ask; zoom: Box; scope: Scope }
  | { type: 'nextQuestion' }
  | { type: 'tapState'; abbr: Abbr }
  | { type: 'clearHit' }
  | { type: 'submitChoice'; abbr: Abbr }
  | { type: 'submitText'; text: string }
  | { type: 'reveal' }
  | { type: 'selectState'; abbr: Abbr }
  | { type: 'clearSelection' }
  | { type: 'setLetter'; letter: string }
  | { type: 'toggleLabels' }
  | { type: 'fitScope' }
  | { type: 'zoomTo'; box: Box }
  | { type: 'selectHook'; group: number; item: number }
  | { type: 'resetProgress' }
  | { type: 'drillWeak' }
  | { type: 'recallRestart' }
  | { type: 'recallAccept'; abbr: Abbr; now: number }
  | { type: 'recallMiss'; text: string }
  | { type: 'recallClearMessage' }
  | { type: 'recallGiveUp'; now: number }
  | { type: 'rollAccept'; abbr: Abbr }
  | { type: 'rollMiss' }
  | { type: 'rollClearMessage' }
  | { type: 'rollSetLetter'; letter: string }
  | { type: 'rollReveal' }
  | { type: 'cardFlip' }
  | { type: 'cardMove'; delta: number }
  | { type: 'cardSetDeck'; deck: State[] }
  | { type: 'cardFlag' }
  | { type: 'syncDeck' };

export function reducer(s: GameState, action: Action): GameState {
  switch (action.type) {
    /* ---------------- chrome ---------------- */

    case 'setMode': {
      const m = MODES[action.mode];
      const learn = m.g === 'learn';
      const base: GameState = {
        ...s,
        mode: action.mode, qm: action.mode,
        sel: null, ask: null, locked: false, tries: 0, recent: [],
        run: freshRun(),
        hookSet: null, roll: null, recall: null, cardBack: false,
        labels: learn && !m.nomap,
        letter: action.mode === 'letter' ? 'M' : s.letter,
        refit: 'none',
      };
      if (m.kind === 'recall') {
        return { ...base, recall: startRecall(s.scope, s.progress), zoom: scopeBox(s.scope, s.progress) };
      }
      if (m.kind === 'roll') {
        const roll: Roll = { letter: 'A', got: new Set(), shown: new Set(), msg: '' };
        roll.letter = nextLetter(roll, s.scope, s.progress);
        return { ...base, roll, zoom: scopeBox(s.scope, s.progress) };
      }
      if (m.kind === 'cards') {
        return buildDeck({ ...base, zoom: scopeBox(s.scope, s.progress) }, false);
      }
      // Quiz modes leave the framing to the question that is about to be built.
      if (!learn) return { ...base, refit: 'scope' };
      return { ...base, zoom: scopeBox(s.scope, s.progress) };
    }

    case 'setScope': {
      const next: GameState = {
        ...s, scope: action.scope, sel: null, recent: [],
        zoom: scopeBox(action.scope, s.progress),
      };
      if (MODES[s.mode].kind === 'recall') {
        return { ...next, recall: startRecall(action.scope, s.progress) };
      }
      if (MODES[s.mode].kind === 'roll' && s.roll) {
        const roll: Roll = { ...s.roll };
        roll.letter = nextLetter(roll, action.scope, s.progress);
        return { ...next, roll };
      }
      if (MODES[s.mode].kind === 'cards') return buildDeck(next, true);
      // A region change reframes the map whatever the next question is.
      if (asksQuestions(s.mode)) return requestQuestion({ ...next, refit: 'force' });
      return next;
    }

    case 'setDiff': {
      if (!DIFFS[action.dif] || action.dif === s.dif) return s;
      const next: GameState = {
        ...s, dif: action.dif, progress: setStoredDiff(s.progress, action.dif),
        locked: false, tries: 0, recent: [], run: freshRun(),
      };
      if (MODES[s.mode].kind === 'recall') {
        return { ...next, recall: startRecall(s.scope, s.progress) };
      }
      if (asksQuestions(s.mode)) return requestQuestion(next);
      return next;
    }

    case 'setQuestion':
      // A freshly drawn question is unanswered, whatever came before it.
      return {
        ...s,
        qm: action.qm, ask: action.ask, scope: action.scope,
        zoom: action.zoom, refit: 'none',
        locked: false, tries: 0, sel: null,
        recent: [...s.recent, action.ask.s.a].slice(-12),
      };

    case 'nextQuestion':
      return requestQuestion(s);

    /* ---------------- answering ---------------- */

    case 'tapState': {
      // In the study modes a tap just selects; only Find It scores it.
      if (s.mode === 'map' || s.mode === 'letter') {
        return {
          ...s, sel: action.abbr,
          letter: s.mode === 'letter' ? BY[action.abbr].n[0] : s.letter,
        };
      }
      if (s.qm !== 'find' || s.locked || !s.ask) return s;
      const tries = s.tries + 1;
      if (action.abbr === s.ask.answer) {
        return {
          ...s, tries, locked: true,
          ask: { ...s.ask, won: true },
          ...score(s, 'find', true),
        };
      }
      if (tries >= DIFFS[s.dif].tries) {
        return {
          ...s, tries, locked: true,
          ask: { ...s.ask, hit: action.abbr },
          ...score(s, 'find', false),
        };
      }
      // Below the try limit the wrong state flashes red and clears itself.
      return { ...s, tries, ask: { ...s.ask, hit: action.abbr } };
    }

    case 'clearHit':
      if (s.locked || !s.ask) return s;
      return { ...s, ask: { ...s.ask, hit: null } };

    case 'submitChoice': {
      if (s.locked || !s.ask) return s;
      const won = action.abbr === s.ask.answer;
      return {
        ...s, locked: true,
        ask: { ...s.ask, hit: action.abbr, won },
        ...score(s, s.qm, won),
      };
    }

    case 'submitText': {
      if (s.locked || !s.ask) return s;
      const v = action.text.trim();
      if (!v) return s;
      const expect = expectedText(s.ask, s.qm);
      // Postal codes are two letters, where a one-edit slip is a different
      // code entirely; everything else gets the forgiving comparison.
      const exactOnly = s.qm === 'code' && !s.ask.rev;
      const won = exactOnly ? norm(v) === norm(expect) : near(v, expect);
      return {
        ...s, locked: true,
        ask: { ...s.ask, won, typed: v },
        ...score(s, s.qm, won),
      };
    }

    case 'reveal':
      if (s.locked || !s.ask) return s;
      return {
        ...s, locked: true,
        ask: { ...s.ask, won: false, gave: true },
        ...score(s, s.qm, false),
      };

    /* ---------------- study modes ---------------- */

    case 'selectState':
      return {
        ...s, sel: action.abbr,
        letter: s.mode === 'letter' ? BY[action.abbr].n[0] : s.letter,
      };

    case 'clearSelection':
      return { ...s, sel: null };

    case 'setLetter':
      return {
        ...s, letter: action.letter, sel: null,
        zoom: fitBox(ST.filter((x) => x.n[0] === action.letter)),
      };

    case 'toggleLabels':
      return { ...s, labels: !s.labels };

    case 'fitScope':
      return { ...s, sel: null, zoom: scopeBox(s.scope, s.progress) };

    case 'zoomTo':
      return { ...s, zoom: action.box };

    case 'selectHook': {
      const id = `h${action.group}-${action.item}`;
      /* Tapping the open hook closes it. The card and the states it lights are
         the same selection, so folding the text away clears the map too. */
      if (s.sel === id) {
        return { ...s, sel: null, hookSet: null, zoom: scopeBox(s.scope, s.progress) };
      }
      const h = HOOKS[action.group].items[action.item];
      return {
        ...s,
        sel: id,
        hookSet: new Set(h.s),
        zoom: fitBox(h.s.map((a) => BY[a])),
      };
    }

    case 'resetProgress': {
      const progress = { ...emptyProgress(), dif: s.progress.dif };
      return { ...s, progress, run: freshRun(), recent: [] };
    }

    case 'drillWeak':
      return reducer(
        { ...s, scope: 'weak', zoom: scopeBox('weak', s.progress) },
        { type: 'setMode', mode: 'mixed' },
      );

    /* ---------------- Name All 50 ---------------- */

    case 'recallRestart':
      return { ...s, recall: startRecall(s.scope, s.progress) };

    case 'recallAccept': {
      if (!s.recall) return s;
      const got = new Set(s.recall.got).add(action.abbr);
      const recall: Recall = { ...s.recall, got, last: action.abbr, msg: '' };
      if (got.size < recall.total) return { ...s, recall };

      recall.done = true;
      recall.stopAt = action.now;
      const key = bestKey(s.scope);
      const prev = s.progress.best[key];
      const time = elapsed(recall, action.now);
      if (prev != null && time >= prev) return { ...s, recall };
      recall.record = true;
      return { ...s, recall, progress: setBest(s.progress, key, time) };
    }

    case 'recallMiss':
      if (!s.recall) return s;
      return { ...s, recall: { ...s.recall, msg: `No match for “${action.text}”.` } };

    case 'recallClearMessage':
      if (!s.recall || !s.recall.msg) return s;
      return { ...s, recall: { ...s.recall, msg: '' } };

    case 'recallGiveUp':
      if (!s.recall) return s;
      return { ...s, recall: { ...s.recall, done: true, stopAt: action.now } };

    /* ---------------- Roll Call ---------------- */

    case 'rollAccept': {
      if (!s.roll) return s;
      const hit = BY[action.abbr];
      if (hit.n[0] !== s.roll.letter) {
        return { ...s, roll: { ...s.roll, msg: `${hit.n} starts with ${hit.n[0]}, not ${s.roll.letter}.` } };
      }
      if (s.roll.got.has(hit.a)) {
        return { ...s, roll: { ...s.roll, msg: `${hit.n} is already up there.` } };
      }
      const roll: Roll = { ...s.roll, got: new Set(s.roll.got).add(hit.a), msg: '' };
      // Finishing a letter moves the player straight on to the next one.
      if (lettersGroup(roll.letter, s.scope, s.progress).every((x) => roll.got.has(x.a))) {
        roll.letter = nextLetter(roll, s.scope, s.progress);
      }
      return { ...s, roll };
    }

    case 'rollMiss':
      if (!s.roll) return s;
      return { ...s, roll: { ...s.roll, msg: 'Not a state name.' } };

    case 'rollClearMessage':
      if (!s.roll || !s.roll.msg) return s;
      return { ...s, roll: { ...s.roll, msg: '' } };

    case 'rollSetLetter':
      if (!s.roll) return s;
      return { ...s, roll: { ...s.roll, letter: action.letter, msg: '' } };

    case 'rollReveal': {
      if (!s.roll) return s;
      if (s.roll.shown.has(s.roll.letter)) {
        const roll: Roll = { ...s.roll, msg: '' };
        roll.letter = nextLetter(roll, s.scope, s.progress);
        return { ...s, roll };
      }
      return { ...s, roll: { ...s.roll, shown: new Set(s.roll.shown).add(s.roll.letter) } };
    }

    /* ---------------- flashcards ---------------- */

    case 'cardFlip':
      return { ...s, cardBack: !s.cardBack };

    case 'cardMove': {
      if (!s.deck.length) return s;
      const card = (s.card + action.delta + s.deck.length) % s.deck.length;
      return { ...s, card, cardBack: false };
    }

    case 'cardSetDeck':
      return { ...s, deck: action.deck, card: 0, cardBack: false };

    case 'cardFlag': {
      const cur = s.deck[s.card];
      if (!cur) return s;
      return {
        ...s,
        progress: flagForReview(s.progress, cur.a),
        card: (s.card + 1) % s.deck.length,
        cardBack: false,
      };
    }

    case 'syncDeck': {
      // The scope can change the pool out from under the deck; keep the card
      // the player is looking at wherever it lands in the new order.
      const want = poolFor(s.scope, s.progress);
      const inPool = new Set(want.map((x) => x.a));
      // Membership, not order: Shuffle reorders the deck and must survive this.
      if (s.deck.length === want.length && s.deck.every((d) => inPool.has(d.a))) return s;
      return buildDeck(s, true);
    }
  }
}

/**
 * The state changes that follow grading one answer: the stored mastery record
 * and the session tallies in the rail.
 */
function score(s: GameState, track: ModeKey, won: boolean): Pick<GameState, 'progress' | 'run'> {
  if (!s.ask || !isTrack(track)) return { progress: s.progress, run: s.run };
  const streak = won ? s.run.streak + 1 : 0;
  return {
    progress: recordAnswer(s.progress, s.ask.s.a, track, won, DIFFS[s.dif].cap),
    run: {
      right: s.run.right + (won ? 1 : 0),
      asked: s.run.asked + 1,
      streak,
      best: Math.max(s.run.best, streak),
    },
  };
}

/**
 * Draw the next question. Kept out of the reducer because it uses randomness:
 * the reducer stays pure and the draw happens exactly once per question.
 */
export function nextQuestion(s: GameState): Extract<Action, { type: 'setQuestion' }> {
  const d = DIFFS[s.dif];

  // A scope can empty out — "weak spots only" once nothing is weak any more.
  let scope = s.scope;
  let pool = poolFor(scope, s.progress);
  if (!pool.length) { scope = 'all'; pool = ST; }

  const qm = questionType(s.mode);
  const track = (isTrack(qm) ? qm : TRACKS[0]);
  // Borders needs a state that actually has one.
  const candidates = pool.filter((x) => qm !== 'border' || x.nb.length > 0);
  const state = pickState(candidates.length ? candidates : pool, s.progress, track, s.recent);
  const ask = buildAsk(state, qm, d);

  const framed = scopeBox(scope, s.progress);
  const zoom =
    s.refit === 'force' ? framed
      : qm === 'shape' ? fitBox([state], 0.06)
        : s.refit === 'scope' ? framed
          : s.zoom;

  return { type: 'setQuestion', qm, ask, zoom, scope };
}
