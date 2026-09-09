import { useEffect, useRef } from 'react';
import { useGame } from '../../game/context';
import { findState, letterDone, lettersGroup, rollLetters } from '../../game/roll';
import { poolFor, scopeLabel } from '../../game/scope';

/**
 * Roll Call — names only, no map.
 *
 * Like Name All 50, the input is uncontrolled so that accepting an answer never
 * disturbs what is being typed.
 */
export function RollPanel() {
  const { state, dispatch } = useGame();
  const { roll, scope, progress } = state;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [roll?.letter]);

  if (!roll) return null;

  const L = roll.letter;
  const group = lettersGroup(L, scope, progress);
  const revealed = roll.shown.has(L);
  const letters = rollLetters(scope, progress);
  const allDone = letters.every((x) => letterDone(roll, x, scope, progress));

  const attempt = (fuzzy: boolean) => {
    const el = inputRef.current;
    if (!el) return;
    // Search the whole in-scope pool, not just this letter, so answering under
    // the wrong heading gets a correction rather than silence.
    const hit = findState(el.value, scope, progress, fuzzy);
    if (hit) {
      el.value = '';
      dispatch({ type: 'rollAccept', abbr: hit.a });
      return;
    }
    // Typing clears a stale message; Enter replaces it, but only if there is
    // something to judge. An empty box on Enter must leave the message alone —
    // it is usually the one just raised by the keystroke that emptied the box.
    if (!fuzzy) dispatch({ type: 'rollClearMessage' });
    else if (el.value.trim()) dispatch({ type: 'rollMiss' });
  };

  return (
    <>
      <div className="eyebrow">Quiz · Roll Call · names only · {scopeLabel(scope, progress)}</div>
      <h2 className="ask">{group.length} start with <span className="rl">{L}</span></h2>

      <div className="sub">
        {roll.msg
          ? <span style={{ color: 'var(--wrong)' }}>{roll.msg}</span>
          : revealed ? 'Revealed. Move on when you are ready.'
            : allDone ? 'Every group done. Start over to go again.'
              : 'Type them in any order. No map, no options — just the names.'}
      </div>

      <div className="slots">
        {group.map((s) => (
          roll.got.has(s.a)
            ? <span key={s.a} className="slot got">{s.n}</span>
            : revealed
              ? <span key={s.a} className="slot miss">{s.n}</span>
              : <span key={s.a} className="slot">{'·'.repeat(Math.min(12, s.n.length))}</span>
        ))}
      </div>

      {!revealed && !allDone && (
        <div className="entry">
          <input
            ref={inputRef}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            placeholder={`A state starting with ${L}…`}
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

      <div className="letters" role="group" aria-label="Letter">
        {letters.map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={x === L}
            className={letterDone(roll, x, scope, progress) ? 'done' : ''}
            onClick={() => dispatch({ type: 'rollSetLetter', letter: x })}
          >
            <i>{x}</i><u>{lettersGroup(x, scope, progress).length}</u>
          </button>
        ))}
      </div>

      <div className="row spread">
        <button className="btn ghost sm" type="button" onClick={() => dispatch({ type: 'rollReveal' })}>
          {revealed ? 'Next letter →' : 'Reveal this group'}
        </button>
        <span className="eyebrow">
          {roll.got.size} of {poolFor(scope, progress).length} named
        </span>
      </div>
    </>
  );
}
