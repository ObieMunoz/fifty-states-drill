import { useEffect } from 'react';
import { MODES } from '../../data/modes';
import { seriesOf } from '../../versus/machine';
import { haptic } from '../../versus/haptics';
import { play } from '../../versus/sound';
import { COUNTDOWN_MS } from '../../versus/timing';
import { colorOf } from '../../versus/types';
import type { VersusApi } from '../../versus/useVersus';

/** Three, two, one. Big enough to read from across a table, with a tick each. */
export function VersusCountdown({ api }: { api: VersusApi }) {
  const { state, countdownMs } = api;
  const n = Math.max(1, Math.ceil(countdownMs / 1000));
  const frac = 1 - countdownMs / COUNTDOWN_MS;
  const series = seriesOf(state);

  useEffect(() => { play('tick'); haptic('tick'); }, [n]);

  return (
    <div className="vs-sheet vs-count">
      <span className="eyebrow">
        {series.played > 0 ? `Match ${series.played + 1} · ` : ''}
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
        <span data-pc={state.me.color}>{state.me.name}</span>
        <i>vs</i>
        <span data-pc={state.them?.color ?? colorOf(!state.isHost)}>
          {state.them?.name || state.lastOpponent || 'Opponent'}
        </span>
      </p>
      {series.played > 0 && (
        <p className="vs-count-series">
          {series.wins > series.losses ? `You lead ${series.wins}–${series.losses}`
            : series.losses > series.wins ? `${state.them?.name || state.lastOpponent || 'They'} lead${state.them ? 's' : ''} ${series.losses}–${series.wins}`
              : `Level at ${series.wins}–${series.losses}`}
        </p>
      )}
    </div>
  );
}
