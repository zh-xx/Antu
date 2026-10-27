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
//    node antu.mjs schema [type] [--json]                 the field table of a type (fact if omitted), as antu_schema
//    node antu.mjs guide [type] [--json]                  how the data becomes the picture, as antu_guide
//    node antu.mjs examples [--type T] [--group G] [--lang L] [name]
//                                                         list the small examples, or fetch one in full, as antu_examples
//    node antu.mjs version [--json]                       the version of this program
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { gunzipSync } from 'node:zlib'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { knowledgeOf } from '../../src/core/registry.js'
import { THEME_IDS, isTheme } from '../../src/theme/themes.js'
import { PAPER_LEVELS, isPaperLevel } from '../../src/core/paper.js'
import { PREVIEW_CHECK, kindProblem, layoutMessage, notesOf, validate, validationMessage } from '../lib/report.mjs'
import { fillViewer } from '../lib/fill.mjs'
import { findChrome, screenshotPage } from '../lib/chrome.mjs'
import { updateNotice, updateNoticeObject } from '../lib/update-notice.mjs'
import { formatVersions, versionsReport } from '../lib/versions.mjs'
import { describeSchema, listExamples, listKnowledgeTypes, readAgentGuide, readExample } from '../mcp/engine.mjs'

// set by the bundler (vite.cli.config.js); a run from the source has none
// eslint-disable-next-line no-undef
const VERSION = typeof __ANTU_VERSION__ === 'undefined' ? 'dev' : __ANTU_VERSION__

const USAGE = `Antu ${VERSION}: check and draw an Antu diagram (JSON)

  node antu.mjs schema   [type] [--json]                   the field table of a type (fact if omitted): what is
                                                           required, of what type, and one line of what it means
  node antu.mjs guide    [type] [--json]                   how the data becomes the picture (the mechanism notes)
  node antu.mjs examples [--type T] [--group agent|real|raw] [--lang en|zh-CN] [name]
                                                           the small examples (start with 1-minimal), or one in full
  node antu.mjs validate <spec.json>                       is the JSON valid? (each problem, with its field path)
  node antu.mjs layout   <spec.json> [--orientation vertical|horizontal] [--kind K] [--paper P]
                                                           how big is the picture, which orientation fits
  node antu.mjs render   <spec.json> [-o <out.html>] [--kind K] [--theme T] [--paper P]
                                                           validate, then write the page (it opens in kind K;
                                                           the reader can still switch)
  node antu.mjs preview  <spec.json> [-o <out.png>] [--orientation vertical|horizontal] [--kind K] [--theme T] [--paper P] [--width 1600] [--height 900]
                                                           validate, make the page, and take a screenshot of it to look at
                                                           (needs Chrome, Edge or Chromium; ANTU_CHROME points at one)
  node antu.mjs version  [--json]                          the version of this program
  node antu.mjs versions [--json]                          the types and the diagrams (the ways of drawing), and the
                                                           version and status of each
  node antu.mjs --version

  schema, guide and examples are the same texts and lists the MCP tools antu_schema, antu_guide and antu_examples
  give. A --json output may carry one small "_notice" object (a newer release, or a skill folder that does not match
  this program); the plain output ends with the same notice as "Notice: ...".

  Once a day the command asks the npm registry for the newest version number and, if there is a newer one, ends with a
  notice. Nothing of the diagram is sent. ANTU_NO_UPDATE_NOTIFIER=1 turns it off.

  --paper P: the sheet the picture is laid out for (issue 123): screen (the default), a4l or a4p — A4 with 12 mm
            margins, which is 1032×703 or 703×1032 CSS px. "layout" then reports the picture and its text size on that
            sheet, and "render" / "preview" open on it. Without the flag nothing changes: the screen of 1600×900.

  --kind K: which way of drawing the same JSON. fact: timeline (the default), chronicle or scale;
            relationship: graph (the default), focus, matrix, equity, authority, related or path;
            procedure: flow (the default) or route.
`

const say = (text) => process.stdout.write(`${text}\n`)
const fail = (text, code = 1) => {
  process.stderr.write(`${text}\n`)
  process.exit(code)
}

// ---- schema / guide / examples: the same reference material the MCP tools give (tools/mcp/engine.mjs) ----

const CLI_FILE = fileURLToPath(import.meta.url)
const TYPES = () => listKnowledgeTypes().map((t) => t.type)

