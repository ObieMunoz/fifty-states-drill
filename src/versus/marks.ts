/**
 * How the versus map paints each state.
 *
 * Kept out of the component because the precedence *is* the behaviour: which
 * of "you tapped this", "this is the answer" and "this is outside the hint"
 * wins is the whole of what the map says, and it is worth reading — and
 * testing — on its own.
 */
import { BY } from '../data/states';
import type { Abbr, State } from '../types';
import type { PlayerColor } from './types';

/** Everything that decides how one state is painted, in one place. */
export interface MapMarks {
  solo?: Abbr | null;
  highlight?: Abbr | null;
  divisionHint?: string | null;
  /** This player's own tap. */
  picked?: Abbr | null;
  /** The opponent's tap. Painted only once revealed: before that it is theirs alone. */
  theirPick?: Abbr | null;
  answer?: Abbr | null;
  revealed?: boolean;
}

/** The fill state for one state, as a class list. */
export function stateClass(s: State, m: MapMarks): string {
  if (m.solo) return s.a === m.solo ? 'st solo' : 'st';
  const c = ['st'];
  if (m.revealed) {
    // Fill says right or wrong; the pins say whose. Either side's miss is
    // painted, so a state both got wrong reads wrong once, not twice.
    if (s.a === m.answer) c.push('ok');
    else if (s.a === m.picked || s.a === m.theirPick) c.push('bad');
  } else if (s.a === m.picked) {
    // Your own tap, held on screen until the round is graded. It is local: the
    // opponent renders their own pick from their own answer, never this one.
    // The neutral selection colour says what you chose without saying whether
    // it was right, which is the reveal's job.
    c.push('pick');
  } else if (s.a === m.highlight) {
    c.push('target');
  }
  // Guided dims everything outside the target's division while live — but
  // never the state you just tapped, which has to stay legible.
  if (!m.revealed && m.divisionHint && s.div !== m.divisionHint && s.a !== m.picked) c.push('mute');
  return c.join(' ');
}

/** One marker on the map: whose tap, and where to draw it. */
export interface Pin {
  abbr: Abbr;
  color: PlayerColor;
  /** Map units; the anchor point, nudged apart when both tapped the same state. */
  x: number;
  y: number;
}

/** How far two pins on the same state sit from its anchor, in map units. */
const PIN_APART = 9;

/**
 * Where to put each player's marker at the reveal.
 *
 * Nothing before the reveal: the opponent's tap is theirs until the round is
 * graded, and this side's own is already the filled state. Two taps on one
 * state sit side by side rather than one hiding the other.
 */
export function pinsFor(
  m: MapMarks, colors: { mine: PlayerColor; theirs: PlayerColor },
): Pin[] {
  if (!m.revealed) return [];
  const taps: { abbr: Abbr; color: PlayerColor }[] = [];
  if (m.picked) taps.push({ abbr: m.picked, color: colors.mine });
  if (m.theirPick) taps.push({ abbr: m.theirPick, color: colors.theirs });
  const shared = taps.length === 2 && taps[0].abbr === taps[1].abbr;
  return taps.flatMap((t, i) => {
    const s = BY[t.abbr];
    if (!s) return [];
    const dx = shared ? (i === 0 ? -PIN_APART : PIN_APART) : 0;
    return [{ abbr: t.abbr, color: t.color, x: s.c[0] + dx, y: s.c[1] }];
  });
}
