// ============================================================
//  tools/verify/npm-pack.mjs — the npm package, packed, installed in an empty folder and run
//
//  What people get from npm is the tarball, not the repository. This script holds the tarball to what the package
//  promises: it builds dist-npm/ (tools/build-npm.mjs), packs it, installs the tarball into an empty folder with
//  nothing of the repository near it, and there
//    · runs the command line (`antu --version`, validate and render an example of each kind),
//    · starts the MCP server over stdio (`antu-mcp`) as a client does: lists its tools, asks for a guide and the
//      examples, validates and renders one, and checks the page lands in the folder it was started in.
//  It publishes nothing. The MCP client here is the SDK the repository already has; the installed package itself
//  has no node_modules beside it.      node tools/verify/npm-pack.mjs
// ============================================================

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { writeNpmPackage } from '../build-npm.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TOOLS = ['antu_schema', 'antu_guide', 'antu_examples', 'antu_validate', 'antu_layout', 'antu_render', 'antu_preview']
const TYPES = ['fact', 'procedure', 'relationship', 'justification']
const failures = []
let passed = 0
const check = (name, ok, detail = '') => {
  if (ok) passed += 1
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const work = mkdtempSync(join(tmpdir(), 'antu-npm-pack-'))
try {
  const pkgDir = await writeNpmPackage(join(work, 'package-dir'))
  const version = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const packed = spawnSync(npm, ['pack', '--pack-destination', work, '--json'], { cwd: pkgDir, encoding: 'utf8', shell: process.platform === 'win32' })
  check('npm pack', packed.status === 0, packed.stderr.trim())
  const info = packed.status === 0 ? JSON.parse(packed.stdout)[0] : null
  if (info) {
    check('package is small (under 4 MB packed)', info.size < 4 * 1024 * 1024, `${info.size} bytes`)
    const names = info.files.map((f) => f.path)
    for (const must of ['package.json', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'bin/antu.mjs', 'bin/antu-mcp.mjs', 'assets/viewer.html', 'spec/agent/fact/guide.md']) {
      check(`package holds ${must}`, names.includes(must))
    }
    check('package holds no source of the repository', !names.some((n) => n.startsWith('src/') || n.startsWith('tools/') || n.startsWith('node_modules/')))
  }

  // an empty folder with nothing of the repository near it: the tarball is installed there
  const user = join(work, 'user')
  mkdirSync(user)
  writeFileSync(join(user, 'package.json'), '{"name":"user","private":true}\n')
  const tarball = join(work, info?.filename ?? 'missing.tgz')
  const installed = spawnSync(npm, ['install', tarball, '--no-audit', '--no-fund', '--loglevel=error'], { cwd: user, encoding: 'utf8', shell: process.platform === 'win32' })
  check('npm install of the tarball', installed.status === 0, installed.stderr.trim())
  const root = join(user, 'node_modules/@zh-xx/antu')
  check('no dependencies installed beside it', !existsSync(join(user, 'node_modules/@modelcontextprotocol')) && !existsSync(join(user, 'node_modules/react')))

  const cli = join(root, 'bin/antu.mjs')
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: user })
  const v = run('--version')
  check('antu --version', v.status === 0 && v.stdout.trim() === `antu ${version}`, `${v.stdout.trim()} ${v.stderr.trim()}`)
  for (const type of TYPES) {
    const spec = join(root, `examples/agent/${type}/1-minimal.zh-CN.json`)
    check(`${type}: the example is in the package`, existsSync(spec))
    const val = run('validate', spec)
    check(`${type}: antu validate`, val.status === 0 && val.stdout.startsWith('Validation passed'), val.stderr.trim() || val.stdout.trim())
    const out = join(user, `cli-${type}.html`)
    const ren = run('render', spec, '-o', out)
    check(`${type}: antu render`, ren.status === 0 && existsSync(out) && readFileSync(out, 'utf8').includes('"type"'), ren.stderr.trim())
  }

  // the MCP server, started the way a client starts it, in the user's folder
  const client = new Client({ name: 'npm-pack-test', version: '0.0.0' })
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'bin/antu-mcp.mjs')], cwd: user, stderr: 'pipe' })
  try {
    await client.connect(transport)
    const listed = (await client.listTools()).tools.map((t) => t.name)
    for (const t of TOOLS) check(`mcp: tool ${t}`, listed.includes(t))
    const text = (r) => r.content.map((c) => c.text ?? '').join('\n')

    const guide = await client.callTool({ name: 'antu_guide', arguments: { type: 'fact' } })
    check('mcp: antu_guide gives the fact guide', !guide.isError && text(guide).length > 500, text(guide).slice(0, 120))
    const schema = await client.callTool({ name: 'antu_schema', arguments: { type: 'procedure' } })
    check('mcp: antu_schema gives a field table', !schema.isError && text(schema).length > 200, text(schema).slice(0, 120))
    const examples = await client.callTool({ name: 'antu_examples', arguments: { type: 'justification' } })
    check('mcp: antu_examples lists examples', !examples.isError && /\.json/.test(text(examples)), text(examples).slice(0, 120))

    const spec = JSON.parse(readFileSync(join(root, 'examples/agent/fact/1-minimal.zh-CN.json'), 'utf8'))
    const val = await client.callTool({ name: 'antu_validate', arguments: { spec } })
    check('mcp: antu_validate passes an example', !val.isError, text(val).slice(0, 160))
    const bad = await client.callTool({ name: 'antu_validate', arguments: { spec: { type: 'fact' } } })
    check('mcp: antu_validate refuses a broken one', bad.isError === true || /fail|error|problem/i.test(text(bad)), text(bad).slice(0, 160))
    const lay = await client.callTool({ name: 'antu_layout', arguments: { spec } })
    check('mcp: antu_layout answers', !lay.isError, text(lay).slice(0, 160))

    const before = new Set(readdirSync(user))
    const ren = await client.callTool({ name: 'antu_render', arguments: { spec } })
    check('mcp: antu_render without outPath writes into the folder it runs in', !ren.isError && readdirSync(user).some((f) => !before.has(f) && f.endsWith('.html')), text(ren).slice(0, 200))
    const outPath = join(user, 'mcp-out.html')
    const ren2 = await client.callTool({ name: 'antu_render', arguments: { spec, outPath, kind: 'timeline' } })
    check('mcp: antu_render to a path', !ren2.isError && existsSync(outPath) && readFileSync(outPath, 'utf8').includes('"defaultKind":"timeline"'), text(ren2).slice(0, 200))
  } catch (e) {
    check('mcp: the server runs and answers', false, String(e?.message ?? e))
  } finally {
    await client.close().catch(() => {})
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures.length) {
  process.stderr.write(`npm package: ${failures.length} failed, ${passed} passed\n${failures.map((f) => `  - ${f}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`npm package: ${passed} checks passed\n`)
