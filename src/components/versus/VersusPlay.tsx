import { useEffect, useMemo, useRef, useState } from 'react';
import { BY } from '../../data/states';
import { DIFFS, MODES } from '../../data/modes';
import { choiceLabel } from '../../game/question';
import { fitBox, fullBox } from '../../lib/geo';
import { currentRound } from '../../versus/machine';
import { isTyped } from '../../versus/scoring';
import { VersusMap } from './VersusMap';
import type { VersusApi } from '../../versus/useVersus';
import type { Abbr, Ask, DiffKey, ModeKey } from '../../types';
import type { RoundAnswer } from '../../versus/types';

/** Longer prompts drop a size so they still fit two lines on a phone. */
const LONG_HEAD = 20;

/**
 * The match itself: a scoreline that never moves, the question, and answers
 * big enough to hit with a thumb without looking.
 */
export function VersusPlay({ api }: { api: VersusApi }) {
  const { state, ask, msLeft, limitMs, answered } = api;
  const round = currentRound(state);
  const revealing = state.phase === 'reveal';

  if (!round || !ask) return null;

  const mine = state.myAnswers[state.round];
  const theirs = state.theirAnswers[state.round];
  const frac = limitMs > 0 && msLeft !== null ? msLeft / limitMs : 1;

  return (
    <div className="vs-sheet vs-play">
      <ScoreBar api={api} />

      <div className="vs-clock" aria-hidden="true">
        <i style={{ transform: `scaleX(${frac})` }} className={frac < 0.25 ? 'low' : undefined} />
      </div>

      <div className="vs-round-line">
        <span className="eyebrow">
          Round {state.round + 1} of {state.plan.length} · {MODES[round.qm].label}
        </span>
        {msLeft !== null && (
          <span className={`vs-secs mono${frac < 0.25 ? ' low' : ''}`}>
            {Math.ceil(msLeft / 1000)}s
          </span>
        )}
      </div>

      <Question
        key={state.round}
        api={api}
        ask={ask}
        qm={round.qm}
        revealing={revealing}
        answered={answered}
        mine={mine}
        theirs={theirs}
      />
    </div>
  );
}

/** The two running totals, always in the same place so a glance is enough. */
function ScoreBar({ api }: { api: VersusApi }) {
  const { state, myTotal, theirTotal } = api;
  const lead = myTotal === theirTotal ? 'tie' : myTotal > theirTotal ? 'me' : 'them';
  const done = state.myAnswers[state.round] != null;
  const theyDone = state.theirAnswers[state.round] != null;

  return (
    <div className="vs-scores" data-lead={lead}>
      <div className="vs-score me">
        <span className="vs-score-name">{state.me.name}</span>
        <b className="mono">{myTotal}</b>
        <i className={done ? 'in' : undefined} aria-label={done ? 'Answered' : 'Thinking'} />
      </div>
      <div className="vs-score them">
        <span className="vs-score-name">{state.them?.name || state.lastOpponent || 'Opponent'}</span>
        <b className="mono">{theirTotal}</b>
        <i className={theyDone ? 'in' : undefined} aria-label={theyDone ? 'Answered' : 'Thinking'} />
      </div>
    </div>
  );
}

interface QuestionProps {
  api: VersusApi;
  ask: Ask;
  qm: ModeKey;
  revealing: boolean;
  answered: boolean;
  mine: RoundAnswer | null;
  theirs: RoundAnswer | null;
}

