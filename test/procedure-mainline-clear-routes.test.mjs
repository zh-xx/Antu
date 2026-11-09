// Whole-graph obstacle clearance + crossings for Mainline stages-off (PR #359 / issue 190).
// Gates fail on de0ec80 baseline for L3/L4/07 box hits and S3/L3 crossings; production layout only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProcedureGraph } from '../src/renderers/procedure/flow/layout.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import {
  segHitsBox,
  segRunsOnBoxEdge,
  pathClear,
  pathCrossCount,
  pathLength,
  pathBendCount,
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

test('07 decision: joint S2 multi-attach clears shared leave; trunk face kept; outline ports', async () => {
  // issue 190 S2: free-side outline multi-attach (not trunk-face steal). Joint resolve after
  // combined-frame polish — naive per-edge first-point mutation is not enough.
  const { onDiamondOutline } = await import('../src/renderers/procedure/flow/diamondPorts.js')
  const spec = JSON.parse(readFileSync('examples/procedure/07-share-acquisition-agreement.zh-CN.json', 'utf8'))
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    assert.equal(edgeCrossings(g).length, 0, dir)
    assert.deepEqual(foreignHits(g), [], dir)
    const n = g.nodes.find((x) => x.id === 'n-3')
    const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    const leave = new Map()
    const incident = []
    for (const c of g.connections) {
      if (!c.points?.length) continue
      if (c.from === 'n-3') {
        assert.equal(onDiamondOutline(box, c.points[0]), true, `${dir} leave off outline ${c.id}`)
        const k = `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`
        if (!leave.has(k)) leave.set(k, [])
        leave.get(k).push(c.id)
        incident.push({ id: c.id, kind: c.kind, end: 'leave', pt: c.points[0] })
      }
      if (c.to === 'n-3') {
        assert.equal(onDiamondOutline(box, c.points.at(-1)), true, `${dir} enter off outline ${c.id}`)
        incident.push({ id: c.id, kind: c.kind, end: 'enter', pt: c.points.at(-1) })
      }
    }
    const shared = [...leave.entries()].filter(([, ids]) => ids.length > 1)
    assert.deepEqual(shared, [], `${dir}: shared leave must be cleared by joint S2 resolve`)
    assert.ok(incident.some((e) => e.end === 'enter'), `${dir}: missing incoming trunk enter on n-3`)
    assert.ok(incident.filter((e) => e.end === 'leave').length >= 3, `${dir}: expected ≥3 leaves from n-3`)
    assert.equal(incident.filter((e) => e.end === 'leave' && e.kind === 'main').length, 1, dir)
  }
})

test('S2 joint resolve: crowded diamond (≥3 branch leaves) — distinct outline ports, no trunk steal, V/H', async () => {
  const { onDiamondOutline } = await import('../src/renderers/procedure/flow/diamondPorts.js')
  // Independently authored minimal case (not a lab file copy): N/S trunk + 3 side exits.
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'synth-crowd-ports',
    domain: 'contract-performance',
    nodes: [
      { id: 's', kind: 'start', label: 'S' },
      { id: 'd', kind: 'decision', label: 'D' },
      { id: 'm', kind: 'step', label: '主' },
      { id: 'e', kind: 'end', label: 'E', outcome: 'positive' },
      { id: 'a', kind: 'end', label: 'A', outcome: 'negative' },
      { id: 'b', kind: 'end', label: 'B', outcome: 'negative' },
      { id: 'c', kind: 'end', label: 'C', outcome: 'negative' },
    ],
    edges: [
      { from: 's', to: 'd', main: true },
      { from: 'd', to: 'm', condition: '主', main: true },
      { from: 'm', to: 'e', main: true },
      { from: 'd', to: 'a', condition: '1' },
      { from: 'd', to: 'b', condition: '2' },
      { from: 'd', to: 'c', condition: '3' },
    ],
  }
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    assert.deepEqual(g.errors, [])
    assert.deepEqual(foreignHits(g), [], dir)
    assert.deepEqual(edgeCrossings(g), [], dir)
    assert.deepEqual(endpointGaps(g), [], dir)
    const pairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
    for (const e of spec.edges) assert.ok(pairs.has(`${e.from}->${e.to}`), `${dir} lost ${e.from}->${e.to}`)
    const n = g.nodes.find((x) => x.id === 'd')
    const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    const leave = new Map()
    let mainLeave = 0
    for (const c of g.connections) {
      if (c.from !== 'd' || !c.points?.length) continue
      assert.equal(onDiamondOutline(box, c.points[0]), true, `${dir} ${c.id}`)
      if (c.kind === 'main') mainLeave += 1
      else {
        const k = `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`
        if (!leave.has(k)) leave.set(k, [])
        leave.get(k).push(c.id)
      }
    }
    assert.equal(mainLeave, 1, `${dir}: trunk leave stolen/duplicated`)
    assert.equal(
      [...leave.values()].filter((ids) => ids.length > 1).length,
      0,
      `${dir}: branch leaves still share a port ${JSON.stringify([...leave])}`,
    )
  }
})

test('S2 joint resolve: disconnected-component decision — no co-linear shared stem', async () => {
  // B08 pattern (independently authored): second start→decision with yes/no both leaving one side.
  const { onDiamondOutline } = await import('../src/renderers/procedure/flow/diamondPorts.js')
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'synth-multi-component-stem',
    domain: 'other',
    nodes: [
      { id: 'a1', kind: 'start', label: '甲起' },
      { id: 'a2', kind: 'step', label: '甲步' },
      { id: 'a3', kind: 'end', label: '甲终', outcome: 'positive' },
      { id: 'b1', kind: 'start', label: '乙起' },
      { id: 'b2', kind: 'decision', label: '乙分支' },
      { id: 'b3', kind: 'end', label: '乙主终', outcome: 'positive' },
      { id: 'b4', kind: 'end', label: '乙支终', outcome: 'negative' },
    ],
    edges: [
      { from: 'a1', to: 'a2', main: true },
      { from: 'a2', to: 'a3', main: true },
      { from: 'b1', to: 'b2', main: true },
      { from: 'b2', to: 'b3', condition: '否', main: true },
      { from: 'b2', to: 'b4', condition: '是' },
    ],
  }
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    assert.deepEqual(g.errors, [])
    assert.deepEqual(foreignHits(g), [], dir)
    assert.deepEqual(edgeCrossings(g), [], dir)
    const n = g.nodes.find((x) => x.id === 'b2')
    const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
    const leave = new Map()
    const stems = []
    for (const c of g.connections) {
      if (c.from !== 'b2' || !c.points?.length || c.points.length < 2) continue
      assert.equal(onDiamondOutline(box, c.points[0]), true, `${dir} ${c.id}`)
      const k = `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`
      if (!leave.has(k)) leave.set(k, [])
      leave.get(k).push(c.id)
      const a = c.points[0]
      const b = c.points[1]
      stems.push(`${c.id}:${Math.sign(b[0] - a[0])},${Math.sign(b[1] - a[1])}@${k}`)
    }
    assert.equal([...leave.values()].filter((ids) => ids.length > 1).length, 0, `${dir} shared port`)
    // Distinct first-leg keys (direction@port) — co-linear shared stem collapses ownership.
    const stemKeys = stems.map((s) => s.split(':')[1])
    assert.equal(new Set(stemKeys).size, stemKeys.length, `${dir} co-linear shared stem ${stems}`)
  }
})

