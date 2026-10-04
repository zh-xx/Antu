// ============================================================
//  test/focus.test.mjs — the relationship focus view (issue #87): rings, islands, clear lines
//  (pure functions)
//
//  What must hold:
//    1. every party and every relation of every relationship example is drawn once, whichever party
//       is the centre, and the rings are the steps from the centre
//    2. no two boxes overlap and no line runs through a box that is not one of its ends
//    3. any valid JSON draws: no relations, one party, separate groups of parties (islands), a star
//       of many, parallel relations between one pair
//    4. the default centre is the party with most relations (the first written on a tie)
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import {
  buildFocusGraph,
  clipToBox,
  componentsOf,
  defaultCentre,
  segmentHitsRect,
} from '../src/renderers/relationship/focus/layout.js'
import { relationshipKnowledge } from '../src/renderers/relationship/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { translate } from '../src/core/i18n.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const DIR = 'examples/relationship'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))

const entity = (id, extra = {}) => ({ id, kind: 'person', label: `Party ${id}`, ...extra })
const relation = (id, from, to, extra = {}) => ({ id, from, to, kind: 'contract', ...extra })
const spec = (entities, relations = [], extra = {}) => ({ type: 'relationship', specVersion: 1, title: 't', entities, relations, ...extra })

const overlapsAny = (nodes) => {
  const boxes = nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
  const out = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push([a.id, b.id])
    }
  }
  return out
}
const throughBoxes = (g) => {
  const boxes = g.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }))
  const out = []
  for (const c of g.connections) {
    for (const b of boxes) {
      if (b.id === c.from || b.id === c.to) continue
      if (c.points.slice(1).some((q, i) => segmentHitsRect(c.points[i], q, b, 0))) out.push([c.id, b.id])
    }
  }
  return out
}

function assertSound(s, label, centre) {
  const g = buildFocusGraph(s, { centre })
  assert.deepEqual(g.errors, [], `${label}: valid`)
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), s.entities.map((e) => e.id).sort(), `${label}: every party once`)
  assert.deepEqual(g.connections.map((c) => c.relationId).sort(), s.relations.map((r) => r.id).sort(), `${label}: every relation once`)
  assert.deepEqual(overlapsAny(g.nodes), [], `${label}: no two boxes overlap`)
  assert.deepEqual(throughBoxes(g), [], `${label}: no line through a box`)
  // Everything inside the content size
  for (const n of g.nodes) {
    assert.ok(n.position.x >= 0 && n.position.y >= 0, `${label}: ${n.id} not above or left of the frame`)
    assert.ok(n.position.x + n.data.w <= g.size.width && n.position.y + n.data.h <= g.size.height, `${label}: ${n.id} inside the frame`)
  }
  for (const c of g.connections) {
    for (const [x, y] of c.points) assert.ok(x >= 0 && y >= 0 && x <= g.size.width && y <= g.size.height, `${label}: ${c.id} inside the frame`)
  }
  return g
}

test('the focus view is the relationship diagram\'s second kind', () => {
  registerKnowledge('relationship', relationshipKnowledge)
  assert.deepEqual(layoutKindsOf('relationship'), ['graph', 'focus'])
})

for (const f of files) {
  test(`${f}: sound around every possible centre`, () => {
    const s = load(f)
    assertSound(s, `${f} default`)
    for (const e of s.entities) assertSound(s, `${f} centre ${e.id}`, e.id)
  })
}

test('the default centre is the busiest party, the first written on a tie', () => {
  const s = spec([entity('a'), entity('b'), entity('c')], [relation('r1', 'a', 'b'), relation('r2', 'b', 'c')])
  assert.equal(defaultCentre(s), 'b')
  const tie = spec([entity('a'), entity('b')], [relation('r1', 'a', 'b')])
  assert.equal(defaultCentre(tie), 'a')
  assert.equal(buildFocusGraph(s, {}).centre, 'b')
  // An id the data does not have means the default
  assert.equal(buildFocusGraph(s, { centre: 'nobody' }).centre, 'b')
  assert.equal(buildFocusGraph(s, { centre: 'c' }).centre, 'c')
})

test('rings are the steps from the centre', () => {
  // a - b - c - d, centred on a: one party at each step
  const chain = spec([entity('a'), entity('b'), entity('c'), entity('d')], [relation('r1', 'a', 'b'), relation('r2', 'b', 'c'), relation('r3', 'c', 'd')])
  const g = assertSound(chain, 'chain', 'a')
  assert.deepEqual(g.rings, [1, 1, 1, 1])
  const ring = Object.fromEntries(g.nodes.map((n) => [n.id, n.data.ring]))
  assert.deepEqual(ring, { a: 0, b: 1, c: 2, d: 3 })
  // Centred on b it is a ring of two and one beyond
  assert.deepEqual(assertSound(chain, 'chain b', 'b').rings, [1, 2, 1])
})