function Question({ api, ask, qm, revealing, answered, mine, theirs }: QuestionProps) {
  const { state } = api;
  const s = ask.s;
  const typed = isTyped(qm, state.me.dif);
  // Remounted per round (see the key at the call site), so the box starts
  // empty with no flash of the previous answer and nothing to reset.
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typed && !answered && !revealing) inputRef.current?.focus({ preventScroll: true });
  }, [typed, answered, revealing]);

  const zoom = useMemo(() => {
    if (qm === 'shape') return fitBox([s], 0.06);
    if (qm === 'find' && DIFFS[state.me.dif].regionHint && !revealing) {
      return fitBox(BY[s.a].nr.map((a) => BY[a]).concat(s), 0.12);
    }
    return fullBox();
  }, [qm, s, state.me.dif, revealing]);

  const showsMap = qm === 'find' || qm === 'shape'
    || ((qm === 'name' || qm === 'border' || qm === 'capital' || qm === 'code')
      && DIFFS[state.me.dif].showTarget && ask.show !== null);

  const head = prompt(ask, qm);
  const twoLetter = qm === 'code' && !ask.rev;

  return (
    <>
      <h2 className={`vs-ask${head.length > LONG_HEAD ? ' sm' : ''}${ask.rev ? ' code' : ''}`}>
        {head}
      </h2>
      <p className="vs-sub">{subtitle(qm, state.me.dif, ask)}</p>

      {showsMap && (
        <div className="vs-stage">
          <VersusMap
            zoom={zoom}
            solo={qm === 'shape' ? s.a : null}
            highlight={qm === 'find' ? null : ask.show}
            divisionHint={qm === 'find' && DIFFS[state.me.dif].regionHint ? s.div : null}
            picked={(mine?.pick ?? null) as Abbr | null}
            answer={qm === 'find' ? s.a : null}
            revealed={revealing && qm === 'find'}
            onPick={qm === 'find' ? api.answerMap : undefined}
            disabled={answered || revealing}
          />
        </div>
      )}

      {revealing ? (
        <Reveal api={api} ask={ask} qm={qm} mine={mine} theirs={theirs} />
      ) : answered ? (
        <div className="vs-locked" role="status">
          <b>Locked in.</b>
          <span>{theirs ? 'Both in — here comes the answer.' : `Waiting for ${state.them?.name || state.lastOpponent || 'them'}…`}</span>
        </div>
      ) : ask.choices ? (
        <div className="vs-choices">
          {ask.choices.map((a) => (
            <button key={a} type="button" onClick={() => api.answerChoice(a)}>
              {choiceLabel(ask, a)}
            </button>
          ))}
        </div>
      ) : typed ? (
        <form
          className="vs-entry"
          onSubmit={(e) => { e.preventDefault(); api.answerText(text); }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={twoLetter ? 'up mono' : undefined}
            maxLength={twoLetter ? 2 : undefined}
            placeholder={twoLetter ? 'XX' : qm === 'capital' ? 'Capital city' : 'State name'}
            aria-label={twoLetter ? 'Postal code' : qm === 'capital' ? 'Capital city' : 'State name'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize={twoLetter ? 'characters' : 'words'}
            spellCheck={false}
            enterKeyHint="send"
          />
          <button type="submit" className="vs-send" disabled={!text.trim()}>Go</button>
        </form>
      ) : qm === 'find' ? (
        <p className="vs-tap">Tap it on the map. One shot.</p>
      ) : null}
    </>
  );
}

/** Both answers, side by side, then the fact worth carrying away. */
function Reveal({
  api, ask, qm, mine, theirs,
}: {
  api: VersusApi; ask: Ask; qm: ModeKey;
  mine: RoundAnswer | null; theirs: RoundAnswer | null;
}) {
  const { state } = api;
  const s = ask.s;

  return (
    <div className="vs-reveal">
      <div className="vs-answers">
        <AnswerChip who={state.me.name} answer={mine} you />
        <AnswerChip who={state.them?.name || state.lastOpponent || 'Opponent'} answer={theirs} />
      </div>
      <p className="vs-fact">
        {qm === 'capital' ? <><b>{s.cap}</b> is the capital of {s.n}.</>
          : qm === 'code' ? <><b>{s.a}</b> — {s.n}.</>
            : qm === 'border' ? <><b>{ask.answer ? BY[ask.answer].n : ''}</b> borders {s.n}.</>
              : <><b>{s.n}</b> — {s.cap} · {s.nick}.</>}
      </p>
    </div>
  );
}

function AnswerChip({ who, answer, you = false }: {
  who: string; answer: RoundAnswer | null; you?: boolean;
}) {
  const cls = !answer || answer.timeout ? 'out' : answer.correct ? 'ok' : 'bad';
  return (
    <div className={`vs-chip ${cls}${you ? ' you' : ''}`}>
      <span className="vs-chip-who">{who}</span>
      <b>
        {!answer || answer.timeout ? 'No answer'
          : answer.correct ? 'Correct' : 'Wrong'}
      </b>
      <span className="mono vs-chip-pts">
        {answer && !answer.timeout && `${(answer.ms / 1000).toFixed(1)}s`}
        {answer && answer.points > 0 ? ` · +${answer.points}` : ''}
      </span>
    </div>
  );
}

/** The question headline, matching the solo wording players already know. */
function prompt(ask: Ask, qm: ModeKey): string {
  const s = ask.s;
  switch (qm) {
    case 'find': return s.n;
    case 'name':
    case 'shape': return 'Which state is this?';
    case 'border': return `Which one borders ${s.n}?`;
    case 'capital': return s.n;
    case 'code': return ask.rev ? s.a : s.n;
    default: return s.n;
  }
}

function subtitle(qm: ModeKey, dif: DiffKey, ask: Ask): string {
  const d = DIFFS[dif];
  switch (qm) {
    case 'find': return d.regionHint ? 'Tap it — only its division is lit.' : 'Tap it on the map.';
    case 'name': return d.typeNames ? 'Type its name.' : 'Pick the highlighted one.';
    case 'shape': return d.typeNames ? 'Shape only. Type its name.' : 'Shape only — no map, no neighbours.';
    case 'border': return d.showTarget ? 'It is highlighted on the map.' : 'No anchor on the map.';
    case 'capital': return d.forceChoice ? 'Pick the capital.' : 'Name the capital.';
    case 'code': return ask.rev ? 'Which state uses this code?'
      : d.forceChoice ? 'Pick the postal code.' : 'Two-letter postal code.';
    default: return '';
  }
}
