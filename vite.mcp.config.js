import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The MCP server (tools/mcp/server.mjs) as ONE file for the npm package: every dependency (the MCP SDK, zod, the
// engine's validators, the layout engine ELK) inside it, so `npx` downloads one small package and no tree of
// others. Built by tools/build-npm.mjs into dist-npm/bin/antu-mcp.mjs. __ANTU_PACKAGE__ makes the file read its guides,
// examples and viewer.html from the package root, not from a repository (tools/lib/make-html.mjs).
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  define: { __ANTU_VERSION__: JSON.stringify(version), __ANTU_PACKAGE__: 'true' },
  ssr: { noExternal: true },
  logLevel: 'warn',
  build: {
    ssr: 'tools/mcp/server.mjs',
    outDir: 'dist-mcp',
    emptyOutDir: true,
    target: 'node18',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'antu-mcp.mjs',
        codeSplitting: false,
      },
    },
  },
})
