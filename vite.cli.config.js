import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The command line in the agent skill (tools/cli/antu.mjs) as ONE file: Node ES module, every dependency (the
// engine's validators, the layout engine ELK) inside it, so it runs with nothing installed beside it. Built by
// tools/build-skill.mjs into skills/antu/scripts/antu.mjs.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  // __ANTU_PACKAGE__ makes the files this bundle reads (guides, examples) resolve from one level up: the skill
  // folder beside scripts/, the npm package root beside bin/, or the repository root beside dist-cli/.
  define: { __ANTU_VERSION__: JSON.stringify(version), __ANTU_PACKAGE__: 'true' },
  ssr: { noExternal: true },
  logLevel: 'warn',
  build: {
    ssr: 'tools/cli/antu.mjs',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node18',
    sourcemap: false,
    minify: true,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'antu.mjs',
        codeSplitting: false,
        // the stamp tools/build-skill.mjs --check looks for
        banner: `#!/usr/bin/env node\n// antu-cli ${version}`,
      },
    },
  },
})
