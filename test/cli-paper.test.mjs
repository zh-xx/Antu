// ============================================================
//  test/cli-paper.test.mjs — the command line takes the sheet as an input (issue 123)
//
//  `--paper` goes through layout (the numbers the report is computed on) and through render/preview (the page opens
//  laid out for that sheet). Only the reporting half runs here: it needs no browser and no built viewer.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const CLI = 'tools/cli/antu.mjs'
const FACT = 'examples/fact/fang-yuan-loan-and-conflict.zh-CN.json'
const run = (...args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ANTU_NO_UPDATE_NOTIFIER: '1' },
  })

const firstPx = (out) => Number((/Text on one screen \([^)]*\): ([\d.]+) px/.exec(out) || [])[1])

test('layout --paper a4p reports the picture on A4 portrait', () => {
  const screen = run('layout', FACT)
  const a4p = run('layout', FACT, '--paper', 'a4p')
  assert.equal(a4p.status, 0, a4p.stderr)
  assert.match(screen.stdout, /Text on one screen \(1600×900\)/, 'no flag is the screen, as before')
  assert.match(a4p.stdout, /Text on one screen \(703×1032\)/)
  assert.ok(firstPx(a4p.stdout) < firstPx(screen.stdout), 'a smaller sheet draws the text smaller')
})

test('layout --paper a4l reports the landscape sheet', () => {
  const r = run('layout', FACT, '--paper', 'a4l')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /Text on one screen \(1032×703\)/)
})

test('an unknown paper level is refused, naming the levels', () => {
  const r = run('layout', FACT, '--paper', 'letter')
  assert.equal(r.status, 2)
  assert.equal(r.stdout.trim(), '')
  assert.match(r.stderr, /--paper: screen, a4l, a4p/)
})

test('the help text names --paper where it is accepted', () => {
  const r = run('--help')
  assert.equal(r.status, 0, r.stderr)
  const lines = r.stdout.split('\n').filter((l) => /^ {2}node antu\.mjs (layout|render|preview)/.test(l))
  assert.equal(lines.length, 3)
  for (const line of lines) assert.match(line, /--paper P/)
})
