// ============================================================
//  test/exportPng.test.mjs — the part of exporting that can be tested alone
//
//  Exporting as a whole needs a browser (grab the DOM, render an image); that part
//  belongs to the integration tests in tools/verify. Two kinds of pure function are
//  covered here: deriving a file name from the title, and content size + padding =
//  output size.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { EXPORT_PAD, exportFrame, fileNameOf } from '../src/shell/exportPng.js'

test('the file name comes from the title, with a .png suffix', () => {
  assert.equal(fileNameOf('电梯劝烟案'), '电梯劝烟案.png')
})

test('characters not allowed in a file name are replaced', () => {
  // slash, colon, asterisk, question mark, quotes, angle brackets, pipe, whitespace
  const name = fileNameOf('A/B:C*D?E"F<G>H|I J')
  assert.ok(!/[/:*?"<>|\s]/.test(name), `characters that cannot go in a file name remain: ${name}`)
  assert.ok(name.endsWith('.png'))
})

test('empty or non-string title falls back to an ASCII name', () => {
  assert.equal(fileNameOf(''), 'antu.png')
  assert.equal(fileNameOf(undefined), 'antu.png')
  assert.equal(fileNameOf(null), 'antu.png')
})

test('an over-long title is truncated (file system limits)', () => {
  const name = fileNameOf('长'.repeat(200))
  assert.ok(name.length <= 64, `still ${name.length} characters after truncation`)
  assert.ok(name.endsWith('.png'))
})

test('padding is non-zero', () => {
  assert.ok(EXPORT_PAD > 0, 'an exported image needs padding, otherwise it is cropped to the content edge')
})

test('output size = content + padding on all four sides', () => {
  const f = exportFrame(1000, 600)
  assert.equal(f.width, 1000 + EXPORT_PAD * 2)
  assert.equal(f.height, 600 + EXPORT_PAD * 2)
})

test('the content is drawn inside the padding, not against the edge', () => {
  const f = exportFrame(1000, 600)
  assert.equal(f.offsetX, EXPORT_PAD)
  assert.equal(f.offsetY, EXPORT_PAD)
  // the remaining space on the right and at the bottom is EXPORT_PAD too
  assert.equal(f.width - f.offsetX - 1000, EXPORT_PAD)
  assert.equal(f.height - f.offsetY - 600, EXPORT_PAD)
})

test('padding is the same on all four sides and does not follow the content shape', () => {
  const wide = exportFrame(2000, 100)
  const tall = exportFrame(100, 2000)
  assert.equal(wide.width - 2000, tall.height - 2000)
  assert.equal(wide.offsetX, tall.offsetY)
})