test('L4 V n-10→n-11 rejoin-facing adapt: shorter than wrap residual without new crosses/hits', () => {
  // Freeze b7068f4 had len≈2188 / 4 bends (wrap). Placement-first side adapt — not U-family necessity.
  const path = 'preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json'
  const r = scanFile(path, 'vertical')
  assert.deepEqual(r.hits, [])
  assert.deepEqual(r.crossings, [])
  assert.deepEqual(r.gaps, [])
  const e = r.g.connections.find((c) => c.id === 'c:n-10->n-11')
  assert.ok(e, 'missing n-10→n-11')
  assert.ok(pathLength(e.points) < 1000, `expected short rejoin, got len=${pathLength(e.points)}`)
  assert.ok(pathBendCount(e.points) <= 2, `expected ≤2 bends, got ${pathBendCount(e.points)}`)
})

// In-repo pins of lab inputs so CI (no synthetic-lab mount) still enforces the
// #190 strict-collinear regressions. Lab originals remain the immutable audit corpus.
const STRICT_FIX = join(ROOT, 'test/fixtures/mainline-strict')

test('strict collinear: B12 H unrelated long rail overlap must be cleared (not fixture whitelist)', async () => {
  // Independent audit: n-11→n-20 and n-21→n-10 overlapped 334u at y=264 with no shared endpoint.
  const { findCollinearAmbiguities } = await import('../src/renderers/procedure/flow/hangSpineRoute.js')
  const path = join(STRICT_FIX, 'B12-stages-plus-loops.zh-CN.json')
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const g = buildProcedureGraph(spec, fields, undefined, 'horizontal')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const amb = findCollinearAmbiguities(g.connections)
  assert.deepEqual(
    amb.unrelatedOverlaps,
    [],
    `unrelated collinear overlaps remain: ${amb.unrelatedOverlaps.join('|')}`,
  )
  // Label ownership: each condition label must map to a unique destination when present.
  const labeled = g.connections.filter((c) => c.from === 'n-11' || c.from === 'n-21')
  for (const c of labeled) {
    if (!c.label) continue
    assert.ok(c.labelAt, `missing labelAt for ${c.id}`)
  }
})

test('strict collinear: B10 V stages-on must clear cascade-exposed unrelated rails', async () => {
  // Fixing n-2→n-5 coincidences first exposed n-8→n-9 ~ n-6→n-2 at 132u; multi-pass required.
  const { findCollinearAmbiguities } = await import('../src/renderers/procedure/flow/hangSpineRoute.js')
  const path = join(STRICT_FIX, 'B10-multi-backedges.zh-CN.json')
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const g = buildProcedureGraph(spec, { engine: 'mainline', stages: true }, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const amb = findCollinearAmbiguities(g.connections)
  assert.deepEqual(
    amb.unrelatedOverlaps,
    [],
    `unrelated collinear overlaps remain: ${amb.unrelatedOverlaps.join('|')}`,
  )
  assert.deepEqual(amb.branchSharedRails, [])
  assert.deepEqual(amb.sharedEndpointCorridors, [])
})

test('corridor separation must not introduce diagonal polylines (B12 H / B02 V-on)', () => {
  const paths = [
    [join(STRICT_FIX, 'B12-stages-plus-loops.zh-CN.json'), 'horizontal', false],
    [join(STRICT_FIX, 'B02-multioutlet-shared.zh-CN.json'), 'vertical', true],
    [join(STRICT_FIX, 'B10-multi-backedges.zh-CN.json'), 'horizontal', true],
    [join(STRICT_FIX, 'B04-correction-retrial-loop.zh-CN.json'), 'vertical', true],
  ]
  for (const [path, orient, stages] of paths) {
    const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), { engine: 'mainline', stages }, undefined, orient)
    assert.deepEqual(g.errors, [])
    assert.deepEqual(foreignHits(g), [])
    assert.deepEqual(edgeCrossings(g), [], `crossings on ${path} ${orient} stages=${stages}`)
    for (const c of g.connections) {
      if (!c.points?.length) continue
      for (let i = 0; i < c.points.length - 1; i += 1) {
        const [p, q] = [c.points[i], c.points[i + 1]]
        assert.ok(
          Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5,
          `diagonal ${c.id} on ${path}: ${JSON.stringify([p, q])}`,
        )
      }
    }
  }
})

test('rect endpoints: B04 H stages-on main ports must sit on box faces after packing', () => {
  // Independent audit: stage pack shifted n-2 by 11.5u while c:n-1→n-2 / c:n-2→n-3 stayed put.
  const path = join(STRICT_FIX, 'B04-correction-retrial-loop.zh-CN.json')
  const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), { engine: 'mainline', stages: true }, undefined, 'horizontal')
  assert.deepEqual(g.errors, [])
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const onFace = (n, p) => {
    const tol = 1.5
    const { x, y } = n.position
    const w = n.data.w
    const h = n.data.h
    return (
      (Math.abs(p[0] - x) <= tol && p[1] >= y - tol && p[1] <= y + h + tol) ||
      (Math.abs(p[0] - (x + w)) <= tol && p[1] >= y - tol && p[1] <= y + h + tol) ||
      (Math.abs(p[1] - y) <= tol && p[0] >= x - tol && p[0] <= x + w + tol) ||
      (Math.abs(p[1] - (y + h)) <= tol && p[0] >= x - tol && p[0] <= x + w + tol)
    )
  }
  for (const id of ['c:n-1->n-2', 'c:n-2->n-3']) {
    const c = g.connections.find((x) => x.id === id)
    assert.ok(c?.points?.length >= 2, id)
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    assert.ok(onFace(from, c.points[0]), `${id} leave off face ${JSON.stringify(c.points[0])}`)
    assert.ok(onFace(to, c.points.at(-1)), `${id} enter off face ${JSON.stringify(c.points.at(-1))}`)
  }
})

