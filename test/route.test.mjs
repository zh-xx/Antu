// ============================================================
//  test/route.test.mjs — the procedure route map (issue #95): the line, what hangs off it, what is left out
//  (pure functions)
//
//  What must hold:
//    1. every node of every procedure example is on the picture (a station or a hanging box, or counted as
//       cut off) or listed under it; none is both
//    2. the stations stand along the line in main-line order, their labels do not overlap, and hanging boxes
//       and arcs stay inside the content and clear of one another
//    3. a rework branch hangs under its decision, a branch back to an earlier station is an arc, a branch to an
//       end ends in the end, a long branch is cut with its count, a branch into a drawn node is a merge
//    4. any valid JSON draws: no stages, no main marked, a flow with no branches
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildRouteGraph, classifyRoute, MAX_CHAIN } from '../src/renderers/procedure/route/layout.js'
import { procedureKnowledge } from '../src/renderers/procedure/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const DIR = 'examples/procedure'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const node = (id, kind = 'step', extra = {}) => ({ id, kind, label: `Node ${id}`, ...extra })
const edge = (from, to, extra = {}) => ({ from, to, ...extra })
const spec = (nodes, edges, extra = {}) => ({ type: 'procedure', specVersion: 1, title: 't', nodes, edges, ...extra })

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function assertSound(s, label) {
  const g = buildRouteGraph(s, {})
  assert.deepEqual(g.errors, [], `${label}: valid`)
  const r = classifyRoute(s)
  const ids = s.nodes.map((n) => n.id)
  const off = new Set(r.off.map((n) => n.id))
  for (const id of ids) assert.ok(r.drawn.has(id) !== off.has(id), `${label}: ${id} is drawn or listed, not both`)
  const layer = g.nodes[0].data
  assert.deepEqual(layer.stations.map((x) => x.id), r.spine, `${label}: stations in line order`)
  for (let i = 1; i < layer.stations.length; i++) assert.ok(layer.stations[i].x - layer.stations[i - 1].x >= 128 - 1e-6, `${label}: stations keep their distance`)
  // Labels over the line do not overlap one another
  const labels = layer.stations.map((x) => x.labelBox)
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), `${label}: labels ${i} and ${j} apart`)
  // Hanging boxes: apart from one another, inside the content, below the line
  const boxes = layer.hangs.flatMap((h) => h.boxes.map((b) => ({ ...b })))
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    assert.ok(b.x >= 0 && b.x + b.w <= g.size.width && b.y > layer.lineY && b.y + b.h <= layer.bandBottom, `${label}: box ${b.id} inside the picture`)
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(b, boxes[j]), `${label}: boxes ${b.id} and ${boxes[j].id} apart`)
  }
  for (const a of layer.arcs) assert.ok(a.depth > Math.max(layer.lineY, ...boxes.map((b) => b.y + b.h)), `${label}: an arc runs below every hanging box`)
  assert.ok(g.size.width >= layer.lineTo, `${label}: the line is inside the content`)
  return g
}

test('the route map is a registered procedure kind, after the flowchart', () => {
  registerKnowledge('procedure', procedureKnowledge)
  assert.deepEqual(layoutKindsOf('procedure'), ['flow', 'route'])
})

for (const f of files) {
  test(`${f}: every node on the picture or listed, nothing overlaps`, () => {
    assertSound(load(f), f)
  })
}

test('a rework branch hangs under its decision and comes back; a loop to an earlier station is an arc', () => {
  const s = spec(
    [node('s', 'start'), node('a'), node('d', 'decision'), node('fix', 'step', { outcome: 'negative' }), node('b'), node('e', 'end')],
    [edge('s', 'a', { main: true }), edge('a', 'd', { main: true }), edge('d', 'b', { condition: 'pass', main: true }), edge('d', 'fix', { condition: 'fail' }), edge('fix', 'd'), edge('b', 'e', { main: true })],
  )
  const g = assertSound(s, 'rework')
  assert.equal(g.hangs, 1)
  const layer = g.nodes[0].data
  const hang = layer.hangs[0]
  assert.equal(hang.from, 'd')
  assert.deepEqual(hang.boxes.map((b) => b.id), ['fix'])
  assert.equal(hang.tail.type, 'return')
  // A branch back to an earlier station is an arc under the line
  const loop = spec(
    [node('s', 'start'), node('a'), node('d', 'decision'), node('e', 'end')],
    [edge('s', 'a', { main: true }), edge('a', 'd', { main: true }), edge('d', 'e', { condition: 'yes', main: true }), edge('d', 'a', { condition: 'no' })],
  )
  const lg = assertSound(loop, 'loop')
  assert.equal(lg.loops, 1)
  assert.equal(lg.hangs, 0)
  const arc = lg.nodes[0].data.arcs[0]
  assert.equal(arc.cond, 'no')
  assert.ok(arc.toX < arc.fromX, 'it goes back, to the left')
})

