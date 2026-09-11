import { useState } from 'react';
import { agoLabel } from '../../versus/friends';
import type { Friend } from '../../versus/friends';

/**
 * The friends list: opponents this device chose to keep, each one tap from
 * a rematch request and two from gone.
 */
export function Friends({
  friends, canAsk, onAsk, onRemove,
}: {
  friends: Friend[];
  /** False until the player has a name to send with the request. */
  canAsk: boolean;
  onAsk: (friend: Friend) => void;
  onRemove: (id: string) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  if (!friends.length) return null;

  return (
    <section className="vs-board vs-friends">
      <div className="vs-board-head">
        <span className="eyebrow">Friends</span>
      </div>
      <ul className="vs-rows">
        {friends.map((f) => (
          <li key={f.id} className={removing === f.id ? 'asking' : undefined}>
            {removing === f.id ? (
              // The whole row becomes the question, so there is no mistaking
              // what the next tap does.
              <div className="vs-sure" role="alertdialog" aria-label={`Remove ${f.name}?`}>
                <p>
                  <b>Remove {f.name}?</b>
                  <span>Neither of you can send the other a rematch request until you play again.</span>
                </p>
                <span className="vs-confirm">
                  <button
                    type="button"
                    className="vs-mini danger"
                    onClick={() => { setRemoving(null); onRemove(f.id); }}
                  >
                    Yes, remove
                  </button>
                  <button type="button" className="vs-mini" onClick={() => setRemoving(null)}>
                    Keep
                  </button>
                </span>
              </div>
            ) : (
              <>
                <span className="vs-who">
                  {f.name}
                  <small>Played {agoLabel(f.last)}</small>
                </span>
                <span className="vs-confirm">
                  <button
                    type="button"
                    className="vs-mini primary"
                    disabled={!canAsk}
                    onClick={() => onAsk(f)}
                  >
                    Rematch
                  </button>
                  <button
                    type="button"
                    className="vs-mini"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setRemoving(f.id)}
                  >
                    Remove
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="vs-hint">
        Rematch opens a room and sends them a notification. Removing someone means neither of
        you can notify the other until you play again.
      </p>
    </section>
  );
}
