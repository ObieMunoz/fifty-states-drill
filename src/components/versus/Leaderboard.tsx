import { useState } from 'react';
import { accuracy, resetBoard } from '../../versus/leaderboard';
import type { LeaderRow } from '../../versus/leaderboard';

/**
 * The house standings, kept on this device.
 *
 * Whoever passes the phone around builds up a record here. It is not a
 * server-backed ranking and does not pretend to be — it is the tally this one
 * browser has seen, and it is one button away from being wiped.
 */
export function Leaderboard({
  rows, highlight, onCleared,
}: {
  rows: LeaderRow[];
  /** Names to mark as the players in the match just finished. */
  highlight?: string[];
  onCleared: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!rows.length) return null;

  const marked = new Set((highlight ?? []).map((n) => n.toLowerCase()));

  return (
    <section className="vs-board">
      <div className="vs-board-head">
        <span className="eyebrow">Standings on this device</span>
        {confirming ? (
          <span className="vs-confirm">
            <button
              type="button"
              className="vs-mini danger"
              onClick={() => { resetBoard(); setConfirming(false); onCleared(); }}
            >
              Clear
            </button>
            <button type="button" className="vs-mini" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="vs-mini" onClick={() => setConfirming(true)}>
            Reset
          </button>
        )}
      </div>

      <ol className="vs-rows">
        {rows.slice(0, 8).map((r, i) => {
          const acc = accuracy(r);
          return (
            <li key={r.name} className={marked.has(r.name.toLowerCase()) ? 'on' : undefined}>
              <b className="vs-rank mono">{i + 1}</b>
              <span className="vs-who">{r.name}</span>
              <span className="vs-wl mono">
                {r.wins}<i>W</i>{r.losses}<i>L</i>{r.draws > 0 && <>{r.draws}<i>D</i></>}
              </span>
              <span className="vs-acc mono">{acc === null ? '—' : `${acc}%`}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
