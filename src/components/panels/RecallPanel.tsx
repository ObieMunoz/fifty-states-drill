import { useEffect, useRef } from 'react';
import { BY } from '../../data/states';
import { DIFFS } from '../../data/modes';
import { useGame } from '../../game/context';
import { elapsed, findRecallHit } from '../../game/recall';
import { bestKey, scopeLabel } from '../../game/scope';
import { fmtTime } from '../../lib/text';

/**
 * Name All 50.
 *
 * The input is deliberately uncontrolled. Accepting a state must never replace
 * the input element or rewrite its value mid-word — that drops keystrokes from
 * a fast typist — so React is kept away from it and it is cleared by hand only
 * when an answer actually lands.
 */
export function RecallPanel() {
  const { state, dispatch } = useGame();
  const { recall, scope, progress, dif } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [recall?.done]);

  if (!recall) return null;

  const n = recall.got.size;
  const pct = Math.round(n / recall.total * 100);
  const best = progress.best[bestKey(scope)];

  const attempt = (fuzzy: boolean) => {
    const el = inputRef.current;
    if (!el) return;
    const hit = findRecallHit(el.value, scope, progress, recall.got, fuzzy);
    if (hit) {
      el.value = '';
      dispatch({ type: 'recallAccept', abbr: hit.a, now: Date.now() });
      return;
    }
    // As in Roll Call: typing clears the message, Enter only replaces it when
    // there is text left to reject.
    const typed = el.value.trim();
    if (!fuzzy) dispatch({ type: 'recallClearMessage' });
    else if (typed) dispatch({ type: 'recallMiss', text: typed });
  };

  return (
    <>
      <div className="eyebrow">
        Quiz · Name All 50 · {DIFFS[dif].label} · {scopeLabel(scope, progress)}
      </div>

      <h2 className={`ask${recall.done ? ' sm' : ''}`}>
        {recall.done && n === recall.total
          ? `All ${recall.total} in ${fmtTime(elapsed(recall, recall.stopAt))}`
          : recall.done
            ? `${n} of ${recall.total} — the rest are in red`
            : <>{n} <span style={{ color: 'var(--ink-3)' }}>/ {recall.total}</span></>}
      </h2>

      <div className="sub">
        {recall.done
          ? (n === recall.total
            ? `${recall.record ? 'A new best time.' : 'Finished.'} Start over to beat it.`
            : 'Every state you missed is marked on the map and listed below.')
          : recall.msg
            ? <span style={{ color: 'var(--wrong)' }}>{recall.msg}</span>
            : recall.last
              ? <>Locked in <b>{BY[recall.last].n}</b> · {recall.total - n} to go</>
              : 'Type any state name — it locks in only once the word is complete. Press Enter if you fumbled the spelling.'}
      </div>

      {!recall.done && (
        <div className="entry">
          <input
            ref={inputRef}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Type a state…"
            aria-label="State name"
            onInput={() => attempt(false)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              attempt(true);
            }}
          />
        </div>
      )}

      <div className="bars"><i style={{ width: `${pct}%`, background: 'var(--m3)' }} /></div>

      <div className="row spread">
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch(recall.done
            ? { type: 'recallRestart' }
            : { type: 'recallGiveUp', now: Date.now() })}
        >
          {recall.done ? 'Start over' : 'Give up & reveal'}
        </button>
        <span className="eyebrow">{best ? `Best ${fmtTime(best)}` : 'No best time yet'}</span>
      </div>
    </>
  );
}
