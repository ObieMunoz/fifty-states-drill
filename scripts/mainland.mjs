// The mainland outline the icon and the link-preview card are drawn from,
// derived from the map geometry the app itself ships.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import polygonClipping from 'polygon-clipping';

export const root = fileURLToPath(new URL('..', import.meta.url));

// Palette: the light theme's tokens (src/styles/tokens.css).
export const TILE = '#1C5A56';
export const TILE_DEEP = '#123F3C';
export const LAND = '#EEF1EA';
export const SIGNAL = '#C24E28';

/** The state the drill is "asking for". Missouri sits dead centre. */
export const ASK = 'MO';

const { states } = JSON.parse(readFileSync(join(root, 'src/data/states.json'), 'utf8'));
// Alaska and Hawaii are insets on the real map; on an icon they are noise.
const lower48 = states.filter((s) => s.a !== 'AK' && s.a !== 'HI');

/** Each `M…Z` subpath of a state becomes one ring. No state has holes. */
export function rings(d) {
  return d.split('M').filter(Boolean).map((sub) =>
    sub.replace(/Z\s*$/, '').split('L').map((pt) => pt.split(',').map(Number)),
  );
}

/** Ramer–Douglas–Peucker, so the outline carries no more points than the size needs. */
export function simplify(ring, tol) {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  const last = ring.length - 1;
  keep[0] = keep[last] = 1;
  // The rings are closed, so the first and last points coincide and the
  // usual single segment has no length. Anchor on the point farthest from the
  // start and work the two halves.
  let far = 0, at = 1;
  for (let i = 1; i < last; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > far) { far = d; at = i; }
  }
  keep[at] = 1;
  const stack = [[0, at], [at, last]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a], [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const dist = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (dist > far) { far = dist; at = i; }
    }
    if (far > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}

const area = (ring) => {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x, y] = ring[i], [nx, ny] = ring[(i + 1) % n];
    a += x * ny - nx * y;
  }
  return Math.abs(a) / 2;
};

// One outline for the whole mainland. Drawing the 48 states over each other
// leaves hairline seams once the icon is small, and the islands (Long Island,
// the Keys, the San Juans) are specks at any icon size, so only the largest
// polygon of the union survives.
const union = polygonClipping.union(...lower48.map((s) => rings(s.d).map((r) => [r])));
export const mainland = union.map((poly) => poly[0]).sort((a, b) => area(b) - area(a))[0];

let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of mainland) {
  if (x < x0) x0 = x; if (x > x1) x1 = x;
  if (y < y0) y0 = y; if (y > y1) y1 = y;
}
/** The mainland's bounding box in map units. */
export const bounds = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };

export const pathOf = (ring) => 'M' + ring.map(([x, y]) => `${+x.toFixed(1)},${+y.toFixed(1)}`).join('L') + 'Z';

/**
 * The two paths of the mark, simplified to `tol` map units: the mainland in
 * one piece, and the state being asked for on top of it.
 */
export function shapes(tol) {
  const land = pathOf(simplify(mainland, tol));
  const ask = rings(lower48.find((s) => s.a === ASK).d).map((r) => pathOf(simplify(r, tol))).join('');
  return { land, ask };
}
