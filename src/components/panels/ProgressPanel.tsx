import { BY, ST } from '../../data/states';
import { MODES } from '../../data/modes';
import { useGame } from '../../game/context';
import { accuracyByTrack, overall, weakList } from '../../game/progress';
import { fitBox } from '../../lib/geo';
import { StateShape } from '../StateShape';

/** How many weak spots the table lists before it gets unhelpfully long. */
const MAX_ROWS = 12;

export function ProgressPanel({ onReset }: { onReset: () => void }) {
  const { state, dispatch } = useGame();
  const { progress } = state;

  const weak = weakList(progress);
  const rows = weak.slice(0, MAX_ROWS);
  const perMode = accuracyByTrack(progress);
  const solidAll = ST.filter((s) => overall(progress, s.a) >= 3).length;

  return (
    <>
      <div className="eyebrow">Learn · Progress</div>
      <h2 className="ask">{solidAll} of 50 solid</h2>
      <div className="sub">
        {weak.length
          ? `${weak.length} state${weak.length === 1 ? '' : 's'} you keep getting wrong, weakest first.`
          : 'Nothing is dragging yet — answer a few more questions and weak spots will surface here.'}
      </div>

      {perMode.length > 0 && (
        <>
          <h3 className="eyebrow" style={{ marginTop: 18 }}>Accuracy by quiz</h3>
          <div className="acc">
            {perMode.map((x) => {
              const pct = Math.round(x.c / x.a * 100);
              return (
                <div className="accrow" key={x.t}>
                  <span>{MODES[x.t].label}</span>
                  <div className="accbar"><i style={{ width: `${pct}%` }} /></div>
                  <b className="mono">{pct}%</b>
                  <u className="mono">{x.c}/{x.a}</u>
                </div>
              );
            })}
          </div>
        </>
      )}

      {rows.length > 0 && (
        <>
          <h3 className="eyebrow" style={{ marginTop: 18 }}>Weakest</h3>
          <table className="wk">
            <tbody>
              {rows.map((x) => (
                <tr
                  key={x.s.a}
                  onClick={() => dispatch({ type: 'zoomTo', box: fitBox([BY[x.s.a]], 1.6) })}
                >
                  <td><StateShape s={x.s} className="wk-shape" /></td>
                  <td><b>{x.s.n}</b><span className="mono">{x.s.cap} · {x.s.a}</span></td>
                  <td className="mono">{MODES[x.track].label}</td>
                  <td className="mono">{x.c}/{x.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="row">
        {rows.length > 0 && (
          <button className="btn sm" type="button" onClick={() => dispatch({ type: 'drillWeak' })}>
            Drill these {weak.length}
          </button>
        )}
        <button className="btn ghost sm" type="button" onClick={onReset}>Reset progress</button>
      </div>
    </>
  );
}
