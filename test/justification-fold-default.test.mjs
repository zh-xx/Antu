// A justification diagram of several issues whose text would be unreadable opens with its issues folded, and says so in
// `layout` (#139). The rule is in src/renderers/justification/tree/foldDefault.js.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { foldDefault } from '../src/renderers/justification/tree/foldDefault.js'
import { buildJustificationGraph } from '../src/renderers/justification/tree/layout.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'
import { TEXT_MIN_PX, textPx } from '../src/core/canvas.js'

const load = (f) => JSON.parse(readFileSync(f, 'utf8'))
const big = load('examples/justification/fang-yuan-defense-excess.zh-CN.json')
const corridor = load('examples/justification/neighbour-corridor-liability.zh-CN.json')
const small = load('examples/agent/justification/3-issues.zh-CN.json')
const one = load('examples/agent/justification/1-minimal.zh-CN.json')

test('a big diagram of several issues opens folded; the text is then readable', () => {
  for (const spec of [big, corridor]) {
    const d = foldDefault(spec, buildJustificationGraph)
    assert.deepEqual(d.issues, spec.groups.map((g) => g.id))
    assert.ok(textPx(13, d.open) < TEXT_MIN_PX, 'unfolded it is under the minimum')
    assert.ok(d.folded > d.open, 'folding makes it larger')
  }
})

test('a small diagram, and a diagram of one issue, open as they are', () => {
  assert.deepEqual(foldDefault(small, buildJustificationGraph).issues, [])
  assert.deepEqual(foldDefault(one, buildJustificationGraph).issues, [])
})

test('`layout` says that it opens folded, how small it would be otherwise, and reports the text as it opens', () => {
  const rep = layoutReport(big)
  assert.equal(rep.opensFolded, true)
  const text = formatLayoutReport(rep)
  assert.match(text, /Opens with the issues folded: unfolded, its text would be \d+\.\d px/)
  assert.match(text, /as it opens \(horizontal, issues folded\)/)
  assert.doesNotMatch(text, /With every issue folded the text is/)
})

test('a diagram that opens whole says nothing of folding', () => {
  const rep = layoutReport(small)
  assert.equal(rep.opensFolded, false)
  assert.doesNotMatch(formatLayoutReport(rep), /Opens with the issues folded/)
})
