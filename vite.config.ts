import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from the root of its own domain on Vercel. The old GitHub Pages
// address, which needed a path prefix, now only redirects here.
const base = '/';

/** The commit being built: Vercel and Actions each name it their own way. */
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;

/**
 * What the browser needs to listen to the room: the project's address and
 * its publishable key. Both are public by design. Vercel's Supabase
 * integration sets them under its own names, so those are taken when the
 * VITE_ ones are not set — and only these two, by name, so no secret in the
 * build environment can reach the page.
 */
const env = process.env;
const supabaseUrl = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default defineConfig({
  define: {
    // Stamped onto the Versus screens, so two phones can be checked against
    // each other. A local build has no commit to name.
    __BUILD__: JSON.stringify(commit?.slice(0, 7) ?? 'dev'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabaseKey),
  },
  plugins: [
    react(),
    // Installable on iOS, Android and desktop, and usable offline: the map
    // geometry ships in the bundle, so once the shell is cached nothing but
    // Versus needs the network. Icons are drawn by scripts/make-icons.mjs.
    VitePWA({
      // A new build waits until src/pwa.ts says it is safe to reload into it,
      // rather than taking over a match in progress.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'logo.svg'],
      manifest: {
        id: base,
        name: 'Fifty States Drill',
        short_name: '50 States',
        description:
          'Learn all 50 US states on a real map: study modes for location and letter groups, plus quizzes on shapes, capitals, postal codes and borders.',
        lang: 'en',
        display: 'standalone',
        background_color: '#E7EAE4',
        theme_color: '#E7EAE4',
        categories: ['education', 'games'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The link-preview card is fetched by messaging apps' servers, never
        // by the page, so it has no place in the offline shell.
        globIgnores: ['**/node_modules/**/*', 'og.png'],
        runtimeCaching: [
          {
            // The Google Fonts stylesheet changes with browser support, so
            // serve the cached copy and refresh it in the background.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // The font files are content-addressed and effectively immutable.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base,
  build: {
    outDir: 'dist',
    // The state geometry is ~96 kB of path data in one module and will always
    // exceed the default warning limit. Raise it rather than reading the
    // warning as a problem on every build.
    chunkSizeWarningLimit: 700,
  },
});