test('a branch to an end ends in the end; a long branch is cut with its count', () => {
  const s = spec(
    [node('s', 'start'), node('d', 'decision'), node('ok'), node('e', 'end'), node('b1'), node('b2'), node('b3'), node('b4'), node('b5'), node('b6'), node('e2', 'end', { outcome: 'negative' })],
    [edge('s', 'd', { main: true }), edge('d', 'ok', { condition: 'fine', main: true }), edge('ok', 'e', { main: true }), edge('d', 'e2', { condition: 'breach' }), edge('d', 'b1', { condition: 'long' }), edge('b1', 'b2'), edge('b2', 'b3'), edge('b3', 'b4'), edge('b4', 'b5'), edge('b5', 'b6'), edge('b6', 'e2')],
  )
  const g = assertSound(s, 'ends')
  const layer = g.nodes[0].data
  const toEnd = layer.hangs.find((h) => h.boxes.at(-1)?.id === 'e2' && h.boxes.length === 1)
  assert.equal(toEnd.tail.type, 'end')
  assert.equal(toEnd.boxes[0].kind, 'end')
  const cut = layer.hangs.find((h) => h.tail.type === 'cut')
  assert.equal(cut.boxes.length, MAX_CHAIN)
  assert.ok(cut.more.text.includes('3') || /\d/.test(cut.more.text), 'the cut says how many more')
  assert.equal(g.cut, 1)
  // The nodes after the cut are accounted for: b5 and b6 are neither lost nor listed as off the route
  const r = classifyRoute(s)
  assert.ok(r.drawn.has('b5') && r.drawn.has('b6'))
})

test('an end reached only through a rule is listed, not lost', () => {
  const s = spec([node('s', 'start'), node('a'), node('e', 'end'), node('x', 'end', { outcome: 'negative' })], [edge('s', 'a'), edge('a', 'e')], { rules: [{ id: 'r1', when: 'breach', then: 'pay', endId: 'x' }] })
  const g = assertSound(s, 'rule end')
  assert.equal(g.off, 1)
  assert.equal(g.rules, 1)
  const layer = g.nodes[0].data
  assert.ok(layer.frames.some((f) => /Not on the route/.test(f.title)))
  assert.ok(layer.texts.some((x) => /reached only through a rule/.test(x.main)))
})

test('no stages, no main marked: the line is inferred and draws without bands', () => {
  const s = spec([node('s', 'start'), node('a'), node('b'), node('e', 'end')], [edge('s', 'a'), edge('a', 'b'), edge('b', 'e')])
  const g = assertSound(s, 'plain')
  assert.equal(g.stagesShown, 0)
  assert.equal(g.hangs, 0)
  assert.equal(g.arcs, 0)
  assert.equal(g.stations, 4)
})

test('a branch into a node already drawn is a merge, and stages become bands', () => {
  const s = spec(
    [node('s', 'start', { stageId: 'g1' }), node('d', 'decision', { stageId: 'g1' }), node('hi', 'step', { stageId: 'g2' }), node('lo', 'step', { stageId: 'g2' }), node('m', 'step', { stageId: 'g2' }), node('e', 'end', { stageId: 'g2' })],
    [edge('s', 'd', { main: true }), edge('d', 'hi', { condition: 'high', main: true }), edge('d', 'lo', { condition: 'low' }), edge('hi', 'm', { main: true }), edge('lo', 'm'), edge('m', 'e', { main: true })],
    { stages: [{ id: 'g1', label: 'One' }, { id: 'g2', label: 'Two' }] },
  )
  const g = assertSound(s, 'merge')
  assert.equal(g.stagesShown, 2)
  const layer = g.nodes[0].data
  assert.deepEqual(layer.bands.map((b) => b.label), ['One', 'Two'])
  assert.equal(layer.hangs[0].boxes[0].id, 'lo')
})

test('the report names the stations, the branches, the arcs and what is left out', () => {
  const s = load('03-labour-outsourcing-contract.en.json')
  const r = layoutReport(s, { kind: 'route' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'route')
  const text = formatLayoutReport(r)
  assert.match(text, /^Kind: route/m)
  assert.match(text, /stations on the main line/)
  assert.match(text, /rule\(s\) not drawn here/)
})
