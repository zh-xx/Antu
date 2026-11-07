// Whole-graph obstacle clearance for Mainline stages-off (PR #359 / issue 190).
// These gates fail on de0ec80 baseline for L3/L4/07; they call production layout only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProcedureGraph } from '../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import {
  segHitsBox,
  pathClear,
  clearSideHorizontal,
  sideHorizontal,
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
    test(`mainline clear: ${path.split('/').pop()} ${dir} — 0 foreign box hits`, () => {
      const r = scanFile(path, dir)
      assert.deepEqual(r.errors, [])
      assert.deepEqual(r.missingNodes, [])
      assert.deepEqual(r.missingEdges, [])
      assert.deepEqual(r.spineBends, [])
      assert.deepEqual(r.hits, [])
    })
  }
}

test('mainline clear: S3 hard gates (straight spine, 0 hits, diamond leaves E/W)', () => {
  const path = 'preview/synthetic-rejoin/fixtures/S3-outer-gutter-blocked.zh-CN.json'
  const r = scanFile(path, 'vertical')
  assert.deepEqual(r.hits, [])
  assert.deepEqual(r.spineBends, [])
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

test('mainline: input-order stability (canonical ids, translation normalized)', () => {
  const path = 'preview/synthetic-rejoin/fixtures/L2-labour-arbitration-nested.zh-CN.json'
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const layout = (s) => {
    const g = buildProcedureGraph(s, fields, undefined, 'vertical')
    const minx = Math.min(...g.nodes.map((n) => n.position.x))
    const miny = Math.min(...g.nodes.map((n) => n.position.y))
    return Object.fromEntries(
      g.nodes.map((n) => [n.id, { x: Math.round(n.position.x - minx), y: Math.round(n.position.y - miny) }]),
    )
  }
  const a = layout(spec)
  const rev = { ...spec, edges: [...spec.edges].reverse(), nodes: [...spec.nodes].reverse() }
  const b = layout(rev)
  for (const id of Object.keys(a)) {
    assert.deepEqual(b[id], a[id], `node ${id} moved under input reorder`)
  }
})
