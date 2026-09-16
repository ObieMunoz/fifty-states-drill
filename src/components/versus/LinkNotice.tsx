import type { VersusState } from '../../versus/machine';

/** What the phone is doing about a link it has lost. */
const LOST = 'Connection lost. Trying to reach the room…';

/**
 * Whatever is currently wrong, said once, wherever the player is standing.
 *
 * The room knows when a call has failed or the channel has dropped, and the
 * menu and the waiting screen have always said so. The screens a match is
 * actually played on did not, which left a phone that could no longer reach
 * the server looking exactly like one waiting on a slow opponent.
 *
 * It floats rather than taking a row of its own: the play screen is laid out
 * so that nothing above the map may change height mid-round, or the map moves
 * under a thumb already on its way down.
 */
export function LinkNotice({ state }: { state: VersusState }) {
  const text = state.error ?? (state.link === 'lost' ? LOST : null);
  if (!text) return null;
  return <p className="vs-notice" role="status">{text}</p>;
}
