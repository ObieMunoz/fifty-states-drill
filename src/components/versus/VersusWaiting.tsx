import { useState } from 'react';
import { BUILD } from '../../build';
import { joinUrl } from '../../versus/room';
import { QrCode } from './QrCode';
import type { InviteOutcome } from '../../versus/machine';
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
          <p className="vs-lead">Joining room</p>
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
          : state.link === 'lost'
            ? <span>Reconnecting…</span>
            : state.lastOpponent
              ? <span>{state.lastOpponent} left. Waiting for the next player…</span>
              : state.invite
                ? state.invite.sent === null
                  ? <span>Pinging {state.invite.name}…</span>
                  : state.invite.sent === 'sent'
                    ? <span>{state.invite.name}’s phone has been pinged. Waiting for them…</span>
                    : <span className="vs-error">{unreached(state.invite.name, state.invite.sent)}</span>
                : state.isHost
                  ? <span>Waiting for the other player…</span>
                  : <span>Taking a seat…</span>}
      </div>

      <p className="vs-fine">
        Both phones need to be online to play. The room lives on the server, so a dropped
        connection or a reload comes straight back to it.
        <span className="vs-diag">Build {BUILD}</span>
      </p>
    </div>
  );
}

/** Why a rematch notification did not go out, in the requester's terms. */
function unreached(name: string, why: InviteOutcome): string {
  switch (why) {
    case 'unconfigured': return 'This server is not set up for notifications yet. Share the link instead.';
    case 'unsubscribed': return `${name} hasn’t turned notifications on. Share the link instead.`;
    default: return `${name}’s phone couldn’t be reached just now. Share the link instead.`;
  }
}
