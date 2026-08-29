import { defineConfig } from 'vite'

// Builds the root preview/demo page (index.html + demo/) as a static site for
// GitHub Pages. The default vite.config.ts is library-mode (dist/); this one is
// an app build. `base: './'` keeps asset URLs relative so the site works under
// the /wryte/ project-page subpath.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    target: 'es2020',
  },
})
