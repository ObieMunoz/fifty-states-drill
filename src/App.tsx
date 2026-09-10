import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MODES } from './data/modes';
import type { ModeKind } from './types';
import { GameContext } from './game/context';
import { loadProgress, saveProgress } from './game/progress';
import { asksQuestions, initialState, nextQuestion, reducer } from './game/state';
import { ModeBar } from './components/ModeBar';
import { MapStage } from './components/MapStage';
import { Rail } from './components/Rail';
import { Roster } from './components/Roster';
import { CardsPanel } from './components/panels/CardsPanel';
import { ExplorePanel } from './components/panels/ExplorePanel';
import { HooksPanel } from './components/panels/HooksPanel';
import { LettersPanel } from './components/panels/LettersPanel';
import { ProgressPanel } from './components/panels/ProgressPanel';
import { QuizPanel } from './components/panels/QuizPanel';
import { RecallPanel } from './components/panels/RecallPanel';
import { RollPanel } from './components/panels/RollPanel';
import { currentRoute, modeRoute, onRouteChange, writeRoute } from './router';
import type { Route } from './router';
import { applyPendingUpdate } from './pwa';

/* Versus pulls in the realtime client, which solo players never need. It is
   split out so the study modes stay as light as they were. */
const VersusScreen = lazy(() => import('./components/versus/VersusScreen')
  .then((m) => ({ default: m.VersusScreen })));

/** How long a correct answer stays on screen before the next question. */
const ADVANCE_MS = 800;
/** Find It gets slightly longer: the eye has to travel back to the map. */
const ADVANCE_MS_MAP = 850;
/** How long a wrong tap stays red before Find It lets you try again. */
const RETRY_FLASH_MS = 700;

/** Modes whose control card is a reference panel rather than a question. */
const DETAIL_KINDS = new Set<ModeKind>(['explore', 'letters', 'hooks', 'weak']);

