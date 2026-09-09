import { useGame } from '../../game/context';
import { scopeLabel } from '../../game/scope';
import { shuffle } from '../../lib/random';
import { ordSuf } from '../../lib/text';
import { StateShape } from '../StateShape';

export function CardsPanel() {
  const { state, dispatch } = useGame();
  const { deck, card, cardBack, scope, progress } = state;
  const s = deck[card];

  if (!s) return <div className="sub">No states in this selection.</div>;

  return (
    <>
      <div className="eyebrow">Learn · Cards · {scopeLabel(scope, progress)}</div>

      <button
        className={`card ${cardBack ? 'flipped' : ''}`}
        type="button"
        aria-label={cardBack ? 'Back of card' : 'Front of card, tap to flip'}
        onClick={() => dispatch({ type: 'cardFlip' })}
      >
        {cardBack ? (
          <div className="card-back">
            <StateShape s={s} className="card-shape" />
            <div className="card-facts">
              <div className="cf"><span>Capital</span><b>{s.cap}</b></div>
              <div className="cf"><span>Code</span><b className="mono">{s.a}</b></div>
              <div className="cf"><span>Admitted</span><b>{s.adm} · {s.ord}{ordSuf(s.ord)}</b></div>
              <div className="cf"><span>Nickname</span><b>{s.nick}</b></div>
              <div className="cf"><span>Region</span><b>{s.div}</b></div>
              <div className="cf">
                <span>Borders</span>
                <b className="mono">{s.nb.length ? s.nb.join(' ') : 'none'}</b>
              </div>
            </div>
          </div>
        ) : (
          <div className="card-front"><b>{s.n}</b><span>tap to flip</span></div>
        )}
      </button>

      <div className="row spread">
        <span className="eyebrow">Card {card + 1} of {deck.length}</span>
        <span className="eyebrow">{(progress.err[s.a] ?? 0) > 0 ? 'flagged for review' : ''}</span>
      </div>

      <div className="row">
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch({ type: 'cardMove', delta: -1 })}
        >
          ← Back
        </button>
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch({ type: 'cardSetDeck', deck: shuffle([...deck]) })}
        >
          Shuffle
        </button>
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch({ type: 'cardFlag' })}
        >
          Need work
        </button>
        <button
          className="btn sm"
          type="button"
          style={{ marginLeft: 'auto' }}
          onClick={() => dispatch({ type: 'cardMove', delta: 1 })}
        >
          Next →
        </button>
      </div>

      <div className="mini">
        Space flips · arrow keys move · <b>Need work</b> flags a state so the quizzes ask about
        it more often.
      </div>
    </>
  );
}