test('strict collinear: V10a H stages-on unrelated long rail must clear', async () => {
  // Independent audit: n-8→n-9 ~ n-6→n-2 shared y=614 for 184u; mid-jog needs near-end split.
  const { findCollinearAmbiguities } = await import('../src/renderers/procedure/flow/hangSpineRoute.js')
  const path = join(STRICT_FIX, 'V10-multi-backedgesa-permute.zh-CN.json')
  const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), { engine: 'mainline', stages: true }, undefined, 'horizontal')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const amb = findCollinearAmbiguities(g.connections)
  assert.deepEqual(
    amb.unrelatedOverlaps,
    [],
    `unrelated collinear overlaps remain: ${amb.unrelatedOverlaps.join('|')}`,
  )
})

test('strict collinear: V11a H stages-on cascade rails must clear', async () => {
  const { findCollinearAmbiguities } = await import('../src/renderers/procedure/flow/hangSpineRoute.js')
  const path = join(STRICT_FIX, 'V11-exception-cascadea-permute.zh-CN.json')
  const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), { engine: 'mainline', stages: true }, undefined, 'horizontal')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const amb = findCollinearAmbiguities(g.connections)
  assert.deepEqual(
    amb.unrelatedOverlaps,
    [],
    `unrelated collinear overlaps remain: ${amb.unrelatedOverlaps.join('|')}`,
  )
})

async function assertShortUnrelatedCleared(path, dir) {
  const { findCollinearAmbiguities, COLLINEAR_UNRELATED_READABILITY_MIN } = await import(
    '../src/renderers/procedure/flow/hangSpineRoute.js'
  )
  const g = buildProcedureGraph(
    JSON.parse(readFileSync(path, 'utf8')),
    { engine: 'mainline', stages: true },
    undefined,
    dir,
  )
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const amb48 = findCollinearAmbiguities(g.connections)
  assert.deepEqual(amb48.unrelatedOverlaps, [])
  const ambRead = findCollinearAmbiguities(g.connections, {
    ambiguousMin: COLLINEAR_UNRELATED_READABILITY_MIN,
  })
  assert.deepEqual(
    ambRead.unrelatedOverlaps,
    [],
    `short unrelated remain (≥${COLLINEAR_UNRELATED_READABILITY_MIN}): ${ambRead.unrelatedOverlaps.join('|')}`,
  )
}

test('short unrelated readability: V10a H stages-on residual under 48 must clear (≥4u)', async () => {
  // Independent audit: after 48-cut, n-8→n-9 ~ n-6→n-2 still shared 29.4u at y=614.
  await assertShortUnrelatedCleared(
    join(STRICT_FIX, 'V10-multi-backedgesa-permute.zh-CN.json'),
    'horizontal',
  )
})

test('short unrelated readability: B10 V stages-on residual under 48 must clear (≥4u)', async () => {
  await assertShortUnrelatedCleared(join(STRICT_FIX, 'B10-multi-backedges.zh-CN.json'), 'vertical')
})

test('short unrelated readability: V11a H stages-on residual under 48 must clear (≥4u)', async () => {
  await assertShortUnrelatedCleared(
    join(STRICT_FIX, 'V11-exception-cascadea-permute.zh-CN.json'),
    'horizontal',
  )
})

test('rect multi-leave: B02 V stages-on must not share one face-centre leave', () => {
  // Independent audit: n-8→n-9 and n-8→n-3 both left S@560,144 after stages packing.
  const path = join(STRICT_FIX, 'B02-multioutlet-shared.zh-CN.json')
  const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), { engine: 'mainline', stages: true }, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const leaves = g.connections.filter((c) => c.from === 'n-8' && c.kind !== 'main')
  assert.ok(leaves.length >= 2)
  const ports = new Set(leaves.map((c) => `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`))
  assert.equal(ports.size, leaves.length, `shared rect leave ports: ${[...ports].join('|')}`)
})

test('rect multi-leave: B09 V stages-off must not share one face-centre leave', () => {
  const path = join(STRICT_FIX, 'B09-nested-hang-rejoin.zh-CN.json')
  const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), fields, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const leaves = g.connections.filter((c) => c.from === 'n-11' && c.kind !== 'main')
  assert.ok(leaves.length >= 2)
  const ports = new Set(leaves.map((c) => `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`))
  assert.equal(ports.size, leaves.length, `shared rect leave ports: ${[...ports].join('|')}`)
})

test('strict collinear: V08b V same-source distinct ports must not share a long rail', async () => {
  // Independent audit: n-b2→n-b3 and n-b2→n-b4 shared x=211 for 155.44u after distinct diamond ports.
  const { findCollinearAmbiguities, pathLength } = await import(
    '../src/renderers/procedure/flow/hangSpineRoute.js'
  )
  const path = join(STRICT_FIX, 'V08-multi-componentsb-extra.zh-CN.json')
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const amb = findCollinearAmbiguities(g.connections)
  assert.deepEqual(
    amb.branchSharedRails,
    [],
    `branch shared rails remain: ${amb.branchSharedRails.join('|')}`,
  )
  const leaves = g.connections.filter((c) => c.from === 'n-b2')
  const ports = new Set(leaves.map((c) => `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`))
  assert.equal(ports.size, leaves.length, 'leave ports must stay distinct')
  // bf19 independent: straight mainline must not buy a branch that rails above the sibling trunk.
  const br = g.connections.find((c) => c.id === 'c:n-b2->n-b4')
  assert.ok(br)
  const aNodes = g.nodes.filter((n) => String(n.id).startsWith('n-a'))
  for (let i = 0; i < br.points.length - 1; i += 1) {
    const p = br.points[i]
    const q = br.points[i + 1]
    if (Math.abs(p[1] - q[1]) >= 0.5) continue
    const lo = Math.min(p[0], q[0])
    const hi = Math.max(p[0], q[0])
    for (const n of aNodes) {
      const top = n.position.y
      const left = n.position.x
      const right = n.position.x + n.data.w
      if (p[1] < top - 0.5 && lo < right && hi > left) {
        assert.fail(
          `V08b branch rails above sibling ${n.id} at y=${p[1]} (box top ${top}); len=${pathLength(br.points).toFixed(0)}`,
        )
      }
    }
  }
})

