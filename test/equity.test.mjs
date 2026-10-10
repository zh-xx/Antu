// ============================================================
//  test/equity.test.mjs — the relationship equity tree (issue #91): levels, products, cycles (pure functions)
//
//  What must hold:
//    1. every relation of every relationship example is on the page once: a line of the tree, or a row of
//       the list of the rest; every party is in the tree or in "not in the equity tree"
//    2. a holder stands above what it holds; no two boxes overlap
//    3. indirect holdings are the sum over paths of the product of the shares, and only when every share
//       on every path is stated
//    4. a cross-holding is allowed: one line of the cycle is drawn upward and dashed, nothing loops
//    5. any valid JSON draws (no equity at all has an explicit empty state)
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildEquityGraph, classifyEquity, indirectHoldings, shareText } from '../src/renderers/relationship/equity/layout.js'
import { relationshipKnowledge } from '../src/renderers/relationship/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const DIR = 'examples/relationship'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const entity = (id, extra = {}) => ({ id, kind: 'company', label: `Co ${id}`, ...extra })
const rel = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, ...extra })
const spec = (entities, relations) => ({ type: 'relationship', specVersion: 1, title: 't', entities, relations })
const holds = (id, from, to, share) => rel(id, from, to, 'equity', share === undefined ? {} : { share })

