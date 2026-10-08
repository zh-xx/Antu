import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `@zh-xx/antu/embed`: `mount` and `validate` for a host's own page (issue #152, spec/embed.md)
//
// ONE ES module, everything inside: React, React Flow, ELK and the stylesheet (as text, for the shadow root).
// React is not a peer dependency on purpose: the host's framework and React version must not matter.
// Built by tools/build-npm.mjs into dist-npm/embed/antu-embed.js; `npm run build:embed` builds it alone.
export default defineConfig({
  plugins: [react()],
  // library mode leaves process.env alone; React reads it to pick its production build
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  logLevel: 'warn',
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: {
      entry: 'src/embed/index.js',
      formats: ['es'],
      fileName: () => 'antu-embed.js',
    },
    rollupOptions: {
      output: { codeSplitting: false },
    },
  },
})
