// ============================================================
//  tools/gen/kind-icons.mjs — write the sketch of every way of drawing as a stand-alone SVG (assets/kinds/<kind>.svg)
//
//  The sketches the page shows in the picker's panel (src/shell/KindIcon.jsx) are the one source. The README shows
//  them, so they are written out from that source, not drawn a second time: `node tools/gen/kind-icons.mjs`
//  writes them, `--check` says whether the committed ones are what the source gives (exit 1 if not).
//  The page's own colours are variables of the shell; a stand-alone file has fixed neutral greys instead.
// ============================================================

import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const OUT = 'assets/kinds'
const INK = '#64748b'
const TINT = '#e2e8f0'
const PAPER = '#ffffff'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { default: KindIcon, SKETCH_KINDS } = await server.ssrLoadModule('/src/shell/KindIcon.jsx')
  const files = {}
  for (const kind of SKETCH_KINDS) {
    const markup = renderToStaticMarkup(createElement(KindIcon, { kind }))
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" ')
      .replace(' class="antu-kindicon"', '')
      .replaceAll('var(--antu-text-3)', INK)
      .replaceAll('var(--antu-line)', TINT)
      .replaceAll('var(--antu-bg, #fff)', PAPER)
    files[join(OUT, `${kind}.svg`)] = markup + '\n'
  }
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([f, text]) => !existsSync(f) || readFileSync(f, 'utf8') !== text).map(([f]) => f)
    if (stale.length) {
      process.stderr.write(`out of date (run node tools/gen/kind-icons.mjs): ${stale.join(', ')}\n`)
      process.exitCode = 1
    }
  } else {
    mkdirSync(OUT, { recursive: true })
    for (const [f, text] of Object.entries(files)) writeFileSync(f, text)
    process.stdout.write(`${Object.keys(files).length} sketches written to ${OUT}\n`)
  }
} finally {
  await server.close()
}
