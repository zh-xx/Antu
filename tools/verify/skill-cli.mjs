// ============================================================
//  tools/verify/skill-cli.mjs — the skill's command line, run by whatever Node this is
//
//  The command line (skills/antu/scripts/antu.mjs) promises Node 18 or newer and nothing installed beside it. This
//  script holds it to that: it copies the skill folder to a temporary place with no node_modules anywhere near,
//  and runs each command on a small example of each kind. It imports nothing but Node's own modules and uses
//  nothing newer than Node 18, so CI runs it under every version we promise, on Linux, macOS and Windows
//  (.github/workflows/verify.yml), and so can anyone:   node tools/verify/skill-cli.mjs
//
//  By default it holds the repository's skills/antu/ to it. With --skill <dir> it holds another copy to it: the
//  release workflow unpacks the zip it is about to publish and points this script at that, so what users download is
//  what was tested.   node tools/verify/skill-cli.mjs --skill /path/to/unpacked/antu
//
//  It also runs the skill's Python script (scripts/make_html.py) with whatever Python 3 is on the machine. Without
//  one it is skipped, unless ANTU_REQUIRE_PYTHON is set (CI sets it), in which case a missing Python is a failure.
// ============================================================

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const SKILL_DIR = resolve(argv.includes('--skill') ? argv[argv.indexOf('--skill') + 1] : join(REPO, 'skills/antu'))
const TYPES = ['fact', 'procedure', 'relationship', 'justification']
const failures = []
let passed = 0

