/**
 * Reactions: one emoji, sent to the other phone and gone again.
 *
 * They ride the room's Realtime channel as a broadcast, never touching the
 * database — there is nothing to keep. The set is fixed, so what arrives is
 * checked against it and anything else is dropped on the floor.
 */
export const REACTIONS = ['👋', '🔥', '😂', '😱', '😤', '👏'] as const;

export type Emoji = (typeof REACTIONS)[number];

/** How a reaction is named to a screen reader. */
export const REACTION_NAMES: Record<Emoji, string> = {
  '👋': 'Wave', '🔥': 'Fire', '😂': 'Laughing', '😱': 'Shocked', '😤': 'Determined', '👏': 'Applause',
};

export interface Reaction {
  /** The player id of whoever sent it. */
  from: string;
  emoji: Emoji;
}

/** How soon one may follow another from the same phone. */
export const REACT_GAP_MS = 450;

/** How long one floats on screen before it is forgotten. */
export const REACT_TTL_MS = 2400;

export const isEmoji = (v: unknown): v is Emoji =>
  typeof v === 'string' && (REACTIONS as readonly string[]).includes(v);

/** A reaction off the wire, or null for anything that is not one. */
export function parseReaction(v: unknown): Reaction | null {
  if (!v || typeof v !== 'object') return null;
  const { from, emoji } = v as { from?: unknown; emoji?: unknown };
  if (typeof from !== 'string' || !from || from.length > 64 || !isEmoji(emoji)) return null;
  return { from, emoji };
}
