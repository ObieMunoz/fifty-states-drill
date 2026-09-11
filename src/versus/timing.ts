/** The clocks both sides and the server agree on. */

/** Ticks down on screen before the first question. */
export const COUNTDOWN_MS = 3000;

/**
 * How long both answers stay up before the next question: enough for the
 * verdict, the round's banner and the totals moving to land one after
 * another, and still short enough that ten rounds feel like a sprint.
 */
export const REVEAL_MS = 3200;

/** After this side has answered, how long to wait on a straggling opponent. */
export const GRACE_MS = 1500;

/** Rooms nobody has touched for this long are swept away. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/** Once a rematch request has gone to someone, how long before another may. */
export const REMATCH_COOLDOWN_MS = 60 * 1000;

/** How long a rematch notification waits for a phone that is off the network. */
export const REMATCH_TTL_MS = 30 * 60 * 1000;

/** Two players who have not met for this long may no longer ping each other. */
export const PAIRING_TTL_MS = 90 * 24 * 60 * 60 * 1000;
