// Whole-graph obstacle clearance + crossings for Mainline stages-off (PR #359 / issue 190).
// Gates fail on de0ec80 baseline for L3/L4/07 box hits and S3/L3 crossings; production layout only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProcedureGraph } from '../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import {
  segHitsBox,
  pathClear,
  pathCrossCount,
  orthoSegsCross,
  clearSideHorizontal,
  sideHorizontal,
  routeHangToSpine,
  gutterBlocked,
  interLaneCorridor,
  gutterRejoin,
  OUTER_GAP,
} from '../src/renderers/procedure/flow/hangSpineRoute.js'

const fields = { engine: 'mainline', stages: false }

function foreignHits(g) {
  const hits = []
  for (const c of g.connections) {
    for (let i = 0; i < c.points.length - 1; i += 1) {
      for (const n of g.nodes) {
        if (n.id === c.from || n.id === c.to) continue
        const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
        if (segHitsBox(c.points[i], c.points[i + 1], box)) hits.push(`${c.id}@${n.id}`)
      }
    }
  }
  return [...new Set(hits)]
}

function edgeCrossings(g) {
  const out = []
  const cs = g.connections.filter((c) => c.points?.length >= 2)
  for (let i = 0; i < cs.length; i += 1) {
    for (let j = i + 1; j < cs.length; j += 1) {
      const a = cs[i].points
      const b = cs[j].points
      for (let u = 0; u < a.length - 1; u += 1) {
        for (let v = 0; v < b.length - 1; v += 1) {
          if (orthoSegsCross([a[u], a[u + 1]], [b[v], b[v + 1]])) {
            out.push(`${cs[i].id} x ${cs[j].id}`)
          }
        }
      }
    }
  }
  return out
}

function endpointGaps(g) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const gaps = []
  const distBox = (n, p) => {
    const x = n.position.x
    const y = n.position.y
    const w = n.data.w
    const h = n.data.h
    const dx = p[0] < x ? x - p[0] : p[0] > x + w ? p[0] - (x + w) : 0
    const dy = p[1] < y ? y - p[1] : p[1] > y + h ? p[1] - (y + h) : 0
    return Math.hypot(dx, dy)
  }
  for (const c of g.connections) {
    if (!c.points?.length) continue
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (!from || !to) continue
    const d0 = distBox(from, c.points[0])
    const d1 = distBox(to, c.points[c.points.length - 1])
    if (d0 > 1.5 || d1 > 1.5) gaps.push(`${c.id}:${d0.toFixed(1)}/${d1.toFixed(1)}`)
  }
  return gaps
}

function missingLabels(g) {
  return g.connections.filter((c) => c.label && !c.labelAt).map((c) => c.id)
}

function scanFile(path, orientation = 'vertical') {
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const g = buildProcedureGraph(spec, fields, undefined, orientation)
  const spine = new Set(g.spine)
  const spineBends = g.connections
    .filter((c) => c.kind === 'main' && spine.has(c.from) && spine.has(c.to) && bendsOf(c.points) !== 0)
    .map((c) => c.id)
  const touched = new Set()
  for (const e of spec.edges || []) {
    touched.add(e.from)
    touched.add(e.to)
  }
  const missingNodes = (spec.nodes || [])
    .filter((n) => touched.has(n.id) && !g.nodes.some((x) => x.id === n.id))
    .map((n) => n.id)
  const connPairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
  const missingEdges = (spec.edges || [])
    .map((e) => `${e.from}->${e.to}`)
    .filter((k) => !connPairs.has(k))
  return {
    g,
    hits: foreignHits(g),
    crossings: edgeCrossings(g),
    gaps: endpointGaps(g),
    missingLabels: missingLabels(g),
    spineBends,
    missingNodes,
    missingEdges,
    errors: g.errors,
  }
}

const ORIGINAL = [
  'preview/synthetic-rejoin/fixtures/L3-admin-reconsider-nested.zh-CN.json',
  'preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json',
  'examples/procedure/07-share-acquisition-agreement.zh-CN.json',
]

