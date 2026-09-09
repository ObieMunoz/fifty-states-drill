import { useState } from 'react';
import { BY } from '../../data/states';
import { correctOf, matchResults } from '../../versus/machine';
import { Leaderboard } from './Leaderboard';
import type { VersusApi } from '../../versus/useVersus';

/** The result, the round-by-round story, and the way back to another match. */
export function VersusFinal({ api }: { api: VersusApi }) {
  const { state, myTotal, theirTotal, board } = api;
  // Mounted fresh for each match — see the key in VersusScreen — so this needs
  // no resetting of its own.
  const [asked, setAsked] = useState(false);
  const { outcome } = matchResults(state);
  const them = state.them?.name || state.lastOpponent || 'Opponent';

  const headline = outcome === 'win' ? 'You win' : outcome === 'loss' ? `${them} wins` : 'Dead heat';

  return (
    <div className="vs-sheet vs-final">
      <header className="vs-top">
        <button type="button" className="vs-back" onClick={api.leave}>← Leave</button>
        <span className="eyebrow mono">Room {state.code}</span>
      </header>

      <div className={`vs-verdict ${outcome}`}>
        <h1>{headline}</h1>
        <div className="vs-final-scores">
          <div className="me">
            <span>{state.me.name}</span>
            <b className="mono">{myTotal}</b>
            <i className="mono">{correctOf(state.myAnswers)}/{state.plan.length} right</i>
          </div>
          <span className="vs-dash" aria-hidden="true">—</span>
          <div className="them">
            <span>{them}</span>
            <b className="mono">{theirTotal}</b>
            <i className="mono">{correctOf(state.theirAnswers)}/{state.plan.length} right</i>
          </div>
        </div>
      </div>

      <section className="vs-strip">
        <div className="vs-strip-head">
          <span className="eyebrow">Round by round</span>
          {/* Which column is whose; the dots alone cannot say it. */}
          <span className="vs-strip-key">
            <i className="me" aria-hidden="true" />{state.me.name}
            <i className="them" aria-hidden="true" />{them}
          </span>
        </div>
        <ol>
          {state.plan.map((r, i) => {
            const mine = state.myAnswers[i];
            const theirs = state.theirAnswers[i];
            return (
              <li key={i}>
                <b className="mono">{i + 1}</b>
                <span className="vs-strip-state">{BY[r.abbr].n}</span>
                <span className={`vs-dot me ${verdict(mine)}`} aria-label={`You: ${verdict(mine)}`} />
                <span className={`vs-dot them ${verdict(theirs)}`} aria-label={`${them}: ${verdict(theirs)}`} />
              </li>
            );
          })}
        </ol>
      </section>

      <div className="vs-foot">
        <button
          type="button"
          className={`vs-big ${asked ? 'on' : 'primary'}`}
          disabled={!state.them}
          onClick={() => { setAsked(true); api.rematch(); }}
        >
          {asked ? 'Asked for a rematch' : 'Play again'}
        </button>
        <p className="vs-foot-note" role="status">
          {!state.them ? `${them} has left.`
            : state.theyWantAgain ? `${them} wants another.`
              : asked ? 'Waiting for the host to restart…' : ''}
        </p>
      </div>

      <Leaderboard
        rows={board}
        highlight={[state.me.name, them]}
        onCleared={api.clearBoard}
      />
    </div>
  );
}

const verdict = (a: { correct: boolean; timeout: boolean } | null): string =>
  !a || a.timeout ? 'out' : a.correct ? 'ok' : 'bad';
