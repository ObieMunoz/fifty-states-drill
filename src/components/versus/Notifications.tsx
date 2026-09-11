import { deviceWord } from '../../versus/push';
import type { PushApi } from '../../versus/usePush';

/**
 * The switch for rematch requests. Off by default and never asked for
 * unprompted: the permission dialog only shows once, and a refusal sticks
 * until the phone's own settings undo it, so it is offered with a reason.
 */
export function Notifications({ push }: { push: PushApi }) {
  const { support, status, busy } = push;
  if (support === 'none') return null;
  const here = deviceWord();

  return (
    <section className="vs-board vs-notify">
      <div className="vs-board-head">
        <span className="eyebrow">Rematch requests</span>
        {support === 'ready' && status === 'on' && (
          <button type="button" className="vs-mini" disabled={busy} onClick={push.disable}>
            Turn off
          </button>
        )}
      </div>

      {support === 'install' ? (
        <p className="vs-hint">
          Add this app to your Home Screen — Share, then <b>Add to Home Screen</b> — and friends
          can send you rematch requests.
        </p>
      ) : status === 'blocked' ? (
        <p className="vs-hint">
          {here === 'phone'
            ? 'Notifications are blocked for this app. Turn them on in your phone’s Settings to get rematch requests from friends.'
            : 'Notifications are blocked for this site. Allow them in your browser’s site settings to get rematch requests from friends.'}
        </p>
      ) : status === 'on' ? (
        <p className="vs-hint">Friends can send a rematch request to this {here}.</p>
      ) : (
        <button type="button" className="vs-big" disabled={busy} onClick={push.enable}>
          Turn on notifications
          <small>Friends can send a rematch request to this {here}</small>
        </button>
      )}

      {push.error && <p className="vs-error" role="alert">{push.error}</p>}
    </section>
  );
}
