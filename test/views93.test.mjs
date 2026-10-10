// ============================================================
//  test/views93.test.mjs — the relationship views of issue #93 (pure functions):
//  authority chart, related-party list, relation path
//
//  What must hold:
//    1. every relation of every relationship example is on the page: a line or a row of the list under it
//       (authority, path), or a row of the table or the list of the rest (related)
//    2. boxes do not overlap and stay inside the content
//    3. each view says what it chose: levels of authority, the chains found (shortest first, a party once
//       per chain, direction ignored)
//    4. any valid JSON draws: no authority, no chain, a centre with no relation
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildAuthorityGraph, classifyAuthority } from '../src/renderers/relationship/authority/layout.js'
import { buildRelatedGraph, relatedRows, centreOf } from '../src/renderers/relationship/related/layout.js'
import { buildPathGraph, findChains, defaultEnds, endsOf, placeChains, pillW, pillH, MAX_CHAINS } from '../src/renderers/relationship/path/layout.js'
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

test('the views are registered relationship kinds, after the equity tree', () => {
  registerKnowledge('relationship', relationshipKnowledge)
  assert.deepEqual(layoutKindsOf('relationship').slice(0, 7), ['graph', 'focus', 'matrix', 'equity', 'authority', 'related', 'path'])
})

for (const f of files) {
  test(`${f}: authority chart, every relation a line or a row`, () => {
    const s = load(f)
    const g = buildAuthorityGraph(s, {})
    assert.deepEqual(g.errors, [])
    const p = classifyAuthority(s)
    assert.equal(p.edges.length + p.above.length + p.rest.length, s.relations.length)
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
    assert.equal(new Set(table.rows.map((r) => r.party)).size, rows.length, 'one block for each party')
    assert.equal(table.rows.length, rows.reduce((n, r) => n + r.rels.length, 0), 'a line for each relation')
    for (const r of table.rows) assert.ok(r.y + r.h <= table.bottom, 'a row inside the table')
  })
  test(`${f}: relation path, every line starts and ends on a box`, () => {
    const g = buildPathGraph(load(f), {})
    const boxes = g.nodes.filter((n) => n.type === 'rnode').map((n) => ({ x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
    for (const l of g.nodes.find((n) => n.type === 'lineLayer').data.links) {
      const pts = [...l.d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => [+m[1], +m[2]])
      for (const p of [pts[0], pts.at(-1)]) assert.ok(boxes.some((b) => p[0] >= b.x - 0.5 && p[0] <= b.x + b.w + 0.5 && p[1] >= b.y - 0.5 && p[1] <= b.y + b.h + 0.5), `${f}: a line ends at (${p}), off every box`)
    }
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

test('the three reports name what each view chose', () => {
  const s = load('sample-group-guarantee.en.json')
  for (const [kind, pattern] of [['authority', /^Kind: authority/m], ['related', /^Kind: related/m], ['path', /^Kind: path/m]]) {
    const r = layoutReport(s, { kind })
    assert.equal(r.ok, true, kind)
    assert.match(formatLayoutReport(r), pattern, kind)
  }
})

test('path: one picture, each party and each relation once, no two lines sharing a stretch', () => {
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d'), entity('e')],
    [rel('r1', 'a', 'b', 'contract'), rel('r2', 'b', 'e', 'contract'), rel('r3', 'b', 'c', 'contract'), rel('r4', 'c', 'e', 'contract'), rel('r5', 'a', 'd', 'contract'), rel('r6', 'd', 'e', 'contract')],
  )
  const g = buildPathGraph(s, { from: 'a', to: 'e' })
  assert.equal(g.chains, 3)
  const layer = g.nodes.find((n) => n.type === 'lineLayer').data
  const boxes = g.nodes.filter((n) => n.type === 'rnode')
  // One start and one end, every other party once
  assert.equal(new Set(boxes.map((n) => n.id)).size, boxes.length)
  assert.equal(boxes.length, 5)
  assert.deepEqual(boxes.filter((n) => n.data.end).map((n) => n.id).sort(), ['a', 'e'])
  const col = (id) => boxes.find((n) => n.id === id).position.x
  assert.equal(col('a') < col('b') && col('b') < col('e'), true, 'read left to right')
  // One line and one label for each relation
  assert.equal(layer.links.length, 6)
  assert.equal(layer.pills.length, 6)
  assert.equal(new Set(layer.pills.map((p) => p.relId)).size, 6)
  // The two shortest chains (2 steps) are heavy; the lines only the 3-step chain has are thin
  const widthOf = (relId) => layer.links[layer.pills.findIndex((p) => p.relId === relId)].width
  for (const id of ['r1', 'r2', 'r5', 'r6']) assert.ok(widthOf(id) > 2, `${id} is heavy`)
  for (const id of ['r3', 'r4']) assert.ok(widthOf(id) < 2, `${id} is thin`)
  // No two lines run along the same stretch
  const segs = layer.links.map((l) => {
    const pts = [...l.d.matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map((m) => [+m[1], +m[2]])
    return pts.slice(1).map((q, i) => [pts[i], q])
  })
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      for (const [p, q] of segs[i]) {
        for (const [u, v] of segs[j]) {
          const sameY = p[1] === q[1] && u[1] === v[1] && p[1] === u[1]
          const sameX = p[0] === q[0] && u[0] === v[0] && p[0] === u[0]
          if (sameY) assert.ok(Math.min(Math.max(p[0], q[0]), Math.max(u[0], v[0])) - Math.max(Math.min(p[0], q[0]), Math.min(u[0], v[0])) <= 0.5, `lines ${i} and ${j} share a horizontal stretch`)
          if (sameX) assert.ok(Math.min(Math.max(p[1], q[1]), Math.max(u[1], v[1])) - Math.max(Math.min(p[1], q[1]), Math.min(u[1], v[1])) <= 0.5, `lines ${i} and ${j} share a vertical stretch`)
        }
      }
    }
  }
  assertBoxes(g, 'path')
  // placeChains: the shortest chain is the main line, in order and on row 0; the parties only a longer chain
  // passes stand above or below it, one side each time, and no two boxes on a row are closer than a column
  const { pos, row } = placeChains(findChains(s, 'a', 'e').chains)
  const main = findChains(s, 'a', 'e').chains[0].nodes
  main.forEach((id, i) => {
    assert.equal(row.get(id), 0)
    if (i) assert.ok(pos.get(id) > pos.get(main[i - 1]), 'in order')
  })
  assert.equal(row.get('d') < 0 !== row.get('c') < 0, true, 'the second longer chain goes to the other side')
  for (const x of pos.keys()) for (const y of pos.keys()) if (x < y && row.get(x) === row.get(y)) assert.ok(Math.abs(pos.get(x) - pos.get(y)) >= 2, 'a column apart on one row')
  // A diamond: two parties of one hop apart on the main line, a third off the line at the middle, not a long row
  const ys = boxes.map((n) => n.position.y)
  assert.ok(Math.max(...ys) > Math.min(...ys), 'more than one row')
})

test('authority: with several separate structures one party\'s picture opens, and any other can be picked', () => {
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d'), entity('e')],
    [rel('r1', 'a', 'b', 'control'), rel('r2', 'b', 'c', 'employment'), rel('r3', 'b', 'e', 'agency'), rel('r4', 'd', 'e', 'control')],
  )
  // b has three lines, but it is the structure a-b-c-e-d: one structure, so everything opens
  assert.equal(classifyAuthority(s).company, null)
  const two = spec([entity('a'), entity('b'), entity('x'), entity('y'), entity('z')], [rel('r1', 'a', 'b', 'control'), rel('r2', 'x', 'y', 'employment'), rel('r3', 'x', 'z', 'employment')])
  const opened = classifyAuthority(two)
  assert.equal(opened.company, 'x', 'the busiest party of the several structures')
  assert.deepEqual(opened.ids.sort(), ['x', 'y', 'z'])
  assert.deepEqual(opened.rest.map((r) => r.id), ['r1'])
  const other = classifyAuthority(two, 'b')
  assert.deepEqual(other.ids.sort(), ['a', 'b'], 'nothing below it: the ones above it are drawn')
  assert.deepEqual(other.above, [])
  const top = classifyAuthority(two, 'x')
  assert.deepEqual(top.ids.sort(), ['x', 'y', 'z'])
  assert.equal(classifyAuthority(two, '*').edges.length, 3)
  const g = buildAuthorityGraph(two, { company: 'a' })
  assert.equal(g.company, 'a')
  assert.equal(g.chartParties, 2)
})

test('authority: several parties tied to one company gather on one bar, symmetric about it, and no label covers another', () => {
  const s = spec(
    [entity('a', { label: 'Aa' }), entity('b', { label: 'A much longer name than the others' }), entity('c'), entity('co')],
    [rel('r1', 'a', 'co', 'employment', { label: '法定代表人、执行董事长' }), rel('r2', 'b', 'co', 'employment', { label: '总经理' }), rel('r3', 'c', 'co', 'employment', { label: '监事' })],
  )
  const g = buildAuthorityGraph(s, {})
  const layer = g.nodes.find((n) => n.type === 'lineLayer').data
  const mid = (id) => {
    const n = g.nodes.find((x) => x.id === id)
    return n.position.x + n.data.w / 2
  }
  // The parties stand equally far apart, and the company is in the middle of them
  assert.ok(Math.abs(mid('b') - mid('a') - (mid('c') - mid('b'))) < 1, 'equal spacing whatever the names')
  assert.ok(Math.abs(mid('co') - (mid('a') + mid('c')) / 2) < 1, 'the company is in the middle of its parties')
  // One line comes down into the company, at its middle; the bar is one stretch
  const ends = new Set(layer.links.map((l) => l.d.trim().split(' ').slice(-2).join(' ')))
  assert.equal(ends.size, 1, 'every line ends at the same point')
  assert.ok(Math.abs(Number([...ends][0].split(' ')[0]) - mid('co')) < 1, 'at the middle of the company')
  const pw = (t) => Math.min(220, 20 + [...t].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 12.5 : 7.4), 0))
  const r = layer.pills.map((p) => ({ x: p.x - pw(p.text) / 2, y: p.y - 11, w: pw(p.text), h: 22 }))
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) assert.ok(!(r[i].x < r[j].x + r[j].w && r[j].x < r[i].x + r[i].w && r[i].y < r[j].y + r[j].h && r[j].y < r[i].y + r[i].h), `labels ${i} and ${j} overlap`)
})

