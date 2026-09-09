import { DIFFS, DIFF_KEYS, MODES, trackOrNull } from '../data/modes';
import { useGame } from '../game/context';
import { solidCount } from '../game/progress';
import { elapsed } from '../game/recall';
import { useNow } from '../hooks/useNow';
import { THEMES, THEME_LABELS, useTheme } from '../hooks/useTheme';
import { fmtTime } from '../lib/text';
import type { DiffKey, Theme } from '../types';

export function Rail({ onVersus }: { onVersus: () => void }) {
  const { state, dispatch } = useGame();
  const { recall, run, qm, progress, dif } = state;
  const [theme, setTheme] = useTheme();

  // Name All 50 shows a running clock; everything else shows session tallies.
  const now = useNow(!!recall && !recall.done);
  const track = trackOrNull(qm);
  const solid = solidCount(progress, track);

  const [a, aLabel] = recall
    ? [`${recall.got.size}/${recall.total}`, 'Found']
    : [run.asked ? `${run.right}/${run.asked}` : '0', 'Correct'];
  const [b, bLabel] = recall
    ? [fmtTime(elapsed(recall, now)), 'Time']
    : [String(run.streak), 'Streak'];

  return (
    <header className="rail">
      <div className="wordmark"><b>Fifty States</b><span>Drill</span></div>
      <div className="rail-right">
        <button type="button" className="vs-open" onClick={onVersus}>
          Versus
        </button>
        <label className="railsel lvl">
          <span className="eyebrow">Level</span>
          <select
            id="lvlSel"
            aria-label="Difficulty level"
            title={DIFFS[dif].blurb}
            value={dif}
            onChange={(e) => dispatch({ type: 'setDiff', dif: e.target.value as DiffKey })}
          >
            {DIFF_KEYS.map((k) => <option key={k} value={k}>{DIFFS[k].label}</option>)}
          </select>
        </label>
        <div className="stat"><b>{a}</b><span>{aLabel}</span></div>
        <div className="stat hot"><b>{b}</b><span>{bLabel}</span></div>
        <label className="railsel">
          <span className="eyebrow">Theme</span>
          <select
            aria-label="Colour theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
          >
            {THEMES.map((t) => <option key={t} value={t}>{THEME_LABELS[t]}</option>)}
          </select>
        </label>
        <div className="stat solid">
          <b>{`${solid}/50`}</b>
          <span>{track ? `${MODES[track].label} solid` : 'Solid'}</span>
        </div>
      </div>
    </header>
  );
}
