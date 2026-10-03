// ============================================================
//  test/views93.test.mjs — the four relationship views of issue #93 (pure functions):
//  authority chart, related-party list, relation path, camp summary
//
//  What must hold:
//    1. every relation of every relationship example is on the page: a line or a row of the list under it
//       (authority, path, summary), or a row of the table or the list of the rest (related)
//    2. boxes (and blocks) do not overlap and stay inside the content
//    3. each view says what it chose: levels of authority, the chains found (shortest first, a party once
//       per chain, direction ignored), the lines between camps (one per pair)
//    4. any valid JSON draws: no authority, no chain, no groups, a centre with no relation
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildAuthorityGraph, classifyAuthority } from '../src/renderers/relationship/authority/layout.js'
import { buildRelatedGraph, relatedRows, relatedTable, centreOf } from '../src/renderers/relationship/related/layout.js'
import { buildPathGraph, findChains, defaultEnds, endsOf, MAX_CHAINS } from '../src/renderers/relationship/path/layout.js'
import { buildSummaryGraph, summaryUnits, summaryLines } from '../src/renderers/relationship/summary/layout.js'
import { layeredGraph } from '../src/renderers/relationship/layered.js'
import { relationshipKnowledge } from '../src/renderers/relationship/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const DIR = 'examples/relationship'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const entity = (id, extra = {}) => ({ id, kind: 'company', label: `Co ${id}`, ...extra })
const rel = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, ...extra })
const spec = (entities, relations, extra = {}) => ({ type: 'relationship', specVersion: 1, title: 't', entities, relations, ...extra })