test('path: parallel lines between two parties, a label that wraps covers none of the other lines', () => {
  const s = spec(
    [entity('a', { role: '角色' }), entity('b', { role: '角色' })],
    [
      rel('r1', 'a', 'b', 'employment', { label: '副总经理兼首席技术官（2031 年任）' }),
      rel('r2', 'b', 'a', 'equity', { label: '股东', share: 15 }),
      rel('r3', 'a', 'b', 'contract', { label: '技术服务合同（含保密与竞业限制条款）' }),
    ],
  )
  const g = buildPathGraph(s, { from: 'a', to: 'b' })
  const layer = g.nodes.find((n) => n.type === 'lineLayer').data
  assert.equal(layer.links.length, 3)
  const segs = layer.links.map((l) => {
    const pts = [...l.d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => [+m[1], +m[2]])
    return pts.slice(1).map((q, i) => [pts[i], q])
  })
  layer.pills.forEach((p, i) => {
    const w = pillW(p.text)
    const h = pillH(p.text)
    const r = { x: p.x - w / 2 + 3, y: p.y - h / 2 + 2, w: w - 6, h: h - 4 }
    segs.forEach((ss, k) => {
      if (k === i) return
      for (const [a, b] of ss) assert.ok(!(Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h), `the label of line ${i} covers line ${k}`)
    })
  })
})