test('the centre is flagged and in the middle of its own ring', () => {
  const s = load('sample-group-guarantee.zh-CN.json')
  const g = assertSound(s, 'guarantee')
  const centre = g.nodes.filter((n) => n.data.centre)
  assert.equal(centre.length, 1)
  assert.equal(centre[0].id, g.centre)
  // Ring 1 stands around it: each box's middle is farther from the centre's middle than the centre's own half-size
  const cm = [centre[0].position.x + centre[0].data.w / 2, centre[0].position.y + centre[0].data.h / 2]
  for (const n of g.nodes.filter((x) => x.data.ring === 1)) {
    const m = [n.position.x + n.data.w / 2, n.position.y + n.data.h / 2]
    assert.ok(Math.hypot(m[0] - cm[0], m[1] - cm[1]) > centre[0].data.h, `${n.id} stands clear of the centre`)
  }
})

test('the first group stands on the left of the centre, the second on the right', () => {
  const s = load('sample-group-guarantee.zh-CN.json')
  const g = assertSound(s, 'camps')
  const cx = (n) => n.position.x + n.data.w / 2
  const centre = g.nodes.find((n) => n.data.centre)
  const left = g.nodes.filter((n) => n.data.ring === 1 && n.data.entity.groupId === 'g-1')
  const right = g.nodes.filter((n) => n.data.ring === 1 && n.data.entity.groupId === 'g-2')
  assert.ok(left.length && left.every((n) => cx(n) < cx(centre)), 'the first group on the left')
  assert.ok(right.length && right.every((n) => cx(n) > cx(centre)), 'the second group on the right')
})

test('a party carries its camp name, toned by its place', () => {
  const g = buildFocusGraph(load('sample-group-guarantee.zh-CN.json'), {})
  const tone = Object.fromEntries(g.nodes.map((n) => [n.id, n.data.camp?.tone ?? null]))
  assert.equal(tone['e-1'], 0, 'first group: 0')
  assert.equal(tone['e-3'], 1, 'second group: 1')
  assert.equal(tone['e-7'], null, 'no group: no camp name')
})

test('parties no relation reaches become islands under the picture, none dropped', () => {
  const s = spec(
    [entity('a'), entity('b'), entity('c'), entity('d'), entity('e'), entity('lone')],
    [relation('r1', 'a', 'b'), relation('r2', 'c', 'd'), relation('r3', 'd', 'e')],
  )
  const g = assertSound(s, 'islands', 'a')
  assert.deepEqual(g.islands.map((i) => i.ids.sort()), [['a', 'b'], ['c', 'd', 'e'], ['lone']])
  assert.equal(g.islands[0].centre, 'a')
  assert.equal(g.islands[1].centre, 'd', 'each island is centred on its own busiest party')
  assert.ok(g.note, 'the caption for the islands has a place')
  const mainBottom = Math.max(...g.nodes.filter((n) => ['a', 'b'].includes(n.id)).map((n) => n.position.y + n.data.h))
  for (const id of ['c', 'd', 'e', 'lone']) assert.ok(g.nodes.find((n) => n.id === id).position.y > mainBottom, `${id} under the picture`)
  assert.deepEqual(componentsOf(s).map((c) => c.length), [2, 3, 1])
})

test('any valid JSON draws: no relations, one party, parallel relations, a big star', () => {
  assertSound(spec([entity('a'), entity('b')], [relation('r1', 'a', 'b')]), 'two parties')
  assertSound(spec([entity('a'), entity('b'), entity('c')], [relation('r1', 'a', 'b')]), 'a party nothing relates to')
  const parallel = spec([entity('a'), entity('b')], [relation('r1', 'a', 'b'), relation('r2', 'a', 'b', { kind: 'debt' }), relation('r3', 'b', 'a', { kind: 'equity', share: 30 })])
  const g = assertSound(parallel, 'parallel')
  // Parallel relations do not lie on one line
  const mids = g.connections.map((c) => c.points[0])
  assert.equal(new Set(mids.map((p) => p.map((v) => Math.round(v)).join(','))).size, 3)
  const many = Array.from({ length: 30 }, (_, i) => entity(`p${i}`, { label: `A party with a rather long name ${i}`, role: `Role number ${i}` }))
  const star = spec(many, many.slice(1).map((e, i) => relation(`s${i}`, 'p0', e.id, { label: `Relation ${i}` })))
  const sg = assertSound(star, 'star of 30')
  assert.deepEqual(sg.rings, [1, 29])
  // A party tied to many others on the second ring
  const web = spec(many, [...many.slice(1, 10).map((e, i) => relation(`a${i}`, 'p0', e.id)), ...many.slice(10, 30).map((e, i) => relation(`b${i}`, `p${1 + (i % 9)}`, e.id)), relation('x', 'p3', 'p7'), relation('y', 'p2', 'p9')])
  assertSound(web, 'two rings of a web')
  assertSound(web, 'two rings of a web, centre on the edge', 'p25')
})

