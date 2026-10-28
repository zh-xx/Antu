// ============================================================
//  test/fit-insets.test.mjs — fit inset math (issue #166)
// ============================================================

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { insetViewport, mergeInsets, normalizeInsets } from '../src/core/canvas.js'

describe('normalizeInsets', () => {
  it('turns missing and bad values into 0', () => {
    assert.deepEqual(normalizeInsets(null), { top: 0, right: 0, bottom: 0, left: 0 })
    assert.deepEqual(normalizeInsets({ top: -3, left: 'x', bottom: 12.5 }), { top: 0, right: 0, bottom: 12.5, left: 0 })
  })
})

describe('mergeInsets', () => {
  it('lets the host replace sides it sets', () => {
    const auto = { top: 80, right: 0, bottom: 56, left: 40 }
    assert.deepEqual(mergeInsets(auto, { top: 100, right: 10 }), { top: 100, right: 10, bottom: 56, left: 40 })
    assert.deepEqual(mergeInsets(auto, null), normalizeInsets(auto))
  })
})

describe('insetViewport', () => {
  it('shrinks the clear area and keeps an origin', () => {
    const area = insetViewport(1600, 900, { top: 100, right: 20, bottom: 60, left: 40 })
    assert.deepEqual(area, { width: 1540, height: 740, left: 40, top: 100 })
  })

  it('never returns a non-positive size', () => {
    const area = insetViewport(50, 50, { top: 40, bottom: 40, left: 40, right: 40 })
    assert.equal(area.width, 1)
    assert.equal(area.height, 1)
  })
})
