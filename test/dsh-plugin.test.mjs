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
  parseArgsRaw,
  resolveOutPath,
  runLayout,
  runRender,
  runValidate,
  sessionCwd,
  slugify,
} from '../tools/dsh/src/tools.mjs'
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
  assert.equal(resolveOutPath(undefined, 'Hello', '/tmp/sess'), join('/tmp/sess', 'Hello.html'))
  assert.equal(resolveOutPath('out/a.html', 'x', '/tmp/sess'), join('/tmp/sess', 'out/a.html'))
  assert.throws(() => resolveOutPath('rel.html', 'x', undefined), /session workspace/)
  assert.throws(() => resolveOutPath('/abs/x.html', 'x', '/tmp/sess'), /must stay under/)
  assert.throws(() => resolveOutPath('../../.bashrc', 'x', '/tmp/sess'), /must stay under/)
  assert.throws(() => resolveOutPath('..', 'x', '/tmp/sess'), /must stay under/)

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

test('parseArgsRaw tolerates truncated JSON', () => {
  assert.deepEqual(parseArgsRaw('{"a":1}'), { a: 1 })
  assert.equal(parseArgsRaw('{"a":'), null)
  assert.equal(parseArgsRaw(''), null)
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
  assert.match(host, /defineTool/)
  assert.match(host, /antu-diagram/)
  assert.match(host, /@zh-xx\/antu\/validate/)
  assert.match(host, /@zh-xx\/antu\/html/)

  const client = readFileSync(join(pkgDir, 'client.js'), 'utf8')
  assert.match(client, /__ModuleLoader__/)
  assert.match(client, /tool\.call\.toolview/)
  assert.match(client, /antu_render/)
  assert.match(client, /mcp__antu__antu_render/)
  assert.match(client, /client\.embed\.js/)
  assert.match(client, /\.destroy\(/)
  assert.match(client, /cardUi/)
  assert.match(client, /Enlarge/)
  assert.match(client, /antu-diagram/)
  assert.match(client, /sidebarRightTabs/)
  // Injected helper + safe call site (not require.async, which is undefined on DSH 0.1.x)
  assert.match(client, /function resolveRequireAsync/)
  assert.match(client, /function beginLoadEmbed/)
  assert.match(client, /≥ 0\.2\.0-rc\.2/)
  assert.match(client, /loadEmbed\(require\)/)
  assert.doesNotMatch(client, /loadEmbed\(require\.async\)/)
  assert.doesNotMatch(client, /@@INJECT_REQUIRE_ASYNC@@/)
  assert.ok(existsSync(join(pkgDir, 'lib', 'require-async.mjs')))

  const chunk = readFileSync(join(pkgDir, 'client.embed.js'), 'utf8')
  assert.match(chunk, /chunk:\s*['"]client\.embed\.js['"]/)
  assert.match(chunk, /exports\[["']mount["']\]/)
  assert.match(chunk, /exports\[["']cardUi["']\]/)
  assert.match(chunk, /exports\[["']kindsOf["']\]/)

  const tgz = readdirSync('tools/dsh').find((n) => n.startsWith('zh-xx-antu-dsh-') && n.endsWith('.tgz'))
  assert.ok(tgz, 'build:dsh should pack zh-xx-antu-dsh-*.tgz')
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

test('Host apply registers three tools and the skill on a stub Cordis context', async () => {
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
      `export { validate, layout } from ${JSON.stringify(join(process.cwd(), 'tools/api/validate.mjs'))}\n`,
    )
    writeFileSync(
      join(dir, 'antu-html.mjs'),
      `export { renderHtml } from ${JSON.stringify(join(process.cwd(), 'tools/api/html.mjs'))}\n`,
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
      ['antu_validate', 'antu_layout', 'antu_render'],
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
