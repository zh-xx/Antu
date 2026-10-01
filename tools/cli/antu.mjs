// ============================================================
//  tools/cli/antu.mjs — the command line in the agent skill (skills/antu/scripts/antu.mjs)
//
//  For an agent that has Node but not the MCP server: the same validation and geometry report, in the same
//  words, and the page made from the viewer beside it. It is bundled into one file (vite.cli.config.js, run
//  by tools/build-skill.mjs), so it needs no `npm install`, no repository and no network.
//
//    node antu.mjs validate spec.json
//    node antu.mjs layout spec.json [--orientation vertical|horizontal]
//    node antu.mjs render spec.json [-o diagram.html]     validates first, and refuses a diagram with problems
//    node antu.mjs --version
//
//  Exit code: 0 done, 1 the diagram has problems (or no geometry yet), 2 the command itself was wrong.
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { layoutMessage, notesOf, validate, validationMessage } from '../lib/report.mjs'
import { fillViewer } from '../lib/fill.mjs'

// set by the bundler (vite.cli.config.js); a run from the source has none
// eslint-disable-next-line no-undef
const VERSION = typeof __ANTU_VERSION__ === 'undefined' ? 'dev' : __ANTU_VERSION__

const USAGE = `Antu ${VERSION}: check and draw an Antu diagram (JSON)

  node antu.mjs validate <spec.json>                       is the JSON valid? (each problem, with its field path)
  node antu.mjs layout   <spec.json> [--orientation vertical|horizontal]
                                                           how big is the picture, which orientation fits
  node antu.mjs render   <spec.json> [-o <out.html>]       validate, then write the page
  node antu.mjs --version
`

const say = (text) => process.stdout.write(`${text}\n`)
const fail = (text, code = 1) => {
  process.stderr.write(`${text}\n`)
  process.exit(code)
}

function readSpec(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    return fail(`cannot read ${file}: ${e.message}`, 2)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    return fail(`${file} is not valid JSON: ${e.message}`, 2)
  }
}

function main(argv) {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') return say(USAGE)
  if (command === '--version' || command === '-v') return say(`antu ${VERSION}`)
  if (!['validate', 'layout', 'render'].includes(command)) return fail(`unknown command "${command}"\n\n${USAGE}`, 2)

  const file = rest.find((a, i) => !a.startsWith('-') && !['-o', '--out', '--orientation'].includes(rest[i - 1]))
  if (!file) return fail(`${command}: which JSON file?\n\n${USAGE}`, 2)
  const option = (...names) => {
    const i = rest.findIndex((a) => names.includes(a))
    return i >= 0 ? rest[i + 1] : undefined
  }
  const spec = readSpec(file)

  if (command === 'validate') {
    const m = validationMessage(spec)
    if (m.ok) say(m.text)
    else fail(m.text)
    return
  }

  if (command === 'layout') {
    const orientation = option('--orientation')
    if (orientation && !['vertical', 'horizontal'].includes(orientation)) return fail('--orientation is vertical or horizontal', 2)
    const m = layoutMessage(spec, { orientation })
    if (m.ok) say(m.text)
    else fail(m.text)
    return
  }

  // render
  const errors = validate(spec)
  if (errors.length) return fail(validationMessage(spec).text)
  const viewerPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'viewer.html')
  let viewer
  try {
    viewer = readFileSync(viewerPath, 'utf8')
  } catch {
    return fail(`cannot find the viewer page at ${viewerPath}: this file is meant to run from its place in the skill folder (scripts/antu.mjs)`, 2)
  }
  const out = resolve(option('-o', '--out') ?? file.replace(/\.json$/i, '') + '.html')
  writeFileSync(out, fillViewer(viewer, spec))
  say(out)
  // How big the text is on one screen (#43): an agent that only renders still hears whether the reader can read it
  const size = layoutMessage(spec).text.split('\n').filter((l) => /^(Text on one screen|Note: the text|With every issue folded)/.test(l))
  if (size.length) say(`\n${size.join('\n')}`)
  const notes = notesOf(spec)
  if (notes.length) say(`\n${notes.length} note(s), not errors:\n${notes.map((n) => `  - ${n}`).join('\n')}`)
}

main(process.argv.slice(2))
