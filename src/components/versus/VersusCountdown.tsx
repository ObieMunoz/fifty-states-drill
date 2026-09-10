import { MODES } from '../../data/modes';
import { COUNTDOWN_MS } from '../../versus/timing';
import type { VersusApi } from '../../versus/useVersus';

/** Three, two, one. Big enough to read from across a table. */
export function VersusCountdown({ api }: { api: VersusApi }) {
  const { state, countdownMs } = api;
  const n = Math.max(1, Math.ceil(countdownMs / 1000));
  const frac = 1 - countdownMs / COUNTDOWN_MS;

  return (
    <div className="vs-sheet vs-count">
      <span className="eyebrow">
        {state.plan.length} rounds · {MODES[state.draft.mode].label}
      </span>
      <div className="vs-count-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="track" cx="50" cy="50" r="44" />
          <circle
            className="fill"
            cx="50" cy="50" r="44"
            style={{ strokeDashoffset: 276.5 * (1 - frac) }}
          />
        </svg>
        <b key={n} className="vs-count-n">{n}</b>
      </div>
      <p className="vs-count-vs">
        <span>{state.me.name}</span>
        <i>vs</i>
        <span>{state.them?.name || state.lastOpponent || 'Opponent'}</span>
      </p>
    </div>
  );
}
