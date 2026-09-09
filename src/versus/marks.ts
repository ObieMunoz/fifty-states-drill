/**
 * How the versus map paints each state.
 *
 * Kept out of the component because the precedence *is* the behaviour: which
 * of "you tapped this", "this is the answer" and "this is outside the hint"
 * wins is the whole of what the map says, and it is worth reading — and
 * testing — on its own.
 */
import type { Abbr, State } from '../types';

/** Everything that decides how one state is painted, in one place. */
export interface MapMarks {
  solo?: Abbr | null;
  highlight?: Abbr | null;
  divisionHint?: string | null;
  picked?: Abbr | null;
  answer?: Abbr | null;
  revealed?: boolean;
}

/** The fill state for one state, as a class list. */
export function stateClass(s: State, m: MapMarks): string {
  if (m.solo) return s.a === m.solo ? 'st solo' : 'st';
  const c = ['st'];
  if (m.revealed) {
    if (s.a === m.answer) c.push('ok');
    else if (s.a === m.picked && m.picked !== m.answer) c.push('bad');
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