test('short unrelated readability: B09/V09b V-on — ≥4 clear; ≥1 micro stubs recorded', async () => {
  // Independent bf19 audit: report wrongly claimed short unrel ≥1 = 0. ≥4 is clear;
  // B09 1.84u / V09b ~3u remain — every single-edge jog raises a cross or a longer rail.
  // Resolve lab path when present (cloud agent); else repo fixtures so CI is not lab-coupled.
  const { findCollinearAmbiguities, COLLINEAR_UNRELATED_READABILITY_MIN } = await import(
    '../src/renderers/procedure/flow/hangSpineRoute.js'
  )
  const lab = '/cursor/stores/self/antu-synthetic-lab'
  /** @type {{ label: string, path: string }[]} */
  const inputs = []
  const b09Lab = join(lab, 'inputs/base/B09-nested-hang-rejoin.zh-CN.json')
  const b09Repo = join(STRICT_FIX, 'B09-nested-hang-rejoin.zh-CN.json')
  inputs.push({ label: 'B09', path: existsSync(b09Lab) ? b09Lab : b09Repo })
  const v09Lab = join(lab, 'inputs/variants/V09-nested-hang-rejoinb-extra.zh-CN.json')
  if (existsSync(v09Lab)) inputs.push({ label: 'V09b', path: v09Lab })
  assert.ok(inputs.length >= 1, 'B09 fixture must resolve (lab or test/fixtures)')
  /** @type {string[]} */
  const micro = []
  for (const { label, path } of inputs) {
    await assertShortUnrelatedCleared(path, 'vertical')
    const g = buildProcedureGraph(
      JSON.parse(readFileSync(path, 'utf8')),
      { engine: 'mainline', stages: true },
      undefined,
      'vertical',
    )
    const amb1 = findCollinearAmbiguities(g.connections, { ambiguousMin: 1 })
    const belowFloor = amb1.unrelatedOverlaps.filter((t) => {
      const m = t.match(/:([\d.]+)$/)
      return m && Number(m[1]) < COLLINEAR_UNRELATED_READABILITY_MIN
    })
    micro.push(...belowFloor.map((t) => `${label}:${t}`))
  }
  // ≥4 clear is the hard bar (assertShortUnrelatedCleared). Under-floor micro stubs were a
  // documented residual; if a generic clearance pass removes them, the ledger may be empty.
  for (const t of micro) {
    const m = t.match(/:([\d.]+)$/)
    assert.ok(m && Number(m[1]) < COLLINEAR_UNRELATED_READABILITY_MIN, t)
  }
})

test('audit #190: B08/V08 input main:true stays straight on every component spine', () => {
  // Independent review a837: 12 cells bent n-b2→n-b3 as branch on a disconnected component.
  const paths = [join(STRICT_FIX, 'V08-multi-componentsb-extra.zh-CN.json')]
  const b08Alt = '/tmp/lab-slim/antu-synthetic-lab/inputs/base/B08-multi-components.zh-CN.json'
  try {
    readFileSync(b08Alt)
    paths.push(b08Alt)
  } catch {
    /* optional lab fixture */
  }
  for (const path of paths) {
    const spec = JSON.parse(readFileSync(path, 'utf8'))
    for (const stages of [false, true]) {
      for (const dir of ['vertical', 'horizontal']) {
        const g = buildProcedureGraph(spec, { engine: 'mainline', stages }, undefined, dir)
        assert.equal(g.stats.layoutEngine, 'mainline', `${path} ${dir} stages=${stages}`)
        assert.deepEqual(foreignHits(g), [], `${path} ${dir} stages=${stages}`)
        assert.deepEqual(edgeCrossings(g), [], `${path} ${dir} stages=${stages}`)
        for (const e of spec.edges.filter((x) => x.main === true)) {
          const c = g.connections.find((x) => x.from === e.from && x.to === e.to)
          assert.ok(c, `${path} missing ${e.from}->${e.to}`)
          assert.equal(c.kind, 'main', `${path} ${e.from}->${e.to} kind`)
          assert.equal(
            bendsOf(c.points),
            0,
            `${path} ${dir} stages=${stages} ${e.from}->${e.to} bends=${bendsOf(c.points)}`,
          )
        }
        const b3 = g.nodes.find((n) => n.id === 'n-b3')
        assert.equal(b3?.data?.isSpine, true, `${path} n-b3 must paint as spine`)
      }
    }
  }
})

test('audit #190: L3/02 stages-on — no hits/cross; cross-stage mains may jog', () => {
  const matrix = [
    ['preview/synthetic-rejoin/fixtures/L3-admin-reconsider-nested.zh-CN.json', true],
    ['examples/procedure/02-purchase-contract.zh-CN.json', true],
  ]
  for (const [rel, stages] of matrix) {
    const spec = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
    for (const dir of ['vertical', 'horizontal']) {
      const g = buildProcedureGraph(spec, { engine: 'mainline', stages }, undefined, dir)
      assert.equal(g.stats.layoutEngine, 'mainline', `${rel} ${dir}`)
      assert.deepEqual(foreignHits(g), [], `${rel} ${dir} hits`)
      assert.deepEqual(edgeCrossings(g), [], `${rel} ${dir} cross`)
      // Within-stage input mains stay straight; cross-stage jogs are the documented fold limit.
      for (const e of spec.edges.filter((x) => x.main === true)) {
        const a = spec.nodes.find((n) => n.id === e.from)
        const b = spec.nodes.find((n) => n.id === e.to)
        if (!a || !b || a.stageId !== b.stageId) continue
        const c = g.connections.find((x) => x.from === e.from && x.to === e.to)
        assert.ok(c)
        assert.equal(bendsOf(c.points), 0, `${rel} ${dir} within ${e.from}->${e.to}`)
      }
    }
  }
})

