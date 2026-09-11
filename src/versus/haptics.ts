import { isApple } from '../install';

/**
 * A buzz under the thumb, where the phone can give one.
 *
 * Android has the Vibration API, and each cue here is a pattern for it. An
 * iPhone has no such API at all; what it does have, from Safari 17.4, is the
 * system's own light tap whenever a switch is toggled — by a finger, or by
 * script from inside a tap. So on an iPhone the moments a finger starts,
 * like locking an answer in, get a tick, and the moments nobody's finger
 * starts, like the reveal, stay silent. Nothing here throws anywhere.
 */
export type Haptic =
  | 'tap' | 'tick' | 'right' | 'wrong' | 'miss' | 'streak' | 'react' | 'join'
  | 'win' | 'loss' | 'draw';

const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 12,
  tick: 6,
  right: 18,
  wrong: [0, 35, 55, 35],
  miss: 30,
  streak: [0, 14, 40, 14, 40, 22],
  react: 8,
  join: 10,
  win: [0, 40, 60, 40, 60, 90],
  loss: [0, 70],
  draw: [0, 30, 60, 30],
};

let toggle: HTMLInputElement | null | undefined;

/** The hidden switch an iPhone taps for us, made once. */
function iosSwitch(): HTMLInputElement | null {
  if (toggle !== undefined) return toggle;
  if (typeof document === 'undefined' || !isApple()) return (toggle = null);
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.setAttribute('switch', '');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  el.style.cssText = 'position:fixed;left:-20px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(el);
  return (toggle = el);
}

export function haptic(kind: Haptic): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(PATTERNS[kind]);
    } catch {
      // Refused: not from a gesture, or not allowed here.
    }
    return;
  }
  iosSwitch()?.click();
}
