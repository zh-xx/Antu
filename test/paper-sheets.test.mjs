// ============================================================
//  test/paper-sheets.test.mjs — "how many sheets" on a paper level (issue 123)
//
//  The geometry report says the picture's size and its text size. On an A4 level it now also says how many sheets the
//  picture takes at full size, because that is the question the issue was opened for ("how many pages on A4, how far
//  down does it scale, is the type below the readable floor").
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { paperOf, sheetsOf } from '../src/core/paper.js'
import { layoutMessage, layoutReport } from '../tools/lib/report.mjs'

const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const sheetsLine = (text) => text.split('\n').find((l) => l.startsWith('Sheets at full size')) ?? ''

test('sheetsOf counts whole sheets, and says nothing for a missing size', () => {
  assert.deepEqual(sheetsOf({ width: 1500, height: 800 }, paperOf('a4p').canvas), { across: 3, down: 1, total: 3 })
  assert.deepEqual(sheetsOf({ width: 703, height: 1032 }, paperOf('a4p').canvas), { across: 1, down: 1, total: 1 })
  assert.deepEqual(sheetsOf({ width: 704, height: 1033 }, paperOf('a4p').canvas), { across: 2, down: 2, total: 4 })
  assert.deepEqual(sheetsOf({ width: 0, height: 100 }, paperOf('a4p').canvas), { across: 0, down: 0, total: 0 })
  assert.deepEqual(sheetsOf(undefined, paperOf('a4p').canvas), { across: 0, down: 0, total: 0 })
})

test('an A4 level reports the sheets; the screen does not', () => {
  const spec = read('examples/fact/fang-yuan-loan-and-conflict.zh-CN.json')
  assert.equal(sheetsLine(layoutMessage(spec).text), '', 'a screen report has no sheets: the notion has no meaning there')
  const r = layoutReport(spec, { paper: 'a4p' })
  const line = sheetsLine(layoutMessage(spec, { paper: 'a4p' }).text)
  const want = sheetsOf(r.text.size, paperOf('a4p').canvas)
  assert.match(line, new RegExp(`${want.across} across × ${want.down} down = ${want.total} on a4p \\(703×1032\\)`))
})

test('a picture inside one sheet says one', () => {
  const tiny = { width: 600, height: 400 }
  assert.deepEqual(sheetsOf(tiny, paperOf('a4p').canvas), { across: 1, down: 1, total: 1 })
})

test('every type reports the sheets, not just the fact timeline', () => {
  const files = [
    'examples/fact/fang-yuan-loan-and-conflict.zh-CN.json',
    'examples/procedure/07-share-acquisition-agreement.zh-CN.json',
    'examples/relationship/marketplace-parties.zh-CN.json',
    'examples/justification/fang-yuan-defense-excess.zh-CN.json',
  ]
  for (const file of files) {
    const text = layoutMessage(read(file), { paper: 'a4l' }).text
    assert.match(text, /Sheets at full size: \d+ across × \d+ down = \d+ on a4l \(1032×703\)/, file)
  }
})

test('a known kind reports the sheets of its own size', () => {
  const spec = read('examples/fact/fang-yuan-loan-and-conflict.zh-CN.json')
  for (const kind of ['timeline', 'chronicle']) {
    const r = layoutReport(spec, { paper: 'a4p', kind })
    assert.equal(r.ok, true, kind)
    const line = sheetsLine(layoutMessage(spec, { paper: 'a4p', kind }).text)
    assert.match(line, /Sheets at full size: /, kind)
  }
})