export function App() {
  // The URL says where to start: a mode, the Versus menu, or a room by invite.
  const [route0] = useState(currentRoute);
  const [versus, setVersus] = useState(route0.kind === 'versus');
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const s = initialState(loadProgress());
    return route0.kind === 'mode' && route0.mode !== s.mode
      ? reducer(s, { type: 'setMode', mode: route0.mode })
      : s;
  });
  const api = useMemo(() => ({ state, dispatch }), [state]);

  const { mode, qm, ask, locked, scope, dif, progress } = state;
  const kind = MODES[mode].kind;

  /* The address bar follows the app. On load the URL is corrected in place:
     an unknown path becomes home, and an old-style invite fragment becomes
     the room's path. After that every change is a history entry, so back
     walks through the modes visited. Inside a room, useVersus writes the
     code segment; this only has to get the screen onto /versus at all. */
  const booted = useRef(false);
  useLayoutEffect(() => {
    if (!booted.current) {
      booted.current = true;
      writeRoute(currentRoute(), true);
      return;
    }
    if (versus) {
      if (!window.location.pathname.startsWith('/versus')) writeRoute({ kind: 'versus', code: null });
      return;
    }
    writeRoute(modeRoute(mode));
  }, [versus, mode]);

  /* Back and forward. Leaving Versus this way unmounts its screen, which
     tells the room; arriving opens the menu, or the room named in the URL.
     Read through refs so the listener is installed once. */
  const at = useRef({ versus, mode });
  useEffect(() => { at.current = { versus, mode }; }, [versus, mode]);
  useEffect(() => onRouteChange((route: Route) => {
    if (route.kind === 'versus') { setVersus(true); return; }
    if (at.current.versus) { setVersus(false); applyPendingUpdate(); }
    if (route.mode !== at.current.mode) dispatch({ type: 'setMode', mode: route.mode });
  }), []);

  /* Draw the next question whenever one is called for. Kept in an effect
     because it uses randomness, which would make the reducer impure. */
  useLayoutEffect(() => {
    if (ask === null && asksQuestions(mode)) dispatch(nextQuestion(state));
  }, [ask, mode, state]);

  /* A correct answer shows its verdict, then moves on by itself. */
  useEffect(() => {
    if (!locked || !ask?.won) return;
    const id = setTimeout(
      () => dispatch({ type: 'nextQuestion' }),
      qm === 'find' ? ADVANCE_MS_MAP : ADVANCE_MS,
    );
    return () => clearTimeout(id);
  }, [ask, locked, qm]);

  /* Below the try limit, a wrong tap in Find It flashes red and clears. */
  useEffect(() => {
    if (locked || qm !== 'find' || !ask?.hit) return;
    const id = setTimeout(() => dispatch({ type: 'clearHit' }), RETRY_FLASH_MS);
    return () => clearTimeout(id);
  }, [ask, locked, qm]);

  /* The scope can change the flashcard pool out from under the deck. */
  useEffect(() => {
    if (kind === 'cards') dispatch({ type: 'syncDeck' });
  }, [kind, scope, progress]);

  useEffect(() => { saveProgress(progress); }, [progress]);

  useEffect(() => {
    document.body.dataset.nomap = MODES[mode].nomap ? '1' : '';
    document.body.dataset.ref = MODES[mode].reference ? '1' : '';
  }, [mode]);

  useEffect(() => { document.body.dataset.lvl = dif; }, [dif]);

  /* Keyboard shortcuts. Typing in a field always wins. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;

      if (kind === 'cards') {
        if (e.key === ' ') { e.preventDefault(); dispatch({ type: 'cardFlip' }); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); dispatch({ type: 'cardMove', delta: 1 }); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); dispatch({ type: 'cardMove', delta: -1 }); }
        return;
      }

      if (kind === 'choice' && !locked && ask?.choices && /^[1-4]$/.test(e.key)) {
        const abbr = ask.choices[Number(e.key) - 1];
        if (abbr) { e.preventDefault(); dispatch({ type: 'submitChoice', abbr }); }
      } else if (e.key === 'Enter' && locked) {
        e.preventDefault();
        dispatch({ type: 'nextQuestion' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, locked, ask]);

  const resetProgress = useCallback(() => {
    if (!confirm('Reset all progress on all 50 states? This cannot be undone.')) return;
    dispatch({ type: 'resetProgress' });
  }, []);

  return (
    <GameContext.Provider value={api}>
      {versus && (
        <Suspense fallback={<div className="vs-root vs-boot">Loading versus…</div>}>
          <VersusScreen onExit={() => { setVersus(false); applyPendingUpdate(); }} />
        </Suspense>
      )}
      <div className="app">
        <Rail onVersus={() => setVersus(true)} />
        <ModeBar />
        <div className="body">
          <MapStage />
          {/* `side` is the scrolling right-hand column on desktop. On phones it
              is display:contents, so ctrl and roster fall back into the body
              grid and keep their own areas. */}
          <div className="side">
            <section className={`ctrl${DETAIL_KINDS.has(kind) ? ' detail' : ''}`}>
              <Panel onReset={resetProgress} kind={kind} />
            </section>
            {/* Reference modes hand the whole column to their panel. */}
            {!MODES[mode].reference && (
              <section className="rosterwrap">
                <Roster />
              </section>
            )}
          </div>
        </div>
      </div>
    </GameContext.Provider>
  );
}

function Panel({ kind, onReset }: { kind: ModeKind; onReset: () => void }) {
  switch (kind) {
    case 'explore': return <ExplorePanel />;
    case 'letters': return <LettersPanel />;
    case 'cards':   return <CardsPanel />;
    case 'hooks':   return <HooksPanel />;
    case 'weak':    return <ProgressPanel onReset={onReset} />;
    case 'recall':  return <RecallPanel />;
    case 'roll':    return <RollPanel />;
    default:        return <QuizPanel />;
  }
}
