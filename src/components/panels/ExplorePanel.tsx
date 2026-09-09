import { BY } from '../../data/states';
import { useGame } from '../../game/context';
import { scopeLabel } from '../../game/scope';
import { fitBox } from '../../lib/geo';
import { StateFacts } from '../StateFacts';

export function ExplorePanel() {
  const { state, dispatch } = useGame();
  const s = state.sel ? BY[state.sel] : null;

  if (!s) {
    return (
      <>
        <div className="eyebrow">Learn · Map</div>
        <h2 className="ask sm">Tap a state to study it</h2>
        <div className="sub">
          Every fact you'll be quizzed on lives here — capital, postal code, when it joined
          the Union, and which states it touches.
        </div>
        <div className="mini">
          Showing <b>{scopeLabel(state.scope, state.progress)}</b>. Narrow the region above the
          map to learn in small batches — the map zooms in with you, which makes the crowded
          Northeast easy to tap.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Learn · Map</div>
      <h2 className="ask">{s.n}</h2>
      <div className="sub">{s.nick}</div>
      <StateFacts s={s} />
      <div className="row">
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch({ type: 'zoomTo', box: fitBox([s], 1.6) })}
        >
          Zoom to {s.a}
        </button>
        <button
          className="btn ghost sm"
          type="button"
          onClick={() => dispatch({ type: 'clearSelection' })}
        >
          Clear
        </button>
      </div>
    </>
  );
}
