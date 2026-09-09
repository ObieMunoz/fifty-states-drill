/**
 * Which build this is, for the fine print on the Versus screens.
 *
 * Two phones on different builds is the first thing to rule out when a match
 * will not connect, and there was no way to tell from the screen. The
 * deploy workflow sets it to the commit; a local run reads `dev`.
 */
export const BUILD: string = __BUILD__;
