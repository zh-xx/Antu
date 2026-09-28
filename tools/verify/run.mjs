#!/usr/bin/env node
// ============================================================
//  tools/verify/run.mjs — verify everything with one command
//
//  How this project used to verify: after each change, write a CDP script on the
//  spot in /tmp and throw it away. The same code was written about twenty times
//  (see known-issues item 1). It now lives here, one command runs it all, and a
//  failure exits non-zero.
//
//  Usage:
//    node tools/verify/run.mjs              all checks
//    node tools/verify/run.mjs --no-browser skip the checks that need a browser (fast)
//    node tools/verify/run.mjs --shot-only  produce one image only
//
//  What it checks:
//    1. build        dev build and engine build both pass
//    2. lint         static checks (undefined variables, dead variables)
//    3. data         every example validates; every view × direction lays out;
//                    the validation errors themselves match
//    4. browser lookup  ANTU_CHROME wins, a wrong value does not get returned blindly; a
//                    failed launch explains itself; the three attempts each own their port
//                    and profile (no browser needed, so this is in verify:fast)
//    5. render       open the generated HTML over file:// and assert card count / size /
//                    zoom / position, with zero external requests
//    6. export       clicking export really lands a PNG; size = (content + padding) × 2;
//                    it is not a blank image; padding on all four sides; arrow at the axis end
//    7. MCP          the bundled client walks all twelve steps
//    8. screenshot   produce one image for a human to glance at (not machine-judged, but viewable)
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { REPO, renderToFile } from '../lib/make-html.mjs'
import { launchBrowser, findChrome } from '../lib/chrome.mjs'
// The knowledge of every major type must be registered first (plain JS), otherwise
// validateSpec finds nothing in the table and silently returns "pass". This trap really
// happened: after moving files, this line was forgotten, bad data was not stopped, and
// the verifier itself caught it.
import '../../src/renderers/index.js'
import { validateSpec } from '../../src/core/validate.js'
import { en, zh } from '../../src/core/messages/index.js'
import { FACT_FIELDS } from '../../src/renderers/fact/schema.js'
import { readExample, listExamples, listAgentGuides, describeSchema, layoutReport, formatLayoutReport,
  readAgentGuide,
} from '../mcp/engine.mjs'
import { listKnowledgeTypes, layoutOf, layoutKindsOf } from '../../src/core/registry.js'
import { CELL_W, ARROW_EXTENT } from '../../src/renderers/fact/timeline/metrics.js'
import { EXPORT_PAD, exportFrame } from '../../src/shell/exportPng.js'
import { viewsOf } from '../../src/renderers/fact/timeline/grid.js'
import { buildFactGraph } from '../../src/renderers/fact/timeline/layout.js'
import { buildProcedureGraph } from '../../src/renderers/procedure/flow/layout.js'
import { sizeOf } from '../../src/renderers/procedure/flow/metrics.js'

const argv = process.argv.slice(2)
const skipBrowser = argv.includes('--no-browser')
const shotOnly = argv.includes('--shot-only')

const OUT = join(REPO, '.verify')
const SHOT = join(OUT, 'screenshot.png')

/**
 * The fact agent example several checks below are pinned to: the geometry report reads it, and
 * the field-table/validator parity check strips its required fields. Both are fact-specific on
 * purpose (the geometry report's text, the fact field table), so the path is named here rather
 * than reached for through a loop variable.
 */
const FACT_AGENT_SAMPLE = join(REPO, 'examples/agent/fact/1-minimal.en.json')

/**
 * Every message prefix whose entries are **fixed English** and therefore copied into zh.js,
 * never translated: validation errors and hints, which are read by the agent.
 * A new major type's keys get their own prefix, and that prefix belongs in this list
 * (zh.js spreads them; see the note at the end of that file).
 *
 * Declared up here on purpose: the main flow below calls checkMessages() before this point in
 * file order, and a `const` further down would still be in its temporal dead zone.
 */
const FIXED_ENGLISH_PREFIXES = ['err.', 'perr.', 'phint.']

// ---------------------------------------------------------------
// Minimal assertions and reporting
// ---------------------------------------------------------------
let passed = 0
const failures = []
// whether this round actually produced a screenshot. With --no-browser, a leftover image
// from the previous round must not be reported as this round's output.
let shotWritten = false

/**
 * The profile directories this project creates in the system temp directory when it
 * launches a browser. The convention in chrome.mjs is "always close() it, or both the
 * process and the temporary directory are left behind"; this counts them against that
 * convention to see whether anyone forgot to close.
 */
function profilesInTmp() {
  return readdirSync(tmpdir()).filter((n) => n.startsWith('antu-chrome-'))
}

function ok(label, detail = '') {
  passed += 1
  console.log(`  ✅ ${label}${detail ? '  ' + detail : ''}`)
}

function bad(label, detail = '') {
  failures.push(`${label}${detail ? ': ' + detail : ''}`)
  console.log(`  ❌ ${label}${detail ? '  ' + detail : ''}`)
}

function section(title) {
  console.log(`\n[${title}]`)
}

/** Recursively list files with the given suffixes (skipping directories that should not be scanned) */
function listFilesUnder(dir, exts) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.git', '.verify', 'dist', 'dist-engine', 'dist-html'].includes(e.name)) continue
        walk(p)
      } else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
    }
  }
  walk(dir)
  return out
}

/** Assert equality, printing both expected and actual */
function eq(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) ok(label, a)
  else bad(label, `expected ${e}, got ${a}`)
}

/**
 * The value only has to be truthy to pass.
 *
 * `detail` must be carried through: nearly twenty call sites in this script pass "what was
 * actually measured" as the third argument, and this parameter used to be swallowed here,
 * so the numbers that matter most (non-white pixels, padding, the ratio between groups)
 * appeared nowhere and could not be seen on failure either, leaving a rerun as the only way
 * to find out.
 */
function truthy(label, value, detail = '') {
  if (value) ok(label, detail)
  else bad(label, detail)
}

// ---------------------------------------------------------------
// 1. Build
// ---------------------------------------------------------------
function checkBuild() {
  section('build')
  for (const [name, args] of [
    ['dev build', ['run', 'build']],
    ['engine build', ['run', 'build:engine']],
  ]) {
    try {
      execFileSync('npm', args, { cwd: REPO, stdio: 'pipe' })
      ok(name)
    } catch (e) {
      bad(name, String(e.stderr || e.message).split('\n').slice(0, 3).join(' / '))
    }
  }
}

// ---------------------------------------------------------------
// 2. lint
// ---------------------------------------------------------------
function checkLint() {
  section('lint')
  try {
    execFileSync('npx', ['eslint', '.'], { cwd: REPO, stdio: 'pipe' })
    ok('static checks pass')
  } catch (e) {
    const out = String(e.stdout || e.message)
    bad('static checks failed', out.split('\n').filter(Boolean).slice(-3).join(' / '))
  }
}

