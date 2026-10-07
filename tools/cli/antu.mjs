// ============================================================
//  tools/cli/antu.mjs — the command line in the agent skill (skills/antu/scripts/antu.mjs)
//
//  For an agent that has Node but not the MCP server: the same validation and geometry report, in the same
//  words, and the page made from the viewer beside it. It is bundled into one file (vite.cli.config.js, run
//  by tools/build-skill.mjs), so it needs no `npm install`, no repository and no network.
//
//    node antu.mjs validate spec.json
//    node antu.mjs layout spec.json [--orientation vertical|horizontal] [--kind K]
//    node antu.mjs render spec.json [-o diagram.html] [--kind K] [--theme T]
//                                                         validates first, and refuses a diagram with problems
//    node antu.mjs preview spec.json [-o shot.png]        validates, makes the page, takes a screenshot of it in a
//                                                         headless Chromium-based browser (Chrome, Edge, Chromium)
//    node antu.mjs versions [--json]                      the types and the diagrams, and the version of each
//    node antu.mjs --version
//
//  Exit code: 0 done, 1 the diagram has problems (or no geometry yet), 2 the command itself was wrong,
//  3 no picture could be taken (no browser found, or it failed).
//
//  `preview` lets an agent without the MCP server look at what it drew (#82): the agent reads the PNG with its own
//  tool. On Node 22 and newer it drives the browser through its debugging protocol (tools/lib/chrome.mjs, the code
//  the MCP preview uses), and waits until the diagram has drawn; below 22 Node has no built-in WebSocket, so it asks
//  the browser for a screenshot itself (`--screenshot`), with a time budget for the page to draw.
// ============================================================

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { THEME_IDS, isTheme } from '../../src/theme/themes.js'
import { PREVIEW_CHECK, kindProblem, layoutMessage, notesOf, validate, validationMessage } from '../lib/report.mjs'
import { fillViewer } from '../lib/fill.mjs'
import { findChrome, screenshotPage } from '../lib/chrome.mjs'
import { updateNotice } from '../lib/update-notice.mjs'
import { formatVersions, versionsReport } from '../lib/versions.mjs'

// set by the bundler (vite.cli.config.js); a run from the source has none
// eslint-disable-next-line no-undef
const VERSION = typeof __ANTU_VERSION__ === 'undefined' ? 'dev' : __ANTU_VERSION__

