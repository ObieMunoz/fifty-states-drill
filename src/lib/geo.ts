import type { Box, State } from '../types';

/** The full Albers frame the map geometry is drawn in. */
export const VB0: Box = { x: 0, y: 0, w: 975, h: 622 };

export const ASPECT = VB0.w / VB0.h;

export const fullBox = (): Box => ({ ...VB0 });

/** Straight-line distance between two states' label anchors. */
export const dist = (a: State, b: State): number =>
  Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);

/**
 * The smallest viewBox containing every state in `list`, padded and then
 * widened or heightened to the map's aspect ratio.
 *
 * An explicit `padFrac` means "pad proportionally"; the fixed minimum is only a
 * default, and it swamps the frame for a small state like Rhode Island.
 */
export function fitBox(list: State[], padFrac?: number): Box {
  if (!list.length) return fullBox();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of list) {
    x0 = Math.min(x0, s.bb[0]);
    y0 = Math.min(y0, s.bb[1]);
    x1 = Math.max(x1, s.bb[2]);
    y1 = Math.max(y1, s.bb[3]);
  }
  const pf = padFrac == null ? 0.1 : padFrac;
  const fixed = padFrac == null ? 10 : 0;
  const px = (x1 - x0) * pf + fixed;
  const py = (y1 - y0) * pf + fixed;
  x0 -= px; x1 += px; y0 -= py; y1 += py;
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h < ASPECT) {
    const nw = h * ASPECT;
    x0 -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / ASPECT;
    y0 -= (nh - h) / 2;
    h = nh;
  }
  return { x: x0, y: y0, w, h };
}

/** viewBox attribute string, rounded the way the animation writes it. */
export const boxAttr = (b: Box): string =>
  `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}`;

/**
 * The silhouette viewBox for one state on its own, padded by 9% of its longer
 * side. Used by the flashcard and weak-spot thumbnails.
 */
export function shapeBox(s: State): string {
  const w = s.bb[2] - s.bb[0];
  const h = s.bb[3] - s.bb[1];
  const p = Math.max(w, h) * 0.09;
  return `${(s.bb[0] - p).toFixed(1)} ${(s.bb[1] - p).toFixed(1)} ${(w + 2 * p).toFixed(1)} ${(h + 2 * p).toFixed(1)}`;
}