test('L4 V settlement: outgoing and return must not share a long opposite-dir corridor', async () => {
  const {
    findCollinearAmbiguities,
    collinearOverlapLen,
    pathBendCount: bends,
    pathLength: len,
    COLLINEAR_ATTACH_TOL,
  } = await import('../src/renderers/procedure/flow/hangSpineRoute.js')
  const path = 'preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json'
  const g = buildProcedureGraph(JSON.parse(readFileSync(path, 'utf8')), fields, undefined, 'vertical')
  assert.deepEqual(foreignHits(g), [])
  assert.deepEqual(edgeCrossings(g), [])
  const out = g.connections.find((c) => c.id === 'c:n-13->n-14')
  const ret = g.connections.find((c) => c.id === 'c:n-15->n-13')
  assert.ok(out && ret)
  const rejoin = g.connections.find((c) => c.id === 'c:n-10->n-11')
  assert.ok(rejoin && len(rejoin.points) < 1000 && bends(rejoin.points) <= 2)
  const amb = findCollinearAmbiguities(g.connections)
  const pair = amb.sharedEndpointCorridors.filter(
    (t) => t.includes('c:n-13->n-14') && t.includes('c:n-15->n-13'),
  )
  assert.deepEqual(pair, [], `L4 settlement corridor still shared: ${pair.join('|')}`)
  // Classification may still tag a cleared rail as shortNecessary; measure geometry.
  let maxOv = 0
  for (let u = 0; u < out.points.length - 1; u += 1) {
    for (let v = 0; v < ret.points.length - 1; v += 1) {
      maxOv = Math.max(
        maxOv,
        collinearOverlapLen(out.points[u], out.points[u + 1], ret.points[v], ret.points[v + 1]),
      )
    }
  }
  assert.ok(
    maxOv <= COLLINEAR_ATTACH_TOL,
    `L4 out~ret collinear overlap ${maxOv.toFixed(1)} exceeds stub tol ${COLLINEAR_ATTACH_TOL}`,
  )
  const shortPair = amb.shortAttachments.filter(
    (t) => t.includes('c:n-13->n-14') && t.includes('c:n-15->n-13'),
  )
  assert.deepEqual(shortPair, [], `L4 settlement still short-tagged after repair: ${shortPair.join('|')}`)
  // Independent 6785 review: return must not ride n-17「制作分配方案」top / 否 enter tip
  // (edge-graze / false connection). Corridor clear alone is not enough.
  const plan = g.nodes.find((n) => n.id === 'n-17')
  assert.ok(plan)
  const planBox = { x: plan.position.x, y: plan.position.y, w: plan.data.w, h: plan.data.h }
  for (let i = 0; i < ret.points.length - 1; i += 1) {
    assert.equal(
      segRunsOnBoxEdge(ret.points[i], ret.points[i + 1], planBox),
      false,
      `L4 return seg ${i} grazes n-17 edge: ${JSON.stringify(ret.points)}`,
    )
  }
  const noMain = g.connections.find((c) => c.id === 'c:n-13->n-17')
  assert.ok(noMain?.points?.length)
  const tip = noMain.points[noMain.points.length - 1]
  for (let i = 0; i < ret.points.length - 1; i += 1) {
    const p = ret.points[i]
    const q = ret.points[i + 1]
    if (Math.abs(p[1] - q[1]) >= 0.5) continue
    const lo = Math.min(p[0], q[0])
    const hi = Math.max(p[0], q[0])
    if (tip[0] >= lo - 0.5 && tip[0] <= hi + 0.5) {
      assert.ok(
        Math.abs(p[1] - tip[1]) > 0.5,
        `L4 return shares 否 enter tip ${tip} at y=${p[1]}`,
      )
    }
  }
  // Must not share the diamond outline port with 是 leave (false merge at E).
  const outPort = `${out.points[0][0].toFixed(1)},${out.points[0][1].toFixed(1)}`
  const retPort = `${ret.points[ret.points.length - 1][0].toFixed(1)},${ret.points[ret.points.length - 1][1].toFixed(1)}`
  assert.notEqual(outPort, retPort, `L4 是 leave and 回并 enter share port ${outPort}`)
  // Staggered points on the same E face still read as one merge in the PNG — require
  // opposite free face (W) for 回并 enter vs 是 leave (independent review of 9daf62e crop).
  const { diamondVertices: dv } = await import('../src/renderers/procedure/flow/diamondPorts.js')
  const n13 = g.nodes.find((n) => n.id === 'n-13')
  assert.ok(n13)
  const tips = dv({ x: n13.position.x, y: n13.position.y, w: n13.data.w, h: n13.data.h })
  const tipFace = (p) => {
    let best = 'E'
    let bestD = Infinity
    for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
      const t = tips[f]
      const d = Math.hypot(p[0] - t[0], p[1] - t[1])
      if (d < bestD) {
        bestD = d
        best = f
      }
    }
    return best
  }
  const outFace = tipFace(out.points[0])
  const retFace = tipFace(ret.points[ret.points.length - 1])
  assert.notEqual(
    outFace,
    retFace,
    `L4 是 leave face ${outFace} and 回并 enter face ${retFace} still share a side; pts out=${JSON.stringify(out.points[0])} ret=${JSON.stringify(ret.points.at(-1))}`,
  )
  assert.equal(retFace, 'W', `L4 回并 should enter W; got ${retFace} pts=${JSON.stringify(ret.points)}`)
  // tipFace W alone is not enough: a chord from the east hang can end on W tip while ink
  // first hits the SE outline. Require the last approach segment to come from outside W.
  const retPrev = ret.points[ret.points.length - 2]
  const retEnd = ret.points[ret.points.length - 1]
  assert.ok(
    retPrev[0] < retEnd[0] - 0.5,
    `L4 回并 must approach W from the west bay; prev=${JSON.stringify(retPrev)} end=${JSON.stringify(retEnd)} pts=${JSON.stringify(ret.points)}`,
  )
})

