// ============================================================
//  tools/verify/skill-cli.mjs — the skill's command line, run by whatever Node this is
//
//  The command line (skills/antu/scripts/antu.mjs) promises Node 18 or newer and nothing installed beside it. This
//  script holds it to that: it copies the skill folder to a temporary place with no node_modules anywhere near,
//  and runs each command on a small example of each kind. It imports nothing but Node's own modules and uses
//  nothing newer than Node 18, so CI runs it under every version we promise (.github/workflows/verify.yml), and so
//  can anyone:   node tools/verify/skill-cli.mjs
// ============================================================

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TYPES = ['fact', 'procedure', 'relationship', 'justification']
const failures = []
let passed = 0

const check = (name, ok, detail = '') => {
  if (ok) passed += 1
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const work = mkdtempSync(join(tmpdir(), 'antu-skill-cli-'))
try {
  cpSync(join(REPO, 'skills/antu'), join(work, 'antu'), { recursive: true })
  const cli = join(work, 'antu/scripts/antu.mjs')
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: work })
  const version = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version

  const v = run('--version')
  check('--version', v.status === 0 && v.stdout.trim() === `antu ${version}`, `${v.stdout.trim()} ${v.stderr.trim()}`)

  for (const type of TYPES) {
    const spec = join(work, `antu/examples/${type}/1-minimal.zh-CN.json`)
    const val = run('validate', spec)
    check(`${type}: validate passes`, val.status === 0 && val.stdout.startsWith('Validation passed'), val.stderr.trim() || val.stdout.trim())
    const lay = run('layout', spec)
    check(`${type}: layout reports`, lay.status === 0 && /content \d+×\d+/.test(lay.stdout), lay.stderr.trim() || lay.stdout.trim())
    const out = join(work, `${type}.html`)
    const ren = run('render', spec, '-o', out)
    const html = existsSync(out) ? readFileSync(out, 'utf8') : ''
    check(`${type}: render writes the page`, ren.status === 0 && html.includes('window.__ANTU_SPEC__ = {') && !html.includes('/*ANTU_SPEC*/null'), ren.stderr.trim())
  }

  // a diagram with a problem: named, exit code 1, and render writes nothing
  const bad = JSON.parse(readFileSync(join(work, 'antu/examples/justification/3-issues.zh-CN.json'), 'utf8'))
  bad.links[0].from = 'nowhere'
  writeFileSync(join(work, 'bad.json'), JSON.stringify(bad))
  const vb = run('validate', 'bad.json')
  check('a problem is named, exit code 1', vb.status === 1 && /nowhere/.test(vb.stderr), `${vb.status} ${vb.stderr.trim()}`)
  const rb = run('render', 'bad.json', '-o', join(work, 'bad.html'))
  check('render refuses it and writes nothing', rb.status === 1 && !existsSync(join(work, 'bad.html')), `${rb.status}`)
  check('a missing file is exit code 2', run('validate', 'no-such.json').status === 2)
  check('an unknown command is exit code 2', run('frob', 'x.json').status === 2)
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`node ${process.version}: ${failures.length} check(s) failed, ${passed} passed`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`node ${process.version}: the skill's command line passes (${passed} checks)`)