const USAGE = `Antu ${VERSION}: check and draw an Antu diagram (JSON)

  node antu.mjs validate <spec.json>                       is the JSON valid? (each problem, with its field path)
  node antu.mjs layout   <spec.json> [--orientation vertical|horizontal] [--kind K]
                                                           how big is the picture, which orientation fits
  node antu.mjs render   <spec.json> [-o <out.html>] [--kind K] [--theme T]
                                                           validate, then write the page (it opens in kind K;
                                                           the reader can still switch)
  node antu.mjs preview  <spec.json> [-o <out.png>] [--orientation vertical|horizontal] [--kind K] [--theme T] [--width 1600] [--height 900]
                                                           validate, make the page, and take a screenshot of it to look at
                                                           (needs Chrome, Edge or Chromium; ANTU_CHROME points at one)
  node antu.mjs versions [--json]                          the types and the diagrams (the ways of drawing), and the
                                                           version and status of each
  node antu.mjs --version

  Once a day the command asks the npm registry for the newest version number and, if there is a newer one, ends with a
  notice. Nothing of the diagram is sent. ANTU_NO_UPDATE_NOTIFIER=1 turns it off.

  --kind K: which way of drawing the same JSON. fact: timeline (the default), chronicle or scale;
            relationship: graph (the default), focus, chain, matrix, equity, authority, related, path or summary;
            procedure: flow (the default) or route.
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

/** The viewer page beside this file in the skill folder (assets/viewer.html) */
function readViewer() {
  const viewerPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'viewer.html')
  try {
    return readFileSync(viewerPath, 'utf8')
  } catch {
    return fail(`cannot find the viewer page at ${viewerPath}: this file is meant to run from its place in the skill folder (scripts/antu.mjs)`, 2)
  }
}

/** The lines of the layout report about text size (#43): an agent that only renders still hears whether it can be read */
function sizeLines(spec, kind) {
  return layoutMessage(spec, { kind }).text.split('\n').filter((l) => /^(Text on one screen|Note: the text|With every issue folded)/.test(l))
}

const isFile = (p) => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** Ask the browser itself for a screenshot (no debugging protocol): the way for Node below 22, and forced by ANTU_PREVIEW_VIA=flag */
function screenshotByFlag(chrome, page, out, { width, height }) {
  const profile = mkdtempSync(join(tmpdir(), 'antu-preview-profile-'))
  try {
    const r = spawnSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        // the page draws after it loads (the layout runs in script): give it virtual time to finish before the shot
        '--virtual-time-budget=15000',
        `--screenshot=${out}`,
        pathToFileURL(page).href,
      ],
      { encoding: 'utf8', timeout: 90000 },
    )
    if (!isFile(out) || statSync(out).size === 0) {
      const why = (r.error?.message || r.stderr || '').trim().split('\n').slice(-3).join(' / ')
      throw new Error(`the browser wrote no screenshot${why ? ` (${why})` : ''}`)
    }
    return { items: null }
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
}

async function preview(spec, file, option, kind, theme) {
  const orientation = option('--orientation')
  if (orientation && !['vertical', 'horizontal'].includes(orientation)) return fail('--orientation is vertical or horizontal', 2)
  const size = (name, fallback) => {
    const raw = option(name)
    if (raw === undefined) return fallback
    const n = Number(raw)
    return Number.isInteger(n) && n >= 200 && n <= 8000 ? n : fail(`${name} is a whole number of pixels between 200 and 8000`, 2)
  }
  const width = size('--width', 1600)
  const height = size('--height', 900)

  const errors = validate(spec)
  if (errors.length) return fail(validationMessage(spec).text)

  // An ANTU_CHROME that points at nothing is said so, not quietly replaced by another browser
  const explicit = process.env.ANTU_CHROME
  if (explicit && !isFile(explicit)) return fail(`ANTU_CHROME is set to ${explicit}, which is not a file: point it at Chrome, Edge or Chromium`, 3)
  const chrome = findChrome()
  if (!chrome) {
    return fail('no Chromium-based browser found (Chrome, Edge or Chromium), so no picture: install one, or set ANTU_CHROME to it. Say that you did not see the page.', 3)
  }

  const out = resolve(option('-o', '--out') ?? file.replace(/\.json$/i, '') + '.png')
  const dir = mkdtempSync(join(tmpdir(), 'antu-preview-'))
  try {
    const page = join(dir, 'preview.html')
    const preset = orientation || kind || theme ? { ...(orientation && { orientation }), ...(kind && { kind }), ...(theme && { theme }) } : undefined
    writeFileSync(page, fillViewer(readViewer(), spec, { preset }))
    let items = null
    if (typeof WebSocket === 'function' && process.env.ANTU_PREVIEW_VIA !== 'flag') {
      const shot = await screenshotPage(page, { width, height })
      writeFileSync(out, Buffer.from(shot.data, 'base64'))
      items = shot.cards
    } else {
      items = screenshotByFlag(chrome, page, out, { width, height }).items
    }
    say(out)
    say(`\n${width}×${height}${items === null ? '' : `, ${items} item(s) drawn`}. Open the PNG with your own tool and look at it.`)
    // the browser's own screenshot is of the window, which is taller than the page inside it: a strip at the foot stays blank
    if (items === null) say('(Taken with the browser\'s own screenshot, for Node below 22: a strip at the bottom may be blank; that is not the diagram.)')
    if (items === 0) say('No diagram item was drawn: the page may show a list of problems instead. Look at the picture.')
    say(PREVIEW_CHECK)
    const lines = sizeLines(spec, kind)
    if (lines.length) say(`\n${lines.join('\n')}`)
  } catch (e) {
    return fail(`no picture could be taken: ${e.message}. Say that you did not see the page.`, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function run(argv) {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') return say(USAGE)
  if (command === '--version' || command === '-v') return say(`antu ${VERSION}`)
  if (command === 'versions') {
    const r = versionsReport(VERSION)
    return say(rest.includes('--json') ? JSON.stringify(r, null, 2) : formatVersions(r))
  }
  if (!['validate', 'layout', 'render', 'preview'].includes(command)) return fail(`unknown command "${command}"\n\n${USAGE}`, 2)

  const valued = ['-o', '--out', '--orientation', '--kind', '--theme', '--width', '--height']
  const file = rest.find((a, i) => !a.startsWith('-') && !valued.includes(rest[i - 1]))
  if (!file) return fail(`${command}: which JSON file?\n\n${USAGE}`, 2)
  const option = (...names) => {
    const i = rest.findIndex((a) => names.includes(a))
    return i >= 0 ? rest[i + 1] : undefined
  }
  const spec = readSpec(file)
  const kind = option('--kind')
  if (kind !== undefined && command !== 'validate') {
    // Only a valid diagram has a type to ask about; an invalid one is refused below with its problems
    const bad = validate(spec).length ? '' : kindProblem(spec, kind)
    if (bad) return fail(`--kind: ${bad}`, 2)
  }

  const theme = option('--theme')
  if (theme !== undefined && !isTheme(theme)) return fail(`--theme: ${THEME_IDS.join(', ')}`, 2)

  if (command === 'validate') {
    const m = validationMessage(spec)
    if (m.ok) say(m.text)
    else fail(m.text)
    return
  }

  if (command === 'layout') {
    const orientation = option('--orientation')
    if (orientation && !['vertical', 'horizontal'].includes(orientation)) return fail('--orientation is vertical or horizontal', 2)
    const m = layoutMessage(spec, { orientation, kind })
    if (m.ok) say(m.text)
    else fail(m.text)
    return
  }

  if (command === 'preview') return preview(spec, file, option, kind, theme)

  // render
  const errors = validate(spec)
  if (errors.length) return fail(validationMessage(spec).text)
  const viewer = readViewer()
  const out = resolve(option('-o', '--out') ?? file.replace(/\.json$/i, '') + '.html')
  writeFileSync(out, fillViewer(viewer, spec, { preset: kind || theme ? { ...(kind && { defaultKind: kind }), ...(theme && { theme }) } : undefined }))
  say(out)
  const size = sizeLines(spec, kind)
  if (size.length) say(`\n${size.join('\n')}`)
  const notes = notesOf(spec)
  if (notes.length) say(`\n${notes.length} note(s), not errors:\n${notes.map((n) => `  - ${n}`).join('\n')}`)
}

async function main(argv) {
  // asks (at most once a day) whether a newer Antu is out, while the command works; says so at the end of a command that
  // finished (a command that fails exits at once and says nothing of it). tools/lib/update-notice.mjs
  const command = argv[0]
  const asking = ['validate', 'layout', 'render', 'preview'].includes(command) ? updateNotice({ current: VERSION }) : Promise.resolve('')
  await run(argv)
  const notice = await asking
  if (notice) say(`\n${notice}`)
}

await main(process.argv.slice(2))