test('diamond outline hardgate: bbox-edge off-diamond fails; diamond vertex passes', async () => {
  const { onDiamondOutline, distDiamondOutline, diamondVertices, staggerOnDiamondSide, orthoRoutesFromPort } =
    await import('../src/renderers/procedure/flow/diamondPorts.js')
  const n = {
    position: { x: 100, y: 200 },
    data: { w: 120, h: 80, node: { kind: 'decision' } },
  }
  const v = diamondVertices(n)
  assert.equal(onDiamondOutline(n, v.N), true)
  assert.equal(onDiamondOutline(n, v.E), true)
  assert.equal(distDiamondOutline(n, v.S) < 0.01, true)
  // On bbox top edge but not at N vertex → painted diamond misses this point.
  const bboxOnOffDiamond = [n.position.x + 8, n.position.y]
  assert.equal(onDiamondOutline(n, bboxOnOffDiamond), false)
  assert.ok(distDiamondOutline(n, bboxOnOffDiamond) > 1.5)
  // On bbox right edge mid-height but shifted off E vertex along the side.
  const bboxEOff = [n.position.x + n.data.w, n.position.y + 8]
  assert.equal(onDiamondOutline(n, bboxEOff), false)
  // S2 helpers: staggered side ports stay on outline and are distinct from the vertex.
  const s0 = staggerOnDiamondSide(n, 'E', 0, 2)
  const s1 = staggerOnDiamondSide(n, 'E', 1, 2)
  assert.equal(onDiamondOutline(n, s0), true)
  assert.equal(onDiamondOutline(n, s1), true)
  assert.ok(Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) > 1)
  assert.ok(Math.hypot(s0[0] - v.E[0], s0[1] - v.E[1]) > 1)
  // High-degree: distinct outline anchors (no clamp-duplicate).
  const hi = [0, 1, 2, 3, 4].map((i) => staggerOnDiamondSide(n, 'E', i, 5))
  for (const p of hi) assert.equal(onDiamondOutline(n, p), true)
  const keys = new Set(hi.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`))
  assert.equal(keys.size, hi.length, `high-degree ports collided: ${[...keys]}`)
  // orthoRoutesFromPort: never rewrite a 2-pt second vertex in place — first=port, last on target face.
  const port = s0
  const target = { x: 280, y: 210, w: 80, h: 40 }
  const fromBox = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
  const routes = orthoRoutesFromPort(port, target, fromBox, 28)
  assert.ok(routes.length >= 4, 'expected multiple orthogonal candidates')
  // Same-row align → short 2-point is offered; otherwise rebuild still starts at port.
  const aligned = { x: 280, y: port[1] - 20, w: 80, h: 40 }
  const short = orthoRoutesFromPort(port, aligned, fromBox, 28)
  assert.ok(
    short.some((r) => r.length === 2 && r[0][0] === port[0] && r[0][1] === port[1]),
    'aligned target must offer 2-point without rewriting port',
  )
  for (const r of routes) {
    assert.equal(r[0][0], port[0])
    assert.equal(r[0][1], port[1])
    const last = r.at(-1)
    const onW = Math.abs(last[0] - target.x) < 0.01
    const onE = Math.abs(last[0] - (target.x + target.w)) < 0.01
    const onN = Math.abs(last[1] - target.y) < 0.01
    const onS = Math.abs(last[1] - (target.y + target.h)) < 0.01
    assert.ok(onW || onE || onN || onS, `enter not on target face ${last}`)
  }
})

test('S2 order stability: repeated builds yield identical leave ports V/H', () => {
  const spec = JSON.parse(readFileSync('examples/procedure/07-share-acquisition-agreement.zh-CN.json', 'utf8'))
  for (const dir of ['vertical', 'horizontal']) {
    const a = buildProcedureGraph(spec, fields, undefined, dir)
    const b = buildProcedureGraph(spec, fields, undefined, dir)
    const ports = (g) =>
      g.connections
        .filter((c) => c.from === 'n-3' && c.points?.length)
        .map((c) => `${c.id}:${c.points[0][0].toFixed(2)},${c.points[0][1].toFixed(2)}`)
        .sort()
    assert.deepEqual(ports(a), ports(b), dir)
    assert.deepEqual(
      a.connections.map((c) => c.points),
      b.connections.map((c) => c.points),
      `${dir} full points`,
    )
  }
})

test('production exhausted absolute: routeHangToSpine returns null — never unsafe outer as success', () => {
  // Seal hang/spine so finite corridors cannot pathClear. Contract: null (exhausted), not an
  // unchecked outerCorridor that looks like success while cutting boxes.
  // (Layout-level corpus does not currently place a sealed wall; this geometric fixture is the
  // production search exhaust marker. Flag propagation through assembly is covered below.)
  const a = { x: 200, y: 200, w: 60, h: 60 }
  const b = { x: 40, y: 360, w: 60, h: 40 }
  const hangOnRight = true
  const placed = new Map([
    ['hang', a],
    ['spine', b],
    ['w1', { x: 0, y: 0, w: 400, h: 180 }],
    ['w2', { x: 0, y: 180, w: 180, h: 280 }],
    ['w3', { x: 280, y: 180, w: 120, h: 280 }],
    ['w4', { x: 180, y: 420, w: 100, h: 80 }],
    ['w5', { x: 100, y: 260, w: 80, h: 80 }],
  ])
  const pts = routeHangToSpine(a, b, hangOnRight, placed, 'hang', 'spine', true)
  assert.equal(pts, null, 'exhausted clear search must not emit known-unsafe geometry')
})

test('mainlineInkInvalid: routeExhausted stub is invalid even when points look attached', async () => {
  const { mainlineInkInvalid } = await import('../src/renderers/procedure/flow/layout.js')
  const placed = new Map([
    ['a', { x: 0, y: 0, w: 40, h: 20 }],
    ['b', { x: 80, y: 0, w: 40, h: 20 }],
  ])
  const validLooking = {
    id: 'c:a->b',
    from: 'a',
    to: 'b',
    points: [
      [40, 10],
      [80, 10],
    ],
  }
  assert.equal(mainlineInkInvalid({ placed, connections: [{ ...validLooking, routeExhausted: true }] }), true)
  assert.equal(mainlineInkInvalid({ placed, connections: [{ ...validLooking }] }), false)
  assert.equal(mainlineInkInvalid({ placed, connections: [{ ...validLooking, points: [] }] }), true)
  assert.equal(mainlineInkInvalid(null), true)
})

test('routeExhausted survives straighten (stage→global assembly keeps the flag)', async () => {
  // straighten maps `{...c}` — the same preserve pattern stage assembly uses before
  // mainlineInkInvalid. Proves the flag is not stripped before the layout boundary.
  const { straighten } = await import('../src/renderers/procedure/flow/straighten.js')
  const placed = new Map([
    ['a', { x: 0, y: 0, w: 40, h: 20 }],
    ['b', { x: 0, y: 80, w: 40, h: 20 }],
  ])
  const out = straighten(
    [
      {
        id: 'c:a->b',
        from: 'a',
        to: 'b',
        kind: 'branch',
        points: [
          [20, 20],
          [20, 80],
        ],
        routeExhausted: true,
        label: null,
        labelAt: null,
        labelSize: null,
      },
    ],
    placed,
    [],
    true,
    new Set(),
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].routeExhausted, true, 'straighten must not drop routeExhausted')
})

test('layout boundary: routeExhausted triggers fallback; measured V/H attachment+clearance', async () => {
  const { mainlineInkInvalid } = await import('../src/renderers/procedure/flow/layout.js')
  const path = 'preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json'
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const expectedPairs = (spec.edges || []).map((e) => `${e.from}->${e.to}`).sort()
  const main = buildProcedureGraph(spec, fields, undefined, 'vertical')
  assert.equal(
    mainlineInkInvalid({
      placed: new Map(main.nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }])),
      connections: main.connections,
    }),
    false,
  )
  assert.equal(main.stats.layoutEngine, 'mainline')
  assert.ok(!main.hints.some((h) => /fell back to current/.test(h)))

  // Env probe stamps routeExhausted on assembled mainline ink, then mainlineInkInvalid
  // (not a direct branch bypass) selects current-engine fallback. Measure final graph.
  const { spawnSync } = await import('node:child_process')
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      process.env.ANTU_FORCE_MAINLINE_EXHAUSTION = '1'
      const { readFileSync } = await import('node:fs')
      const { buildProcedureGraph } = await import('./src/renderers/procedure/flow/layout.js')
      const { segHitsBox } = await import('./src/renderers/procedure/flow/hangSpineRoute.js')
      const path = ${JSON.stringify(path)}
      const spec = JSON.parse(readFileSync(path, 'utf8'))
      const expectedPairs = (spec.edges || []).map((e) => e.from + '->' + e.to).sort()
      function foreignHits(g) {
        const hits = []
        for (const c of g.connections) {
          for (let i = 0; i < c.points.length - 1; i++) {
            for (const n of g.nodes) {
              if (n.id === c.from || n.id === c.to) continue
              const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
              if (segHitsBox(c.points[i], c.points[i + 1], box)) hits.push(c.id + '@' + n.id)
            }
          }
        }
        return [...new Set(hits)]
      }
      function endpointGaps(g) {
        const byId = new Map(g.nodes.map((n) => [n.id, n]))
        const gaps = []
        const distBox = (n, p) => {
          const x = n.position.x, y = n.position.y, w = n.data.w, h = n.data.h
          const dx = p[0] < x ? x - p[0] : p[0] > x + w ? p[0] - (x + w) : 0
          const dy = p[1] < y ? y - p[1] : p[1] > y + h ? p[1] - (y + h) : 0
          return Math.hypot(dx, dy)
        }
        for (const c of g.connections) {
          if (!c.points?.length) continue
          const from = byId.get(c.from), to = byId.get(c.to)
          if (!from || !to) continue
          const d0 = distBox(from, c.points[0]), d1 = distBox(to, c.points[c.points.length - 1])
          if (d0 > 1.5 || d1 > 1.5) gaps.push(c.id + ':' + d0.toFixed(1) + '/' + d1.toFixed(1))
        }
        return gaps
      }
      const out = {}
      for (const orient of ['vertical', 'horizontal']) {
        const g = buildProcedureGraph(spec, { engine: 'mainline', stages: false }, undefined, orient)
        const pairs = g.connections.map((c) => c.from + '->' + c.to).sort()
        out[orient] = {
          layoutEngine: g.stats.layoutEngine,
          fellBack: g.hints.some((h) => /fell back to current/.test(h)),
          hint: g.hints.find((h) => /fell back to current/.test(h)) || null,
          pairsMatch: JSON.stringify(pairs) === JSON.stringify(expectedPairs),
          missingPairs: expectedPairs.filter((k) => !pairs.includes(k)),
          extraPairs: pairs.filter((k) => !expectedPairs.includes(k)),
          hits: foreignHits(g),
          gaps: endpointGaps(g),
          routeExhaustedLeft: g.connections.filter((c) => c.routeExhausted).map((c) => c.id),
        }
      }
      process.stdout.write(JSON.stringify(out))
      `,
    ],
    { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' },
  )
  assert.equal(probe.status, 0, probe.stderr || probe.stdout)
  const forced = JSON.parse(probe.stdout)
  for (const orient of ['vertical', 'horizontal']) {
    const r = forced[orient]
    assert.equal(r.fellBack, true, `${orient}: hint must surface fallback — not silent success`)
    assert.notEqual(r.layoutEngine, 'mainline', `${orient}: must not keep stamped-invalid mainline`)
    assert.equal(r.pairsMatch, true, `${orient}: fallback must keep every edge pair, not merely equal count`)
    assert.deepEqual(r.missingPairs, [], `${orient}: missing edge pairs`)
    assert.deepEqual(r.extraPairs, [], `${orient}: unexpected edge pairs`)
    // Measured post-return geometry (columns/ELK as emitted by buildProcedureGraph). Report
    // residuals explicitly — do not brand the legacy engine "hardsafe" without numbers.
    if (r.hits.length || r.gaps.length) {
      assert.fail(
        `${orient}: fallback residual (not claimed hardsafe) hits=${JSON.stringify(r.hits)} gaps=${JSON.stringify(r.gaps)}`,
      )
    }
    assert.deepEqual(r.routeExhaustedLeft, [], `${orient}: fallback engine must not carry mainline exhaustion stubs`)
  }
  // Pin expected pairs against the unforced mainline graph too (same spec edge set).
  assert.deepEqual(
    main.connections.map((c) => `${c.from}->${c.to}`).sort(),
    expectedPairs,
  )
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

test('adversarial: disconnected second start→end keeps primary graph complete', () => {
  // Valid supported form: two weakly-connected components (each start→end). Orphans are
  // schema-invalid and must not be “fixed” by dropping edges.
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'adv-disconnected',
    nodes: [
      { id: 'a', kind: 'start', label: 'A' },
      { id: 'b', kind: 'end', label: 'B' },
      { id: 's2', kind: 'start', label: 'S2' },
      { id: 'e2', kind: 'end', label: 'E2' },
    ],
    edges: [
      { from: 'a', to: 'b', main: true },
      { from: 's2', to: 'e2', main: true },
    ],
  }
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    assert.deepEqual(g.errors, [])
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const id of ['a', 'b', 's2', 'e2']) assert.ok(ids.has(id), `${dir} lost ${id}`)
    const pairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
    assert.ok(pairs.has('a->b') && pairs.has('s2->e2'), dir)
    assert.deepEqual(foreignHits(g), [])
    assert.deepEqual(endpointGaps(g), [])
  }
})