for (const path of ORIGINAL) {
  for (const dir of ['vertical', 'horizontal']) {
    test(`mainline clear: ${path.split('/').pop()} ${dir} — 0 foreign box hits, full graph, endpoints`, () => {
      const r = scanFile(path, dir)
      assert.deepEqual(r.errors, [])
      assert.deepEqual(r.missingNodes, [])
      assert.deepEqual(r.missingEdges, [])
      assert.deepEqual(r.spineBends, [])
      assert.deepEqual(r.hits, [])
      assert.deepEqual(r.gaps, [])
      assert.deepEqual(r.missingLabels, [])
    })
  }
}

test('mainline clear: L3 both orients — 0 crossings (baseline had 1)', () => {
  for (const dir of ['vertical', 'horizontal']) {
    const r = scanFile('preview/synthetic-rejoin/fixtures/L3-admin-reconsider-nested.zh-CN.json', dir)
    assert.deepEqual(r.crossings, [], `L3 ${dir} crossings`)
  }
})

test('mainline clear: L4 vertical — 0 crossings + attached endpoints (baseline V had 0 cross, 4 hits)', () => {
  const r = scanFile('preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json', 'vertical')
  assert.deepEqual(r.hits, [])
  assert.deepEqual(r.crossings, [])
  assert.deepEqual(r.gaps, [])
})

test('mainline clear: L4 horizontal — 0 hits, 0 crossings (baseline H had 0 cross / 4 hits)', () => {
  // n-7→n-8 same-stack past n-10: north U crossed settlement (3). Crossing-aware restore +
  // post-straighten repair picks a box-clear outer corridor with 0 crossings (non-regression
  // vs baseline H cross=0; hits stay 0).
  const r = scanFile('preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json', 'horizontal')
  assert.deepEqual(r.hits, [])
  assert.deepEqual(r.gaps, [])
  assert.deepEqual(r.crossings, [], `L4 H crossings ${r.crossings.join('|')}`)
})

test('mainline clear: S3 hard gates (0 hits, 0 crossings, straight spine, E/W leave, ≤2 bend rejoin)', () => {
  const path = 'preview/synthetic-rejoin/fixtures/S3-outer-gutter-blocked.zh-CN.json'
  for (const dir of ['vertical', 'horizontal']) {
    const r = scanFile(path, dir)
    assert.deepEqual(r.hits, [], `S3 ${dir} hits`)
    assert.deepEqual(r.crossings, [], `S3 ${dir} crossings`)
    assert.deepEqual(r.spineBends, [], `S3 ${dir} spine`)
    assert.deepEqual(r.gaps, [], `S3 ${dir} gaps`)
  }
  const r = scanFile(path, 'vertical')
  const byId = new Map(r.g.nodes.map((n) => [n.id, n]))
  const rejoin = r.g.connections.find((e) => e.id === 'c:n-21->n-3')
  assert.ok(rejoin)
  const from = byId.get('n-21')
  const [x, y] = rejoin.points[0]
  const cy = from.position.y + from.data.h / 2
  const leaveW = Math.abs(x - from.position.x) < 1.5 && Math.abs(y - cy) < 2
  const leaveE = Math.abs(x - (from.position.x + from.data.w)) < 1.5 && Math.abs(y - cy) < 2
  assert.ok(leaveW || leaveE, 'diamond rejoin leaves E/W')
  assert.ok(bendsOf(rejoin.points) <= 2)
})

test('mainline clear: same-row blocked → U clears (production helper)', () => {
  const a = { x: 200, y: 100, w: 80, h: 40 }
  const b = { x: 400, y: 100, w: 80, h: 40 }
  const mid = { x: 300, y: 90, w: 60, h: 60 }
  const placed = new Map([
    ['a', a],
    ['b', b],
    ['mid', mid],
  ])
  const straight = sideHorizontal(a, b)
  assert.equal(pathClear(straight, placed, 'a', 'b'), false)
  const clear = clearSideHorizontal(a, b, placed, 'a', 'b')
  assert.ok(clear)
  assert.equal(pathClear(clear, placed, 'a', 'b'), true)
})

