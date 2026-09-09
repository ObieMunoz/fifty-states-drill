import type { ReactNode } from 'react';
import { BY, DIVS, LETTERS, ST } from '../data/states';
import { DIFFS, MODES, trackOrNull } from '../data/modes';
import { useGame } from '../game/context';
import { levelFor } from '../game/progress';
import { inScope } from '../game/scope';
import { fitBox } from '../lib/geo';
import type { Abbr, State } from '../types';

/** One named state in the list, coloured by whether it has been found. */
function StateEntry({ s, cls, onFocus }: { s: State; cls: string; onFocus: (a: Abbr) => void }) {
  return (
    <li>
      <button type="button" className={cls} onClick={() => onFocus(s.a)}>
        <s className={`pip ${cls}`} /><em>{s.n}</em>
      </button>
    </li>
  );
}

function Group({ title, count, children }: { title: ReactNode; count: ReactNode; children: ReactNode }) {
  return (
    <div className="grp">
      <h4><span>{title}</span><span>{count}</span></h4>
      <ul>{children}</ul>
    </div>
  );
}

/**
 * The list beside the map. It shows whatever is most useful for the mode in
 * play: mastery by census division most of the time, and the answer sheet
 * during Roll Call and Name All 50.
 */
export function Roster({ onReset }: { onReset: () => void }) {
  const { state, dispatch } = useGame();
  const { mode, scope, progress, recall, roll } = state;
  const track = trackOrNull(mode);

  const focus = (a: Abbr) => {
    if (mode === 'map' || mode === 'letter') dispatch({ type: 'selectState', abbr: a });
    dispatch({ type: 'zoomTo', box: fitBox([BY[a]], 1.6) });
  };

  const Entry = ({ s, cls }: { s: State; cls: string }) => (
    <StateEntry s={s} cls={cls} onFocus={focus} />
  );

  /* ---- Roll Call: the answer sheet, letter by letter ---- */
  if (mode === 'roll' && roll) {
    return (
      <div className="roster">
        {LETTERS.map((L) => {
          const g = ST.filter((s) => s.n[0] === L && inScope(s, scope, progress));
          if (!g.length) return null;
          const got = g.filter((s) => roll.got.has(s.a));
          const done = got.length === g.length;
          return (
            <Group key={L} title={`${L}${done ? ' ✓' : ''}`} count={`${got.length}/${g.length}`}>
              {g.map((s) => (
                roll.got.has(s.a) ? <Entry key={s.a} s={s} cls="got" />
                  : roll.shown.has(L) ? <Entry key={s.a} s={s} cls="miss" />
                    : <li key={s.a} className="blank">····</li>
              ))}
            </Group>
          );
        })}
      </div>
    );
  }

  /* ---- Name All 50 on Expert: no letter breakdown at all ---- */
  if (recall && !DIFFS[state.dif].letterGroups) {
    const got = ST.filter((s) => inScope(s, scope, progress) && recall.got.has(s.a));
    const missed = recall.done
      ? ST.filter((s) => inScope(s, scope, progress) && !recall.got.has(s.a))
      : [];
    return (
      <div className="roster">
        <Group title="Found" count={`${got.length}/${recall.total}`}>
          {got.length
            ? got.map((s) => <Entry key={s.a} s={s} cls="got" />)
            : <li className="blank">nothing yet</li>}
        </Group>
        {missed.length > 0 && (
          <Group title="Missed" count={missed.length}>
            {missed.map((s) => <Entry key={s.a} s={s} cls="miss" />)}
          </Group>
        )}
      </div>
    );
  }

  /* ---- Name All 50: blanks sized to the missing names, on Guided ---- */
  if (recall) {
    const lengths = DIFFS[state.dif].lengths;
    return (
      <div className="roster">
        {LETTERS.map((L) => {
          const g = ST.filter((s) => s.n[0] === L && inScope(s, scope, progress));
          if (!g.length) return null;
          const got = g.filter((s) => recall.got.has(s.a));
          return (
            <Group key={L} title={L} count={`${got.length}/${g.length}`}>
              {g.map((s) => (
                recall.got.has(s.a) ? <Entry key={s.a} s={s} cls="got" />
                  : recall.done ? <Entry key={s.a} s={s} cls="miss" />
                    : (
                      <li key={s.a} className="blank">
                        {lengths ? '·'.repeat(Math.min(14, s.n.length)) : '····'}
                      </li>
                    )
              ))}
            </Group>
          );
        })}
      </div>
    );
  }

  /* ---- Everything else: mastery, by census division ---- */
  const counts = [0, 0, 0, 0];
  for (const s of ST) counts[levelFor(progress, s.a, track)]++;

  return (
    <div className="roster">
      <div className="grp">
        <h4>
          <span>{`Progress · ${track ? MODES[mode].label : 'overall'}`}</span>
          <button
            className="btn ghost sm"
            type="button"
            style={{ minHeight: 0, padding: '2px 8px', fontSize: 10 }}
            onClick={onReset}
          >
            Reset
          </button>
        </h4>
        <div className="bars">
          {[1, 2, 3].map((i) => (
            <i key={i} style={{ width: `${counts[i] / 50 * 100}%`, background: `var(--m${i})` }} />
          ))}
        </div>
        <div className="legend">
          <span>
            <s style={{ background: 'var(--land)', boxShadow: 'inset 0 0 0 1px var(--land-line)' }} />
            {`New ${counts[0]}`}
          </span>
          <span><s style={{ background: 'var(--m1)' }} />{`Seen ${counts[1]}`}</span>
          <span><s style={{ background: 'var(--m2)' }} />{`Learning ${counts[2]}`}</span>
          <span><s style={{ background: 'var(--m3)' }} />{`Solid ${counts[3]}`}</span>
        </div>
      </div>

      {DIVS.map((d) => {
        const g = ST.filter((s) => s.div === d);
        const solid = g.filter((s) => levelFor(progress, s.a, track) >= 3).length;
        return (
          <Group key={d} title={d} count={`${solid}/${g.length}`}>
            {g.map((s) => {
              const L = levelFor(progress, s.a, track);
              const weak = track && L < 2 && (progress.err[s.a] ?? 0) > 0;
              return (
                <li key={s.a}>
                  <button
                    type="button"
                    className={L >= 2 ? 'got' : ''}
                    onClick={() => focus(s.a)}
                  >
                    <s className={`pip ${L ? 'm' + L : ''}${weak ? ' weak' : ''}`} />
                    <em>{s.n}</em>
                  </button>
                </li>
              );
            })}
          </Group>
        );
      })}
    </div>
  );
}
