import type { CSSProperties } from 'react';
import { REACTIONS, REACTION_NAMES } from '../../versus/reactions';
import type { Emoji } from '../../versus/reactions';
import type { FloatingReaction } from '../../versus/useVersus';

/**
 * The six emoji a player can send, and the emoji in flight on this screen.
 *
 * The tray is the same everywhere it appears; the bubbles are drawn inside
 * whatever box holds the two players — the lobby's cards, the scoreline, the
 * final's totals — and rise from each player's own side of it.
 */
export function ReactionTray({ onReact, small = false }: { onReact: (e: Emoji) => void; small?: boolean }) {
  return (
    <div className={`vs-tray${small ? ' sm' : ''}`} role="group" aria-label="Send a reaction">
      {REACTIONS.map((e) => (
        <button key={e} type="button" onClick={() => onReact(e)} aria-label={REACTION_NAMES[e]}>
          {e}
        </button>
      ))}
    </div>
  );
}

/** A little sideways drift per bubble, so two in a row do not stack. */
const drift = (id: number): number => ((id * 37) % 41) - 20;

export function ReactionBubbles({ reactions, them }: { reactions: FloatingReaction[]; them: string }) {
  const latest = [...reactions].reverse().find((r) => r.from === 'them');
  return (
    <>
      {reactions.length > 0 && (
        <div className="vs-bubbles" aria-hidden="true">
          {reactions.map((r) => (
            <span
              key={r.id}
              className={`vs-bubble ${r.from}`}
              style={{ '--dx': `${drift(r.id)}px` } as CSSProperties}
            >
              {r.emoji}
            </span>
          ))}
        </div>
      )}
      <span className="sr" aria-live="polite">
        {latest ? `${them}: ${REACTION_NAMES[latest.emoji]}` : ''}
      </span>
    </>
  );
}
