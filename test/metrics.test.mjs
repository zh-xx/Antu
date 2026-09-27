// ============================================================
//  test/metrics.test.mjs — sizes and coordinates (pure functions, no browser)
//
//  This layer watches the computed numbers. The lost-arrow defect in exported images
//  had two causes, one of them exactly here: **was the extra 6px of the arrow counted
//  into the content size?** An end-to-end test only finds it by exporting and counting
//  pixels, which is too late; here it is pinned at a glance.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildGrid } from '../src/renderers/fact/timeline/grid.js'
import { makeMetrics, CELL_W, CELL_GAP, HEADER_H, HEADER_W, ARROW_EXTENT } from '../src/renderers/fact/timeline/metrics.js'
import { SUMMARY_MAX, SUMMARY_MAX_EM, textEm } from '../src/renderers/fact/cardGeometry.js'

const spec = JSON.parse(readFileSync('examples/fact/elevator-smoking-case.zh-CN.json', 'utf8'))
const fields = { sources: false, actors: false, summary: true }
const grid = buildGrid(spec)

test('the content size includes the arrow at the end of the axis', () => {
  // vertical: height = header band + slots × cell height + arrow
  const v = makeMetrics(grid, fields, false)
  assert.equal(
    v.contentH,
    v.originY + v.rowCount * v.slotExtent + ARROW_EXTENT,
    'the vertical height is missing the arrow’s 6px; the arrow gets cropped out on export',
  )
  // horizontal: width = header band + slots × cell width + arrow
  const h = makeMetrics(grid, fields, true)
  assert.equal(
    h.contentW,
    h.originX + h.rowCount * h.slotExtent + ARROW_EXTENT,
    'the horizontal width is missing the arrow’s 6px',
  )
})

test('the arrow constant has a value (so nobody sets it to 0 for convenience)', () => {
  assert.ok(ARROW_EXTENT > 0)
})

test('the length a slot takes and a lane takes swap between vertical and horizontal', () => {
  const v = makeMetrics(grid, fields, false)
  const h = makeMetrics(grid, fields, true)
  assert.equal(v.slotExtent, h.laneExtent)
  assert.equal(v.laneExtent, h.slotExtent)
  assert.equal(v.laneExtent, CELL_W)
})

test('cell height = card height + gap; card height follows the field toggles', () => {
  const withSummary = makeMetrics(grid, fields, false)
  assert.equal(withSummary.cellH, withSummary.cardH + CELL_GAP)
  const noSummary = makeMetrics(grid, { ...fields, summary: false }, false)
  assert.ok(noSummary.cardH < withSummary.cardH, 'turning the summary off should make the card shorter')
  assert.equal(noSummary.contentH, withSummary.contentH - grid.rows.length * (withSummary.cardH - noSummary.cardH))
})

test('grid origin: the header band is at the top when vertical and on the left when horizontal', () => {
  const v = makeMetrics(grid, fields, false)
  assert.deepEqual([v.originX, v.originY], [0, HEADER_H])
  const h = makeMetrics(grid, fields, true)
  assert.deepEqual([h.originX, h.originY], [HEADER_W, 0])
})

test('cellAt: slots run along the time axis, lanes along the lane axis', () => {
  const v = makeMetrics(grid, fields, false)
  // vertical: column is x, slot is y
  assert.deepEqual(v.cellAt(0, 0), { x: 0, y: v.originY })
  assert.deepEqual(v.cellAt(2, 1), { x: v.laneExtent, y: v.originY + 2 * v.slotExtent })
  // horizontal: slot is x, column is y
  const h = makeMetrics(grid, fields, true)
  assert.deepEqual(h.cellAt(0, 0), { x: h.originX, y: 0 })
  assert.deepEqual(h.cellAt(2, 1), { x: h.originX + 2 * h.slotExtent, y: h.laneExtent })
})

test('the axis centre falls in the middle of the axis column', () => {
  const v = makeMetrics(grid, fields, false)
  assert.equal(v.axisCenter, grid.axisColumnIndex * v.laneExtent + v.laneExtent / 2)
})

// ---------------------------------------------------------------
// Width measurement is language-independent (a real defect exposed by i18n)
// ---------------------------------------------------------------
// A summary that "does not fit on one line" used to be judged by **character count**
// (SUMMARY_MAX = inner width / font size), which only holds when 1 character = 1em,
// that is, only for CJK. An English summary translated literally doubled its character
// count, was judged too long, and **the whole diagram was refused**. The three tests
// below pin the behaviour down.

test('textEm: Latin letters are narrower than CJK, so equal character counts take different widths', () => {
  assert.ok(textEm('abc') < textEm('汉字字'), 'three Latin letters must be narrower than three CJK characters')
  assert.equal(textEm('汉字'), 2, 'two CJK characters take 2em')
})

test('the summary limit is judged by width: 22 Latin characters still pass (by character count they would be killed)', () => {
  const en = 'Talk only, under 5 min' // 22 characters
  assert.ok(en.length <= SUMMARY_MAX, 'this one also satisfies the old character-count rule')
  const longer = 'Contact under five minutes; no altercation' // 40 characters
  assert.ok(longer.length > SUMMARY_MAX, 'by character count this one would be judged too long')
  assert.ok(textEm(longer) > SUMMARY_MAX_EM, 'by width it genuinely does not fit either (23.1em > 22.8em)')
})

test('the width rule does not let a genuinely over-wide English summary through', () => {
  const tooWide = 'x'.repeat(100)
  assert.ok(textEm(tooWide) > SUMMARY_MAX_EM)
})