// ---------------------------------------------------------------
// 2.5 Unit tests (pure Node, seconds)
// ---------------------------------------------------------------
// Integration tests go end to end and are slow; unit tests watch pure functions and are fast.
// Both are needed: "has that 6px of arrow been counted into the content size", for instance,
// is a pure-function matter that a unit test pins down at a glance, with no need to export an
// image and count pixels.
function checkUnit() {
  section('unit tests')
  try {
    const out = execFileSync('node', ['--test', 'test/*.test.mjs'], {
      cwd: REPO,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    const pass = out.match(/# pass (\d+)/)?.[1] ?? '?'
    const fail = out.match(/# fail (\d+)/)?.[1] ?? '?'
    if (fail === '0') ok(`all ${pass} pure-function tests pass`)
    else bad(`${fail} pure-function tests failed`)
  } catch (e) {
    const out = String(e.stdout || e.message)
    const fails = out.split('\n').filter((l) => l.includes('not ok')).slice(0, 3)
    bad('unit tests failed', fails.join(' / '))
  }
}

// ---------------------------------------------------------------
// 3. Data and layout (pure Node, no browser)
// ---------------------------------------------------------------
function checkData() {
  section('data and layout')
  // Examples are split into directories by major type: examples/<type>/*.json. Scan every
  // registered knowledge type. Adding a new type needs no change here; it picks up one more
  // directory on its own.
  const files = []
  for (const { type } of listKnowledgeTypes()) {
    const dir = join(REPO, 'examples', type)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      files.push(`examples/${type}/${f}`)
    }
  }
  truthy('examples found', files.length > 0)
  if (files.length === 0) return { files, sample: null, combos: 0, views: 0 }

  let views = 0
  let combos = 0
  let blocked = 0
  for (const f of files) {
    const spec = JSON.parse(readFileSync(join(REPO, f), 'utf8'))
    const errs = validateSpec(spec)
    if (errs.length) {
      bad(`example ${f} validation`, errs[0])
      continue
    }
    // Ask the registry for this type's layout, never hard-wire fact. Two reasons: procedure has
    // no views, and its layout takes the same four arguments with the view simply unused.
    // Hard-wiring fact here is how this loop used to count every procedure example as
    // "does not fit (expected)" without anyone noticing: viewsOf handed it a fact "all" view and
    // the fact grid ran on a spec with no slots, so it reported an error and moved on.
    const layout = layoutOf(spec.type, layoutKindsOf(spec.type)[0])
    if (!layout) {
      bad(`example ${f}: no layout registered`, `type=${spec.type}`)
      continue
    }
    const units = spec.type === 'fact' ? viewsOf(spec) : [undefined]
    const fields = spec.type === 'fact' ? { summary: true } : {}
    for (const view of units) {
      views += 1
      for (const o of ['vertical', 'horizontal']) {
        const g = layout(spec, fields, view, o)
        combos += 1
        if (g.errors.length) {
          blocked += 1
          continue
        }
        // what the layout produces must be self-consistent
        if (!Number.isFinite(g.size.width) || !Number.isFinite(g.size.height) || g.size.width <= 0) {
          bad(`${f}: computed size is wrong`, JSON.stringify(g.size))
        }
        if (g.edges.length !== 0) bad(`${f}: unexpected edges`, `edges=${g.edges.length}`)
      }
    }
  }
  ok(`all ${files.length} examples pass validation`)
  ok(
    `${views} views × 2 directions = ${combos} combinations all lay out`,
    blocked ? `${blocked} of them do not fit (expected)` : '',
  )

  // The agent examples are "data that runs", not documentation: schema changes make them fail.
  // This check is where the design of item 14 lands, keeping them from drifting silently.
  // It runs for **every** major type, dispatching through the registry, for the same reason as
  // the loop above.
  for (const { type } of listKnowledgeTypes()) {
    const agentDir = join(REPO, 'examples/agent', type)
    if (!existsSync(agentDir)) continue
    const agentFiles = readdirSync(agentDir).filter((f) => f.endsWith('.json'))
    let badAgent = 0
    let blockedAgent = 0
    for (const f of agentFiles) {
      const spec = JSON.parse(readFileSync(join(agentDir, f), 'utf8'))
      if (validateSpec(spec).length) badAgent += 1
      const layout = layoutOf(spec.type, layoutKindsOf(spec.type)[0])
      if (!layout) continue
      if (layout(spec).errors.length) blockedAgent += 1
    }
    truthy(`all ${agentFiles.length} agent examples of ${type} pass validation`, badAgent === 0)
    truthy(
      `every ${type} agent example lays out (copying one will not hit "does not fit")`,
      blockedAgent === 0,
    )
  }

  // Examples come in pairs: X.en.json and X.zh-CN.json. **Only the text may differ**; the
  // structure has to be identical, or one half quietly drifts (a link fixed on one side only,
  // a node added to one language). Nothing else in the toolchain compares the two.
  const pairs = []
  for (const { type } of listKnowledgeTypes()) {
    for (const base of [`examples/${type}`, `examples/agent/${type}`]) {
      const dir = join(REPO, base)
      if (!existsSync(dir)) continue
      const names = readdirSync(dir)
      for (const n of names.filter((x) => x.endsWith('.en.json'))) {
        const stem = n.slice(0, -'.en.json'.length)
        const zhName = `${stem}.zh-CN.json`
        if (!names.includes(zhName)) {
          bad(`pair ${base}/${stem}`, 'the .zh-CN half is missing')
          continue
        }
        pairs.push([`${base}/${n}`, `${base}/${zhName}`])
      }
    }
  }
  truthy('examples come in pairs (.en and .zh-CN)', pairs.length >= 20, `${pairs.length} pairs`)
  // Structural projection: ids, kinds, links, flags. **Never the text** — party roles, edge
  // conditions and view labels are translated, so they differ by design and comparing them would
  // make every pair look drifted.
  const structureOf = (spec) =>
    JSON.stringify({
      actors: (spec.actors ?? []).map((a) => a.id),
      stages: (spec.stages ?? []).map((s) => s.id),
      sources: (spec.sources ?? []).map((s) => [s.id, s.type]),
      nodes: (spec.nodes ?? []).map((n) => [
        n.id,
        n.kind,
        n.outcome ?? '',
        (n.actorIds ?? []).join(','),
        n.stageId ?? '',
        (n.sourceIds ?? []).join(','),
      ]),
      edges: (spec.edges ?? []).map((e) => [e.from, e.to, e.main ? 1 : 0]),
      views: (spec.views ?? []).map((v) => [
        v.splitBy,
        (v.side1?.actors ?? []).join(','),
        (v.side2?.actors ?? []).join(','),
      ]),
      slots: (spec.slots ?? []).map((s) =>
        (s.events ?? []).map((e) => [
          e.id,
          (e.actorIds ?? []).join(','),
          e.groupId ?? '',
          e.approx ? 1 : 0,
          e.dateEnd ? 1 : 0,
          (e.sourceIds ?? []).join(','),
        ]),
      ),
    })
  const drifted = pairs.filter(([a, b]) => {
    const A = JSON.parse(readFileSync(join(REPO, a), 'utf8'))
    const B = JSON.parse(readFileSync(join(REPO, b), 'utf8'))
    return structureOf(A) !== structureOf(B)
  })
  eq(
    'the two halves of every pair share one structure (only the text differs)',
    drifted.map(([a]) => a),
    [],
  )

  // The spec for the agent and the design document for humans must stay separate. This guards
  // against "handing the human documents to the agent": those documents explain "why it was
  // decided this way back then" and run to tens of thousands of characters, so an agent reading
  // them merely burns context. The old approach exposed them as-is with nothing but a "useful
  // for writing data" tag, which amounts to no separation at all.
  const serverSrc = readFileSync(join(REPO, 'tools/mcp/server.mjs'), 'utf8')
  // Look these up with the directory included, so that a generic word like "schema-draft" does
  // not cause a false hit. The list carries no extensions, so a rename (X.md → X.zh-CN.md) does
  // not affect it. **A new major type's design draft must be added here too**: miss it and that
  // one has no leak check. spec/procedure/schema-draft was missed once, found only when
  // procedure was translated.
  const humanDocs = ['spec/fact/schema-draft', 'spec/fact/timeline-rules', 'spec/fact/rendering',
    'spec/source-schema-draft', 'spec/v0-architecture', 'spec/known-issues', 'spec/mcp-server',
    'spec/react-flow-features', 'spec/procedure/schema-draft']
  const leaked2 = humanDocs.filter((n) => serverSrc.includes(n))
  truthy('no human-facing design document leaks into MCP', leaked2.length === 0)
  if (leaked2.length) console.log('     leaked in: ' + leaked2.join(', '))
  truthy('the antu_spec tool is gone', !serverSrc.includes("'antu_spec'"))
  truthy('resources expose only antu://agent/', serverSrc.includes('antu://agent/'))

  // Reference material for the agent must be dispatched **by major type**, with fact never
  // hard-wired into a tool. antu_schema used to call describeFactSchema() directly and
  // antu_guide read one fixed file: once the relationship diagram arrives the whole path
  // needs rework. Now all three tools take a type argument and read it from the registry.
  const hasTypeArg = (tool) =>
    new RegExp(`registerTool\\(\\s*'${tool}'[\\s\\S]{0,1500}?type: z`).test(serverSrc)
  truthy('antu_schema takes a type argument', hasTypeArg('antu_schema'))
  truthy('antu_guide takes a type argument', hasTypeArg('antu_guide'))
  truthy('antu_examples takes a type argument', hasTypeArg('antu_examples'))
  truthy('nothing like factKnowledge is hard-wired in MCP', !/from '.*renderers\/fact\/schema\.js'/.test(serverSrc))
  truthy('the field table can be fetched by major type', describeSchema('fact').ok === true)
  truthy('a missing major type says so instead of returning an empty table', describeSchema('relationship').ok === false)
  // The "not built yet" wording is the agent-facing text of tools/mcp/engine.mjs. Its language
  // is pinned here so a rewrite cannot quietly empty it; a bare `ok === false` assertion passes
  // even when `reason` is undefined.
  const noType = describeSchema('relationship').reason ?? ''
  truthy('a missing major type gives a readable reason (not undefined)', noType.startsWith('no reference material for type'), noType)
  truthy('the mechanism guide is fetched by major type', listAgentGuides().includes('fact'))

  // The geometry report is the tool's text output, so it is asserted by its content, not just by
  // "a string came back": the fit zoom and the orientation advice are exactly what an agent reads
  // before deciding whether the diagram is too wide. See tools/mcp/engine.mjs formatLayoutReport.
  const lay = layoutReport(
    JSON.parse(readFileSync(FACT_AGENT_SAMPLE, 'utf8')),
    { fields: { summary: true } },
  )
  truthy('the geometry report can be computed', lay.ok === true, lay.ok ? '' : String(lay.reason))
  const layText = lay.ok ? formatLayoutReport(lay) : ''
  truthy(
    'the geometry report carries the fit zoom, the suggested orientation and the view count',
    layText.includes('fit zoom') && layText.includes('Suggested orientation') && layText.includes('view(s)'),
    layText.split('\n').filter((l) => l.trim()).slice(0, 3).join(' / '),
  )

  // Only three kinds of file count as examples. `file` used to be able to fetch anything under
  // examples, so an agent thought it was fetching an example and got back a whole judgment
  // (3500 characters).
  truthy('examples/README.md cannot be fetched (it is not an example)', readExample('examples/README.md') === null)
  truthy('a path escaping examples/ cannot be fetched', readExample('examples/agent/../fact-电梯劝烟案.json') === null)
  truthy('a small example can be fetched', readExample('examples/agent/fact/1-minimal.en.json') !== null)
  truthy('examples are laid out in per-type directories', listExamples({ type: 'fact' }).length > 0)
  truthy(
    'examples come in three groups (agent / real / raw)',
    listExamples({ group: 'agent' }).length > 0 &&
      listExamples({ group: 'real' }).length > 0 &&
      listExamples({ group: 'raw' }).length > 0,
  )

  // Every entry the list gives back must be fetchable.
  // This covers a real bug that was fixed: listExamples returned **absolute paths** while
  // readExample accepted only relative ones, so an agent copying a path out of the list to
  // fetch a real case got nothing back, every time. A check that only asserts "the list is
  // non-empty" cannot see it: the list itself is right, it is the next step that does not
  // connect.
  const realList = listExamples({ type: 'fact', group: 'real' })
  const unreadable = realList.filter((e) => !readExample(e.path))
  eq('every entry in the example list can be fetched (list and read agree on paths)', unreadable.map((e) => e.file), [])

  // Language variants of paired examples: by default only the English one is given, and the
  // Chinese variant is not listed again. Listing both would show the agent the same case twice,
  // wasting context and inviting a wrong pick.
  const zhOnly = realList.filter((e) => /\.zh-CN\.json$/i.test(e.file))
  eq('the default (English) list has no .zh-CN variant', zhOnly.map((e) => e.file), [])
  const zhList = listExamples({ type: 'fact', group: 'real', lang: 'zh' })
  truthy(
    'lang=zh gives the Chinese variants',
    zhList.length > 0 && zhList.every((e) => /\.zh-CN\.json$/i.test(e.file)),
    `Chinese ${zhList.length} / English ${realList.length}`,
  )
  // A bare basename must resolve to the default-language copy, so the agent need not know how
  // the files are paired.
  const byBase = realList[0]?.file.replace(/\.en\.json$/i, '.json')
  const baseRead = byBase ? readExample(byBase) : null
  truthy(
    'fetching an example by bare basename resolves to the English copy (the agent need not know how files are paired)',
    !!baseRead && baseRead.path.endsWith('.en.json'),
    `${byBase} → ${baseRead ? baseRead.path.split('/').slice(-1)[0] : 'null'}`,
  )

  // Path references in documents must point at files that really exist.
  // This was added after the fact: the files have moved several times (core → renderers,
  // fact → fact/timeline, repository root → split by major type) and every move left
  // references behind, which no amount of human reading gets fully clean.
  // Two forms are scanned, because the first version only caught one and let a broken
  // README command through:
  //   1. a path in backticks anywhere (prose, JSDoc, comments);
  //   2. a path in a shell command or code fence, backticked or not — this is how the
  //      README's `npm run diagram -- examples/...` line is written, and it pointed at a
  //      file that no longer existed because the examples had been split into language pairs.
  // known-issues.md is skipped: it is a historical log and quotes paths as they were then.
  const refMissing = []
  // Two traps, both hit while writing this:
  //   · extension prefixes: without care `src/App.jsx` matches as the non-existent
  //     `src/App.js`. Listing `jsx` before `js` and requiring a non-word character after
  //     fixes it (made lazy, the quantifier otherwise backtracks into the shorter form).
  //   · placeholder paths: documents legitimately write `examples/xxx.json` or
  //     `examples/fact/x.json` to mean "any example", and those must not be reported.
  // The extension is an explicit list rather than \.[\w]{2,4}: `foo.zh-CN.json` would
  // otherwise be captured as `foo.zh`. jsx comes before js for the same reason.
  const EXT = '(?:md|json|jsx|js|mjs)'
  const PATH_RE = new RegExp(
    `(?:^|[\\s\`'"(])((?:spec|examples|src|tools)/[\\w./\\u4e00-\\u9fff-]*?/(?![xX]/)[\\w\\u4e00-\\u9fff-]+(?:\\.zh-CN)?\\.${EXT})(?![\\w.]|/[\\w])`,
    'gm',
  )
  const PLACEHOLDER = /(^|\/)(x|xxx|some-file|your-file)\.[\w]+$/
  for (const f of listFilesUnder(REPO, ['.md', '.mjs', '.js', '.jsx'])) {
    if (f.includes('node_modules') || f.includes('/dist')) continue
    if (f.endsWith('spec/known-issues.md')) continue
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(PATH_RE)) {
      if (PLACEHOLDER.test(m[1])) continue
      // A path with `..` is deliberate: the escape guard asserts that such a path cannot be
      // fetched, so it is supposed to point at nothing.
      if (m[1].includes('..')) continue
      if (!existsSync(join(REPO, m[1]))) refMissing.push(`${f.replace(REPO + '/', '')} → ${m[1]}`)
    }
  }
  truthy('every path reference in the documents points at a real file', refMissing.length === 0)
  for (const r of refMissing.slice(0, 5)) console.log('     ' + r)

  // The field metadata (reference material for the agent) must say the same thing as the
  // validator. The method: take an example that passes validation and strip the "required"
  // fields one at a time, and the validator must report an error. That makes it impossible for
  // the field table to drift silently, without rewriting the validation rules as data.
  const base = JSON.parse(readFileSync(FACT_AGENT_SAMPLE, 'utf8'))
  // The required marker in the field table: `FACT_FIELDS` was changed to 'yes' with the
  // internationalisation. Both 'yes' and '是' are accepted here, and **the compatibility is
  // not superfluous**: while the English switch was being made, this accepted only '是',
  // `required` became an empty array, the loop never ran once, and the assertion still
  // reported "pass". A check that verifies nothing is worse than no check at all.
  // The `required.length > 0` below is what stops it from spinning empty again.
  const REQUIRED_MARK = new Set(['yes', '是'])
  const required = []
  for (const rows of Object.values(FACT_FIELDS)) {
    for (const r of rows) if (REQUIRED_MARK.has(r.req) && r.name) required.push(r.name)
  }
  truthy(
    'the field table yields required fields (guards against spinning empty: an empty array would let the check below pass silently)',
    required.length > 0,
    `${required.length}`,
  )
  const noop = ['type', 'title'] // these three sit in the envelope layer; stripping them reports other errors, tested separately
  let agree = 0
  let disagree = []
  for (const name of required) {
    if (noop.includes(name)) continue
    const copy = JSON.parse(JSON.stringify(base))
    const target = name === 'events' ? copy.slots[0] : copy.slots[0].events[0]
    if (!(name in target)) continue // the example has no such field, skip it
    delete target[name]
    if (validateSpec(copy).length > 0) agree += 1
    else disagree.push(name)
  }
  truthy(`every field marked required is reported when it is removed (checked ${agree})`, disagree.length === 0)
  if (disagree.length) console.log('     not reported: ' + disagree.join(', '))

  // The agent's reference material must stay small, and the size quoted in the docs must not
  // drift away from it. It did drift: the English switch made the field table and the guide
  // noticeably longer, and "2.3k tokens" stayed in seven places for a while.
  // The conversion is the one tools/mcp/client-test.mjs already uses (0.65 tokens per char).
  const tokOf = (text) => (text.length * 0.65) / 1000
  const schemaTok = tokOf(describeSchema('fact').text)
  const guideTok = tokOf(readAgentGuide('fact'))
  const agentRefTok = schemaTok + guideTok
  truthy(
    'the agent reference material is still about the size we advertise (under 6k tokens)',
    agentRefTok < 6,
    `${agentRefTok.toFixed(1)}k tokens (schema ${schemaTok.toFixed(1)}k + guide ${guideTok.toFixed(1)}k)`,
  )
  // And the advertised number must match, so it cannot go stale unnoticed.
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8')
  const claimed = readme.match(/agent is ([\d.]+)k tokens/)
  truthy('README states the size of the agent reference material', !!claimed, claimed ? claimed[1] : 'not stated')
  if (claimed) {
    const diff = Math.abs(Number(claimed[1]) - agentRefTok)
    truthy(
      'the size stated in README matches measurement',
      diff <= 0.6,
      `README says ${claimed[1]}k, measured ${agentRefTok.toFixed(1)}k`,
    )
  }

  // Validation errors must speak plainly: deliberately build a broken one and see whether the
  // message carries the field path.
  const broken = { type: 'fact', title: '坏的', slots: [{ id: 's1', events: [{ id: 'e1', label: '没时间' }] }] }
  const errs = validateSpec(broken)
  truthy('bad data is stopped', errs.length > 0)
  truthy('the error carries the field path', errs.some((e) => /slots\[\d+\]/.test(e)))
  truthy('the error carries the event id', errs.some((e) => e.includes('e1')))

  // The render checks **always use this one file**, never files[0].
  // It used to take "the first after sorting", so adding an example to examples/fact/ whose
  // name sorted earlier changed what the render assertions looked at, and the card counts of
  // two runs were not comparable at all (measured: 7 cards vs 12). Once fixed, assertions like
  // "card count" and "label card title" actually mean something.
  const sample = 'examples/fact/elevator-smoking-case.zh-CN.json'
  truthy('the render sample exists', existsSync(join(REPO, sample)))
  // Same rule for the flowchart: one fixed file. 01 is chosen because it carries every thing
  // the renderer has to draw at once: stages, decisions, back edges, both outcome colours.
  const procedureSample = 'examples/procedure/01-software-development-contract.zh-CN.json'
  truthy('the procedure render sample exists', existsSync(join(REPO, procedureSample)))

  return { files, sample, procedureSample, combos, views }
}

// ---------------------------------------------------------------
// 4. Browser lookup (no browser needed, so it can go in verify:fast)
// ---------------------------------------------------------------
/**
 * The three behaviours of findChrome, which is the fulcrum of "pile up no vendor paths in the
 * repository": a user with some other Chromium-based browser (common on Kylin / UOS) gets in
 * entirely through ANTU_CHROME, and if that chain breaks the preview and the render checks go
 * mute together while the only symptom is "no Chrome found on this machine". So this asserts
 * only that the value was read and is not returned blindly.
 */
function checkBrowserLookup() {
  section('browser lookup')
  // A file that certainly exists, borrowed as a stand-in for a "browser path"
  const probe = join(REPO, 'package.json')
  const prev = process.env.ANTU_CHROME
  try {
    process.env.ANTU_CHROME = probe
    eq('ANTU_CHROME wins over known paths', findChrome(), probe)

    process.env.ANTU_CHROME = '/nope/not-a-browser'
    truthy('ANTU_CHROME pointing at a missing path is not treated as a browser', findChrome() !== '/nope/not-a-browser')

    process.env.ANTU_CHROME = REPO
    truthy('ANTU_CHROME pointing at a directory is not treated as a browser', findChrome() !== REPO)
  } finally {
    if (prev === undefined) delete process.env.ANTU_CHROME
    else process.env.ANTU_CHROME = prev
  }
}

/**
 * The path where launching fails: the error must explain itself, and the three attempts must
 * **not tread on each other**. Bought with known-issues item 18, where the variants shared one
 * profile and one port (so once the first failed to start, Chrome killed the rest on the
 * SingletonLock and the fallback chain was dead), `child.kill()` sent one SIGTERM and gave up,
 * and `stdio: 'ignore'` threw away Chrome's own error. A fake browser verifies all of it, so
 * this can go in verify:fast; the real-browser reproduction is in known-issues item 18.
 */
async function checkLaunchFailure() {
  const fake = join(OUT, 'fake-browser.sh')
  const log = join(OUT, 'fake-browser.log')
  rmSync(log, { force: true })
  writeFileSync(
    fake,
    '#!/bin/sh\n' +
      'echo "###" >> "$ANTU_FAKE_LOG"\n' +
      'for a in "$@"; do echo "$a" >> "$ANTU_FAKE_LOG"; done\n' +
      'echo "假浏览器：我起不来，原因写在这里" >&2\n' +
      'exit 7\n',
    { mode: 0o755 },
  )
  const prevChrome = process.env.ANTU_CHROME
  const prevLog = process.env.ANTU_FAKE_LOG
  const before = readdirSync(tmpdir()).filter((n) => n.startsWith('antu-chrome-'))
  let message
  try {
    process.env.ANTU_CHROME = fake
    process.env.ANTU_FAKE_LOG = log
    try {
      // timeoutMs is set very small: the fake browser exits at once and the implementation should
      // "give up the moment the process exits", with no real waiting
      await launchBrowser({ timeoutMs: 1500 })
      bad('the fake browser started anyway', 'it should have reported an error')
      return
    } catch (e) {
      message = e.message
    }
  } finally {
    if (prevChrome === undefined) delete process.env.ANTU_CHROME
    else process.env.ANTU_CHROME = prevChrome
    if (prevLog === undefined) delete process.env.ANTU_FAKE_LOG
    else process.env.ANTU_FAKE_LOG = prevLog
  }

  ok('a fake browser that cannot start makes launchBrowser throw', message.split('\n')[0])
  // All three variants were tried, and **each reports its own port**: duplicate ports mean a
  // regression to "three attempts sharing one port", where the first not dying cleanly stops the
  // other two from binding and the fallback chain is dead.
  const ports = [...message.matchAll(/port (\d+)/g)].map((m) => m[1])
  eq('all three headless variants were tried', ports.length, 3)
  eq('each variant has its own port', new Set(ports).size, ports.length)
  // Chrome's own words must be carried into the failure message, or the next time is guesswork again
  // detail is given only on failure: on a pass there is no need to copy that original text again, the log is noisy enough
  truthy(
    'the failure message carries the error the browser printed itself',
    message.includes('假浏览器：我起不来，原因写在这里'),
    message.includes('假浏览器：我起不来，原因写在这里')
      ? ''
      : message.split('\n').slice(1, 3).join(' / ').slice(0, 90),
  )
  truthy('the failure message carries the browser path', message.includes(fake))

  // Look at **the arguments actually sent to Chrome**: the three attempts must not share a profile
  // directory. The check above sees only the port numbers in the error and cannot see the profile
  // (its name is a random directory name), yet a shared profile is what really breaks the fallback
  // chain.
  const attempts = readFileSync(log, 'utf8')
    .split('###\n')
    .filter((t) => t.trim())
    .map((t) => t.trim().split('\n'))
  eq('the fake browser was launched three times', attempts.length, 3)
  const flagOf = (args, name) => args.find((a) => a.startsWith(`${name}=`))
  const profiles = attempts.map((a) => flagOf(a, '--user-data-dir'))
  const launchedPorts = attempts.map((a) => flagOf(a, '--remote-debugging-port'))
  truthy('every attempt carries a profile directory', profiles.every(Boolean), profiles.some((p) => !p) ? profiles.join(' / ') : '')
  eq('the three attempts each have their own profile directory', new Set(profiles).size, profiles.length)
  eq('the three attempts each have their own debugging port', new Set(launchedPorts).size, launchedPorts.length)
  truthy(
    'the three attempts run the old flag, then the new flag, then no flag',
    attempts[0].includes('--headless=old') &&
      attempts[1].includes('--headless=new') &&
      !attempts[2].some((a) => a.startsWith('--headless')),
  )

  // temporary profile directories must not be left in /tmp
  const after = readdirSync(tmpdir()).filter((n) => n.startsWith('antu-chrome-'))
  eq('a failure leaves no temporary profile directory behind', after.length, before.length)
}
/**
 * Chrome is still writing into the profile while it winds down, and the directory must come out
 * clean anyway. On CI (known-issues item 18) this surfaced as `ENOTEMPTY: directory not empty`,
 * because the child writing the profile outlived the main process. Shutdown therefore has to
 * **kill the whole process group**. A fake browser whose background process keeps writing files
 * into the profile verifies it, so no real browser is needed.
 */
async function checkLingeringChrome() {
  const fake = join(OUT, 'churning-browser.sh')
  // The writer **does mkdir -p before every rewrite**: if the directory is deleted it just
  // creates it again. That way "the writer is still alive" necessarily shows up as "the profile
  // directory is still there", instead of depending on a lucky timing race. The writer lives 20
  // seconds and stops on its own, leaving no infinite loop on the machine. Note that there is
  // deliberately **no** trap for TERM here: what is being verified is exactly "kill the whole
  // process group", and only when the writer in the group goes too can the directory be deleted.
  writeFileSync(
    fake,
    '#!/bin/sh\n' +
      'PROFILE=""\n' +
      'for a in "$@"; do\n' +
      '  case "$a" in --user-data-dir=*) PROFILE="${a#--user-data-dir=}" ;; esac\n' +
      'done\n' +
      'i=0\n' +
      '( while [ $i -lt 2000 ]; do\n' +
      '    i=$((i + 1))\n' +
      '    mkdir -p "$PROFILE/Default" 2>/dev/null || exit 0\n' +
      '    echo x > "$PROFILE/Default/f$i" 2>/dev/null || exit 0\n' +
      '    sleep 0.01\n' +
      '  done ) &\n' +
      'sleep 60\n',
    { mode: 0o755 },
  )
  const prev = process.env.ANTU_CHROME
  const before = profilesInTmp().length
  let message
  try {
    process.env.ANTU_CHROME = fake
    try {
      await launchBrowser({ timeoutMs: 1200 })
      bad('the fake browser that keeps writing while winding down started anyway', 'it should have reported an error')
      return
    } catch (e) {
      message = e.message
    }
  } finally {
    if (prev === undefined) delete process.env.ANTU_CHROME
    else process.env.ANTU_CHROME = prev
  }
  ok('a fake browser that keeps writing while winding down makes launchBrowser throw', message.split('\n')[0])
  // the check that matters: only once the writer is dead can the profile be deleted
  eq('shutdown kills the child process too, so the profile can be deleted', profilesInTmp().length, before)
}

/**
 * The export image checks. Four things that matter, each the spot where this mechanism most
 * easily breaks silently: the click must really land a file (the browser blocks a second
 * automatic download, so it has to be marked a user gesture, see eval in lib/chrome.mjs); the
 * size must be exactly (content + padding) × 2, or the wrong range was framed; it must not be a
 * blank image; and there must be **white margin on all four sides** plus **an arrow at the end
 * of the axis**. The last two each cost real defects and no size measurement can see them, so
 * pixel bands are sampled along the edges and one pixel where the arrow should be. The export
 * carries no heading (that switch was withdrawn, see rendering §10.2), so there is one export.
 */
/**
 * Point the browser's downloads at a fresh directory, and return the two things an export
 * check needs: a click that finds its control by class, and a wait for the PNG to land.
 * Shared by the fact and procedure render checks, so both exercise the same export path.
 */
async function downloadHelpers(browser) {
  const dir = join(OUT, 'downloads')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await browser.setDownloadDir(dir)

  // Click a dock control **by its role, not by its label**. Finding a button by the text
  // it shows is exactly the trap this replaced: with two interface languages the label
  // differs, and the click silently stops working on a machine with the other language.
  const clickByClass = (selector) =>
    browser.eval(
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        el.click()
        return el.textContent.trim()
      })()`,
      { userGesture: true },
    )

  const grab = async (hint) => {
    let file = null
    for (let i = 0; i < 40 && !file; i++) {
      await new Promise((r) => setTimeout(r, 250))
      file = readdirSync(dir).find((f) => f.endsWith('.png')) ?? null
    }
    if (!file) {
      bad(`${hint}: export was clicked but no file landed on disk`)
      return null
    }
    const path = join(dir, file)
    const buf = readFileSync(path)
    rmSync(path, { force: true }) // move it out of the way so the next download is visible
    return { name: file, buf, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  return { clickByClass, grab }
}

async function checkExport(browser, spec) {
  section('export image')
  const { clickByClass, grab } = await downloadHelpers(browser)

  const clicked = await clickByClass('.antu-dock-action')
  if (!clicked) {
    bad('export image: the button is not in the bottom dock')
    return
  }
  const shot = await grab('export')
  if (!shot) return
  truthy('clicking export lands a PNG on disk', shot.buf.slice(1, 4).toString() === 'PNG')
  // Keep a copy, for the same reason a human looks at a screenshot: the right size does not mean
  // the right content
  const EXPORT_SHOT = join(OUT, 'export.png')
  writeFileSync(EXPORT_SHOT, shot.buf)
  ok('export succeeded', `${shot.width}×${shot.height}  ${EXPORT_SHOT.replace(REPO + '/', '')}`)

  // The page is certainly in its default presentation state (a fresh browser profile has no
  // preferences): only the summary field on, direction by slot count, first view.
  const orientation = spec.slots.length >= 5 ? 'vertical' : 'horizontal'
  const graph = buildFactGraph(
    spec,
    { sources: false, actors: false, summary: true },
    viewsOf(spec)[0],
    orientation,
  )
  eq('size = (content + padding) × 2', [shot.width, shot.height], [
    exportFrame(graph.size.width, graph.size.height).width * 2,
    exportFrame(graph.size.width, graph.size.height).height * 2,
  ])
  ok('padding', `${EXPORT_PAD}px per side (design pixels)`)

  // Sampling: an all-white image compresses to almost nothing, but that is circumstantial
  // evidence; here the non-white pixels are counted directly.
  const sample = async (x, y) =>
    browser.eval(
      `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${shot.buf.toString('base64')}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(${x}, ${y}, 1, 1).data
        return [d[0], d[1], d[2]]
      })()`,
      { awaitPromise: true },
    )

  const ink = await browser.eval(
    `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${shot.buf.toString('base64')}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n += 1
        return n
      })()`,
    { awaitPromise: true },
  )
  truthy('the exported image is not blank', ink > 5000, `non-white pixels ${ink}`)

  // Padding: each of the four edges gets a band of pixels, all of which must be white, while the
  // content area of the same image must have ink. The two have to be read together: "all white at
  // the edges" alone passes an entirely white image, and "there is ink inside" alone passes an
  // image with padding on one side and content stretched over the whole frame.
  //
  // Check the precondition before sampling: with zero padding one edge of these four pixel
  // rectangles is 0 and getImageData throws outright, burying "the padding is simply gone"
  // under a pile of stack traces.
  const pad = EXPORT_PAD * 2 // device pixels
  truthy('padding per side is greater than 0 (device pixels)', pad > 0, `${pad}px`)
  const bands = !pad
    ? null
    : await browser.eval(
        `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${shot.buf.toString('base64')}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const count = (x, y, w, h) => {
          const d = ctx.getImageData(x, y, w, h).data
          let n = 0
          for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n += 1
          return n
        }
        const p = ${pad}
        return {
          w: c.width,
          h: c.height,
          top: count(0, 0, c.width, p),
          bottom: count(0, c.height - p, c.width, p),
          left: count(0, p, p, c.height - p * 2),
          right: count(c.width - p, p, p, c.height - p * 2),
          inner: count(p, p, c.width - p * 2, c.height - p * 2),
        }
      })()`,
        { awaitPromise: true },
      )
  // First confirm these four bands really are inside the image, rather than "counting 0 non-white
  // pixels" at out-of-range coordinates
  truthy(
    'the padding sampling band is inside the exported image',
    !!bands && pad * 2 < bands.w && pad * 2 < bands.h,
    bands ? `image ${bands.w}×${bands.h}, padding ${pad}px per side` : 'no pixels were sampled',
  )
  if (bands) {
    truthy('the content area has ink', bands.inner > 5000, `non-white pixels in the content area ${bands.inner}`)
    eq('the top padding band is pure white', bands.top, 0)
    eq('the bottom padding band is pure white', bands.bottom, 0)
    eq('the left padding band is pure white', bands.left, 0)
    eq('the right padding band is pure white', bands.right, 0)
  }

  // The arrow at the end of the axis: work out where it should be and sample one pixel to see
  // whether it is dark. Vertical: the axis is at x = the axis column centre, and the arrow hangs
  // within ARROW_EXTENT below the end of the axis; horizontal: the axis is at y = the axis row
  // centre and the arrow hangs off the right end. These are content coordinates, so the padding
  // (EXPORT_PAD) has to be added to get coordinates in the finished image.
  const axisAt = graph.grid.axisColumnIndex * CELL_W + CELL_W / 2
  const [px, py] =
    orientation === 'vertical'
      ? [axisAt, graph.size.height - ARROW_EXTENT / 2]
      : [graph.size.width - ARROW_EXTENT / 2, axisAt]
  const sx = Math.round((px + EXPORT_PAD) * 2)
  const sy = Math.round((py + EXPORT_PAD) * 2)
  // First confirm the sampling point is inside the image. Without that step, when the arrow is
  // cropped getImageData returns a fully transparent pixel that reads as black, so it "looks
  // dark" and passes — the assertion cannot catch that bug on its own (measured).
  truthy(
    'the arrow sampling point is inside the exported image',
    sx >= 0 && sy >= 0 && sx < shot.width && sy < shot.height,
    `sample point (${sx},${sy}), image ${shot.width}×${shot.height}`,
  )
  const rgb = await sample(sx, sy)
  // Not merely "dark": it has to be the colour of the axis line (a little slack for sampling a
  // semi-transparent line)
  const near = Math.abs(rgb[0] - 178) < 40 && Math.abs(rgb[1] - 192) < 40 && Math.abs(rgb[2] - 208) < 40
  truthy('the exported image has an arrow at the end of the timeline', near, `sampled rgb(${rgb}) at (${sx},${sy}), axis colour about rgb(178,192,208)`)
}

// ---------------------------------------------------------------
// 5. Render (needs a browser)
// ---------------------------------------------------------------
async function checkRender(sampleFile) {
  section('render (opened over file://, zero external requests)')
  if (!findChrome()) {
    bad('no usable Chrome, skipped', 'install Chrome, or point ANTU_CHROME at the browser you already have')
    return null
  }

  const spec = JSON.parse(readFileSync(join(REPO, sampleFile), 'utf8'))
  const html = join(OUT, 'render-check.html')
  renderToFile(spec, { outPath: html, quiet: true })

  const browser = await launchBrowser({ width: 1600, height: 900 })
  try {
    // Pin the interface language through the URL. Without this the UI follows
    // navigator.language, so on an English CI machine the dock labels come out in English
    // while on a Chinese laptop they come out in Chinese, and any assertion that finds a
    // control by its label would pass in one place and fail in the other.
    // `?lang=` exists for exactly this (see core/i18n.js); it also lets a person share a
    // link that opens in a fixed language.
    await browser.open(`file://${html}?lang=zh`)

    const cards = await browser.eval('document.querySelectorAll(".antu-card").length')
    const expectCards = spec.slots.reduce((n, s) => n + (s.events?.length || 0), 0)
    eq('card count', cards, expectCards)

    // Card size: take CSS pixels and divide out the current zoom to get the design size
    const size = await browser.eval(`(() => {
      const c = document.querySelector('.antu-card')
      if (!c) return null
      const z = parseFloat(document.querySelector('.react-flow__viewport').style.transform.split('scale(')[1])
      const r = c.getBoundingClientRect()
      return { w: Math.round(r.width / z), h: Math.round(r.height / z) }
    })()`)
    truthy('card size measured', size)
    if (size) eq('card width (design size)', size.w, 288)

    const zoom = await browser.eval(
      `+(parseFloat(document.querySelector('.react-flow__viewport').style.transform.split('scale(')[1])).toFixed(3)`,
    )
    truthy('zoom is in a sensible range', zoom > 0.2 && zoom <= 1)

    const headers = await browser.eval(
      `[...document.querySelectorAll('.antu-colhead-side')].map(e => e.textContent)`,
    )
    truthy('column headings are rendered', Array.isArray(headers) && headers.length > 0)

    const dock = await browser.eval(`document.querySelectorAll('.antu-dock-chip').length`)
    truthy('the control dock is present', dock > 0)

    // The shape rules of the controls in the dock (rendering §4.2). These are all rules that may
    // not be visible in the picture yet break the whole dock once violated, so they are checked
    // by colour and stylesheet rather than by human eye.
    const shape = await browser.eval(`(() => {
      const bar = document.querySelector('.antu-dock-bar')
      if (!bar) return null
      const btns = [...bar.querySelectorAll('button')]
      const text = (b) => b.textContent.trim()
      // Crucial: a 12% grey switch also reads "dark" as rgba (15,23,42), but it sits on the
      // near-white dock background and looks light. So it must be composited by alpha before the
      // brightness comparison, or a switch that is on gets misread as solid dark.
      const lum = (b) => {
        const m = getComputedStyle(b).backgroundColor.match(/[\\d.]+/g).map(Number)
        const a = m.length === 4 ? m[3] : 1
        return a * ((m[0] + m[1] + m[2]) / 3) + (1 - a) * 255
      }
      // Report which class each dark button has, not its label: the label depends on the
      // interface language (see the language note at the top of checkRender).
      const dark = btns.filter((b) => lum(b) < 128).map((b) => b.className.split(' ')[0])

      // Look up the pressed state and the focus ring in the stylesheet: these two states cannot
      // be "sampled" from a static page, only checked for the presence of the rule. What is
      // checked is presence, not looks.
      const css = [...document.styleSheets].flatMap((s) => {
        try {
          return [...s.cssRules].map((r) => r.selectorText || '')
        } catch {
          return []
        }
      }).join(' || ')
      const hasRule = (sel) => css.includes(sel)
      const classes = ['.antu-dock-chip', '.antu-dock-seg-item', '.antu-dock-action']
      // Read **all** rules carrying :focus-visible together, not just the one for the action
      // button: if these are ever split into several rules, accepting only one would falsely
      // report "a switch has no focus ring".
      const focusSel = css
        .split(' || ')
        .filter((s) => s.includes(':focus-visible'))
        .join(' || ')

      const action = bar.querySelector('.antu-dock-action')
      const icon = action?.querySelector('svg')
      const r = icon?.getBoundingClientRect()
      return {
        total: btns.length,
        dark,
        hasIcon: !!icon,
        iconW: r ? Math.round(r.width) : 0,
        iconH: r ? Math.round(r.height) : 0,
        missingActive: classes.filter((c) => !hasRule(c + ':active')),
        focusCovered: classes.filter((c) => !focusSel.includes(c + ':focus-visible')),
      }
    })()`)
    truthy('dock control shapes measured', shape)
    if (shape) {
      eq(
        'only the export action in the dock has a solid dark background',
        shape.dark,
        ['antu-dock-action'],
      )
      truthy('the export button carries a download symbol', shape.hasIcon)
      truthy(
        'the download symbol has a real size (not a zero-size element, which export drops altogether)',
        shape.iconW > 0 && shape.iconH > 0,
        `${shape.iconW}×${shape.iconH}`,
      )
      eq('every control has a pressed state', shape.missingActive, [])
      eq('every control is covered by the shared focus-ring rule', shape.focusCovered, [])
    }

    // Grouping rests on distance, not on that line (rendering §4.2).
    // This came out of measurement: inner and outer gaps were both 2px, so the gaps between 11
    // elements all looked identical and "five blocks" rested entirely on a 1px line at 10%
    // opacity, which users could not tell apart. So the assertion is written as a **ratio**
    // rather than a specific pixel count: the outer gap must be clearly wider than the inner one.
    const groups = await browser.eval(`(() => {
      const bar = document.querySelector('.antu-dock-bar')
      if (!bar) return null
      const kids = [...bar.children].filter((e) => getComputedStyle(e).display !== 'none')
      const rect = (e) => e.getBoundingClientRect()
      const inner = []   // the gap between two controls in the same block (no separator between them)
      const outer = []   // a gap across a separator: the left margin plus the right margin
      const sides = []   // what each separator has on either side
      for (let i = 1; i < kids.length; i += 1) {
        const prev = kids[i - 1]
        const cur = kids[i]
        const gap = +(rect(cur).left - rect(prev).right).toFixed(2)
        if (cur.classList.contains('antu-dock-sep') || prev.classList.contains('antu-dock-sep')) outer.push(gap)
        else inner.push(gap)
      }
      for (let i = 0; i < kids.length; i += 1) {
        if (!kids[i].classList.contains('antu-dock-sep')) continue
        sides.push({
          left: +(rect(kids[i]).left - rect(kids[i - 1]).right).toFixed(2),
          right: +(rect(kids[i + 1]).left - rect(kids[i]).right).toFixed(2),
        })
      }
      const sep = bar.querySelector('.antu-dock-sep')
      const s = sep ? getComputedStyle(sep) : null
      return {
        inner: Math.max(...inner),
        outerTotal: sides.length ? +(sides[0].left + 1 + sides[0].right).toFixed(2) : 0,
        outerMin: outer.length ? Math.min(...outer) : 0,
        seps: sides.length,
        // group count = separator count + 1 (the separators cut the dock into blocks)
        groupCount: sides.length + 1,
        sepH: s ? parseFloat(s.height) : 0,
        sepAlpha: s ? Number((s.backgroundColor.match(/[\\d.]+/g) || [])[3] ?? 1) : 0,
      }
    })()`)
    truthy('dock group gaps measured', groups)
    if (groups) {
      // The separator count = group count - 1. The group count is read from the page rather than
      // hard-wired: adding a control group (a language switcher, say) adds a separator, and
      // hard-wiring it would mean editing the verification every time.
      eq('there is one separator between every two blocks', groups.seps, groups.groupCount - 1)
      truthy(
        'the gap between groups is at least 5 times the gap within one (grouping must be visible at a glance)',
        groups.outerTotal >= groups.inner * 5,
        `within a group ${groups.inner}px, between groups ${groups.outerTotal}px (${(groups.outerTotal / groups.inner).toFixed(1)} times)`,
      )
      const lopsided = await browser.eval(`(() => {
        const bar = document.querySelector('.antu-dock-bar')
        const kids = [...bar.children].filter((e) => getComputedStyle(e).display !== 'none')
        const rect = (e) => e.getBoundingClientRect()
        const off = []
        for (let i = 0; i < kids.length; i += 1) {
          if (!kids[i].classList.contains('antu-dock-sep')) continue
          const l = rect(kids[i]).left - rect(kids[i - 1]).right
          const r = rect(kids[i + 1]).left - rect(kids[i]).right
          if (Math.abs(l - r) > 0.5) off.push(+Math.abs(l - r).toFixed(2))
        }
        return off
      })()`)
      eq('the separator is equally wide on both sides (not wider on one)', lopsided, [])
      truthy(
        'the separator itself is visible (tall enough, opaque enough)',
        groups.sepH >= 15 && groups.sepAlpha >= 0.1,
        `height ${groups.sepH}px, opacity ${groups.sepAlpha}`,
      )
    }

    const title = await browser.eval(`document.querySelector('.antu-header-title')?.textContent`)
    eq('label card title', title, spec.title)

    // The label card is always shown (the "heading" switch was withdrawn, see rendering §10.2)
    truthy('the label card is always shown on screen', await browser.eval(`!!document.querySelector('.antu-header-card')`))
    // The heading switch was removed (see spec/fact/rendering.md §10.2), and an assertion
    // that looked for the text "题头" had gone dead: that string no longer exists in either
    // dictionary, so `some(... === '题头')` was false in both languages and the check passed
    // unconditionally. Written structurally instead, so it cannot rot that way: the dock is
    // cut into blocks by separators, so count the blocks and check that the live controls are
    // exactly the ones we expect. A stray toggle would add a block of its own.
    const dockShape = await browser.eval(`(() => {
      const bar = document.querySelector('.antu-dock-bar')
      if (!bar) return null
      const kids = [...bar.children].filter((e) => getComputedStyle(e).display !== 'none')
      return {
        blocks: kids.filter((e) => e.classList.contains('antu-dock-sep')).length + 1,
        buttons: kids.filter((e) => e.tagName === 'BUTTON').length,
        segItems: kids.filter((e) => e.classList.contains('antu-dock-seg')).reduce((n, s) => n + s.children.length, 0),
      }
    })()`)
    truthy('measured the dock control blocks', dockShape)
    if (dockShape) {
      // Six blocks: view · field toggles · orientation · grid · language · export.
      // The export action is separated off on its own, because it is the only **action** in
      // the dock while everything else is a state toggle.
      // The count is asserted rather than inferred: a resurrected heading switch would add
      // a seventh, and that is exactly what this replaced assertion was meant to catch.
      eq('the dock has six control blocks', dockShape.blocks, 6)
      truthy(
        'the dock still carries the controls it should',
        dockShape.buttons >= 5 && dockShape.segItems >= 4,
        `${dockShape.buttons} buttons + ${dockShape.segItems} segment items`,
      )
    }

    // ── The interface language actually switches (and the data does not) ──
    // Without this, the whole i18n layer could break silently: every other assertion runs
    // with the language pinned and would still pass. Switching is driven by position, not by
    // label, because the labels themselves are what changes.
    const beforeSwitch = await browser.eval(`(() => {
      const segs = [...document.querySelectorAll('.antu-dock-bar .antu-dock-seg')]
      return {
        lang: document.documentElement.lang,
        type: (document.querySelector('.antu-header-type') || {}).textContent || '',
        dockTitle: (document.querySelector('.antu-dock-seg[title]') || {}).title || '',
        segCount: segs.length,
        lastSegItems: segs.length ? segs[segs.length - 1].children.length : 0,
      }
    })()`)
    truthy('measured the interface before switching language', beforeSwitch)
    if (beforeSwitch) {
      // Do not assume which language we start in: the URL parameter decides that, and the
      // same check should hold whichever one is pinned. What is asserted is that the document
      // language agrees with the interface and that switching moves both.
      truthy(
        'document language agrees with the interface language',
        (beforeSwitch.lang === 'zh-CN' && beforeSwitch.type === '事实图') ||
          (beforeSwitch.lang === 'en' && beforeSwitch.type === 'Fact'),
        `lang=${beforeSwitch.lang} type=${beforeSwitch.type}`,
      )
      // The language switcher is the last segmented control and holds exactly two items.
      eq('the last segmented control is the language switcher', beforeSwitch.lastSegItems, 2)
      // Click whichever language is NOT currently active, rather than a fixed index:
      // the items are ordered EN then 中文, so index 1 is Chinese and clicking it while
      // already in Chinese changes nothing (which is exactly the mistake this guard made
      // the first time it ran).
      const switchResult = await browser.eval(
        `(() => {
          const segs = [...document.querySelectorAll('.antu-dock-bar .antu-dock-seg')]
          const last = segs[segs.length - 1]
          if (!last || last.children.length !== 2) return null
          const target = [...last.children].find((b) => !b.className.includes('is-on'))
          if (!target) return null
          const was = [...last.children].find((b) => b.className.includes('is-on')).textContent.trim()
          target.click()
          return { clicked: target.textContent.trim(), was }
        })()`,
        { userGesture: true },
      )
      truthy('clicked the other language', switchResult, JSON.stringify(switchResult))
      // The click goes through React state, so the DOM does not change synchronously.
      // Give it a beat; without this the assertions read the previous render and report a
      // language switch that never happened.
      await new Promise((r) => setTimeout(r, 400))
      const afterSwitch = await browser.eval(`(() => ({
        lang: document.documentElement.lang,
        type: (document.querySelector('.antu-header-type') || {}).textContent || '',
        title: document.querySelector('.antu-header-title')
          ? document.querySelector('.antu-header-title').textContent
          : '',
      }))()`)
      const expectLang = beforeSwitch.lang === 'zh-CN' ? 'en' : 'zh-CN'
      eq(
        'document language follows the switch',
        afterSwitch.lang,
        expectLang,
        `${beforeSwitch.lang} → ${afterSwitch.lang}`,
      )
      truthy(
        'the interface chrome is translated',
        beforeSwitch.type !== afterSwitch.type,
        `${beforeSwitch.type} → ${afterSwitch.type}`,
      )
      // The data is language-neutral: the case title comes from the JSON and must not change.
      eq('the data itself is not translated', afterSwitch.title, spec.title)
      // Switch back, so the assertions that follow see the language they expect.
      await browser.eval(
        `(() => {
          const segs = [...document.querySelectorAll('.antu-dock-bar .antu-dock-seg')]
          const last = segs[segs.length - 1]
          const target = [...last.children].find((b) => !b.className.includes('is-on'))
          if (target) target.click()
        })()`,
        { userGesture: true },
      )
      await new Promise((r) => setTimeout(r, 400))
    }

    // The arrow at the end of the timeline must be an **SVG with a real size**.
    // This guards against two things: the arrow going back to a zero-size CSS border triangle
    // (dropped altogether on export), and "the source was changed but took no effect" — which I
    // did once, reporting the arrow as converted to SVG while the file still held a span 0×0.
    const arrow = await browser.eval(`(() => {
      const el = document.querySelector('.antu-axis-arrow')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { tag: el.tagName.toLowerCase(), w: r.width, h: r.height, poly: !!el.querySelector('polygon') }
    })()`)
    truthy('there is an arrow at the end of the timeline', arrow)
    if (arrow) {
      eq('the arrow is an svg', arrow.tag, 'svg')
      truthy('the arrow has a polygon (a real shape, not a zero-size border triangle)', arrow.poly)
      truthy('the arrow has a real size', arrow.w > 0 && arrow.h > 0, `${arrow.w}×${arrow.h}`)
    }

    // The one that matters most: the finished product must not make external requests
    const external = browser.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('file://'))
    eq('external request count', external.length, 0)
    if (external.length) console.log('     ' + external.join('\n     '))

    eq('console error count', browser.errors.length, 0)
    if (browser.errors.length) console.log('     ' + browser.errors.slice(0, 3).join('\n     '))

    // The four overlays each in the corner they belong in.
    // This guards against the class of problem "the base style layer was lost": the cards, column
    // headings and zoom are all still there but everything is crammed into the top left. Count and
    // content assertions cannot see it; only position can. It really happened once: refactoring
    // into TimelineRenderer lost React Flow's base styles.
    const boxes = await browser.eval(`(() => {
      const W = innerWidth, H = innerHeight
      const box = (sel) => {
        const e = document.querySelector(sel)
        if (!e) return null
        const r = e.getBoundingClientRect()
        return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2 }
      }
      return {
        viewport: { W, H },
        headerCard: box('.antu-header'),
        zoomControls: box('.react-flow__controls'),
        minimap: box('.react-flow__minimap'),
        dock: box('.antu-dock'),
      }
    })()`)
    const { W, H } = boxes.viewport
    truthy(
      'the label card is at the top left',
      boxes.headerCard && boxes.headerCard.l < W * 0.2 && boxes.headerCard.t < H * 0.2,
    )
    truthy(
      'the zoom controls are at the bottom left',
      boxes.zoomControls && boxes.zoomControls.t > H * 0.5 && boxes.zoomControls.l < W * 0.2,
    )
    truthy(
      'the minimap is at the bottom right',
      boxes.minimap && boxes.minimap.t > H * 0.5 && boxes.minimap.l > W * 0.5,
    )
    truthy(
      'the control dock is centred at the bottom',
      boxes.dock && boxes.dock.t > H * 0.8 && Math.abs(boxes.dock.cx - W / 2) < W * 0.1,
    )

    mkdirSync(OUT, { recursive: true })
    await browser.screenshot(SHOT)
    shotWritten = true
    ok('screenshot saved', SHOT.replace(REPO + '/', ''))

    await checkExport(browser, spec)
  } finally {
    await browser.close()
  }
  return html
}

