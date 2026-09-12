import { useEffect, useMemo, useRef, useState } from 'react';
import { BY } from '../../data/states';
import { DIFFS, MODES } from '../../data/modes';
import { choiceLabel } from '../../game/question';
import { useCountUp } from '../../hooks/useCountUp';
import { fitBox, fullBox } from '../../lib/geo';
import { pickLabel } from '../../versus/grade';
import { currentRound, roundTaker, settledUpTo, verdictsOf } from '../../versus/machine';
import type { VersusState } from '../../versus/machine';
import { breakdown, isFinalRound, isTyped, streakBefore } from '../../versus/scoring';
import type { Bonus } from '../../versus/scoring';
import { colorOf } from '../../versus/types';
import { ReactionBubbles, ReactionTray } from './Reactions';
import { SoundToggle } from './SoundToggle';
import { VersusMap } from './VersusMap';
import type { VersusApi } from '../../versus/useVersus';
import type { Abbr, Ask, DiffKey, ModeKey } from '../../types';
import type { PlayerColor, RoundAnswer } from '../../versus/types';

/** Longer prompts drop a size so they still fit two lines on a phone. */
const LONG_HEAD = 20;

/** How long the totals wait after the reveal lands before rolling up. */
const TOTAL_DELAY_MS = 650;

/** The opponent's colour: theirs if they are still here, else the seat they had. */
const theirColor = (api: VersusApi): PlayerColor =>
  api.state.them?.color ?? colorOf(!api.state.isHost);

const theirName = (api: VersusApi): string =>
  api.state.them?.name || api.state.lastOpponent || 'Opponent';

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/**
 * The match itself: a scoreline that only moves at the reveal, the round's
 * story so far in a row of pips, the question, and answers big enough to
 * hit with a thumb without looking.
 *
 * Each player has a seat colour that is the same on both phones, and every
 * mark that says "whose" — the scoreline, a pip, a tap on the map, the
 * reveal's chips and banner — carries it, so what the other player did
 * reads as theirs at once.
 */
