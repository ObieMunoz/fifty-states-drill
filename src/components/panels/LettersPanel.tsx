import { BY, LETTERS, ST } from '../../data/states';
import { useGame } from '../../game/context';
import { fitBox } from '../../lib/geo';
import { StateFacts } from '../StateFacts';

export function LettersPanel() {
  const { state, dispatch } = useGame();
  const { letter, sel } = state;
  const group = ST.filter((s) => s.n[0] === letter);
  // Only show facts for a selection that still belongs to the current letter.
  const picked = sel && BY[sel] && BY[sel].n[0] === letter ? BY[sel] : null;

  return (
    <>
      <div className="eyebrow">Learn · By Letter</div>
      <h2 className="ask">{group.length} start with {letter}</h2>
      <div className="sub">
        {letter === 'M' || letter === 'N'
          ? 'The two biggest groups — eight each. Learn these and you have a third of the map.'
          : 'Lit up on the map. Say them in order, then check yourself.'}
      </div>

      <div className="letters" role="group" aria-label="First letter">
        {LETTERS.map((L) => (
          <button
            key={L}
            type="button"
            aria-pressed={L === letter}
            onClick={() => dispatch({ type: 'setLetter', letter: L })}
          >
            <i>{L}</i><u>{ST.filter((x) => x.n[0] === L).length}</u>
          </button>
        ))}
      </div>

      <div className="chips">
        {group.map((x) => (
          <button
            key={x.a}
            type="button"
            onClick={() => {
              dispatch({ type: 'selectState', abbr: x.a });
              dispatch({ type: 'zoomTo', box: fitBox([x], 1.6) });
            }}
          >
            {x.n}
          </button>
        ))}
      </div>

      {picked
        ? <StateFacts s={picked} />
        : <div className="mini">Tap a name to see its facts and find it on the map.</div>}
    </>
  );
}
