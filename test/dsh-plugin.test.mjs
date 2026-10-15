// ============================================================
//  test/dsh-plugin.test.mjs — @zh-xx/antu-dsh Host helpers, manifest, build
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  readExample,
  readGuide,
  resolveOutPath,
  listExamples,
  runLayout,
  runRender,
  renderPresentation,
  runValidate,
  sessionCwd,
  slugify,
} from '../tools/dsh/src/tools.mjs'
import {
  THEMES,
  argsRawOf,
  knownKinds,
  mountOptions,
  parseArgsRaw,
  pickOpening,
  renderFailure,
  resultPath,
  statusOf,
  titleOf,
} from '../tools/dsh/src/card-model.mjs'
import {
  assertEmbedExports,
  beginLoadEmbed,
  resolveRequireAsync,
} from '../tools/dsh/src/require-async.mjs'
import { SKILL } from '../tools/dsh/src/skill.mjs'
import { validate, layout } from '../tools/api/validate.mjs'
import { renderHtml } from '../tools/api/html.mjs'
import '../src/renderers/index.js'

/** Shape of DSH ≥ 0.2 ModuleLoader factory require (has .async). */
function makeRequireV02(loader) {
  const requireFn = () => {
    throw new Error('sync require unused in this test')
  }
  requireFn.async = async (spec) => loader(spec)
  return requireFn
}

/** Shape of DSH 0.1.x factory require (no .async). */
function makeRequireV01() {
  return () => {
    throw new Error('sync require unused in this test')
  }
}

const root = JSON.parse(readFileSync('package.json', 'utf8'))
const pkgDir = 'tools/dsh/package'

const MINI = JSON.parse(readFileSync('examples/agent/procedure/1-minimal.en.json', 'utf8'))