/** The skill folder this file runs from (scripts/ beside SKILL.md), or null from a checkout or the npm package */
function skillFolder() {
  const dir = dirname(CLI_FILE)
  return basename(dir) === 'scripts' && existsSync(join(dir, '..', 'SKILL.md')) ? resolve(dir, '..') : null
}

/** The one non-option argument, skipping the values of options that take one */
function positional(rest, valued) {
  return rest.find((a, i) => !a.startsWith('-') && !valued.includes(rest[i - 1]))
}

/** The value of an option, or undefined */
function optionOf(rest, names) {
  const i = rest.findIndex((a) => names.includes(a))
  return i >= 0 ? rest[i + 1] : undefined
}

/** The type asked for, defaulting to fact as MCP does; an unknown type exits 2 with the list */
function typeOf(rest, valued = ['--type', '--group', '--lang']) {
  const type = optionOf(rest, ['--type']) ?? positional(rest, valued) ?? 'fact'
  if (!TYPES().includes(type)) return fail(`no reference material for type "${type}" yet. Available: ${TYPES().join(', ')}.`, 2)
  return type
}

/** The guide: the repository/package copy first, then references/guide-<type>.md beside the skill */
function guideText(type) {
  const text = readAgentGuide(type)
  if (text) return text
  const dir = skillFolder()
  if (dir) {
    const file = join(dir, 'references', `guide-${type}.md`)
    if (existsSync(file)) return readFileSync(file, 'utf8')
  }
  return null
}

