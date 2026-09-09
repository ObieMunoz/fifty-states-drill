// Draws the app icon from the map geometry the app itself ships, then writes
// every size the web, iOS and Android need into public/.
//
//   node scripts/make-icons.mjs
//
// Needs `rsvg-convert` (librsvg) and `magick` (ImageMagick 7) on PATH. Not
// part of the build: the outputs are committed, and this only has to run
// again when the mark changes.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import polygonClipping from 'polygon-clipping';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'public');
const tmp = join(root, 'node_modules', '.icons');
mkdirSync(tmp, { recursive: true });

// Palette: the light theme's tokens (src/styles/tokens.css).
const TILE = '#1C5A56';
const TILE_DEEP = '#123F3C';
const LAND = '#EEF1EA';
const SIGNAL = '#C24E28';

/** The state the drill is "asking for". Missouri sits dead centre. */
const ASK = 'MO';

const { states } = JSON.parse(readFileSync(join(root, 'src/data/states.json'), 'utf8'));
// Alaska and Hawaii are insets on the real map; on an icon they are noise.
const lower48 = states.filter((s) => s.a !== 'AK' && s.a !== 'HI');

/** Each `M…Z` subpath of a state becomes one ring. No state has holes. */
function rings(d) {
  return d.split('M').filter(Boolean).map((sub) =>
    sub.replace(/Z\s*$/, '').split('L').map((pt) => pt.split(',').map(Number)),
  );
}

/** Ramer–Douglas–Peucker, so the outline carries no more points than the size needs. */
function simplify(ring, tol) {
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
const mainland = union.map((poly) => poly[0]).sort((a, b) => area(b) - area(a))[0];

let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const [x, y] of mainland) {
  if (x < x0) x0 = x; if (x > x1) x1 = x;
  if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const bw = x1 - x0, bh = y1 - y0;

const pathOf = (ring) => 'M' + ring.map(([x, y]) => `${+x.toFixed(1)},${+y.toFixed(1)}`).join('L') + 'Z';

/**
 * One rendition of the mark in a 512-unit box.
 *   mapFrac  width of the map as a fraction of the box
 *   corner   corner radius of the tile; 0 for a full-bleed square
 *   tol      simplification tolerance in map units
 */
function mark({ mapFrac, corner, tol = 0.6 }) {
  const S = 512;
  const k = (S * mapFrac) / bw;
  const tx = (S - bw * k) / 2 - x0 * k;
  const ty = (S - bh * k) / 2 - y0 * k;
  const land = pathOf(simplify(mainland, tol));
  const ask = rings(lower48.find((s) => s.a === ASK).d).map((r) => pathOf(simplify(r, tol))).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TILE}"/><stop offset="1" stop-color="${TILE_DEEP}"/></linearGradient></defs>
<rect width="${S}" height="${S}" rx="${corner}" fill="url(#g)"/>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})" stroke-linejoin="round">
<path d="${land}" fill="${LAND}"/>
<path d="${ask}" fill="${SIGNAL}" stroke="${TILE_DEEP}" stroke-width="7" paint-order="stroke"/>
</g>
</svg>
`;
}

// The mark on its own: rounded tile, map filling most of it.
const tile = mark({ mapFrac: 0.78, corner: 114 });
// At tab-icon size the coastline is one or two pixels; a coarser outline reads cleaner.
const fav = mark({ mapFrac: 0.8, corner: 114, tol: 2.5 });
// Full bleed for platforms that cut their own shape (iOS, Android maskable):
// the map stays inside the central safe zone so no corner is lost.
const bleed = mark({ mapFrac: 0.64, corner: 0 });

writeFileSync(join(out, 'logo.svg'), tile);
writeFileSync(join(out, 'favicon.svg'), fav);

function png(svg, size, file) {
  const src = join(tmp, `${size}-${file}.svg`);
  writeFileSync(src, svg);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', join(out, file), src]);
}

png(tile, 192, 'icon-192.png');
png(tile, 512, 'icon-512.png');
png(bleed, 192, 'icon-maskable-192.png');
png(bleed, 512, 'icon-maskable-512.png');
// iOS rounds the corners itself, with a shallower inset than Android's circle.
png(mark({ mapFrac: 0.72, corner: 0 }), 180, 'apple-touch-icon.png');

// Legacy favicon: 16, 32 and 48 px frames in one .ico.
const frames = [16, 32, 48].map((n) => {
  const f = join(tmp, `fav-${n}.png`);
  writeFileSync(join(tmp, 'fav.svg'), fav);
  execFileSync('rsvg-convert', ['-w', String(n), '-h', String(n), '-o', f, join(tmp, 'fav.svg')]);
  return f;
});
execFileSync('magick', [...frames, join(out, 'favicon.ico')]);

rmSync(tmp, { recursive: true, force: true });
console.log('icons written to public/');
