// Draws the link-preview card — what iMessage, Slack, X and the like show
// under a link to the app — and writes it to public/og.png.
//
//   node scripts/make-og.mjs
//
// Needs `rsvg-convert` (librsvg) on PATH, and the network the first time, to
// fetch the two typefaces the app uses from Google Fonts. Not part of the
// build: the output is committed, and this only has to run again when the
// card changes. The icon set is scripts/make-icons.mjs.
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { root, bounds, shapes, TILE, TILE_DEEP, LAND, SIGNAL } from './mainland.mjs';

const out = join(root, 'public', 'og.png');
const tmp = join(root, 'node_modules', '.og');
const fontDir = join(tmp, 'fonts');
mkdirSync(fontDir, { recursive: true });

// The card is drawn on the 1200 × 630 canvas every preview renderer agrees
// on, and written at twice that. Messages on iOS draws a link's image
// full-width only when it is large enough — about 2400 pixels across — and
// shows a small thumbnail beside the title otherwise; the other renderers
// simply scale it down, and phones get a sharper card into the bargain.
const W = 1200, H = 630;
const SCALE = 2;

/**
 * Google Fonts serves a different format per browser, and a bare, unknown
 * user agent gets plain TTFs, which fontconfig reads. The cuts the card
 * uses: the display serif for the title and the sans for the rest.
 */
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=IBM+Plex+Sans:wght@400;500&display=swap';

async function fetchFonts() {
  if (existsSync(join(fontDir, 'ready'))) return;
  const css = await (await fetch(FONTS, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf/g) ?? [])];
  if (urls.length === 0) throw new Error('Google Fonts returned no TTF files; check the network.');
  await Promise.all(urls.map(async (url, i) => {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(join(fontDir, `${i}.ttf`), buf);
  }));
  writeFileSync(join(fontDir, 'ready'), '');
}

// Messages crops the card towards square on a phone, so the wordmark and the
// map keep clear of both edges: nothing that matters lives in the outer
// tenth on either side.
const M = 120;

// The map, sized to the right-hand third of the card and centred there.
const { x0, y0, w: bw, h: bh } = bounds;
const mapW = 460;
const k = mapW / bw;
const mapX = W - mapW - M;
const mapY = (H - bh * k) / 2;
const { land, ask } = shapes(0.5);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TILE}"/><stop offset="1" stop-color="${TILE_DEEP}"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<g transform="translate(${(mapX - x0 * k).toFixed(2)} ${(mapY - y0 * k).toFixed(2)}) scale(${k.toFixed(5)})" stroke-linejoin="round">
<path d="${land}" fill="${LAND}"/>
<path d="${ask}" fill="${SIGNAL}" stroke="${TILE_DEEP}" stroke-width="5" paint-order="stroke"/>
</g>
<g font-family="Fraunces" font-weight="700" fill="${LAND}">
<text x="${M}" y="262" font-size="80">Fifty States</text>
<text x="${M}" y="348" font-size="80">Drill</text>
</g>
<g font-family="IBM Plex Sans" font-weight="400" fill="#B4C7BF" font-size="30">
<text x="${M}" y="418">Learn all 50 states on a real map,</text>
<text x="${M}" y="460">then race a friend in Versus.</text>
</g>
<text x="${M}" y="556" font-family="IBM Plex Sans" font-weight="500" font-size="22" fill="#75A39B" letter-spacing="1">fifty-states-drill.vercel.app</text>
</svg>
`;

await fetchFonts();

// Homebrew's pango draws through CoreText on macOS and would never see these
// files; a private fontconfig and the fontconfig backend make it use them.
const conf = join(tmp, 'fonts.conf');
writeFileSync(conf, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${fontDir}</dir><cachedir>${join(tmp, 'fc-cache')}</cachedir></fontconfig>
`);
const src = join(tmp, 'og.svg');
writeFileSync(src, svg);
execFileSync('rsvg-convert', ['-w', String(W * SCALE), '-h', String(H * SCALE), '-o', out, src], {
  env: { ...process.env, FONTCONFIG_FILE: conf, PANGOCAIRO_BACKEND: 'fontconfig' },
});
rmSync(join(tmp, 'fc-cache'), { recursive: true, force: true });
console.log(`card written to public/og.png at ${W * SCALE} × ${H * SCALE}`);
