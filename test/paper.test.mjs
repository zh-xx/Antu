// Paper levels (issue 123): screen | a4l | a4p share one quantity with the print path.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { REFERENCE_CANVAS } from '../src/core/canvas.js'
import {
  A4_MM,
  PAPER_LEVELS,
  PRINT_MARGIN_MM,
  isPaperLevel,
  levelForOrientation,
  paperOf,
} from '../src/core/paper.js'
import { printableArea } from '../src/shell/printPaper.js'

test('the three paper levels are the only ones', () => {
  assert.deepEqual([...PAPER_LEVELS], ['screen', 'a4l', 'a4p'])
  assert.equal(isPaperLevel('screen'), true)
  assert.equal(isPaperLevel('a4l'), true)
  assert.equal(isPaperLevel('a4p'), true)
  assert.equal(isPaperLevel('a3'), false)
  assert.equal(isPaperLevel(''), false)
})

test('screen is the reference canvas', () => {
  const page = paperOf('screen')
  assert.equal(page.level, 'screen')
  assert.deepEqual(page.canvas, REFERENCE_CANVAS)
  assert.equal(page.orientation, undefined)
  assert.equal(page.pageSize, undefined)
  assert.equal(page.marginMm, undefined)
})

test('a4p and a4l are A4 less the margins, in CSS pixels', () => {
  assert.deepEqual(A4_MM, { width: 210, height: 297 })
  assert.equal(PRINT_MARGIN_MM, 12)
  assert.deepEqual(paperOf('a4p'), {
    level: 'a4p',
    canvas: { width: 703, height: 1032 },
    orientation: 'portrait',
    pageSize: 'A4 portrait',
    marginMm: 12,
  })
  assert.deepEqual(paperOf('a4l'), {
    level: 'a4l',
    canvas: { width: 1032, height: 703 },
    orientation: 'landscape',
    pageSize: 'A4 landscape',
    marginMm: 12,
  })
})

test('an unknown level names the ones that exist', () => {
  assert.throws(
    () => paperOf('letter'),
    (err) => {
      assert.match(String(err.message), /letter/)
      assert.match(String(err.message), /screen/)
      assert.match(String(err.message), /a4l/)
      assert.match(String(err.message), /a4p/)
      return true
    },
  )
})

test('orientation maps onto the A4 levels', () => {
  assert.equal(levelForOrientation('portrait'), 'a4p')
  assert.equal(levelForOrientation('landscape'), 'a4l')
})

test('the print helpers keep the same printable area as paperOf', () => {
  assert.deepEqual(printableArea('portrait'), paperOf('a4p').canvas)
  assert.deepEqual(printableArea('landscape'), paperOf('a4l').canvas)
})