const boxesOf = (g) => {
  const out = g.nodes.filter((n) => n.type === 'rnode').map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
  const layer = g.nodes.find((n) => n.type === 'lineLayer').data
  for (const b of layer.blocks ?? []) out.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })
  return out
}
function assertBoxes(g, label) {
  const boxes = boxesOf(g)
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= g.size.width && a.y + a.h <= g.size.height, `${label}: ${a.id} inside the content`)
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${label}: ${a.id} and ${b.id} overlap`)
    }
  }
}

test('the four views are registered relationship kinds, after the equity tree', () => {
  registerKnowledge('relationship', relationshipKnowledge)
  assert.deepEqual(layoutKindsOf('relationship').slice(0, 9), ['graph', 'focus', 'chain', 'matrix', 'equity', 'authority', 'related', 'path', 'summary'])
})

for (const f of files) {
  test(`${f}: authority chart, every relation a line or a row`, () => {
    const s = load(f)
    const g = buildAuthorityGraph(s, {})
    assert.deepEqual(g.errors, [])
    const p = classifyAuthority(s)
    assert.equal(p.edges.length + p.rest.length, s.relations.length)
    assert.equal(g.nodes.find((n) => n.type === 'lineLayer').data.links.length, p.edges.length)
    assertBoxes(g, f)
  })
  test(`${f}: related-party list, every party a row or listed apart`, () => {
    const s = load(f)
    const g = buildRelatedGraph(s, {})
    assert.deepEqual(g.errors, [])
    const c = centreOf(s, undefined)
    const { rows, none, rest } = relatedRows(s, c)
    assert.equal(rows.length + none.length + 1, s.entities.length, 'the centre, a row or apart: every party once')
    assert.equal(rows.reduce((n, r) => n + r.rels.length, 0) + rest.length, s.relations.length, 'every relation in a row or in the rest')
    const table = g.nodes[0].data.table
    assert.equal(table.rows.length, rows.length)
    for (const r of table.rows) assert.ok(r.y + r.h <= table.bottom, 'a row inside the table')
  })
  test(`${f}: relation path, chains tie the two ends`, () => {
    const s = load(f)
    const g = buildPathGraph(s, {})
    assert.deepEqual(g.errors, [])
    const { chains } = findChains(s, g.from, g.to)
    assert.ok(chains.length >= 1 && chains.length <= MAX_CHAINS)
    for (const c of chains) {
      assert.equal(c.nodes[0], g.from)
      assert.equal(c.nodes.at(-1), g.to)
      assert.equal(new Set(c.nodes).size, c.nodes.length, 'a party once per chain')
      c.rels.forEach((r, i) => assert.ok((r.from === c.nodes[i] && r.to === c.nodes[i + 1]) || (r.to === c.nodes[i] && r.from === c.nodes[i + 1]), 'each hop is a relation between the two'))
    }
    for (let i = 1; i < chains.length; i++) assert.ok(chains[i].rels.length >= chains[i - 1].rels.length, 'shortest first')
    assertBoxes(g, f)
  })
  test(`${f}: camp summary, every relation between blocks or inside one`, () => {
    const s = load(f)
    const g = buildSummaryGraph(s, {})
    assert.deepEqual(g.errors, [])
    assert.equal(g.betweenRelations + g.insideRelations, s.relations.length)
    const units = summaryUnits(s)
    assert.equal(units.reduce((n, u) => n + u.members.length, 0), s.entities.length, 'every party in a block or alone')
    assertBoxes(g, f)
  })
}

test('layered: a line that skips a level goes round the box between, in both directions', () => {
  const ids = ['a', 'b', 'c']
  const edges = [{ key: 'r1', from: 'a', to: 'b' }, { key: 'r2', from: 'b', to: 'c' }, { key: 'r3', from: 'a', to: 'c' }]
  const size = () => ({ w: 100, h: 40 })
  for (const horizontal of [false, true]) {
    const g = layeredGraph(ids, edges, size, { horizontal })
    assert.equal(g.links.get('r3').via.length, 1, 'one waypoint, in the level between')
    const [px, py] = g.links.get('r3').via[0]
    const b = g.boxes.get('b')
    assert.ok(!(px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h), 'the waypoint is not inside b')
    // Along the levels the later box is further: down when vertical, right when horizontal
    assert.ok(horizontal ? g.boxes.get('c').x > g.boxes.get('b').x : g.boxes.get('c').y > g.boxes.get('b').y)
  }
})

test('authority: the controller above the controlled, the rest listed, a cycle flagged', () => {
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d')],
    [rel('r1', 'a', 'b', 'control'), rel('r2', 'b', 'c', 'employment'), rel('r3', 'c', 'a', 'agency'), rel('r4', 'a', 'd', 'contract')],
  )
  const g = buildAuthorityGraph(s, {})
  assert.equal(g.cycles, 1)
  assert.equal(g.authorityLines, 3)
  assert.equal(g.apart, 1)
  assert.equal(g.other, 1)
  const at = new Map(g.nodes.filter((n) => n.type === 'rnode').map((n) => [n.id, n.position.y]))
  assert.ok(at.get('a') < at.get('b') && at.get('b') < at.get('c'))
  const none = spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'contract')])
  const empty = buildAuthorityGraph(none, {})
  assert.equal(empty.authorityLines, 0)
  assert.equal(empty.nodes[0].data.empties.length, 1)
})

test('related: several relations to the centre share a row; the arrow says which way', () => {
  const s = spec(
    [entity('c'), entity('x'), entity('y'), entity('z')],
    [rel('r1', 'c', 'x', 'equity', { share: 30 }), rel('r2', 'x', 'c', 'guarantee'), rel('r3', 'c', 'y', 'contract'), rel('r4', 'x', 'y', 'other')],
  )
  const { rows, none, rest } = relatedRows(s, 'c')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0].rels.map((x) => x.arrow), ['→', '←'])
  assert.equal(rows[1].rels[0].arrow, '↔')
  assert.deepEqual(none.map((e) => e.id), ['z'])
  assert.deepEqual(rest.map((r) => r.id), ['r4'])
  assert.equal(centreOf(s, 'nobody'), centreOf(s, undefined), 'an unknown centre means the default')
  const table = relatedTable(s, 'c')
  assert.equal(table.rows.length, 2)
  assert.match(table.rows[0][2], /→ .*; ← /)
  // A centre with no relation: an empty state, and everything else apart
  const lonely = buildRelatedGraph(s, { centre: 'z' })
  assert.equal(lonely.related, 0)
  assert.equal(lonely.nodes[0].data.empties.length, 1)
})

test('path: direction is ignored when walking, shortest chain first, arrows kept', () => {
  // a holds b; c guarantees b: a - b - c is a chain though no relation runs from a to c through b
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d'), entity('e')],
    [rel('r1', 'a', 'b', 'equity', { share: 60 }), rel('r2', 'c', 'b', 'guarantee'), rel('r3', 'a', 'd', 'contract'), rel('r4', 'd', 'e', 'contract'), rel('r5', 'e', 'c', 'contract')],
  )
  const { chains, total } = findChains(s, 'a', 'c')
  assert.equal(total, 2)
  assert.deepEqual(chains[0].nodes, ['a', 'b', 'c'])
  assert.deepEqual(chains[1].nodes, ['a', 'd', 'e', 'c'])
  const g = buildPathGraph(s, { from: 'a', to: 'c' })
  assert.deepEqual([g.from, g.to, g.chains, g.shortest], ['a', 'c', 2, 2])
  const layer = g.nodes.find((n) => n.type === 'lineLayer').data
  const guarantee = layer.links.find((l) => l.kind === 'guarantee')
  // The picture reads towards c, but the guarantee runs from c to b: the arrowhead is at the start of the line
  assert.equal(guarantee.arrow, 'start')
  assert.ok(layer.links.find((l) => l.kind === 'equity').width > layer.links.find((l) => l.kind === 'contract').width, 'the shortest chain is heavier')
  // Not tied at all: said so
  const apart = spec([entity('a'), entity('b'), entity('c'), entity('d')], [rel('r1', 'a', 'b', 'contract'), rel('r2', 'c', 'd', 'contract')])
  const none = buildPathGraph(apart, { from: 'a', to: 'd' })
  assert.equal(none.chains, 0)
  assert.equal(none.nodes[0].data.empties.length, 1)
  assertBoxes(none, 'apart')
  // More than three chains: three are drawn and the rest counted
  const many = spec(
    [entity('a'), entity('b'), entity('m1'), entity('m2'), entity('m3'), entity('m4')],
    ['m1', 'm2', 'm3', 'm4'].flatMap((m, i) => [rel(`x${i}`, 'a', m, 'contract'), rel(`y${i}`, m, 'b', 'contract')]),
  )
  const f = findChains(many, 'a', 'b')
  assert.equal(f.chains.length, MAX_CHAINS)
  assert.equal(f.total, 4)
})

test('path: the default ends are the two furthest apart, and a bad pick falls back', () => {
  const s = spec([entity('a'), entity('b'), entity('c')], [rel('r1', 'a', 'b', 'contract'), rel('r2', 'b', 'c', 'contract')])
  assert.deepEqual(defaultEnds(s), { from: 'a', to: 'c' })
  assert.deepEqual(endsOf(s, { from: 'b', to: 'b' }), { from: 'a', to: 'c' }, 'the same party twice is no pick')
  assert.deepEqual(endsOf(s, { from: 'c', to: 'a' }), { from: 'c', to: 'a' })
  assert.deepEqual(endsOf(s, { from: 'zz', to: 'a' }), { from: 'a', to: 'c' })
})

test('summary: one line for a pair of blocks, run from the side most relations run from', () => {
  const s = spec(
    [entity('a1', { groupId: 'g1' }), entity('a2', { groupId: 'g1' }), entity('b1', { groupId: 'g2' }), entity('s')],
    [rel('r1', 'a1', 'b1', 'debt'), rel('r2', 'a2', 'b1', 'guarantee'), rel('r3', 'b1', 'a1', 'contract'), rel('r4', 'a1', 'a2', 'equity'), rel('r5', 's', 'b1', 'other')],
    { groups: [{ id: 'g1', label: 'One' }, { id: 'g2', label: 'Two' }] },
  )
  const units = summaryUnits(s)
  assert.deepEqual(units.map((u) => u.id), ['g:g1', 'g:g2', 's'])
  const { between, inside } = summaryLines(s, units)
  assert.equal(between.length, 2)
  const pair = between.find((b) => b.rels.length === 3)
  assert.equal(pair.a, 'g:g1', 'two of the three run from One')
  assert.equal(inside.get('g:g1').length, 1)
  const g = buildSummaryGraph(s, {})
  assert.deepEqual([g.blocks, g.singles, g.lines, g.betweenRelations, g.insideRelations], [2, 1, 2, 4, 1])
  const pill = g.nodes.find((n) => n.type === 'lineLayer').data.pills.find((p) => /Debts/.test(p.text))
  assert.match(pill.text, /Contracts 1/)
  // No groups: every party alone
  const flat = buildSummaryGraph(spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'contract')]), {})
  assert.equal(flat.blocks, 0)
  assert.equal(flat.singles, 2)
})

test('the four reports name what each view chose', () => {
  const s = load('sample-group-guarantee.en.json')
  for (const [kind, pattern] of [['authority', /^Kind: authority/m], ['related', /^Kind: related/m], ['path', /^Kind: path/m], ['summary', /camp block/]]) {
    const r = layoutReport(s, { kind })
    assert.equal(r.ok, true, kind)
    assert.match(formatLayoutReport(r), pattern, kind)
  }
})