// ---------------------------------------------------------------
// 6b. Render: the procedure flowchart
// ---------------------------------------------------------------
/**
 * The flowchart opened over file://, the same way a user opens it. What only a browser can
 * show: every node and link actually on screen, the shapes being real SVG, the switches doing
 * what they say, the overlay opening, the export producing an image of the right size.
 * The geometry itself is pinned by test/procedure-layout.test.mjs; here the counts are taken
 * from the same layout function, so the page is compared against it, not against a number
 * copied by hand.
 */
async function checkRenderProcedure(sampleFile) {
  section('render: procedure flowchart')
  if (!findChrome()) {
    bad('no usable Chrome, skipped', 'install Chrome, or point ANTU_CHROME at the browser you already have')
    return
  }

  const spec = JSON.parse(readFileSync(join(REPO, sampleFile), 'utf8'))
  // The page's default presentation: every switch on, vertical (a fresh profile has no preferences)
  const layout = buildProcedureGraph(spec, {}, undefined, 'vertical')
  const html = join(OUT, 'render-procedure.html')
  renderToFile(spec, { outPath: html, quiet: true })

  const browser = await launchBrowser({ width: 1600, height: 900 })
  try {
    await browser.open(`file://${html}?lang=zh`)
    const count = (sel) => browser.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`)

    eq('node count', await count('.antu-pn'), spec.nodes.length)
    // Flow links only: rule trunks and scope bars are drawn in the same layer with their own classes
    const FLOW_LINK = '.antu-plink.k-main, .antu-plink.k-branch, .antu-plink.k-back'
    eq('link count (several edges into one target merge into one)', await count(FLOW_LINK), layout.connections.length)
    eq('rule cards', await count('.antu-rule'), layout.rules.length)
    eq('rule trunks and scope bars', await count('.antu-plink.k-rule, .antu-plink.k-scope'), layout.ruleLinks.length)
    eq(
      'condition label count',
      await count('.antu-plabel'),
      layout.connections.filter((c) => c.label).length,
    )
    eq('stage band count', await count('.antu-pstage-name'), layout.stageBands.length)
    eq('main-line links carry the main class', await count('.antu-plink.k-main'), layout.spine.length - 1)
    eq('back edges carry the back class', await count('.antu-plink.k-back'), layout.connections.filter((c) => c.kind === 'back').length)

    // Shapes are SVG with a real size: a decision is a polygon, an end has its second ring
    const shapes = await browser.eval(`(() => {
      const z = parseFloat(document.querySelector('.react-flow__viewport').style.transform.split('scale(')[1])
      const one = (sel) => {
        const e = document.querySelector(sel)
        if (!e) return null
        const r = e.getBoundingClientRect()
        return { w: Math.round(r.width / z), h: Math.round(r.height / z) }
      }
      return {
        step: one('.antu-pn.k-step'),
        decisionPolygon: document.querySelectorAll('.antu-pn.k-decision polygon').length,
        decisions: document.querySelectorAll('.antu-pn.k-decision').length,
        endRings: document.querySelectorAll('.antu-pn.k-end .antu-pn-ring').length,
        ends: document.querySelectorAll('.antu-pn.k-end').length,
        arrows: [...document.querySelectorAll('.antu-plink.k-main, .antu-plink.k-branch, .antu-plink.k-back')].filter((p) => (p.getAttribute('marker-end') || '').startsWith('url(')).length,
        negative: document.querySelectorAll('.antu-pn.o-negative').length,
        // SVG paint set by a CSS class rule does not survive html-to-image: the first export
        // came out as solid black shapes on a correctly sized canvas. Paint must be attributes.
        unpainted: [...document.querySelectorAll('.antu-pn-shape, .antu-pn-ring, .antu-plink, .antu-arrow path')]
          .filter((e) => !e.getAttribute('fill') || (!e.closest('marker') && !e.getAttribute('stroke'))).length,
      }
    })()`)
    truthy('node shapes measured', shapes)
    if (shapes) {
      eq('a step box has its design size', [shapes.step?.w, shapes.step?.h], [sizeOf({ kind: 'step' }).w, sizeOf({ kind: 'step' }).h])
      eq('every decision is drawn as a diamond', shapes.decisionPolygon, shapes.decisions)
      eq('every end has its second ring', shapes.endRings, shapes.ends)
      eq('every link ends in an arrowhead', shapes.arrows, layout.connections.length)
      eq('negative outcomes are coloured as such', shapes.negative, spec.nodes.filter((n) => n.outcome === 'negative').length)
      eq('every shape and link carries its paint as SVG attributes (so the export keeps it)', shapes.unpainted, 0)
    }

    eq('label card title', await browser.eval(`document.querySelector('.antu-header-title')?.textContent`), spec.title)
    eq('label card type', await browser.eval(`document.querySelector('.antu-header-type')?.textContent`), '程序图')
    truthy(
      'the label card counts nodes, not time slots',
      (await browser.eval(`document.querySelector('.antu-header-info')?.textContent || ''`)).includes(`${spec.nodes.length} 个节点`),
    )

    // The dock: four switches (the stage one because the sample has stages), orientation,
    // language, export; and the export is still the only solid dark control
    const dock = await browser.eval(`(() => {
      const bar = document.querySelector('.antu-dock-bar')
      if (!bar) return null
      const kids = [...bar.children]
      const lum = (b) => {
        const m = getComputedStyle(b).backgroundColor.match(/[\\d.]+/g).map(Number)
        const a = m.length === 4 ? m[3] : 1
        return a * ((m[0] + m[1] + m[2]) / 3) + (1 - a) * 255
      }
      return {
        chips: bar.querySelectorAll('.antu-dock-chip').length,
        blocks: kids.filter((e) => e.classList.contains('antu-dock-sep')).length + 1,
        dark: [...bar.querySelectorAll('button')].filter((b) => lum(b) < 128).map((b) => b.className.split(' ')[0]),
      }
    })()`)
    truthy('the flowchart dock is present', dock)
    if (dock) {
      // conditions · detail · main line, plus stages and rules when the data has them
      eq('the dock has a switch per thing the data has', dock.chips, 3 + (spec.stages?.length ? 1 : 0) + (spec.rules?.length ? 1 : 0))
      eq('four blocks: switches · orientation · language · export', dock.blocks, 4)
      eq('only the export action is solid dark', dock.dark, ['antu-dock-action'])
    }

    // Switches do what they say. Clicked by position (the labels change with the language)
    const clickChip = (i) =>
      browser.eval(`document.querySelectorAll('.antu-dock-bar .antu-dock-chip')[${i}].click()`, { userGesture: true })
    const settle = () => new Promise((r) => setTimeout(r, 400))

    await clickChip(0)
    await settle()
    eq('the condition switch hides the labels', await count('.antu-plabel'), 0)
    await clickChip(0)
    await settle()

    await clickChip(2)
    await settle()
    eq('the main-line switch drops the highlight', await count('.antu-plinks.is-main-hl'), 0)
    await clickChip(2)
    await settle()
    eq('the main-line switch brings it back', await count('.antu-plinks.is-main-hl'), 1)

    await clickChip(3)
    await settle()
    eq('the stage switch removes the bands', await count('.antu-pstage-name'), 0)
    await clickChip(3)
    await settle()

    // The rule switch (the fifth chip: the sample has stages and rules) gives the lane back
    await clickChip(4)
    await settle()
    eq('the rule switch removes the cards', await count('.antu-rule'), 0)
    await clickChip(4)
    await settle()
    eq('and brings them back', await count('.antu-rule'), layout.rules.length)

    // Orientation: the second item of the first segmented control is "horizontal"
    await browser.eval(`document.querySelector('.antu-dock-bar .antu-dock-seg').children[1].click()`, { userGesture: true })
    await settle()
    truthy('horizontal: the stage bands run along the top', (await count('.antu-pstages.is-h')) === 1)
    eq('horizontal: no node is lost', await count('.antu-pn'), spec.nodes.length)
    await browser.eval(`document.querySelector('.antu-dock-bar .antu-dock-seg').children[0].click()`, { userGesture: true })
    await settle()

    // The overlay: keyboard pins it (the mouse path goes through React Flow), Escape closes it
    await browser.eval(`document.querySelector('.antu-pn.k-decision').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`)
    await settle()
    eq('Enter on a node pins its overlay', await count('.antu-preview.pinned'), 1)
    await browser.eval(`document.querySelector('.antu-pn.k-decision').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await settle()
    eq('Escape closes it', await count('.antu-preview'), 0)

    const external = browser.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('file://'))
    eq('external request count', external.length, 0)
    if (external.length) console.log('     ' + external.join('\n     '))
    eq('console error count', browser.errors.length, 0)
    if (browser.errors.length) console.log('     ' + browser.errors.slice(0, 3).join('\n     '))

    mkdirSync(OUT, { recursive: true })
    await browser.screenshot(join(OUT, 'screenshot-procedure.png'))
    ok('screenshot saved', '.verify/screenshot-procedure.png')

    // Export: the size must be the layout's content size plus padding, at 2×. The back-edge
    // lanes sit at the far edge of the content, so a size that forgot them shows up here.
    const { clickByClass, grab } = await downloadHelpers(browser)
    if (!(await clickByClass('.antu-dock-action'))) {
      bad('export image: the button is not in the flowchart dock')
    } else {
      const shot = await grab('procedure export')
      if (shot) {
        truthy('clicking export lands a PNG on disk', shot.buf.slice(1, 4).toString() === 'PNG')
        const frame = exportFrame(layout.size.width, layout.size.height)
        eq('export size = (content + padding) × 2', [shot.width, shot.height], [frame.width * 2, frame.height * 2])
        writeFileSync(join(OUT, 'export-procedure.png'), shot.buf)
        ok('export succeeded', `${shot.width}×${shot.height}  .verify/export-procedure.png`)
      }
    }
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------
// 7. MCP self-test
// ---------------------------------------------------------------
function checkMcp() {
  section('MCP server')
  try {
    const out = execFileSync('node', [join(REPO, 'tools/mcp/client-test.mjs')], {
      cwd: REPO,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    // client-test.mjs prints one `[N] title` line per step and a final ✅ line. Both the step
    // marker and the success line are in English since the strings were internationalised; the
    // parse here has to match that output exactly or this check silently loses its detail line.
    const marker = '✅'
    const summary = out.split('\n').find((l) => l.includes(marker)) || ''
    const steps = out.split('\n').filter((l) => /^\[\d+\]/.test(l.trim()))
    if (summary) ok('MCP twelve steps all pass', summary.replace(marker, '').trim() || steps[steps.length - 1]?.trim() || '')
    else bad('the MCP self-test failed', out.split('\n').slice(-4).join(' / '))
  } catch (e) {
    bad('the self-test could not run', String(e.stdout || e.message).split('\n').slice(-4).join(' / '))
  }
}

// ---------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------
console.log('antu · verify')
mkdirSync(OUT, { recursive: true })

const started = Date.now()

if (!shotOnly) {
  checkBuild()
  checkLint()
  checkUnit()
  checkMessages()
}

/**
 * The key names of the two message dictionaries must match exactly.
 *
 * Why this deserves a mechanical check: a missing key raises no error, and the interface simply
 * displays the key name itself (dock.exportImage, say). That is visible at a glance, but nobody
 * opens two files for every message added, so it goes to the verifier. The same for a surplus
 * key: it means one side no longer uses it, which is refactoring residue.
 */
function checkMessages() {
  section('message dictionaries')
  const ek = new Set(Object.keys(en))
  const zk = new Set(Object.keys(zh))
  const missingInZh = [...ek].filter((k) => !zk.has(k))
  const missingInEn = [...zk].filter((k) => !ek.has(k))
  eq('zh and en keys correspond one to one (nothing missing in zh)', missingInZh, [])
  eq('zh and en keys correspond one to one (nothing missing in en)', missingInEn, [])
  // Error messages are fixed in English: the same value in both dictionaries, never written twice
  const drift = [...ek]
    .filter((k) => FIXED_ENGLISH_PREFIXES.some((p) => k.startsWith(p)))
    .filter((k) => en[k] !== zh[k])
  eq('validation errors are identical in both dictionaries (errors are fixed English, they do not follow the interface language)', drift, [])
  truthy('the number of message keys is sensible', ek.size > 40, `${ek.size} entries`)

  // Every key the source asks for has to exist. A key that does not raises no error anywhere:
  // translate() hands the key straight back, so both the interface and the agent see
  // "perr.badKind" and read it as the message. It happened once: a translation pass rewrote the
  // procedure validation errors as keys and added none of them to the catalogue, and only the
  // procedure unit tests noticed, indirectly. This check is where that class of slip dies.
  const used = new Set()
  const collect = (dir) => {
    for (const e of readdirSync(join(REPO, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) {
        collect(p)
        continue
      }
      if (!/\.(js|jsx|mjs)$/.test(e.name)) continue
      const text = readFileSync(join(REPO, p), 'utf8')
      for (const m of text.matchAll(/\b(?:tEn|t)\(\s*'([A-Za-z][\w.]*)'/g)) used.add(m[1])
      for (const m of text.matchAll(/\btranslate\(\s*[^,()]+,\s*'([A-Za-z][\w.]*)'/g)) used.add(m[1])
    }
  }
  for (const d of ['src', 'tools']) collect(d)
  truthy('message keys are actually used', used.size > 20, `${used.size} keys found in the source`)
  eq(
    'every message key the source asks for exists in the dictionary',
    [...used].filter((k) => !ek.has(k)).sort(),
    [],
  )
}

const data = checkData()

checkBrowserLookup()
await checkLaunchFailure()
await checkLingeringChrome()

if (!shotOnly && !skipBrowser) {
  const profilesBefore = profilesInTmp().length
  if (data.sample) await checkRender(data.sample)
  if (data.procedureSample) await checkRenderProcedure(data.procedureSample)
  checkMcp()
  // This stretch launched a browser twice (once for the render, once for the MCP preview), and
  // both must be closed cleanly. Identity, not "equal to 0": this machine may already have
  // directories left by other instances, which are someone else's business; all this owns is
  // "this stretch added none".
  eq('temporary profile directories are cleaned up after the browser is done', profilesInTmp().length, profilesBefore)
} else if (shotOnly) {
  if (data.sample) await checkRender(data.sample)
}

console.log('')
if (failures.length === 0) {
  console.log(`all passed (${passed} checks, ${((Date.now() - started) / 1000).toFixed(1)}s)`)
  if (shotWritten) console.log(`screenshot: ${SHOT.replace(REPO + '/', '')}`)
  if (existsSync(join(OUT, 'export.png'))) console.log(`export sample: ${join(OUT, 'export.png').replace(REPO + '/', '')}`)
} else {
  console.log(`${failures.length} checks failed (${passed} passed):`)
  for (const f of failures) console.log('  - ' + f)
  rmSync(OUT, { recursive: true, force: true })
  process.exitCode = 1
}