test('a relation between two parties on opposite sides goes round, not through the middle', () => {
  // The centre c is tied to a (first group, left) and b (second group, right); a and b are tied to each other
  const s = spec(
    [entity('c'), entity('a', { groupId: 'g1' }), entity('b', { groupId: 'g2' })],
    [relation('r1', 'c', 'a'), relation('r2', 'c', 'b'), relation('r3', 'a', 'b', { kind: 'debt' })],
    { groups: [{ id: 'g1', label: 'Left' }, { id: 'g2', label: 'Right' }] },
  )
  const g = assertSound(s, 'opposite', 'c')
  const through = g.connections.find((x) => x.relationId === 'r3')
  assert.ok(through.points.length > 2, 'drawn as a curve round the ring, not straight across the centre')
  assert.match(through.d, /^M [\d.-]+ [\d.-]+ C /, 'as a smooth curve')
  assert.equal(through.faint, true, 'faint: it does not touch the centre')
  assert.equal(g.connections.find((x) => x.relationId === 'r1').faint, false)
  assert.equal(g.connections.find((x) => x.relationId === 'r1').points.length, 2, 'a relation of the centre is straight')
})

test('the layout is the same every time', () => {
  const s = load('marketplace-parties.zh-CN.json')
  assert.deepEqual(buildFocusGraph(s, {}), buildFocusGraph(s, {}))
})

test('a spec with problems is reported, not drawn', () => {
  const g = buildFocusGraph(spec([entity('a')], [relation('r1', 'a', 'nowhere')]), {})
  assert.ok(g.errors.length > 0)
  assert.deepEqual(g.nodes, [])
})

test('clipToBox leaves a box on its edge, a little outside; segmentHitsRect is a slab test', () => {
  const r = { x: 0, y: 0, w: 100, h: 40 }
  const [x, y] = clipToBox(r, [300, 20])
  assert.equal(Math.round(x), 102)
  assert.equal(Math.round(y), 20)
  const [x2, y2] = clipToBox(r, [50, -200])
  assert.equal(Math.round(x2), 50)
  assert.equal(Math.round(y2), -2)
  assert.equal(segmentHitsRect([-10, 20], [110, 20], r), true)
  assert.equal(segmentHitsRect([-10, 60], [110, 60], r), false)
  assert.equal(segmentHitsRect([-10, 60], [110, 60], r, 25), true, 'grown by a margin')
  assert.equal(segmentHitsRect([200, -50], [200, 90], r), false)
})

test('the geometry report speaks of the centre, the rings and what is apart', () => {
  const s = spec([entity('a'), entity('b'), entity('c'), entity('x')], [relation('r1', 'a', 'b'), relation('r2', 'b', 'c')])
  const r = layoutReport(s, { kind: 'focus' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'focus')
  const text = formatLayoutReport(r)
  assert.match(text, /^Kind: focus/m)
  assert.match(text, /centred on "Party b"/)
  assert.match(text, /Rings around it: 2 at 1 step/)
  assert.match(text, /1 party is not reached from the centre/)
  // The graph's own report is unchanged by the new kind
  assert.match(formatLayoutReport(layoutReport(s, {})), /Vertical: content/)
  assert.equal(layoutReport(s, { kind: 'nope' }).ok, false)
})

test('every focus message exists in both languages', () => {
  for (const lang of ['en', 'zh']) {
    for (const key of ['graphKind.focus', 'rel.focus.hint', 'rel.focus.apart', 'rel.focus.reset', 'rel.focus.resetTitle']) {
      const text = translate(lang, key)
      assert.ok(text && !text.startsWith('rel.') && !text.startsWith('graphKind.'), `${lang} ${key}`)
    }
  }
})
