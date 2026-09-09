import { useState } from 'react';
import { BUILD } from '../../build';
import { joinUrl } from '../../versus/room';
import { QrCode } from './QrCode';
import type { VersusApi } from '../../versus/useVersus';

/**
 * The waiting room: the code, big enough to read across a table, and a QR for
 * the phone that is already in the other person's hand.
 */
export function VersusWaiting({ api }: { api: VersusApi }) {
  const { state } = api;
  const [copied, setCopied] = useState(false);
  const url = joinUrl(state.code);

  const share = async () => {
    // The share sheet is the fastest route on a phone; the clipboard is the
    // fallback on a desktop browser that has no sheet.
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Fifty States Drill', text: `Join my room: ${state.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // The player dismissed the sheet, or the clipboard is unavailable.
    }
  };

  return (
    <div className="vs-sheet vs-wait">
      <header className="vs-top">
        <button type="button" className="vs-back" onClick={api.leave}>← Leave</button>
        <span className="eyebrow">{state.isHost ? 'Your room' : 'Joining'}</span>
      </header>

      {state.isHost ? (
        <>
          <p className="vs-lead">Read this out, or let them scan it.</p>
          <div className="vs-code" aria-label={`Room code ${state.code.split('').join(' ')}`}>
            {state.code.split('').map((ch, i) => (
              <b key={i} className="mono">{ch}</b>
            ))}
          </div>

          <div className="vs-qr-wrap">
            <QrCode text={url} />
          </div>

          <button type="button" className="vs-big" onClick={() => void share()}>
            {copied ? 'Link copied' : 'Share link'}
          </button>
        </>
      ) : (
        <>
          <p className="vs-lead">Looking for room</p>
          <div className="vs-code">
            {state.code.split('').map((ch, i) => (
              <b key={i} className="mono">{ch}</b>
            ))}
          </div>
        </>
      )}

      <div className="vs-searching" role="status">
        <span className="vs-pulse" aria-hidden="true"><i /><i /><i /></span>
        {state.error
          ? <span className="vs-error">{state.error}</span>
          : state.lastOpponent
            ? <span>{state.lastOpponent} left. Waiting for the next player…</span>
            : <span>Waiting for the other player…</span>}
      </div>

      <p className="vs-fine">
        Both phones need to be online for a moment while they find each other. After that the
        game runs directly between them.
        <span className="vs-diag">
          {api.relays === 1 ? '1 relay reachable' : `${api.relays} relays reachable`} · Build {BUILD}
        </span>
      </p>
    </div>
  );
}
