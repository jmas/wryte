import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      external: [/^prosemirror-/, /^node:/],
    },
  },
  plugins: [dts({ include: ['src'] })],
})