/** One example from a skill folder: examples/<type>-<name>.<lang>.json is the build's flat layout */
function readSkillExample(name, { type: _type, lang }) {
  const dir = join(skillFolder(), 'examples')
  const raw = String(name).replace(/^examples\//, '')
  const bases = raw.includes('/') ? [raw] : [raw, ...TYPES().map((t) => `${t}-${raw}`)]
  const candidates = bases.flatMap((base) => {
    if (base.endsWith('.json')) return [base]
    const langs = lang === 'zh-CN' ? ['zh-CN', 'en'] : ['en', 'zh-CN']
    return [...langs.map((l) => `${base}.${l}.json`), base]
  })
  const root = resolve(dir)
  for (const rel of candidates) {
    const file = resolve(root, rel)
    if (!file.startsWith(`${root}${sep}`)) continue
    if (existsSync(file) && statSync(file).isFile()) return { file: `examples/${rel}`, path: file, text: readFileSync(file, 'utf8') }
  }
  return null
}

/** The small examples in a skill folder, in the same row shape listExamples gives */
function skillExamples({ type, group, lang }) {
  if (group !== 'agent') return []
  const dir = join(skillFolder(), 'examples')
  const zh = lang === 'zh-CN'
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${type}-`) && f.endsWith('.json'))
    .filter((f) => (zh ? f.endsWith('.zh-CN.json') : !f.endsWith('.zh-CN.json')))
    .sort()
    .map((f) => {
      const path = join(dir, f)
      const spec = JSON.parse(readFileSync(path, 'utf8'))
      return {
        file: `examples/${f}`,
        path,
        title: spec.title,
        bytes: statSync(path).size,
        ...(knowledgeOf(spec.type)?.summarize?.(spec) ?? { line: '' }),
      }
    })
}

/** The list, in the words antu_examples uses, so an agent hears the same thing from either side */
function examplesText(rows, { type, group }) {
  if (rows.length === 0 && group === 'agent') return `no small examples for type "${type}" yet. Try --group real.`
  if (rows.length === 0) return `no ${group} examples for type "${type}" here.`
  const head =
    group === 'real'
      ? `Real cases: ${rows.length} (4-8 KB each, for reference, write your data from the default small examples first):`
      : group === 'raw'
        ? `Raw judgments: ${rows.length} (**not examples**, never use them as a template; the source material these examples came from):`
        : `Small examples: ${rows.length} (about 1 KB each, start with 1-minimal):`
  const lines = rows.map((r) => `- ${r.file}  (${(r.bytes / 1024).toFixed(1)} KB)\n    ${r.title}\n    ${r.line ?? ''}`)
  const tail =
    group === 'agent'
      ? '\n\nThere are also real cases (--group real) and source material (--group raw).'
      : '\n\nTo write data, use the default small examples (no arguments).'
  return `${head}\n\n${lines.join('\n')}${tail}`
}

/** One example from a checkout or the npm package, as antu_examples reads it (a bare name is looked for by type) */
function repoExample(name, { type: _type, lang }) {
  const engineLang = lang === 'zh-CN' ? 'zh' : 'en'
  const bare = !String(name).includes('/')
  const one =
    readExample(name, { lang: engineLang }) ??
    (bare ? TYPES().map((t) => readExample(`agent/${t}/${name}`, { lang: engineLang })).find(Boolean) : null)
  return one ? { file: String(name), ...one } : null
}

/** Print JSON, adding the structured notice only when there is one (never `_notice: null`) */
async function printJson(value, notice) {
  const n = notice ? await notice : null
  say(JSON.stringify(n ? { ...value, _notice: n } : value, null, 2))
}

/** The absolute output path, with its folder made if it is not there yet (as the MCP server does) */
function outPath(path) {
  const out = resolve(path)
  try {
    mkdirSync(dirname(out), { recursive: true })
  } catch (e) {
    return fail(`cannot make the folder for ${out}: ${e.message}`, 2)
  }
  return out
}

function readSpec(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    return fail(`cannot read ${file}: ${e.message}`, 2)
  }
  try {
    // a byte-order mark (Windows Notepad writes one) is not part of the JSON
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (e) {
    return fail(`${file} is not valid JSON: ${e.message}`, 2)
  }
}

/**
 * The viewer page beside this file in the skill folder: assets/viewer.html, or assets/viewer.html.gz for a package
 * that has to stay small (WorkBuddy takes a skill of 3 MB at most, and the page alone is 2.3 MB)
 */
function readViewer() {
  const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
  try {
    return readFileSync(join(assets, 'viewer.html'), 'utf8')
  } catch {
    /* not there as plain text: try the compressed one */
  }
  try {
    return gunzipSync(readFileSync(join(assets, 'viewer.html.gz'))).toString('utf8')
  } catch {
    return fail(`cannot find the viewer page at ${join(assets, 'viewer.html')} (or viewer.html.gz): this file is meant to run from its place in the skill folder (scripts/antu.mjs)`, 2)
  }
}

/** The lines of the layout report about text size (#43): an agent that only renders still hears whether it can be read */
function sizeLines(spec, kind, paper) {
  return layoutMessage(spec, { kind, paper }).text.split('\n').filter((l) => /^(Text on one screen|Note: the text|With every issue folded)/.test(l))
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

async function preview(spec, file, option, kind, theme, paper) {
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

  const out = outPath(option('-o', '--out') ?? file.replace(/\.json$/i, '') + '.png')
  const dir = mkdtempSync(join(tmpdir(), 'antu-preview-'))
  try {
    const page = join(dir, 'preview.html')
    const preset =
      orientation || kind || theme || paper
        ? { ...(orientation && { orientation }), ...(kind && { kind }), ...(theme && { theme }), ...(paper && { paper }) }
        : undefined
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
    const lines = sizeLines(spec, kind, paper)
    if (lines.length) say(`\n${lines.join('\n')}`)
  } catch (e) {
    return fail(`no picture could be taken: ${e.message}. Say that you did not see the page.`, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function schema(rest, notice) {
  const type = typeOf(rest)
  const r = describeSchema(type)
  if (!r.ok) return fail(r.reason, 2)
  if (rest.includes('--json')) return printJson({ type, text: r.text }, notice)
  say(r.text)
}

async function guide(rest, notice) {
  const type = typeOf(rest)
  const text = guideText(type)
  if (!text) return fail(`no mechanism notes for type "${type}" yet. Available: ${TYPES().join(', ')}.`, 2)
  if (rest.includes('--json')) return printJson({ type, text }, notice)
  say(text)
}

async function examples(rest, notice) {
  const type = optionOf(rest, ['--type']) ?? 'fact'
  if (!TYPES().includes(type)) return fail(`no examples for type "${type}" yet. Available: ${TYPES().join(', ')}.`, 2)
  const group = optionOf(rest, ['--group']) ?? 'agent'
  if (!['agent', 'real', 'raw'].includes(group)) return fail('--group is agent, real or raw', 2)
  const lang = optionOf(rest, ['--lang']) ?? 'en'
  if (!['en', 'zh-CN'].includes(lang)) return fail('--lang is en or zh-CN', 2)
  const asked = positional(rest, ['--type', '--group', '--lang'])
  const skill = skillFolder()

  if (asked) {
    const one = skill ? readSkillExample(asked, { type, lang }) : repoExample(asked, { type, lang })
    if (!one) return fail(`example not found: ${asked}. Run "examples --type ${type}" to see the list.`, 2)
    if (rest.includes('--json')) return printJson({ file: one.file, text: one.text }, notice)
    return say(`# ${one.file}\n\n\`\`\`json\n${one.text}\n\`\`\``)
  }

  const rows = skill ? skillExamples({ type, group, lang }) : listExamples({ type, group, lang: lang === 'zh-CN' ? 'zh' : 'en' })
  if (rest.includes('--json')) return printJson({ type, group, lang, examples: rows.map(({ path: _path, ...r }) => r) }, notice)
  say(examplesText(rows, { type, group }))
}

