// Layout-A of issue 123: layoutReport / layoutMessage take an optional paper level.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { paperOf } from '../src/core/paper.js'
import { CANVAS, layoutMessage, layoutReport } from '../tools/lib/report.mjs'

const file = 'examples/fact/fang-yuan-loan-and-conflict.zh-CN.json'
const spec = () => JSON.parse(readFileSync(file, 'utf8'))

test('CANVAS is the screen paper level', () => {
  assert.deepEqual(CANVAS, paperOf('screen').canvas)
})

test('omitting paper is the same as screen', () => {
  const a = layoutReport(spec())
  const b = layoutReport(spec(), { paper: 'screen' })
  assert.equal(a.ok, true)
  assert.equal(a.paper, 'screen')
  assert.deepEqual(a.canvas, paperOf('screen').canvas)
  assert.equal(b.paper, 'screen')
  assert.equal(a.text.open.fit, b.text.open.fit)
  assert.equal(layoutMessage(spec()).text, layoutMessage(spec(), { paper: 'screen' }).text)
})

test('a4l changes the fit and the text-on-canvas line', () => {
  const screen = layoutReport(spec())
  const a4l = layoutReport(spec(), { paper: 'a4l' })
  assert.equal(a4l.ok, true)
  assert.equal(a4l.paper, 'a4l')
  assert.deepEqual(a4l.canvas, paperOf('a4l').canvas)
  // A smaller canvas must not report the same open fit as the screen for this wide timeline.
  assert.notEqual(a4l.text.open.fit, screen.text.open.fit)
  assert.match(layoutMessage(spec(), { paper: 'a4l' }).text, /Text on one screen \(1032×703\)/)
  assert.match(layoutMessage(spec()).text, /Text on one screen \(1600×900\)/)
})

test('a4p is accepted and names its canvas in the message', () => {
  const r = layoutReport(spec(), { paper: 'a4p' })
  assert.equal(r.ok, true)
  assert.equal(r.paper, 'a4p')
  assert.match(layoutMessage(spec(), { paper: 'a4p' }).text, /Text on one screen \(703×1032\)/)
})

test('a bad paper level fails softly, naming the allowed ones', () => {
  const r = layoutReport(spec(), { paper: 'letter' })
  assert.equal(r.ok, false)
  assert.match(r.reason, /letter/)
  assert.match(r.reason, /screen/)
  assert.match(r.reason, /a4l/)
  assert.match(r.reason, /a4p/)
  assert.equal(layoutMessage(spec(), { paper: 'letter' }).ok, false)
  assert.equal(layoutMessage(spec(), { paper: 'letter' }).text, r.reason)
})
