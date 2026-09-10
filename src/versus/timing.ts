/** The clocks both sides and the server agree on. */

/** Ticks down on screen before the first question. */
export const COUNTDOWN_MS = 3000;

/** How long both answers stay up before the next question. */
export const REVEAL_MS = 2600;

/** After this side has answered, how long to wait on a straggling opponent. */
export const GRACE_MS = 1500;

/** Rooms nobody has touched for this long are swept away. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