async function version(rest, notice) {
  if (rest.includes('--json')) return printJson({ version: VERSION }, notice)
  say(`antu ${VERSION}`)
}

async function run(argv, notice = null) {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h') return say(USAGE)
  if (command === '--version' || command === '-v') return say(`antu ${VERSION}`)
  if (command === 'version') return version(rest, notice)
  if (command === 'schema') return schema(rest, notice)
  if (command === 'guide') return guide(rest, notice)
  if (command === 'examples') return examples(rest, notice)
  if (command === 'versions') {
    const r = versionsReport(VERSION)
    return say(rest.includes('--json') ? JSON.stringify(r, null, 2) : formatVersions(r))
  }
  if (!['validate', 'layout', 'render', 'preview'].includes(command)) return fail(`unknown command "${command}"\n\n${USAGE}`, 2)

  const valued = ['-o', '--out', '--orientation', '--kind', '--theme', '--paper', '--width', '--height']
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

  const paper = option('--paper')
  if (paper !== undefined && !isPaperLevel(paper)) return fail(`--paper: ${PAPER_LEVELS.join(', ')}`, 2)

  if (command === 'validate') {
    const m = validationMessage(spec)
    if (m.ok) say(m.text)
    else fail(m.text)
    return
  }

  if (command === 'layout') {
    const orientation = option('--orientation')
    if (orientation && !['vertical', 'horizontal'].includes(orientation)) return fail('--orientation is vertical or horizontal', 2)
    const m = layoutMessage(spec, { orientation, kind, paper })
    if (m.ok) say(m.text)
    else fail(m.text)
    return
  }

  if (command === 'preview') return preview(spec, file, option, kind, theme, paper)

  // render
  const errors = validate(spec)
  if (errors.length) return fail(validationMessage(spec).text)
  const viewer = readViewer()
  const out = outPath(option('-o', '--out') ?? file.replace(/\.json$/i, '') + '.html')
  const preset =
    kind || theme || paper
      ? { ...(kind && { defaultKind: kind }), ...(theme && { theme }), ...(paper && { paper }) }
      : undefined
  writeFileSync(out, fillViewer(viewer, spec, { preset }))
  say(out)
  const size = sizeLines(spec, kind, paper)
  if (size.length) say(`\n${size.join('\n')}`)
  const notes = notesOf(spec)
  if (notes.length) say(`\n${notes.length} note(s), not errors:\n${notes.map((n) => `  - ${n}`).join('\n')}`)
}

async function main(argv) {
  // asks (at most once a day) whether a newer Antu is out, while the command works; says so at the end of a command that
  // finished (a command that fails exits at once and says nothing of it). tools/lib/update-notice.mjs
  const command = argv[0]
  const json = ['schema', 'guide', 'examples', 'version'].includes(command) && argv.includes('--json')
  const asks = ['validate', 'layout', 'render', 'preview', 'schema', 'guide', 'examples', 'version'].includes(command)
  // a JSON output carries the notice inside itself (_notice); the text output ends with the Notice: lines
  const asking = asks ? (json ? updateNoticeObject({ current: VERSION }) : updateNotice({ current: VERSION })) : null
  await run(argv, json ? asking : null)
  if (!json && asking) {
    const notice = await asking
    if (notice) say(`\n${notice}`)
  }
}

await main(process.argv.slice(2))
