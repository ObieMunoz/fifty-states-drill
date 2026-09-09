import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BY } from '../../data/states';
import { DIFFS, MODES } from '../../data/modes';
import { useGame } from '../../game/context';
import { choiceLabel } from '../../game/question';
import { scopeLabel } from '../../game/scope';
import type { Ask, ModeKey } from '../../types';

/** Longer prompts drop to the smaller display size so they still fit two lines. */
const LONG_HEAD = 22;

export function QuizPanel() {
  const { state, dispatch } = useGame();
  const { ask, qm, mode, locked, tries, run, dif, scope, progress } = state;
  const d = DIFFS[dif];

  // Typed text belongs to one question. Tying it to the `ask` object clears the
  // box the instant a new question arrives, with no flash of the last answer.
  const [entry, setEntry] = useState<{ for: Ask | null; text: string }>({ for: null, text: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!locked) inputRef.current?.focus({ preventScroll: true });
  }, [ask, locked]);

  if (!ask) return null;

  const text = entry.for === ask ? entry.text : '';
  const setText = (t: string) => setEntry({ for: ask, text: t });
  const submit = (v: string) => dispatch({ type: 'submitText', text: v });

  const { head, body, headCls } = prompt(ask, qm, tries, locked, d.tries, {
    regionHint: d.regionHint, showTarget: d.showTarget, forceChoice: d.forceChoice,
    typeNames: d.typeNames,
  });

  /** Postal codes are entered as two characters, uppercase and centred. */
  const twoLetter = qm === 'code' && !ask.rev;
  const placeholder = twoLetter ? 'XX' : qm === 'capital' ? 'Capital city' : 'State name';

  const modeLabel = MODES[qm].label;
  const hint = run.asked
    ? `${Math.round(run.right / run.asked * 100)}% this session`
    : qm === 'find' ? 'Tap the map'
      : ask.choices ? 'Keys 1–4'
        : 'Enter to submit';

  return (
    <>
      <div className="eyebrow">
        Quiz · {mode === 'mixed' ? `Mixed → ${modeLabel}` : modeLabel} · {d.label} · {scopeLabel(scope, progress)}
      </div>
      <h2 className={`ask${head.length > LONG_HEAD ? ' sm' : ''}${headCls}`}>{head}</h2>
      {body}

      {ask.choices ? (
        <div className="choices">
          {ask.choices.map((a, i) => (
            <button
              key={a}
              type="button"
              data-a={a}
              disabled={locked}
              className={
                locked && a === ask.answer ? 'pick-ok'
                  : locked && a === ask.hit ? 'pick-bad'
                    : ''
              }
              onClick={() => dispatch({ type: 'submitChoice', abbr: a })}
            >
              <kbd>{i + 1}</kbd>{choiceLabel(ask, a)}
            </button>
          ))}
        </div>
      ) : qm !== 'find' ? (
        <div className="entry">
          <input
            ref={inputRef}
            maxLength={twoLetter ? 2 : undefined}
            className={twoLetter ? 'up' : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize={twoLetter ? 'characters' : 'words'}
            spellCheck={false}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={locked}
            value={locked ? (ask.typed ?? '') : text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v);
              // A two-letter code is complete the moment it is typed.
              if (twoLetter && v.trim().length === 2) submit(v);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (locked) dispatch({ type: 'nextQuestion' });
              else submit(text);
            }}
          />
          <button
            className="btn"
            type="button"
            onClick={() => (locked ? dispatch({ type: 'nextQuestion' }) : submit(text))}
          >
            {locked ? 'Next' : 'Check'}
          </button>
        </div>
      ) : null}

      {locked && <Verdict ask={ask} qm={qm} />}

      <div className="row spread">
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch(locked ? { type: 'nextQuestion' } : { type: 'reveal' })}
        >
          {locked ? 'Next question →' : 'Show me'}
        </button>
        <span className="eyebrow">{hint}</span>
      </div>
    </>
  );
}

type PromptFlags = Pick<
  (typeof DIFFS)['standard'], 'regionHint' | 'showTarget' | 'forceChoice' | 'typeNames'
>;

/** The question itself: a headline, and a line of subtext explaining the rules. */
function prompt(
  ask: Ask, qm: ModeKey, tries: number, locked: boolean, maxTries: number, d: PromptFlags,
): { head: string; body: ReactNode; headCls: string } {
  const s = ask.s;
  const sub = (children: ReactNode) => <div className="sub">{children}</div>;

  switch (qm) {
    case 'find': {
      const left = maxTries - tries;
      return {
        head: s.n, headCls: '',
        body: sub(<>
          {`Tap it on the map${!locked && tries > 0
            ? ` — not quite, ${left} ${left === 1 ? 'try' : 'tries'} left`
            : ''}.`}
          {d.regionHint && !locked && <> Only <b>{s.div}</b> is lit.</>}
        </>),
      };
    }
    case 'name':
      return {
        head: 'Which state is this?', headCls: '',
        body: sub(d.typeNames ? 'Type its name — no options.' : 'The highlighted one.'),
      };
    case 'shape':
      return {
        head: 'Which state is this?', headCls: '',
        body: sub('Shape only — no map, no neighbours.'),
      };
    case 'border':
      return {
        head: `Which one borders ${s.n}?`, headCls: '',
        body: sub(d.showTarget ? `${s.n} is highlighted.` : 'No anchor on the map.'),
      };
    case 'capital':
      return {
        head: s.n, headCls: '',
        body: sub((d.forceChoice ? 'Pick the capital.' : 'Name the capital.')
          + (d.showTarget ? '' : ' The map will not help.')),
      };
    case 'code':
      return ask.rev
        ? {
          head: s.a, headCls: ' code',
          body: sub('Which state uses this postal code?'),
        }
        : {
          head: s.n, headCls: '',
          body: sub(d.forceChoice ? 'Pick the postal code.' : 'Two-letter postal code.'),
        };
    default:
      return { head: s.n, headCls: '', body: null };
  }
}

/** The answer, plus the facts worth carrying away from the question. */
function Verdict({ ask, qm }: { ask: Ask; qm: ModeKey }) {
  const s = ask.s;
  const good = ask.won;
  let msg: ReactNode;

  if (good) {
    msg = <b>Correct.</b>;
  } else if (qm === 'find') {
    msg = <>
      <b>That's {s.n}</b> — shown in green.
      {ask.hit && ask.hit !== s.a && (
        <span className="note">You tapped {BY[ask.hit].n}, marked red.</span>
      )}
    </>;
  } else if (qm === 'capital') {
    msg = <><b>{s.cap}</b> is the capital of {s.n}.</>;
  } else if (qm === 'code') {
    msg = ask.rev
      ? <><b>{s.n}</b> uses {s.a}.</>
      : <><b>{s.a}</b> — {s.n}.</>;
  } else if (qm === 'border') {
    msg = <>
      <b>{ask.answer ? BY[ask.answer].n : ''}</b> borders {s.n}.
      <span className="note">{s.n} touches {s.nb.length}: {s.nb.join(' · ')}</span>
    </>;
  } else {
    msg = <><b>{s.n}</b> — {s.cap} · {s.nick}.</>;
  }

  // Name It and Silhouette already show the state, so the recap would be noise.
  const recap = good && qm !== 'name' && qm !== 'shape';

  return (
    <div className={`verdict ${good ? 'ok' : 'bad'}`}>
      {msg}
      {recap && <span className="note">{s.n} · {s.a} · {s.cap} · {s.div}</span>}
    </div>
  );
}
