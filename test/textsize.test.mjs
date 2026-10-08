// ============================================================
//  test/textsize.test.mjs — how big the body text is on one screen (#43, the guard)
//
//  Every kind of diagram reports one number, the body text in px when the page opens fitted to the screen, against
//  one pair of thresholds (core/canvas.js). tools/verify checks the number against the page in a browser.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TEXT_MIN_PX, TEXT_OK_PX, textPx, textSizeLines } from '../src/core/canvas.js'
import { layoutMessage, layoutReport } from '../tools/lib/report.mjs'
import { LABEL_FONT } from '../src/renderers/fact/cardGeometry.js'
import { NODE_FONT as PROCEDURE_FONT } from '../src/renderers/procedure/flow/metrics.js'
import { ENTITY_FONT } from '../src/renderers/relationship/graph/metrics.js'
import { NODE_FONT as JUSTIFICATION_FONT } from '../src/renderers/justification/tree/metrics.js'

const spec = (file) => JSON.parse(readFileSync(file, 'utf8'))
const canvas = { width: 1600, height: 900 }
const lines = (fitOpen, fitOther, extra = {}) =>
  textSizeLines({ font: 13, canvas, open: { name: 'vertical', fit: fitOpen }, other: { name: 'horizontal', fit: fitOther }, ...extra }, 'one diagram per issue')

test('the text size is the font times the fit zoom, never above the font', () => {
  assert.equal(textPx(13, 0.5), 6.5)
  assert.equal(textPx(14, 0.639), 8.9)
  assert.equal(textPx(13, 1), 13)
  assert.equal(textPx(13, 2.7), 13, 'a small diagram is not reported larger than full size')
})

test('three levels: full size says nothing more, small says the reader can zoom, too small says split', () => {
  assert.deepEqual(lines(1, 1), ['Text on one screen (1600×900): full size (13 px) either way.'])
  // 13 × 0.8 = 10.4: small
  const small = lines(0.8, 0.7)
  assert.match(small[0], /10\.4 px as it opens \(vertical\), 9\.1 px horizontal/)
  assert.match(small[1], new RegExp(`under ${TEXT_OK_PX} px.*zoom in`))
  // 13 × 0.6 = 7.8: too small
  const tiny = lines(0.6, 0.5)
  assert.match(tiny[1], new RegExp(`too small.*under ${TEXT_MIN_PX} px.*one diagram per issue.*do not drop facts`))
  // judged by the better orientation: one that reads well is enough
  assert.equal(lines(0.6, 1).length, 1)
})

test('the folded size is told only when the text is small, and says full size when it is', () => {
  assert.equal(lines(1, 1, { folded: 0.5 }).length, 1)
  assert.match(lines(0.5, 0.4, { folded: 0.5 }).at(-1), /folded the text is 6\.5 px/)
  assert.match(lines(0.5, 0.4, { folded: 2 }).at(-1), /folded the text is full size \(13 px\)/)
})

test('every kind reports it, with its own body font, in the geometry report and in its text', () => {
  const cases = [
    ['examples/agent/fact/1-minimal.zh-CN.json', LABEL_FONT],
    ['examples/agent/procedure/1-minimal.zh-CN.json', PROCEDURE_FONT],
    ['examples/agent/relationship/1-minimal.zh-CN.json', ENTITY_FONT],
    ['examples/agent/justification/1-minimal.zh-CN.json', JUSTIFICATION_FONT],
  ]
  for (const [file, font] of cases) {
    const r = layoutReport(spec(file))
    assert.equal(r.text.font, font, file)
    assert.match(layoutMessage(spec(file)).text, /^Text on one screen \(1600×900\)/m, file)
  }
})

test('the real cases that are too small say so, the fact diagram too (it used to say nothing; it is small now, not too small)', () => {
  const tooSmall = ['examples/procedure/05-premises-lease.zh-CN.json']
  for (const file of tooSmall) assert.match(layoutMessage(spec(file)).text, /too small to read without zooming in/, file)
  // the Fang Yuan timeline opens staggered (spec/fact/rendering.md §8.1): small, no longer too small, and still told to split
  assert.match(layoutMessage(spec('examples/fact/fang-yuan-loan-and-conflict.zh-CN.json')).text, /the text is small \(under 11 px\).*Splitting the timeline into periods/)
  // a justification of several issues that would be too small opens with its issues folded, and says so instead
  for (const file of ['examples/justification/fang-yuan-defense-excess.zh-CN.json', 'examples/justification/neighbour-corridor-liability.zh-CN.json']) {
    const text = layoutMessage(spec(file)).text
    assert.match(text, /Opens with the issues folded: unfolded, its text would be/, file)
    assert.doesNotMatch(text, /too small to read without zooming in/, file)
  }
  // the smallest example says nothing more than the size
  assert.doesNotMatch(layoutMessage(spec('examples/agent/fact/1-minimal.zh-CN.json')).text, /Note: the text/)
})

test('the fact diagram reports the orientation it opens with (five slots or more: vertical)', () => {
  const r = layoutReport(spec('examples/fact/fang-yuan-loan-and-conflict.zh-CN.json'))
  assert.equal(r.text.open.name, r.suggestedOrientation)
  assert.equal(r.text.open.fit, r.byOrientation[r.suggestedOrientation].fit)
})
