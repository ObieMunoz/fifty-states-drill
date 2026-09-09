import { DIVS, REGS, ST } from '../data/states';
import { MODES } from '../data/modes';
import { useGame } from '../game/context';
import { UsMap } from './UsMap';

export function MapStage() {
  const { state, dispatch } = useGame();
  // The Codes toggle only makes sense in the study modes; the quizzes would be
  // giving away their own answers.
  const showLabelToggle = MODES[state.mode].g === 'learn';

  return (
    <section className="stage">
      <div className="maptools">
        <select
          className="btn ghost sm"
          id="scope"
          aria-label="Region"
          value={state.scope}
          onChange={(e) => dispatch({ type: 'setScope', scope: e.target.value })}
        >
          <option value="all">All 50 states</option>
          <optgroup label="Region">
            {REGS.map((r) => (
              <option key={r} value={`r:${r}`}>
                {`${r} (${ST.filter((s) => s.reg === r).length})`}
              </option>
            ))}
          </optgroup>
          <option value="weak">Weak spots only</option>
          <optgroup label="Census division">
            {DIVS.map((d) => (
              <option key={d} value={d}>
                {`${d} (${ST.filter((s) => s.div === d).length})`}
              </option>
            ))}
          </optgroup>
        </select>
        <button className="sm" type="button" onClick={() => dispatch({ type: 'fitScope' })}>Fit</button>
        {showLabelToggle && (
          <button
            className="sm"
            type="button"
            aria-pressed={state.labels}
            onClick={() => dispatch({ type: 'toggleLabels' })}
          >
            Codes
          </button>
        )}
      </div>
      <UsMap />
    </section>
  );
}
