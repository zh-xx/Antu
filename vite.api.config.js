import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// `@zh-xx/antu/validate` and `@zh-xx/antu/html` (issue #152, spec/embed.md): the two entries for a host's own
// code, as Node ES modules with every dependency inside (the validators, ELK), so the package needs no tree of
// others. Built by tools/build-npm.mjs into dist-npm/lib/. __ANTU_PACKAGE__ makes `html` read the viewer
// template from the package root (tools/lib/make-html.mjs), as the MCP server does.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  define: { __ANTU_VERSION__: JSON.stringify(version), __ANTU_PACKAGE__: 'true' },
  ssr: { noExternal: true },
  logLevel: 'warn',
  build: {
    ssr: true,
    outDir: 'dist-api',
    emptyOutDir: true,
    target: 'node18',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: { validate: 'tools/api/validate.mjs', html: 'tools/api/html.mjs' },
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
})
