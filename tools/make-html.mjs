#!/usr/bin/env node
// ============================================================
//  tools/make-html.mjs —— turn one spec JSON into one self-contained HTML
//
//  The product is a single .html file: double-click to open, no server, no network,
//  works offline. The engine (JS + CSS) and the data (JSON) are all inlined in that one
//  file, so sending it to someone, archiving it, or attaching it to an email all work.
//
//  Usage:
//    node tools/make-html.mjs <spec.json> [-o output.html] [--rebuild]
//    npm run diagram -- examples/xxx.json
//
//  It rebuilds automatically when the engine sources have changed; --rebuild forces a
//  rebuild. Without -o, the output goes next to the input with the same name and an
//  .html suffix.
//
//  The real generation logic is in tools/lib/make-html.mjs; the MCP server calls the
//  same one.
// ============================================================

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { renderToFile, REPO } from './lib/make-html.mjs'

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
  console.log('Usage: node tools/make-html.mjs <spec.json> [-o output.html] [--rebuild]')
  process.exit(argv.length === 0 ? 1 : 0)
}

const specPath = resolve(argv[0])
const oi = argv.findIndex((a) => a === '-o' || a === '--out')
const outPath =
  oi >= 0 && argv[oi + 1]
    ? resolve(argv[oi + 1])
    : join(dirname(specPath), basename(specPath).replace(/\.json$/i, '') + '.html')
const force = argv.includes('--rebuild')

if (!existsSync(specPath)) {
  console.error('Spec file not found: ' + specPath)
  process.exit(1)
}

let spec
try {
  spec = JSON.parse(readFileSync(specPath, 'utf8'))
} catch (e) {
  console.error('Spec file is not valid JSON: ' + e.message)
  process.exit(1)
}

const kb = (p) => Math.round(statSync(p).size / 1024) + ' KB'

const { path, bytes } = renderToFile(spec, { outPath, force })

console.log(`Generated ${path}`)
console.log(
  `  data ${kb(specPath)}  engine ${kb(join(REPO, 'dist-engine/engine.js'))} + ` +
    `${kb(join(REPO, 'dist-engine/engine.css'))}  output ${Math.round(bytes / 1024)} KB`,
)
console.log('  Double-click to open; no server needed, works offline')
