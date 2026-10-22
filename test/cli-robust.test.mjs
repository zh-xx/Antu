// The command line and the Python filler with files as people really have them: a byte-order mark in front of the
// JSON (Windows Notepad writes one), an output folder that does not exist yet (an agent often names one).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Today's command line, bundled the way the skill carries it, in a skill-shaped folder (scripts/ beside assets/): the
// committed skills/antu/ is the last release, so it cannot show a fix made since.
const SKILL = mkdtempSync(join(tmpdir(), 'antu-robust-skill-'))
const built = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.cli.config.js', '--outDir', join(SKILL, 'scripts'), '--logLevel', 'error'], { encoding: 'utf8' })
if (built.status !== 0) throw new Error(`could not bundle the command line: ${built.stderr}`)
mkdirSync(join(SKILL, 'assets'))
copyFileSync('skills/antu/assets/viewer.html', join(SKILL, 'assets', 'viewer.html'))
process.on('exit', () => rmSync(SKILL, { recursive: true, force: true }))
const CLI = join(SKILL, 'scripts', 'antu.mjs')
const PY_SOURCE = 'tools/skill/make_html.py'
const EXAMPLE = 'examples/agent/fact/1-minimal.zh-CN.json'
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
const hasPython = !spawnSync('python3', ['--version']).error

const withDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'antu-robust-'))
  try { return fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}
const bomCopy = (dir) => {
  const file = join(dir, 'bom.json')
  writeFileSync(file, '﻿' + readFileSync(EXAMPLE, 'utf8'))
  return file
}

test('a JSON file with a byte-order mark is read like one without', () => withDir((dir) => {
  const file = bomCopy(dir)
  const r = cli('validate', file)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Validation passed/)
  const out = join(dir, 'bom.html')
  assert.equal(cli('render', file, '-o', out).status, 0)
  assert.ok(existsSync(out))
}))

test('render makes the output folder when it is not there, instead of failing with a stack trace', () => withDir((dir) => {
  const out = join(dir, 'not', 'yet', 'there', 'page.html')
  const r = cli('render', EXAMPLE, '-o', out)
  assert.equal(r.status, 0, r.stderr)
  assert.ok(existsSync(out))
  assert.doesNotMatch(r.stderr, /at \S+ \(|node:internal/, 'no stack trace')
}))

test('an output folder that cannot be made is a plain message, not a stack trace', () => withDir((dir) => {
  const blocker = join(dir, 'a-file')
  writeFileSync(blocker, 'x')
  const r = cli('render', EXAMPLE, '-o', join(blocker, 'page.html'))
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /cannot make the folder/)
  assert.doesNotMatch(r.stderr, /at \S+ \(|node:internal/)
}))

test('the Python filler reads a byte-order mark and makes the output folder too', { skip: !hasPython && 'no python3' }, () => withDir((dir) => {
  // the source script, laid out as in the skill: scripts/ beside assets/
  mkdirSync(join(dir, 'skill', 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'skill', 'assets'))
  copyFileSync(PY_SOURCE, join(dir, 'skill', 'scripts', 'make_html.py'))
  copyFileSync('skills/antu/assets/viewer.html', join(dir, 'skill', 'assets', 'viewer.html'))
  const PY = join(dir, 'skill', 'scripts', 'make_html.py')
  const out = join(dir, 'deep', 'page.html')
  const r = spawnSync('python3', ['-I', PY, bomCopy(dir), '-o', out], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(existsSync(out))
  const blocked = join(dir, 'a-file')
  writeFileSync(blocked, 'x')
  const bad = spawnSync('python3', ['-I', PY, EXAMPLE, '-o', join(blocked, 'p.html')], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /cannot write/)
  assert.doesNotMatch(bad.stderr, /Traceback/)
}))