function assertSound(s, label) {
  const g = buildEquityGraph(s, {})
  assert.deepEqual(g.errors, [], `${label}: valid`)
  const p = classifyEquity(s)
  const treeIds = new Set(p.ids)
  for (const e of s.entities) assert.ok(treeIds.has(e.id) || p.apart.some((a) => a.id === e.id) || p.above.some((r) => r.from === e.id || r.to === e.id), `${label}: ${e.id} is in the tree, above it or listed apart`)
  assert.equal(p.edges.length + p.above.length + p.rest.length, s.relations.length, `${label}: every relation is a line, above it or a row of the rest`)
  const boxes = g.nodes.filter((n) => n.type === 'rnode').map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= g.size.width && a.y + a.h <= g.size.height, `${label}: ${a.id} inside the content`)
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${label}: ${a.id} and ${b.id} overlap`)
    }
  }
  // A holder stands above what it holds (except along a cross-holding line, drawn upward)
  const at = new Map(boxes.map((b) => [b.id, b]))
  for (const e of p.edges.filter((x) => !x.back)) assert.ok(at.get(e.from).y + at.get(e.from).h <= at.get(e.to).y, `${label}: ${e.from} above ${e.to}`)
  return g
}

test('the equity tree is a registered relationship kind, after the matrix', () => {
  registerKnowledge('relationship', relationshipKnowledge)
  assert.deepEqual(layoutKindsOf('relationship').slice(0, 4), ['graph', 'focus', 'matrix', 'equity'])
})

for (const f of files) {
  test(`${f}: every relation on the page once, holders above`, () => {
    assertSound(load(f), f)
  })
}

test('levels follow the longest path from a holder that is held by no one', () => {
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d')],
    [holds('r1', 'a', 'b', 50), holds('r2', 'b', 'c', 50), holds('r3', 'a', 'c', 10), holds('r4', 'c', 'd', 100)],
  )
  const p = classifyEquity(s)
  assert.deepEqual([...p.level], [['a', 0], ['b', 1], ['c', 2], ['d', 3]])
  assert.deepEqual(p.roots, ['a'])
  assertSound(s, 'levels')
})

test('a line that skips a level goes around the boxes of that level', () => {
  // a holds b and c; b holds c; a also holds d directly two levels down through b's level: a -> c skips b's level
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('x'), entity('y')],
    [holds('r1', 'a', 'b', 50), holds('r2', 'b', 'c', 50), holds('r3', 'a', 'c', 10), holds('r4', 'x', 'b', 5), holds('r5', 'y', 'c', 5), holds('r6', 'a', 'y', 1)],
  )
  const g = assertSound(s, 'skip')
  const layer = g.nodes[0].data
  const boxes = g.nodes.filter((n) => n.type === 'rnode').map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
  const long = layer.links.filter((l) => l.via.length)
  assert.ok(long.length >= 1, 'a line has a waypoint')
  for (const l of long) {
    for (const [px, py] of l.via) {
      for (const b of boxes) assert.ok(!(px > b.x && px < b.x + b.w && py >= b.y && py <= b.y + b.h), `waypoint (${px}, ${py}) is inside ${b.id}`)
    }
    assert.ok(!/ C /.test(l.d), 'straight stretches and right-angle turns, no curve')
    for (const [px, py] of l.via) assert.ok(l.d.includes(`L ${px} ${py}`), 'the line goes through its waypoint')
  }
})

test('indirect holdings: the sum of the products over every path, only when every share is stated', () => {
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d')],
    [holds('r1', 'a', 'b', 50), holds('r2', 'b', 'c', 50), holds('r3', 'a', 'c', 10), holds('r4', 'c', 'd')],
  )
  const rows = indirectHoldings(s)
  const c = rows.find((r) => r.held === 'c')
  assert.equal(c.total, 35, '50% × 50% + 10%')
  assert.deepEqual(c.terms, ['50% × 50%', '10%'])
  const d = rows.find((r) => r.held === 'd')
  assert.equal(d.total, null, 'the share into d is not stated')
  assert.equal(rows.find((r) => r.held === 'b'), undefined, 'a direct holding is not indirect')
  const g = assertSound(s, 'indirect')
  assert.equal(g.noShare, 1)
  assert.match(g.nodes[0].data.pills.find((p) => p.relId === 'r4').text, /not stated/)
})

test('a cross-holding is drawn once, upward and dashed', () => {
  const s = spec([entity('a'), entity('b'), entity('c')], [holds('r1', 'a', 'b', 60), holds('r2', 'b', 'c', 60), holds('r3', 'c', 'a', 10)])
  const p = classifyEquity(s)
  assert.deepEqual(p.edges.filter((e) => e.back).map((e) => e.rel.id), ['r3'])
  const g = assertSound(s, 'cycle')
  assert.equal(g.crossHoldings, 1)
  const layer = g.nodes[0].data
  assert.equal(layer.links.filter((l) => l.back).length, 1)
  assert.match(layer.pills.find((x) => x.relId === 'r3').text, /cross-holding/)
  // A pure cycle has no holder on top
  const ring = spec([entity('a'), entity('b')], [holds('r1', 'a', 'b', 50), holds('r2', 'b', 'a', 50)])
  assertSound(ring, 'ring')
})

test('no equity at all: an explicit empty state, and the rest still listed', () => {
  const s = spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'contract')])
  const g = assertSound(s, 'none')
  const layer = g.nodes[0].data
  assert.equal(layer.empties.length, 1)
  assert.equal(g.equityLines, 0)
  assert.ok(layer.frames.length >= 2, 'the parties and the other relations are listed')
})

test('the share is written without trailing noise', () => {
  assert.equal(shareText(55), '55%')
  assert.equal(shareText(33.333333), '33.33%')
  assert.equal(shareText(0.5), '0.5%')
})

test('the report names what the data leaves unsaid, by kind', () => {
  const s = spec([entity('a'), entity('b')], [holds('r1', 'a', 'b')])
  const r = layoutReport(s, { kind: 'equity' })
  assert.equal(r.ok, true)
  assert.equal(r.noShare, 1)
  assert.match(formatLayoutReport(r), /no share written/)
})

test('several separate structures: the busiest party opens, any party can be picked, "all" keeps everything', () => {
  // two holders of A, A holds B (one structure); X holds Y (another)
  const s = spec(
    [entity('h1'), entity('h2'), entity('a'), entity('b'), entity('x'), entity('y')],
    [holds('r1', 'h1', 'a', 60), holds('r2', 'h2', 'a', 40), holds('r3', 'a', 'b', 100), holds('r4', 'x', 'y', 100)],
  )
  // Nothing asked: the structure with most lines, opened on its busiest party (a: three lines)
  const opened = classifyEquity(s)
  assert.equal(opened.company, 'a')
  // The party at the top and what is below it; its holders are written under the picture
  assert.deepEqual(opened.ids.sort(), ['a', 'b'])
  assert.deepEqual(opened.above.map((r) => r.id).sort(), ['r1', 'r2'])
  assert.deepEqual(opened.rest.map((r) => r.id), ['r4'], 'the line outside the picture is listed, not dropped')
  assert.deepEqual(opened.apart.map((e) => e.id).sort(), ['x', 'y'])
  // A party with nothing below it is a box on its own, with everything above it listed
  const b = classifyEquity(s, 'b')
  assert.deepEqual(b.ids.sort(), ['b'])
  assert.deepEqual(b.above.map((r) => r.id).sort(), ['r1', 'r2', 'r3'])
  const y = classifyEquity(s, 'y')
  assert.deepEqual(y.ids.sort(), ['y'])
  assert.deepEqual(y.above.map((r) => r.id), ['r4'])
  assert.equal(y.edges.length + y.above.length + y.rest.length, s.relations.length)
  // "All" draws every line, as before
  const all = classifyEquity(s, '*')
  assert.equal(all.company, null)
  assert.equal(all.edges.length, 4)
  // The page says which party it is and lists the parties to pick from
  const g = buildEquityGraph(s, { company: 'y' })
  assert.equal(g.company, 'y')
  assert.deepEqual(g.companies.map((c) => c.id), ['h1', 'h2', 'a', 'b', 'x', 'y'])
  assert.equal(g.treeParties, 1)
  assertSound(s, 'several structures')
})

test('one structure opens on all of it, and a party the data does not have falls back to the default', () => {
  const s = spec([entity('h'), entity('a'), entity('b')], [holds('r1', 'h', 'a', 100), holds('r2', 'a', 'b', 100)])
  assert.equal(classifyEquity(s).company, null)
  assert.equal(classifyEquity(s, 'nobody').company, null)
  assert.equal(classifyEquity(s).edges.length, 2)
})