const check = (name, ok, detail = '') => {
  if (ok) passed += 1
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const work = mkdtempSync(join(tmpdir(), 'antu-skill-cli-'))
try {
  cpSync(SKILL_DIR, join(work, 'antu'), { recursive: true })
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

  // preview (#82): a screenshot of the page, so an agent can look at it. A command line from an earlier release has none (the
  // committed skill is the last release until the next one), so it is checked only where the command line has it.
  if (run('--help').stdout.includes('preview')) {
    const runWith = (env, ...args) =>
      spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', cwd: work, env: { ...process.env, ...env } })
    // the size a PNG says it is, from its header
    const pngSize = (file) => {
      const b = existsSync(file) ? readFileSync(file) : Buffer.alloc(0)
      return b.length > 24 && b.toString('latin1', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}` : null
    }
    const noBrowser = runWith({ ANTU_CHROME: join(work, 'no-such-browser') }, 'preview', join(work, 'antu/examples/fact/1-minimal.zh-CN.json'), '-o', join(work, 'x.png'))
    check('preview: an ANTU_CHROME that points at nothing is said so, exit code 3', noBrowser.status === 3 && /ANTU_CHROME/.test(noBrowser.stderr), `${noBrowser.status} ${noBrowser.stderr.trim()}`)

    // Node below 22 has no WebSocket and takes the browser's own screenshot; 22 and newer drive the browser, and
    // take the other way too when told to, so both ways are tried wherever the machine allows
    const ways = typeof WebSocket === 'function' ? [['protocol', {}], ['browser screenshot', { ANTU_PREVIEW_VIA: 'flag' }]] : [['browser screenshot', {}]]
    let missing = false
    for (const [way, env] of ways) {
      for (const type of ['fact', 'justification']) {
        const out = join(work, `${type}-${env.ANTU_PREVIEW_VIA || 'cdp'}.png`)
        const r = runWith(env, 'preview', join(work, `antu/examples/${type}/1-minimal.zh-CN.json`), '-o', out)
        if (r.status === 3 && /no Chromium-based browser found/.test(r.stderr)) {
          missing = true
          continue
        }
        const size = pngSize(out)
        check(`${type}: preview takes a 1600×900 picture (${way})`, r.status === 0 && size === '1600×900' && /Open the PNG/.test(r.stdout), `${r.status} ${size} ${r.stderr.trim()}`)
      }
    }
    if (missing) {
      if (process.env.ANTU_REQUIRE_BROWSER) check('a Chromium-based browser is found', false, 'preview found none')
      else console.log('  (no Chromium-based browser here, preview took no picture)')
    }
  } else {
    console.log('  (this command line has no preview yet)')
  }

  // --kind (#85): the same JSON drawn another way. A command line from an earlier release has none.
  if (run('--help').stdout.includes('--kind')) {
    const spec = join(work, 'antu/examples/fact/1-minimal.zh-CN.json')
    const lay = run('layout', spec, '--kind', 'chronicle')
    check('fact: layout --kind chronicle reports the chronicle', lay.status === 0 && /^Kind: chronicle/m.test(lay.stdout), lay.stderr.trim() || lay.stdout.trim())
    const wrong = run('layout', spec, '--kind', 'swimlane')
    check('an unknown kind is named, exit code 2', wrong.status === 2 && /timeline, chronicle/.test(wrong.stderr), `${wrong.status} ${wrong.stderr.trim()}`)
    // The relationship focus view, where this command line has it
    if (run('--help').stdout.includes('focus')) {
      const rel = join(work, 'antu/examples/relationship/1-minimal.zh-CN.json')
      const f = run('layout', rel, '--kind', 'focus')
      check('relationship: layout --kind focus reports the focus view', f.status === 0 && /^Kind: focus/m.test(f.stdout), f.stderr.trim() || f.stdout.trim())
      const ch = run('layout', rel, '--kind', 'chain')
      check('relationship: layout --kind chain reports the guarantee chain', ch.status === 0 && /^Kind: chain/m.test(ch.stdout), ch.stderr.trim() || ch.stdout.trim())
      const wrongRel = run('layout', rel, '--kind', 'scale')
      check('a fact kind on a relationship is named, exit code 2', wrongRel.status === 2 && /graph, focus, chain/.test(wrongRel.stderr), `${wrongRel.status} ${wrongRel.stderr.trim()}`)
    }
    // The time scale, where this command line has it
    if (run('--help').stdout.includes('scale')) {
      const sc = run('layout', spec, '--kind', 'scale')
      check('fact: layout --kind scale reports the time scale', sc.status === 0 && /^Kind: scale/m.test(sc.stdout), sc.stderr.trim() || sc.stdout.trim())
    }
    const out = join(work, 'fact-chronicle.html')
    const ren = run('render', spec, '-o', out, '--kind', 'chronicle')
    const html = existsSync(out) ? readFileSync(out, 'utf8') : ''
    check('fact: render --kind chronicle opens the page in the chronicle', ren.status === 0 && html.includes('"defaultKind":"chronicle"'), ren.stderr.trim())
    const png = join(work, 'fact-chronicle.png')
    const pre = run('preview', spec, '-o', png, '--kind', 'chronicle')
    if (pre.status === 3 && /no Chromium-based browser found/.test(pre.stderr)) {
      if (process.env.ANTU_REQUIRE_BROWSER) check('a Chromium-based browser is found (--kind)', false, 'preview found none')
    } else {
      check('fact: preview --kind chronicle takes a picture with every event drawn', pre.status === 0 && existsSync(png) && (/, 3 item\(s\) drawn/.test(pre.stdout) || /browser's own screenshot/.test(pre.stdout)), `${pre.status} ${pre.stderr.trim()}`)
    }
  } else {
    console.log('  (this command line has no --kind yet)')
  }

  // the Python script: the other way the skill has of making the page
  const python = ['python3', 'python'].find((name) => {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8' })
    return r.status === 0 && /^Python 3/.test(`${r.stdout}${r.stderr}`)
  })
  if (python) {
    for (const type of TYPES) {
      const spec = join(work, `antu/examples/${type}/1-minimal.zh-CN.json`)
      const out = join(work, `${type}-py.html`)
      const r = spawnSync(python, [join(work, 'antu/scripts/make_html.py'), spec, '-o', out], { encoding: 'utf8', cwd: work })
      const html = existsSync(out) ? readFileSync(out, 'utf8') : ''
      check(`${type}: python script writes the page`, r.status === 0 && html.includes('window.__ANTU_SPEC__ = {') && !html.includes('/*ANTU_SPEC*/null'), r.stderr.trim())
    }
  } else if (process.env.ANTU_REQUIRE_PYTHON) {
    check('python 3 is available', false, 'neither python3 nor python found')
  } else {
    console.log('  (python 3 not available, the Python script was not checked)')
  }

  // a diagram with a problem: named, exit code 1, and render writes nothing
  const bad = JSON.parse(readFileSync(join(work, 'antu/examples/justification/3-issues.zh-CN.json'), 'utf8'))
  bad.links[0].from = 'nowhere'
  writeFileSync(join(work, 'bad.json'), JSON.stringify(bad))
  const vb = run('validate', 'bad.json')
  check('a problem is named, exit code 1', vb.status === 1 && /nowhere/.test(vb.stderr), `${vb.status} ${vb.stderr.trim()}`)
  const rb = run('render', 'bad.json', '-o', join(work, 'bad.html'))
  check('render refuses it and writes nothing', rb.status === 1 && !existsSync(join(work, 'bad.html')), `${rb.status}`)
  const pb = run('preview', 'bad.json', '-o', join(work, 'bad.png'))
  if (run('--help').stdout.includes('preview')) {
    check('preview refuses it too and writes nothing', pb.status === 1 && !existsSync(join(work, 'bad.png')), `${pb.status}`)
  }
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
