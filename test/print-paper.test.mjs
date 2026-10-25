// The print slice (issue 123): the paper a diagram is laid out on.
// The numbers are A4 minus the page margins, in CSS pixels: print lays out at 96 dpi.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { A4_MM, PRINT_MARGIN_MM, pageSize, paperFor, printableArea } from '../src/shell/printPaper.js'

test('the printable area is A4 less the margins on every edge, in CSS pixels', () => {
  assert.deepEqual(A4_MM, { width: 210, height: 297 })
  assert.equal(PRINT_MARGIN_MM, 12)
  // 186 × 273 mm at 96 dpi
  assert.deepEqual(printableArea('portrait'), { width: 703, height: 1032 })
  assert.deepEqual(printableArea('landscape'), { width: 1032, height: 703 })
})

test('the two orientations are the same sheet', () => {
  const portrait = printableArea('portrait')
  const landscape = printableArea('landscape')
  assert.equal(portrait.width, landscape.height)
  assert.equal(portrait.height, landscape.width)
})

test("the sheet turns to the diagram's own shape", () => {
  assert.equal(paperFor(1400, 900), 'landscape')
  assert.equal(paperFor(900, 1400), 'portrait')
  // a square has no better side: portrait is the default
  assert.equal(paperFor(1000, 1000), 'portrait')
  // a size the canvas has not measured yet must not decide anything
  assert.equal(paperFor(0, 0), 'portrait')
  assert.equal(paperFor(undefined, 100), 'portrait')
  assert.equal(paperFor(NaN, 100), 'portrait')
})

test('the @page size names the sheet and which way up it goes', () => {
  assert.equal(pageSize('portrait'), 'A4 portrait')
  assert.equal(pageSize('landscape'), 'A4 landscape')
})