test('adversarial: multiple back-edges + nested-ish hangs — finite, complete, 0 hits', () => {
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'adv-multi-back',
    nodes: [
      { id: 's', kind: 'start', label: 'S' },
      { id: 'd1', kind: 'decision', label: 'D1' },
      { id: 'h1', kind: 'step', label: 'H1' },
      { id: 'h2', kind: 'step', label: 'H2' },
      { id: 'm', kind: 'step', label: 'M' },
      { id: 'd2', kind: 'decision', label: 'D2' },
      { id: 'h3', kind: 'step', label: 'H3' },
      { id: 'e', kind: 'end', label: 'E' },
    ],
    edges: [
      { from: 's', to: 'd1', main: true },
      { from: 'd1', to: 'h1', condition: '支' },
      { from: 'h1', to: 'h2' },
      { from: 'h2', to: 'm', condition: '回' },
      { from: 'd1', to: 'm', condition: '是', main: true },
      { from: 'm', to: 'd2', main: true },
      { from: 'd2', to: 'h3', condition: '支2' },
      { from: 'h3', to: 'm', condition: '回2' },
      { from: 'd2', to: 'e', condition: '是', main: true },
      { from: 'h2', to: 'd1', condition: '再' },
    ],
  }
  for (const dir of ['vertical', 'horizontal']) {
    const t0 = Date.now()
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    const ms = Date.now() - t0
    assert.ok(ms < 5000, `${dir}: runtime budget exceeded ${ms}ms`)
    assert.deepEqual(g.errors, [])
    const pairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
    for (const e of spec.edges) assert.ok(pairs.has(`${e.from}->${e.to}`), `${dir} missing ${e.from}->${e.to}`)
    assert.deepEqual(foreignHits(g), [], `${dir} hits`)
    assert.deepEqual(endpointGaps(g), [], `${dir} gaps`)
  }
})