test('slugify and resolveOutPath stay under the session cwd', () => {
  assert.equal(slugify('Hello / 世界'), 'Hello-世界')
  // A real folder under tmpdir(): on macOS that is behind a symlink (`/var` → `/private/var`).
  const sessBase = mkdtempSync(join(tmpdir(), 'antu-dsh-sess-'))
  try {
    const sess = realpathSync(sessBase)
    assert.equal(resolveOutPath(undefined, 'Hello', sessBase), join(sess, 'Hello.html'))
    assert.equal(resolveOutPath('out/a.html', 'x', sessBase), join(sess, 'out/a.html'))
    assert.throws(() => resolveOutPath('rel.html', 'x', undefined), /session workspace/)
    assert.throws(() => resolveOutPath('/abs/x.html', 'x', sessBase), /must stay under/)
    assert.throws(() => resolveOutPath('../../.bashrc', 'x', sessBase), /must stay under/)
    assert.throws(() => resolveOutPath('..', 'x', sessBase), /must stay under/)
    // A workspace folder that does not exist yet still resolves through the symlinked parent.
    const later = join(sessBase, 'not-yet')
    assert.equal(resolveOutPath('a.html', 'x', later), join(sess, 'not-yet', 'a.html'))
  } finally {
    rmSync(sessBase, { recursive: true, force: true })
  }

  const base = mkdtempSync(join(tmpdir(), 'antu-dsh-symlink-'))
  try {
    const ws = join(base, 'ws')
    const outside = join(base, 'outside')
    mkdirSync(ws)
    mkdirSync(outside)
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    // Existing symlink to an outside file
    symlinkSync(join(outside, 'secret.txt'), join(ws, 'evil.html'))
    assert.throws(() => resolveOutPath('evil.html', 'x', ws), /must stay under/)
    // Dangling symlink to a not-yet-existing outside file
    symlinkSync(join(outside, 'new.html'), join(ws, 'dangling.html'))
    assert.throws(() => resolveOutPath('dangling.html', 'x', ws), /must stay under/)
    // Symlinked parent directory pointing outside
    symlinkSync(outside, join(ws, 'linkdir'))
    assert.throws(() => resolveOutPath('linkdir/via.html', 'x', ws), /must stay under/)
    // A link loop is refused, not a stack overflow
    symlinkSync(join(ws, 'loop-b.html'), join(ws, 'loop-a.html'))
    symlinkSync(join(ws, 'loop-a.html'), join(ws, 'loop-b.html'))
    symlinkSync(join(ws, 'self.html'), join(ws, 'self.html'))
    for (const name of ['loop-a.html', 'loop-b.html', 'self.html']) {
      assert.throws(() => resolveOutPath(name, 'x', ws), /too many levels of symbolic links/)
    }
    // Absolute outPath inside the (possibly non-realpath) cwd still accepted
    const absInside = join(ws, 'abs2.html')
    assert.equal(resolveOutPath(absInside, 'x', ws), absInside)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('sessionCwd reads exec.agent.session.header.cwd', () => {
  assert.equal(sessionCwd({ agent: { session: { header: { cwd: '/w' } } } }), '/w')
  assert.equal(sessionCwd({}), undefined)
})

test('readGuide / listExamples / readExample read the agent material by plain name only', () => {
  const root = process.cwd()

  const guide = readGuide(root, 'fact')
  assert.equal(guide.ok, true)
  assert.match(guide.text, /Mechanism notes for an agent/)

  const listed = listExamples(root, 'procedure')
  assert.equal(listed.ok, true)
  assert.ok(
    listed.examples.some((e) => e.file === '1-minimal.en.json' && typeof e.title === 'string' && e.title.length > 0),
  )
  const zh = listExamples(root, 'procedure', 'zh-CN')
  assert.equal(zh.ok, true)
  assert.ok(zh.examples.length > 0)
  assert.ok(zh.examples.every((e) => e.file.endsWith('.zh-CN.json')))
  assert.ok(zh.examples.some((e) => e.file === '1-minimal.zh-CN.json'))

  const one = readExample(root, 'procedure', '1-minimal.en.json')
  assert.equal(one.ok, true)
  assert.equal(JSON.parse(one.text).type, 'procedure')
  assert.equal(readExample(root, 'procedure', '1-minimal.zh-CN.json').ok, true)

  // Unknown types name what is available
  const noGuide = readGuide(root, 'nope')
  assert.equal(noGuide.ok, false)
  assert.match(noGuide.reason, /type "nope"/)
  assert.match(noGuide.reason, /Available: .*fact/)
  const noExamples = listExamples(root, 'nope')
  assert.equal(noExamples.ok, false)
  assert.match(noExamples.reason, /type "nope"/)
  assert.match(noExamples.reason, /Available: .*fact/)

  // Path-like input is refused everywhere: no `..`, no separator, only listed names
  for (const bad of ['../x', 'a/b', '..', '.', 'a\\b', '']) {
    assert.equal(readGuide(root, bad).ok, false, `readGuide(${JSON.stringify(bad)})`)
    assert.equal(listExamples(root, bad).ok, false, `listExamples(${JSON.stringify(bad)})`)
    assert.equal(readExample(root, 'procedure', bad).ok, false, `readExample(file=${JSON.stringify(bad)})`)
  }
  assert.equal(readExample(root, 'procedure', 'missing.json').ok, false)
  assert.equal(readExample(root, '../fact', '1-minimal.en.json').ok, false)
})

test('parseArgsRaw tolerates truncated JSON', () => {
  assert.deepEqual(parseArgsRaw('{"a":1}'), { a: 1 })
  assert.equal(parseArgsRaw('{"a":'), null)
  assert.equal(parseArgsRaw(''), null)
})

test('card model: where the call arguments, the written file and the status come from', () => {
  assert.equal(argsRawOf(null), null)
  assert.equal(argsRawOf({ phase: 'start', argsRaw: '{"spec":1}' }), '{"spec":1}')
  assert.equal(argsRawOf({ phase: 'preparing', argsRaw: '{' }), null)
  assert.equal(argsRawOf({ kind: 'result', call: { argsRaw: '{"a":1}' } }), '{"a":1}')

  assert.equal(resultPath({ kind: 'result', meta: { path: '/w/a.html' } }), '/w/a.html')
  assert.equal(
    resultPath({ kind: 'result', content: [{ type: 'text', text: 'Written: /w/b.html\nSize: 1 KB' }] }),
    '/w/b.html',
  )
  assert.equal(resultPath({ kind: 'result', isError: true, meta: { path: '/w/a.html' } }), null)
  assert.equal(resultPath({ phase: 'start' }), null)

  assert.equal(statusOf('preparing'), 'preparing')
  assert.equal(statusOf('start'), 'running')
  assert.equal(statusOf('end', { isError: true }), 'error')
  assert.equal(statusOf('end', { error: { code: 'interrupted' } }), 'stopped')
  assert.equal(statusOf('end', {}), 'ok')

  assert.equal(titleOf({ title: '  案情  ' }, 'Antu'), '案情')
  assert.equal(titleOf({ title: ' ' }, 'Antu'), 'Antu')
  assert.equal(titleOf(null, 'Antu (MCP)'), 'Antu (MCP)')
})

test('render presentation: lossless JSON on every path, the reason kept', () => {
  const ok = renderPresentation({ ok: true, path: '/w/a.html', bytes: 12, title: undefined })
  assert.deepEqual(ok, { ok: true, path: '/w/a.html', title: '', bytes: 12 })
  for (const value of [
    { ok: false, reason: 'antu_render outPath must stay under the session workspace (/w)' },
    { ok: false, errors: ['nodes (n-2): a decision needs at least 2'] },
    { ok: false },
    undefined,
  ]) {
    const meta = renderPresentation(value)
    assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta)
    assert.equal(meta.ok, false)
    assert.ok(meta.reason)
  }
  // The card reads it back
  assert.equal(renderFailure({ kind: 'result', meta: renderPresentation({ ok: false, reason: 'EPERM: operation not permitted' }) }), 'EPERM: operation not permitted')
  assert.equal(
    renderFailure({ kind: 'result', meta: renderPresentation({ ok: false, errors: ['a', 'b'] }) }),
    'Validation failed: a (+1 more)',
  )
  assert.equal(renderFailure({ kind: 'result', meta: ok }), null)
  assert.equal(renderFailure({ phase: 'start' }), null)
})

test('card model: a diagram opens as asked only when the kind and theme exist', () => {
  const embed = { kindsOf: (type) => (type === 'fact' ? ['timeline', 'chronicle', 'scale'] : []) }
  const known = knownKinds(embed, { type: 'fact' })
  assert.deepEqual(known, ['timeline', 'chronicle', 'scale'])
  assert.deepEqual(knownKinds(embed, { type: 'nope' }), [])
  assert.deepEqual(knownKinds(embed, { type: 7 }), [])
  assert.deepEqual(knownKinds(null, { type: 'fact' }), [])
  assert.deepEqual(knownKinds({ kindsOf() { throw new Error('boom') } }, { type: 'fact' }), [])

  // Asked for and valid
  assert.deepEqual(pickOpening(known, 'scale', 'legal'), { mountKind: 'scale', mountTheme: 'legal', activeKind: 'scale' })
  // Not valid: mount with the engine's default, highlight the type's first kind
  assert.deepEqual(pickOpening(known, 'bogus', 'neon'), { mountKind: null, mountTheme: null, activeKind: 'timeline' })
  assert.deepEqual(pickOpening([], undefined, undefined), { mountKind: null, mountTheme: null, activeKind: null })
  assert.deepEqual(THEMES, ['document', 'modern', 'legal'])

  assert.deepEqual(mountOptions({ mountKind: 'scale', mountTheme: null }, { zoom: false }), { kind: 'scale', ui: { zoom: false } })
  assert.deepEqual(mountOptions({ mountKind: null, mountTheme: 'modern' }), { theme: 'modern' })
})

test('runValidate / runLayout / runRender against the real engine API', () => {
  const v = runValidate(MINI, { validate })
  assert.equal(v.ok, true)
  assert.ok(Array.isArray(v.errors))

  const bad = runValidate({ type: 'procedure' }, { validate })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.length > 0)

  const lay = runLayout(MINI, { layout })
  assert.equal(lay.ok, true)
  assert.match(lay.text, /./)

  const dir = mkdtempSync(join(tmpdir(), 'antu-dsh-'))
  try {
    const r = runRender(MINI, { renderHtml, cwd: dir })
    assert.equal(r.ok, true)
    assert.ok(existsSync(r.path))
    assert.ok(r.bytes > 1000)
    assert.equal(r.title, MINI.title)
    assert.match(readFileSync(r.path, 'utf8'), /<!DOCTYPE html>/i)

    const fail = runRender({ type: 'procedure' }, { renderHtml, cwd: dir })
    assert.equal(fail.ok, false)
    assert.ok(fail.errors?.length)

    // Parent path that cannot be created as a directory → { ok: false }, not a throw.
    writeFileSync(join(dir, 'blocked'), 'x')
    const io = runRender(MINI, { renderHtml, cwd: dir, outPath: 'blocked/out.html' })
    assert.equal(io.ok, false)
    assert.match(io.reason || '', /./)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('memory skill is antu-diagram (not bare antu) and teaches Host wire names', () => {
  assert.equal(SKILL.name, 'antu-diagram')
  assert.match(SKILL.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  assert.equal(SKILL.source, 'runtime')
  assert.match(SKILL.content, /antu_validate/)
  assert.match(SKILL.content, /antu_layout/)
  assert.match(SKILL.content, /antu_render/)
  assert.doesNotMatch(SKILL.content, /npx antu-mcp/)
})

test('package manifest matches root version and DSH bundle shape', () => {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, '@zh-xx/antu-dsh')
  assert.equal(pkg.version, root.version)
  assert.equal(pkg.dependencies['@zh-xx/antu'], root.version)
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-tool'))
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./client'], './client.js')

  const patch = readFileSync(join(pkgDir, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id:\s*antu-dsh/)
  assert.match(patch, /@zh-xx\/antu-dsh/)
})

test('resolveRequireAsync accepts DSH 0.2 require.async and refuses 0.1-shaped require', async () => {
  const good = makeRequireV02(async (spec) => {
    assert.equal(spec, './client.embed.js')
    return { mount() {}, cardUi: { panOnScroll: false }, kindsOf: () => [] }
  })
  const load = resolveRequireAsync(good)
  const mod = assertEmbedExports(await load('./client.embed.js'))
  assert.equal(typeof mod.mount, 'function')

  assert.throws(() => resolveRequireAsync(makeRequireV01()), (err) => {
    assert.match(err.message, /≥ 0\.2\.0-rc\.2/)
    assert.match(err.message, /no require\.async/)
    assert.equal(err.code, 'ANTU_DSH_REQUIRE_ASYNC')
    return true
  })
  assert.throws(() => resolveRequireAsync(undefined), /no require\.async/)
  assert.throws(() => assertEmbedExports(null), /did not export mount/)
  assert.throws(() => assertEmbedExports({ mount() {} }), /missing cardUi/)
})

test('beginLoadEmbed never throws sync on 0.1-shaped require (card can catch)', async () => {
  const cache = { promise: null }
  let syncThrow = false
  let rejected
  try {
    rejected = beginLoadEmbed(makeRequireV01(), cache)
  } catch {
    syncThrow = true
  }
  assert.equal(syncThrow, false, 'must not throw synchronously — that crashes tool.call.toolview')
  await assert.rejects(rejected, (err) => {
    assert.equal(err.code, 'ANTU_DSH_REQUIRE_ASYNC')
    return true
  })
  // Memoized: same rejected promise
  assert.equal(beginLoadEmbed(makeRequireV01(), cache), rejected)

  const okCache = { promise: null }
  const ok = await beginLoadEmbed(
    makeRequireV02(async () => ({ mount() {}, cardUi: { panOnScroll: false }, kindsOf: () => ['swimlane'] })),
    okCache,
  )
  assert.equal(typeof ok.mount, 'function')
  assert.equal(await beginLoadEmbed(makeRequireV02(async () => ({})), okCache), ok)
})

test('build.mjs writes Host entry, Client entry, and ModuleLoader embed chunk', () => {
  const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)

  const host = readFileSync(join(pkgDir, 'index.js'), 'utf8')
  assert.match(host, /antu_validate/)
  assert.match(host, /antu_layout/)
  assert.match(host, /antu_render/)
  assert.match(host, /antu_schema/)
  assert.match(host, /antu_guide/)
  assert.match(host, /antu_examples/)
  assert.match(host, /defineTool/)
  assert.match(host, /antu-diagram/)
  assert.match(host, /@zh-xx\/antu\/validate/)
  assert.match(host, /@zh-xx\/antu\/html/)
  // The validate entry is a namespace import: a named `describe` import would fail to link against an
  // older installed @zh-xx/antu and take every tool down with it.
  assert.match(host, /import \* as antuValidate from '@zh-xx\/antu\/validate'/)
  assert.doesNotMatch(host, /import\s*\{[^}]*\bdescribe\b[^}]*\}\s*from\s*['"]@zh-xx\/antu\/validate['"]/)

  const client = readFileSync(join(pkgDir, 'client.js'), 'utf8')
  assert.match(client, /__ModuleLoader__/)
  assert.match(client, /tool\.call\.toolview/)
  assert.match(client, /antu_render/)
  assert.match(client, /mcp__antu__antu_render/)
  assert.match(client, /client\.embed\.js/)
  assert.match(client, /\.destroy\(/)
  assert.match(client, /cardUi/)
  assert.match(client, /Open full view/)
  assert.match(client, /antu-diagram/)
  assert.match(client, /sidebarRightTabs/)
  // Injected helper + safe call site (not require.async, which is undefined on DSH 0.1.x)
  assert.match(client, /function resolveRequireAsync/)
  assert.match(client, /function beginLoadEmbed/)
  assert.match(client, /≥ 0\.2\.0-rc\.2/)
  assert.match(client, /loadEmbed\(require\)/)
  assert.doesNotMatch(client, /loadEmbed\(require\.async\)/)
  assert.doesNotMatch(client, /@@INJECT_/)
  // card-model.mjs is inlined too
  assert.match(client, /function pickOpening/)
  assert.match(client, /function parseArgsRaw/)
  assert.ok(existsSync(join(pkgDir, 'lib', 'require-async.mjs')))

  const chunk = readFileSync(join(pkgDir, 'client.embed.js'), 'utf8')
  assert.match(chunk, /chunk:\s*['"]client\.embed\.js['"]/)
  assert.match(chunk, /exports\[["']mount["']\]/)
  assert.match(chunk, /exports\[["']cardUi["']\]/)
  assert.match(chunk, /exports\[["']kindsOf["']\]/)

  const tgz = readdirSync('tools/dsh').find((n) => n.startsWith('zh-xx-antu-dsh-') && n.endsWith('.tgz'))
  assert.ok(tgz, 'build:dsh should pack zh-xx-antu-dsh-*.tgz')
})

test('build.mjs keeps the last good tarball when npm pack fails', { skip: process.platform === 'win32' && 'needs a POSIX fake npm on PATH' }, () => {
  const isTgz = (n) => n.startsWith('zh-xx-antu-dsh-') && n.endsWith('.tgz')
  let tgz = readdirSync('tools/dsh').find(isTgz)
  if (!tgz) {
    const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    tgz = readdirSync('tools/dsh').find(isTgz)
  }
  const before = readFileSync(join('tools/dsh', tgz))

  const bin = mkdtempSync(join(tmpdir(), 'antu-dsh-fake-npm-'))
  try {
    const fake = join(bin, 'npm')
    writeFileSync(fake, '#!/bin/sh\necho "npm error code EPERM (fake)" >&2\nexit 1\n', { mode: 0o755 })
    const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /npm pack failed; the previous tarball \(if any\) is kept/)
    assert.match(r.stderr, /EPERM \(fake\)/)
    assert.ok(existsSync(join('tools/dsh', tgz)), 'the last good tarball must survive a failed pack')
    assert.ok(readFileSync(join('tools/dsh', tgz)).equals(before))
    assert.ok(!readdirSync('tools/dsh').some((n) => n.startsWith('.pack-')), 'no staging folder left behind')
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
})

test('built client factory surfaces missing require.async as a rejected load (0.1.x shape)', async () => {
  // Ensure artifacts exist.
  if (!existsSync(join(pkgDir, 'client.js'))) {
    const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  }
  const clientSrc = readFileSync(join(pkgDir, 'client.js'), 'utf8')
  // Extract the inlined helpers by evaluating them in a tiny sandbox.
  const start = clientSrc.indexOf('function resolveRequireAsync')
  const end = clientSrc.indexOf('/** Lazy promise for the ModuleLoader embed chunk')
  assert.ok(start >= 0 && end > start, 'injected helpers must be present in built client.js')
  const helperSrc = clientSrc.slice(start, end)
  const sandbox = { exports: {} }
  const run = new Function(
    'exports',
    `${helperSrc}\nexports.resolveRequireAsync = resolveRequireAsync;\nexports.beginLoadEmbed = beginLoadEmbed;\nexports.assertEmbedExports = assertEmbedExports;`,
  )
  run(sandbox)

  const cache = { promise: null }
  const requireV01 = makeRequireV01()
  let sync = false
  let p
  try {
    p = sandbox.beginLoadEmbed(requireV01, cache)
  } catch {
    sync = true
  }
  assert.equal(sync, false)
  await assert.rejects(p, (err) => {
    assert.match(String(err.message), /≥ 0\.2\.0-rc\.2/)
    return true
  })

  const mod = await sandbox.beginLoadEmbed(
    makeRequireV02(async () => ({ mount() {}, cardUi: { panOnScroll: false } })),
    { promise: null },
  )
  assert.equal(typeof mod.mount, 'function')
})

test('Host apply registers the tools and the skill on a stub Cordis context', async () => {
  // Ensure build artifacts exist (previous test usually wrote them).
  if (!existsSync(join(pkgDir, 'index.js'))) {
    const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  }

  const dir = mkdtempSync(join(tmpdir(), 'antu-dsh-host-'))
  try {
    writeFileSync(join(dir, 'dsh-tools.mjs'), 'export function defineTool(def) { return def }\n')
    writeFileSync(
      join(dir, 'antu-validate.mjs'),
      `export { validate, layout, describe } from ${JSON.stringify(join(process.cwd(), 'tools/api/validate.mjs'))}\n`,
    )
    writeFileSync(
      join(dir, 'antu-html.mjs'),
      `export { renderHtml } from ${JSON.stringify(join(process.cwd(), 'tools/api/html.mjs'))}\n`,
    )
    // A minimal @zh-xx/antu package root, so the reference tools can resolve one.
    const antuRoot = join(dir, 'node_modules', '@zh-xx', 'antu')
    mkdirSync(join(antuRoot, 'spec', 'agent', 'fact'), { recursive: true })
    mkdirSync(join(antuRoot, 'examples', 'agent', 'fact'), { recursive: true })
    writeFileSync(join(antuRoot, 'package.json'), `${JSON.stringify({ name: '@zh-xx/antu', version: '0.0.0' })}\n`)
    writeFileSync(join(antuRoot, 'spec', 'agent', 'fact', 'guide.md'), '# Guide for fact\n')
    writeFileSync(
      join(antuRoot, 'examples', 'agent', 'fact', '1-minimal.en.json'),
      `${JSON.stringify({ type: 'fact', title: 'Minimal fact' })}\n`,
    )
    let host = readFileSync(join(pkgDir, 'index.js'), 'utf8')
    host = host
      .replace('@deepseek-ai/dsh-tools', './dsh-tools.mjs')
      .replace('@zh-xx/antu/validate', './antu-validate.mjs')
      .replace('@zh-xx/antu/html', './antu-html.mjs')
      .replace("from './lib/tools.mjs'", `from ${JSON.stringify(join(process.cwd(), pkgDir, 'lib/tools.mjs'))}`)
      .replace("from './lib/skill.mjs'", `from ${JSON.stringify(join(process.cwd(), pkgDir, 'lib/skill.mjs'))}`)
    const hostFile = join(dir, 'host.mjs')
    writeFileSync(hostFile, host)

    const { apply, inject } = await import(hostFile)
    assert.deepEqual(inject, ['tools'])

    const registered = []
    const skills = []
    apply({
      tools: { register: (t) => registered.push(t) },
      inject: (deps, fn) => {
        if (deps.includes('skills')) fn({ skills: { register: (s) => skills.push(s) } })
      },
    })
    assert.deepEqual(
      registered.map((t) => t.name),
      ['antu_validate', 'antu_layout', 'antu_render', 'antu_schema', 'antu_guide', 'antu_examples'],
    )
    assert.equal(skills[0]?.name, 'antu-diagram')

    const v = await registered[0].execute({ spec: MINI })
    assert.equal(v.ok, true)
    mkdirSync(join(dir, 'ws'), { recursive: true })
    const rendered = await registered[2].execute(
      { spec: MINI, outPath: 'card.html' },
      { agent: { session: { header: { cwd: join(dir, 'ws') } } } },
    )
    assert.equal(rendered.ok, true)
    assert.ok(existsSync(rendered.path))

    // The reference tools: field table from the engine, guide and examples from the resolved package root
    const byName = Object.fromEntries(registered.map((t) => [t.name, t]))
    const schema = await byName.antu_schema.execute({ type: 'fact' })
    assert.equal(schema.ok, true)
    assert.ok(schema.text.length > 0)
    const guide = await byName.antu_guide.execute({ type: 'fact' })
    assert.equal(guide.ok, true)
    assert.match(guide.text, /Guide for fact/)
    const listed = await byName.antu_examples.execute({ type: 'fact' })
    assert.deepEqual(listed, { ok: true, examples: [{ file: '1-minimal.en.json', title: 'Minimal fact' }] })
    assert.match(
      byName.antu_examples.output.render({}, listed).map((b) => b.text).join(''),
      /1-minimal\.en\.json/,
    )
    const fetched = await byName.antu_examples.execute({ type: 'fact', file: '1-minimal.en.json' })
    assert.equal(fetched.ok, true)
    assert.equal(fetched.file, '1-minimal.en.json')
    assert.match(fetched.text, /"Minimal fact"/)

    // The declared output contract, not only the pure function: presentationMeta must be lossless JSON on
    // every path (DSH rejects undefined with INVALID_TOOL_OUTPUT and the reason is lost), failures included
    const render = registered[2]
    const ws = { agent: { session: { header: { cwd: join(dir, 'ws') } } } }
    const lossless = (v) => assert.deepEqual(JSON.parse(JSON.stringify(v)), v, `not lossless JSON: ${String(v)}`)
    const metaOf = (args, value) => {
      const meta = render.output.presentationMeta(args, value)
      assert.notEqual(meta, undefined)
      lossless(meta)
      return meta
    }
    assert.equal(metaOf({}, rendered).path, rendered.path)
    const outside = await render.execute({ spec: MINI, outPath: '../../outside-workspace.html' }, ws)
    assert.equal(outside.ok, false)
    const outsideMeta = metaOf({}, outside)
    assert.deepEqual(outsideMeta, { ok: false, reason: outside.reason, errors: [] })
    assert.match(outsideMeta.reason, /must stay under the session workspace/)
    const invalid = await render.execute({ spec: { type: 'fact', title: 'x', events: 'nope' } }, ws)
    assert.equal(invalid.ok, false)
    const invalidMeta = metaOf({}, invalid)
    assert.ok(invalidMeta.errors.length > 0)
    const noCwd = await render.execute({ spec: MINI }, {})
    assert.match(metaOf({}, noCwd).reason, /session workspace/)
    // and the text the model reads still carries the reason
    assert.match(render.output.render({}, outside).map((b) => b.text).join(''), /must stay under/)

    const wsReal = realpathSync(join(dir, 'ws'))
    assert.ok(
      rendered.path === join(wsReal, 'card.html') ||
        realpathSync(dirname(rendered.path)) === wsReal,
      `path ${rendered.path} should be under ${wsReal}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Host apply still loads all six tools when @zh-xx/antu/validate has no describe', async () => {
  // The published 0.14.0 @zh-xx/antu/validate exports validate and layout only. A named `describe`
  // import would fail at link time and hide every tool; a namespace import must keep them all.
  if (!existsSync(join(pkgDir, 'index.js'))) {
    const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  }

  const dir = mkdtempSync(join(tmpdir(), 'antu-dsh-old-'))
  try {
    writeFileSync(join(dir, 'dsh-tools.mjs'), 'export function defineTool(def) { return def }\n')
    writeFileSync(
      join(dir, 'antu-validate.mjs'),
      `export { validate, layout } from ${JSON.stringify(join(process.cwd(), 'tools/api/validate.mjs'))}\n`,
    )
    writeFileSync(
      join(dir, 'antu-html.mjs'),
      `export { renderHtml } from ${JSON.stringify(join(process.cwd(), 'tools/api/html.mjs'))}\n`,
    )
    // A minimal old @zh-xx/antu root: guides and examples are there, `describe` is not.
    const antuRoot = join(dir, 'node_modules', '@zh-xx', 'antu')
    mkdirSync(join(antuRoot, 'spec', 'agent', 'fact'), { recursive: true })
    mkdirSync(join(antuRoot, 'examples', 'agent', 'fact'), { recursive: true })
    writeFileSync(join(antuRoot, 'package.json'), `${JSON.stringify({ name: '@zh-xx/antu', version: '0.14.0' })}\n`)
    writeFileSync(join(antuRoot, 'spec', 'agent', 'fact', 'guide.md'), '# Guide for fact\n')
    writeFileSync(
      join(antuRoot, 'examples', 'agent', 'fact', '1-minimal.en.json'),
      `${JSON.stringify({ type: 'fact', title: 'Minimal fact' })}\n`,
    )

    let host = readFileSync(join(pkgDir, 'index.js'), 'utf8')
    host = host
      .replace('@deepseek-ai/dsh-tools', './dsh-tools.mjs')
      .replace('@zh-xx/antu/validate', './antu-validate.mjs')
      .replace('@zh-xx/antu/html', './antu-html.mjs')
      .replace("from './lib/tools.mjs'", `from ${JSON.stringify(join(process.cwd(), pkgDir, 'lib/tools.mjs'))}`)
      .replace("from './lib/skill.mjs'", `from ${JSON.stringify(join(process.cwd(), pkgDir, 'lib/skill.mjs'))}`)
    const hostFile = join(dir, 'host.mjs')
    writeFileSync(hostFile, host)

    // Importing must not throw (the namespace import tolerates the missing `describe`).
    const { apply } = await import(hostFile)
    const registered = []
    apply({ tools: { register: (t) => registered.push(t) }, inject: () => {} })
    assert.deepEqual(
      registered.map((t) => t.name),
      ['antu_validate', 'antu_layout', 'antu_render', 'antu_schema', 'antu_guide', 'antu_examples'],
    )

    const byName = Object.fromEntries(registered.map((t) => [t.name, t]))
    assert.equal((await byName.antu_validate.execute({ spec: MINI })).ok, true)
    const schema = await byName.antu_schema.execute({ type: 'fact' })
    assert.equal(schema.ok, false)
    assert.match(schema.reason, /too old/)
    assert.match(schema.reason, /antu_guide and antu_examples still work/)
    assert.equal((await byName.antu_guide.execute({ type: 'fact' })).ok, true)
    assert.equal((await byName.antu_examples.execute({ type: 'fact' })).ok, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---- The built Client, run for real in a tiny hooks runtime (no browser, no DSH) ----

/** Just enough React to run a function component with hooks: state, refs, memo, effects, re-render until stable */
function miniReact() {
  let cur = null
  const slot = (make) => {
    const i = cur.i++
    if (!(i in cur.slots)) cur.slots[i] = make()
    return cur.slots[i]
  }
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((x, k) => Object.is(x, b[k]))
  const effect = (fn, deps) => {
    const s = slot(() => ({ deps: null, cleanup: null, ran: false }))
    cur.effects.push({ s, fn, deps })
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useRef: (v) => slot(() => ({ current: v })),
    useState: (init) => {
      const s = slot(() => ({ v: typeof init === 'function' ? init() : init }))
      const owner = cur
      return [s.v, (nv) => { s.v = typeof nv === 'function' ? nv(s.v) : nv; owner.dirty = true }]
    },
    useMemo: (fn, deps) => {
      const s = slot(() => ({ deps: null, v: undefined }))
      if (!sameDeps(s.deps, deps)) { s.v = fn(); s.deps = deps }
      return s.v
    },
    useEffect: effect,
    useLayoutEffect: effect,
  }
  /** Mount a component; `props` can be replaced with update(). `flush()` lets promises settle and re-renders */
  function mount(Component, props) {
    const inst = { slots: [], i: 0, effects: [], dirty: false, tree: null }
    const run = () => {
      for (let n = 0; n < 12; n += 1) {
        inst.i = 0
        inst.effects = []
        inst.dirty = false
        cur = inst
        inst.tree = Component(props)
        cur = null
        // commit: refs get a stand-in element
        const walk = (node) => {
          if (!node || typeof node !== 'object') return
          if (node.props?.ref) node.props.ref.current = inst.el
          for (const c of node.children || []) walk(c)
        }
        walk(inst.tree)
        for (const { s, fn, deps } of inst.effects) {
          if (s.ran && sameDeps(s.deps, deps)) continue
          if (s.cleanup) s.cleanup()
          s.cleanup = fn() || null
          s.deps = deps
          s.ran = true
        }
        if (!inst.dirty) return
      }
      throw new Error('component did not settle')
    }
    inst.el = { replaceChildren() {} }
    run()
    return {
      tree: () => inst.tree,
      async flush() { await new Promise((r) => setTimeout(r, 0)); run() },
      update(next) { props = next; run() },
      rerender: run,
    }
  }
  return { React, mount }
}

const textOf = (node) => (node && typeof node === 'object' ? (node.children || []).map(textOf).join('') : node == null || node === false ? '' : String(node))
const findAll = (node, pred, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (pred(node)) out.push(node)
  for (const c of node.children || []) findAll(c, pred, out)
  return out
}
const buttonLabelled = (tree, label) => findAll(tree, (n) => n.type === 'button' && textOf(n) === label)[0]

/** Load the built package/client.js; return the chat card, and the full-view page when a right sidebar is given */
function loadBuiltCard({ requireAsync, sidebarRight }) {
  const { React, mount } = miniReact()
  let def
  new Function('window', readFileSync(join(pkgDir, 'client.js'), 'utf8'))({ __ModuleLoader__: { load: (d) => { def = d } } })
  const req = (id) => { assert.equal(id, 'react'); return React }
  if (requireAsync) req.async = requireAsync
  const registered = {}
  const slots = { inject: (_n, fn) => fn(), register: ({ key }, comp) => { registered[key] = comp } }
  const tabTypes = []
  def.factory(req).apply({
    slots,
    inject(_names, fn) {
      if (!sidebarRight) return // a profile without the right sidebar
      fn({ effect: (f) => f(), slots, sidebarRight, sidebarRightTabs: { register: (t) => tabTypes.push(t) } })
    },
  })
  return { Card: registered.antu_render, McpCard: registered.mcp__antu__antu_render, Page: registered['@zh-xx/antu-dsh'], tabTypes, mount }
}

function fakeEmbed({ failMount } = {}) {
  const calls = { mount: [], destroyed: 0, kinds: [], themes: [] }
  const embed = {
    cardUi: { panOnScroll: false, header: false },
    kindsOf: (type) => (type === 'fact' ? ['timeline', 'chronicle', 'scale'] : []),
    mount(el, spec, options) {
      calls.mount.push({ spec, options })
      if (failMount) throw new Error('mount refused')
      return {
        destroy() { calls.destroyed += 1 },
        setKind(k) { calls.kinds.push(k); return k !== 'scale-not-allowed' },
        setTheme(t) { calls.themes.push(t); return true },
      }
    },
  }
  return { embed, calls }
}

const callBlock = (args, extra = {}) => ({ kind: 'result', call: { argsRaw: JSON.stringify(args) }, meta: { path: '/w/a.html' }, ...extra })

test('built client card: only the whole picture; new arguments remount it', async () => {
  if (!existsSync(join(pkgDir, 'client.js'))) {
    const r = spawnSync(process.execPath, ['tools/dsh/build.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  }
  const { embed, calls } = fakeEmbed()
  const { Card, McpCard, mount } = loadBuiltCard({ requireAsync: async () => embed })
  assert.equal(typeof Card, 'function')
  assert.equal(McpCard, Card, 'the stopgap MCP wire name shows the same card')

  const spec = { type: 'fact', title: '案情' }
  const view = mount(Card, { phase: 'end', toolName: 'antu_render', openFile() {}, block: callBlock({ spec, kind: 'scale', theme: 'legal' }) })
  await view.flush()

  // Mounted once, with the asked-for kind and theme and the quiet chrome of cardUi (the whole diagram, fitted)
  assert.equal(calls.mount.length, 1)
  assert.deepEqual(calls.mount[0].options, { kind: 'scale', theme: 'legal', ui: embed.cardUi })
  assert.deepEqual(calls.mount[0].spec, spec)
  // Nothing but the picture: no title row, no buttons (no right sidebar here, so no cover either)
  assert.equal(findAll(view.tree(), (n) => n.type === 'button').length, 0)
  assert.equal(textOf(view.tree()).trim(), '')

  // New arguments: the old mount is destroyed, then the diagram is mounted again (never "already mounted")
  view.update({ phase: 'end', toolName: 'antu_render', openFile() {}, block: callBlock({ spec: { type: 'fact', title: '二稿' }, kind: 'bogus', theme: 'neon' }) })
  assert.equal(calls.destroyed, 1)
  assert.equal(calls.mount.length, 2)
  // An unknown kind or theme is not passed on
  assert.deepEqual(calls.mount[1].options, { ui: embed.cardUi })
})

test('built client card: a click opens the full view, fullscreen, with the HTML one click away', async () => {
  const { embed, calls } = fakeEmbed()
  const opened = []
  const toggled = []
  const sidebarRight = {
    openTab: (kind, options) => opened.push({ kind, options }),
    commandTarget: () => ({ paneId: 'p1', host: 'dock' }),
    toggleFullscreen: (target) => toggled.push(target),
  }
  const { Card, Page, tabTypes, mount } = loadBuiltCard({ requireAsync: async () => embed, sidebarRight })
  assert.deepEqual(tabTypes.map((t) => t.kind), ['antu-diagram'])
  assert.equal(typeof Page, 'function')

  const files = []
  const spec = { type: 'fact', title: '案情' }
  const card = mount(Card, { phase: 'end', toolName: 'antu_render', openFile: (p) => files.push(p), block: callBlock({ spec, kind: 'scale' }) })
  await card.flush()
  const cover = findAll(card.tree(), (n) => n.type === 'button')
  assert.equal(cover.length, 1, 'one cover over the picture, nothing else')
  assert.match(cover[0].props['aria-label'], /Open full view: 案情/)
  cover[0].props.onClick()
  assert.equal(opened.length, 1)
  assert.equal(opened[0].kind, 'antu-diagram')
  assert.deepEqual(opened[0].options.params, { spec, kind: 'scale', theme: undefined, path: '/w/a.html', title: '案情', wantFullscreen: true })

  // The page: the full diagram (no cardUi), the panel asked to go fullscreen once, and the HTML button
  let tabInfo = { sidebar: { expanded: true, fullscreen: false }, tab: { navigation: { params: opened[0].options.params, revision: 1 } } }
  const page = mount(Page, { useTabInfo: () => tabInfo })
  await page.flush()
  assert.deepEqual(calls.mount.at(-1).options, { kind: 'scale' })
  assert.equal(toggled.length, 1)
  page.rerender()
  assert.equal(toggled.length, 1, 'asked once per opening, not on every render')
  // The reader leaves fullscreen: the page does not force it back
  tabInfo = { ...tabInfo, sidebar: { expanded: true, fullscreen: false } }
  page.rerender()
  assert.equal(toggled.length, 1)
  buttonLabelled(page.tree(), 'Open HTML').props.onClick()
  assert.deepEqual(files, ['/w/a.html'])

  // Already fullscreen: nothing toggled (toggling would leave it)
  const again = mount(Page, { useTabInfo: () => ({ sidebar: { expanded: true, fullscreen: true }, tab: { navigation: { params: opened[0].options.params, revision: 2 } } }) })
  await again.flush()
  assert.equal(toggled.length, 1)
})

test('built client card: says what is wrong instead of crashing (mount fails, truncated arguments, DSH 0.1.x)', async () => {
  // The engine refuses the spec: the card keeps its mount host and shows the reason
  const bad = fakeEmbed({ failMount: true })
  const a = loadBuiltCard({ requireAsync: async () => bad.embed })
  const refused = a.mount(a.Card, { phase: 'end', toolName: 'antu_render', block: callBlock({ spec: { type: 'fact' } }) })
  await refused.flush()
  const fallback = findAll(refused.tree(), (n) => String(n.props?.className || '').includes('antuDsh_fallback'))[0]
  assert.match(textOf(fallback), /mount refused/)
  assert.ok(findAll(refused.tree(), (n) => String(n.props?.className || '') === 'antuDsh_canvas')[0], 'the mount host stays in the tree')

  // Arguments cut off while the model is still writing them
  const ok = fakeEmbed()
  const b = loadBuiltCard({ requireAsync: async () => ok.embed })
  const partial = b.mount(b.Card, { phase: 'start', toolName: 'antu_render', block: { phase: 'start', argsRaw: '{"spec":{"type":' } })
  await partial.flush()
  assert.equal(ok.calls.mount.length, 0)
  assert.match(textOf(partial.tree()), /Could not parse tool arguments/)

  // antu_render returned ok: false (here: outPath outside the workspace): the reason, not a picture
  const failed = b.mount(b.Card, {
    phase: 'end', toolName: 'antu_render',
    block: { kind: 'result', call: { argsRaw: JSON.stringify({ spec: { type: 'fact' } }) }, meta: { ok: false, reason: 'antu_render outPath must stay under the session workspace (/w)', errors: [] } },
  })
  await failed.flush()
  assert.match(textOf(failed.tree()), /must stay under the session workspace/)
  assert.equal(ok.calls.mount.length, 0, 'nothing is drawn for a call that failed')

  // DSH 0.1.x has no require.async: a clear message, no throw
  const c = loadBuiltCard({ requireAsync: undefined })
  const old = c.mount(c.Card, { phase: 'end', toolName: 'antu_render', block: callBlock({ spec: { type: 'fact' } }) })
  await old.flush()
  assert.match(textOf(old.tree()), /≥ 0\.2\.0-rc\.2/)
})