test('production exhausted both-blocked: no unchecked gutter; returned path is pathClear or deep-verified', () => {
  // Dense wall: gutter blocked, interLane null, shallow outer blocked — forces deep search.
  const a = { x: 200, y: 100, w: 80, h: 80 }
  const b = { x: 40, y: 260, w: 100, h: 40 }
  const hangOnRight = true
  const hangOuter = a.x + a.w
  const placed = new Map([
    ['hang', a],
    ['spine', b],
    ['gutter', { x: 120, y: 160, w: 60, h: 80 }],
    ['vertWall', { x: hangOuter + 4, y: 90, w: OUTER_GAP + 80, h: 220 }],
  ])
  assert.equal(gutterBlocked(a, b, hangOnRight, placed, 'hang', 'spine'), true)
  assert.equal(interLaneCorridor(a, b, hangOnRight, placed, 'hang', 'spine'), null)
  const legacy = gutterRejoin(a, b, hangOnRight)
  assert.equal(pathClear(legacy, placed, 'hang', 'spine'), false)
  const pts = routeHangToSpine(a, b, hangOnRight, placed, 'hang', 'spine', true)
  assert.ok(pts?.length >= 2)
  assert.notDeepEqual(pts, legacy)
  // Must not silently emit the known-blocked gutter; prefer a pathClear result when search finds one.
  assert.equal(pathClear(pts, placed, 'hang', 'spine'), true)
})

test('mainline: input-order stability — reverse nodes+edges (canonical ids; mainline unchanged)', () => {
  // Shuffle: reverse both nodes[] and edges[] arrays only. Inferred spine / hang membership
  // must be identical; translated node centres must match.
  const path = 'preview/synthetic-rejoin/fixtures/L2-labour-arbitration-nested.zh-CN.json'
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const layout = (s) => {
    const g = buildProcedureGraph(s, fields, undefined, 'vertical')
    const minx = Math.min(...g.nodes.map((n) => n.position.x))
    const miny = Math.min(...g.nodes.map((n) => n.position.y))
    return {
      spine: [...g.spine],
      pos: Object.fromEntries(
        g.nodes.map((n) => [n.id, { x: Math.round(n.position.x - minx), y: Math.round(n.position.y - miny) }]),
      ),
    }
  }
  const a = layout(spec)
  const rev = { ...spec, edges: [...spec.edges].reverse(), nodes: [...spec.nodes].reverse() }
  const b = layout(rev)
  assert.deepEqual(b.spine, a.spine, 'inferred spine changed under reverse')
  for (const id of Object.keys(a.pos)) {
    assert.deepEqual(b.pos[id], a.pos[id], `node ${id} moved under input reorder`)
  }
})

test('mainline: independent branch insertion order — permute non-main leave edges only', () => {
  const path = 'preview/synthetic-rejoin/fixtures/L2-labour-arbitration-nested.zh-CN.json'
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const layout = (s) => {
    const g = buildProcedureGraph(s, fields, undefined, 'vertical')
    const minx = Math.min(...g.nodes.map((n) => n.position.x))
    const miny = Math.min(...g.nodes.map((n) => n.position.y))
    return {
      spine: [...g.spine],
      pos: Object.fromEntries(
        g.nodes.map((n) => [n.id, { x: Math.round(n.position.x - minx), y: Math.round(n.position.y - miny) }]),
      ),
    }
  }
  const main = spec.edges.filter((e) => e.main)
  const branch = spec.edges.filter((e) => !e.main)
  const a = layout(spec)
  const shuffled = {
    ...spec,
    edges: [...main, ...[...branch].reverse()],
  }
  const b = layout(shuffled)
  assert.deepEqual(b.spine, a.spine, 'spine changed under branch-edge reorder')
  for (const id of Object.keys(a.pos)) {
    assert.deepEqual(b.pos[id], a.pos[id], `node ${id} moved under branch reorder`)
  }
})

test('pathCrossCount / orthoSegsCross audit', () => {
  assert.equal(
    orthoSegsCross(
      [
        [0, 10],
        [20, 10],
      ],
      [
        [10, 0],
        [10, 20],
      ],
    ),
    true,
  )
  assert.equal(
    pathCrossCount(
      [
        [0, 10],
        [20, 10],
      ],
      [
        [
          [10, 0],
          [10, 20],
        ],
      ],
    ),
    1,
  )
})