test('adversarial: huge + tiny labels — chips placed, ink complete', () => {
  const huge = '超长标签'.repeat(24)
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'adv-labels',
    nodes: [
      { id: 's', kind: 'start', label: 'S' },
      { id: 'd', kind: 'decision', label: 'D' },
      { id: 'h', kind: 'step', label: 'H' },
      { id: 'e', kind: 'end', label: 'E' },
    ],
    edges: [
      { from: 's', to: 'd', main: true },
      { from: 'd', to: 'h', condition: huge },
      { from: 'h', to: 'e' },
      { from: 'd', to: 'e', condition: '是', main: true },
    ],
  }
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    assert.deepEqual(g.errors, [])
    assert.deepEqual(missingLabels(g), [])
    assert.deepEqual(foreignHits(g), [])
    assert.deepEqual(endpointGaps(g), [])
    const pairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
    for (const e of spec.edges) assert.ok(pairs.has(`${e.from}->${e.to}`))
  }
})

test('adversarial: port crowding at decision — trunk faces kept; graph complete V/H', () => {
  // Four leaves from one decision: main + three branches (crowding beyond E/W).
  const spec = {
    type: 'procedure',
    specVersion: 1,
    title: 'adv-port-crowd',
    nodes: [
      { id: 's', kind: 'start', label: 'S' },
      { id: 'd', kind: 'decision', label: 'D' },
      { id: 'a', kind: 'end', label: 'A' },
      { id: 'b', kind: 'end', label: 'B' },
      { id: 'c', kind: 'end', label: 'C' },
      { id: 'e', kind: 'end', label: 'E' },
    ],
    edges: [
      { from: 's', to: 'd', main: true },
      { from: 'd', to: 'e', condition: '主', main: true },
      { from: 'd', to: 'a', condition: '1' },
      { from: 'd', to: 'b', condition: '2' },
      { from: 'd', to: 'c', condition: '3' },
    ],
  }
  for (const dir of ['vertical', 'horizontal']) {
    const g = buildProcedureGraph(spec, fields, undefined, dir)
    assert.deepEqual(g.errors, [])
    const pairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
    for (const e of spec.edges) assert.ok(pairs.has(`${e.from}->${e.to}`), `${dir} lost ${e.from}->${e.to}`)
    assert.deepEqual(foreignHits(g), [], dir)
    assert.deepEqual(endpointGaps(g), [], dir)
    const mainLeave = g.connections.filter((c) => c.from === 'd' && c.kind === 'main')
    assert.equal(mainLeave.length, 1, `${dir}: trunk leave stolen or duplicated`)
  }
})

test('adversarial: unrelated insertion — prior spine + pairs preserved (packing may shift)', () => {
  // Input-order permutation of the *same* component is pixel-stable (tests above). A second
  // valid start→end component is supported and must not lose prior edges / spine membership;
  // whole-frame packing may still shift — residual under issue 190, not greenwashed here.
  const base = JSON.parse(
    readFileSync('preview/synthetic-rejoin/fixtures/L2-labour-arbitration-nested.zh-CN.json', 'utf8'),
  )
  const g0 = buildProcedureGraph(base, fields, undefined, 'vertical')
  const inserted = {
    ...base,
    nodes: [
      ...base.nodes,
      { id: 'zz-s', kind: 'start', label: '无关起' },
      { id: 'zz-e', kind: 'end', label: '无关终' },
    ],
    edges: [...base.edges, { from: 'zz-s', to: 'zz-e', main: true }],
  }
  const g1 = buildProcedureGraph(inserted, fields, undefined, 'vertical')
  assert.deepEqual(g0.errors, [])
  assert.deepEqual(g1.errors, [])
  assert.deepEqual(
    g1.spine.filter((id) => !String(id).startsWith('zz-')),
    g0.spine,
  )
  const priorPairs = new Set(g0.connections.map((c) => `${c.from}->${c.to}`))
  const nextPairs = new Set(g1.connections.map((c) => `${c.from}->${c.to}`))
  for (const p of priorPairs) assert.ok(nextPairs.has(p), `lost prior pair ${p}`)
  assert.ok(nextPairs.has('zz-s->zz-e'))
  assert.deepEqual(foreignHits(g1), [])
  assert.deepEqual(endpointGaps(g1), [])
})

test('adversarial: runtime budget + determinism on L4', () => {
  const path = 'preview/synthetic-rejoin/fixtures/L4-enforcement-objection-nested.zh-CN.json'
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const run = () => {
    const t0 = Date.now()
    const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
    return {
      ms: Date.now() - t0,
      dig: JSON.stringify({
        spine: g.spine,
        nodes: g.nodes.map((n) => [n.id, Math.round(n.position.x), Math.round(n.position.y)]),
        edges: g.connections.map((c) => [c.id, c.points]),
      }),
    }
  }
  const a = run()
  const b = run()
  assert.ok(a.ms < 5000, `L4 runtime ${a.ms}ms`)
  assert.ok(b.ms < 5000, `L4 runtime2 ${b.ms}ms`)
  assert.equal(a.dig, b.dig, 'non-deterministic layout')
})