export function VersusPlay({ api }: { api: VersusApi }) {
  const { state, ask, msLeft, limitMs, answered, worth } = api;
  const round = currentRound(state);
  const revealing = state.phase === 'reveal';

  if (!round || !ask) return null;

  const mine = state.myAnswers[state.round];
  const theirs = state.theirAnswers[state.round];
  const frac = limitMs > 0 && msLeft !== null ? msLeft / limitMs : 1;
  const low = frac < 0.25;
  const finalRound = isFinalRound(state.round, state.plan.length);
  // They are in and this side is not: the clock just got louder.
  const pressure = !!theirs && !theirs.timeout && !answered && !revealing;

  return (
    <div className="vs-sheet vs-play">
      <ScoreBar api={api} />
      <RoundPips state={state} them={theirName(api)} theirColor={theirColor(api)} />

      <div className="vs-clock" aria-hidden="true">
        <i style={{ transform: `scaleX(${frac})` }} className={low ? 'low' : undefined} />
      </div>

      <div className="vs-round-line">
        <span className="eyebrow">
          Round {state.round + 1} of {state.plan.length} · {MODES[round.qm].label}
        </span>
        {finalRound && <i className="vs-x2" role="img" aria-label="Double points">2×</i>}
        <span className="vs-round-right">
          {worth > 0 && (
            <span className={`vs-worth mono${low ? ' low' : ''}`} aria-label={`Worth ${worth} points right now`}>
              +{worth}
            </span>
          )}
          {msLeft !== null && (
            <span className={`vs-secs mono${low ? ' low' : ''}`}>
              {Math.ceil(msLeft / 1000)}s
            </span>
          )}
          <SoundToggle />
        </span>
      </div>

      {/* Always in the flow, empty or not — see .vs-pressure. */}
      <p className="vs-pressure" role="status" data-pc={theirColor(api)} data-in={pressure || undefined}>
        {pressure && <><b>{theirName(api)}</b> is in · {secs(theirs.ms)}</>}
      </p>

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

/**
 * The two running totals, always in the same place so a glance is enough.
 *
 * They count revealed rounds only, and roll up a beat after the reveal so
 * the verdict lands first. The dot says an answer is in; the flame says how
 * many in a row. Reactions float up from each player's side of it.
 */
function ScoreBar({ api }: { api: VersusApi }) {
  const { state, myTotal, theirTotal, myStreak, theirStreak, reactions } = api;
  const mine = useCountUp(myTotal, { delay: TOTAL_DELAY_MS });
  const theirs = useCountUp(theirTotal, { delay: TOTAL_DELAY_MS });
  const lead = myTotal === theirTotal ? 'tie' : myTotal > theirTotal ? 'me' : 'them';
  const done = state.myAnswers[state.round] != null;
  const theyDone = state.theirAnswers[state.round] != null;

  return (
    <div className="vs-scores" data-lead={lead}>
      <div className="vs-score me" data-pc={state.me.color}>
        <span className="vs-score-name">{state.me.name}</span>
        <Flame n={myStreak} />
        <b className="mono">{mine}</b>
        <i className={done ? 'in' : undefined} aria-label={done ? 'Answered' : 'Thinking'} />
      </div>
      <div className="vs-score them" data-pc={theirColor(api)}>
        <span className="vs-score-name">{theirName(api)}</span>
        <Flame n={theirStreak} />
        <b className="mono">{theirs}</b>
        <i className={theyDone ? 'in' : undefined} aria-label={theyDone ? 'Answered' : 'Thinking'} />
      </div>
      <ReactionBubbles reactions={reactions} them={theirName(api)} />
    </div>
  );
}

/** A streak worth showing: two or more in a row. Remounted on change, which replays the pop. */
function Flame({ n }: { n: number }) {
  if (n < 2) return null;
  return (
    <span key={n} className="vs-flame" aria-label={`${n} in a row`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6.2 0C6.4 2.6 3 4.1 3 7.3a3.2 3.2 0 0 0 6.4 0c0-1.5-.7-2.4-1.2-3.2-.3.9-.9 1.3-1.4 1.3.3-1.4-.1-3.6-.6-5.4z" />
      </svg>
      {n}
    </span>
  );
}

/**
 * One pip per round: filled in the colour of whoever took it, grey for a
 * split, a pulsing ring for the round in play and faint for what is left.
 * The match's story so far, readable from across a table.
 */
function RoundPips({ state, them, theirColor: tc }: { state: VersusState; them: string; theirColor: PlayerColor }) {
  const upTo = settledUpTo(state);
  return (
    <ol className="vs-pips" aria-label="Rounds so far">
      {state.plan.map((_, i) => {
        let cls: string;
        let pc: PlayerColor | undefined;
        let label: string;
        if (i < upTo) {
          const t = roundTaker(state.myAnswers[i] ?? null, state.theirAnswers[i] ?? null);
          cls = t;
          pc = t === 'me' ? state.me.color : t === 'them' ? tc : undefined;
          label = t === 'me' ? 'yours' : t === 'them' ? `${them}’s` : 'split';
        } else if (i === state.round && state.phase === 'question') {
          cls = 'live';
          label = 'in play';
        } else {
          cls = 'todo';
          label = 'still to play';
        }
        return <li key={i} className={cls} data-pc={pc} aria-label={`Round ${i + 1}: ${label}`} />;
      })}
    </ol>
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

  /* On a keyboard, 1–4 picks an option, as the solo quiz does. */
  const { answerChoice } = api;
  const choices = ask.choices;
  useEffect(() => {
    if (!choices || answered || revealing) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!/^[1-4]$/.test(e.key)) return;
      const a = choices[Number(e.key) - 1];
      if (a) {
        e.preventDefault();
        answerChoice(a);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, answered, revealing, answerChoice]);

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
  // Only Find It answers *on* the map. Everywhere else the map is the prompt,
  // so lighting up a pick made on a button would mark the wrong state.
  const myPick = qm === 'find' ? ((mine?.pick ?? null) as Abbr | null) : null;
  const theirPick = qm === 'find' && revealing ? ((theirs?.pick ?? null) as Abbr | null) : null;
  const colors = { mine: state.me.color, theirs: theirColor(api) };

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
            picked={myPick}
            theirPick={theirPick}
            answer={qm === 'find' ? s.a : null}
            revealed={revealing && qm === 'find'}
            colors={colors}
            onPick={qm === 'find' ? api.answerMap : undefined}
            disabled={answered || revealing}
          />
        </div>
      )}

      {revealing ? (
        <Reveal api={api} ask={ask} qm={qm} mine={mine} theirs={theirs} />
      ) : answered ? (
        <div className="vs-locked" role="status">
          <b>Locked in{mine && !mine.timeout ? ` · ${secs(mine.ms)}` : ''}</b>
          <span>{theirs ? 'Both in — here comes the answer.' : `Waiting for ${theirName(api)}…`}</span>
          {!theirs && <ReactionTray onReact={api.react} small />}
        </div>
      ) : ask.choices ? (
        <div className="vs-choices">
          {ask.choices.map((a, i) => (
            <button key={a} type="button" onClick={() => api.answerChoice(a)}>
              <kbd aria-hidden="true">{i + 1}</kbd>
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

/**
 * The round's verdict: who took it, both answers side by side with what
 * each was worth and why, then the fact worth carrying away.
 *
 * Each chip says what its player actually put in — the state they tapped,
 * the option they chose, the word they typed — in the words of the question
 * that player saw, which need not be this one: the opponent may have been
 * picking from four where this side was typing.
 */
function Reveal({
  api, ask, qm, mine, theirs,
}: {
  api: VersusApi; ask: Ask; qm: ModeKey;
  mine: RoundAnswer | null; theirs: RoundAnswer | null;
}) {
  const { state, theirAsk } = api;
  const s = ask.s;
  const taker = roundTaker(mine, theirs);
  const took = taker === 'me' ? mine : taker === 'them' ? theirs : null;
  const anyPoints = (mine?.points ?? 0) > 0 || (theirs?.points ?? 0) > 0;
  const final = isFinalRound(state.round, state.plan.length);
  const myBonus: Bonus = { streak: streakBefore(verdictsOf(state.myAnswers), state.round), final };
  const theirBonus: Bonus = { streak: streakBefore(verdictsOf(state.theirAnswers), state.round), final };
  const pc = taker === 'me' ? state.me.color : taker === 'them' ? theirColor(api) : undefined;

  return (
    <div className="vs-reveal">
      <div className={`vs-call ${taker}`} data-pc={pc} role="status">
        <b>
          {taker === 'me' ? 'Round to you'
            : taker === 'them' ? `Round to ${theirName(api)}`
              : anyPoints ? 'Split round' : 'Nobody had it'}
        </b>
        {took && <span className="mono">+{took.points} · {secs(took.ms)}</span>}
      </div>
      <div className="vs-answers">
        <AnswerChip
          who={state.me.name}
          color={state.me.color}
          answer={mine}
          pick={mine ? pickLabel(ask, qm, mine.pick) : null}
          bonus={myBonus}
          you
        />
        <AnswerChip
          who={theirName(api)}
          color={theirColor(api)}
          answer={theirs}
          pick={theirs && theirAsk ? pickLabel(theirAsk, qm, theirs.pick) : null}
          bonus={theirBonus}
        />
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

function AnswerChip({ who, color, answer, pick, bonus, you = false }: {
  who: string; color: PlayerColor; answer: RoundAnswer | null; pick: string | null;
  bonus: Bonus; you?: boolean;
}) {
  const cls = !answer || answer.timeout ? 'out' : answer.correct ? 'ok' : 'bad';
  const parts = answer?.correct ? breakdown(answer.points, bonus) : null;
  const tagged = !!parts && (parts.speed > 0 || parts.streak > 0 || parts.doubled);
  return (
    <div className={`vs-chip ${cls}${you ? ' you' : ''}`} data-pc={color}>
      <span className="vs-chip-who">{who}</span>
      <b>
        {!answer || answer.timeout ? 'No answer'
          : answer.correct ? 'Correct' : 'Wrong'}
      </b>
      {pick && <span className="vs-chip-pick">{pick}</span>}
      <span className="mono vs-chip-pts">
        {answer && !answer.timeout && secs(answer.ms)}
        {answer && answer.points > 0 && <em>+{answer.points}</em>}
      </span>
      {tagged && parts && (
        <span className="vs-chip-tags">
          {parts.speed > 0 && <i>+{parts.speed} speed</i>}
          {parts.streak > 0 && <i>+{parts.streak} streak</i>}
          {parts.doubled && <i>×2 last round</i>}
        </span>
      )}
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
