// Draws the app icon from the map geometry the app itself ships, then writes
// every size the web, iOS and Android need into public/.
//
//   node scripts/make-icons.mjs
//
// Needs `rsvg-convert` (librsvg) and `magick` (ImageMagick 7) on PATH. Not
// part of the build: the outputs are committed, and this only has to run
// again when the mark changes. The link-preview card is scripts/make-og.mjs.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, bounds, shapes, TILE, TILE_DEEP, LAND, SIGNAL } from './mainland.mjs';

const out = join(root, 'public');
const tmp = join(root, 'node_modules', '.icons');
mkdirSync(tmp, { recursive: true });

const { x0, y0, w: bw, h: bh } = bounds;

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
  const { land, ask } = shapes(tol);
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
