import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is a GitHub Pages *project* page, served from
// https://obiemunoz.github.io/fifty-states-drill/, so every asset URL needs
// that prefix. `vite dev` and `vite preview` honour it too, which keeps local
// runs on the same paths as production.
export default defineConfig({
  plugins: [react()],
  base: '/fifty-states-drill/',
  build: {
    outDir: 'dist',
    // The state geometry is ~96 kB of path data in one module and will always
    // exceed the default warning limit. Raise it rather than reading the
    // warning as a problem on every build.
    chunkSizeWarningLimit: 700,
  },
});
