// H1: diamond hang→spine must not legalize a blocked inward gutter (issue 190 / PR #359).
// Tests the PRODUCTION helpers in hangSpineRoute.js (same module mainline.js imports).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildProcedureGraph } from '../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'
import {
  routeHangToSpine,
  gutterBlocked,
  interLaneCorridor,
  gutterRejoin,
  diamondOuterSide,
  pathClear,
  segHitsBox,
  OUTER_GAP,
} from '../src/renderers/procedure/flow/hangSpineRoute.js'

const fields = { engine: 'mainline', stages: false }

/**
 * Gutter blocked + interLane null (near-flush vertical wall below leave row kills short mid),
 * while diamondOuterSide escalates past the wall — production both-blocked branch.
 */
function bothChannelsBlockedPlaced(hangOnRight = true) {
  const a = { x: 200, y: 100, w: 80, h: 80 } // diamond hang
  const b = { x: 40, y: 260, w: 100, h: 40 } // spine
  const gutterBlock = { x: 120, y: 160, w: 60, h: 80 }
  const hangOuter = hangOnRight ? a.x + a.w : a.x
  // Vertical wall below leave row: gap from hang < 8 → interLane null; leave stub at acy clear;
  // short OUTER_GAP vertical hits wall; deeper diamondOuterSide clears.
  const vertWall = hangOnRight
    ? { x: hangOuter + 4, y: 185, w: OUTER_GAP + 24, h: 90 }
    : { x: hangOuter - (OUTER_GAP + 24) - 4, y: 185, w: OUTER_GAP + 24, h: 90 }
  const placed = new Map([
    ['hang', a],
    ['spine', b],
    ['gutter', gutterBlock],
    ['vertWall', vertWall],
  ])
  return { a, b, gutterBlock, placed, hangOnRight }
}

test('segHitsBox audit: known hit / no-hit / edge-touch', () => {
  const box = { x: 10, y: 10, w: 20, h: 20 }
  assert.equal(segHitsBox([0, 20], [40, 20], box), true, 'horizontal through interior')
  assert.equal(segHitsBox([20, 0], [20, 40], box), true, 'vertical through interior')
  assert.equal(segHitsBox([0, 5], [40, 5], box), false, 'above box')
  assert.equal(segHitsBox([0, 10], [40, 10], box, 0.5), false, 'edge touch only (pad)')
  assert.equal(segHitsBox([50, 0], [50, 40], box), false, 'beside box')
})

test('segRunsOnBoxEdge / pathClear: foreign rim ride is not clear', async () => {
  const { segRunsOnBoxEdge, pathClear } = await import('../src/renderers/procedure/flow/hangSpineRoute.js')
  const box = { x: 10, y: 10, w: 20, h: 20 }
  assert.equal(segRunsOnBoxEdge([0, 10], [40, 10], box), true, 'top edge run')
  assert.equal(segRunsOnBoxEdge([0, 30], [40, 30], box), true, 'bottom edge run')
  assert.equal(segRunsOnBoxEdge([10, 0], [10, 40], box), true, 'left edge run')
  assert.equal(segRunsOnBoxEdge([0, 5], [40, 5], box), false, 'parallel above, not on rim')
  assert.equal(segRunsOnBoxEdge([0, 10], [5, 10], box), false, 'no span overlap with box')
  const placed = new Map([
    ['from', { x: 50, y: 0, w: 10, h: 10 }],
    ['to', { x: 0, y: 0, w: 10, h: 10 }],
    ['foreign', box],
  ])
  // Riding foreign top is blocked even though interior segHitsBox is false.
  assert.equal(pathClear([[0, 10], [40, 10]], placed, 'from', 'to'), false)
  assert.equal(pathClear([[0, 5], [40, 5]], placed, 'from', 'to'), true)
})

test('H1 production: both-blocked fromDiamond never returns blocked gutter path', () => {
  for (const hangOnRight of [true, false]) {
    const { a, b, gutterBlock, placed } = bothChannelsBlockedPlaced(hangOnRight)
    assert.equal(gutterBlocked(a, b, hangOnRight, placed, 'hang', 'spine'), true, `gutterBlocked ${hangOnRight}`)
    assert.equal(interLaneCorridor(a, b, hangOnRight, placed, 'hang', 'spine'), null, `interLane null ${hangOnRight}`)
    // Historical defect shape (pre-fix last resort): forced gutter while blocked.
    const legacyForced = gutterRejoin(a, b, hangOnRight)
    assert.equal(pathClear(legacyForced, placed, 'hang', 'spine'), false, `legacy gutter hits (${hangOnRight})`)
    // Production path (same module mainline imports):
    const pts = routeHangToSpine(a, b, hangOnRight, placed, 'hang', 'spine', true)
    assert.ok(pts?.length >= 2)
    assert.notDeepEqual(pts, legacyForced)
    assert.equal(pathClear(pts, placed, 'hang', 'spine'), true, `production path clear (${hangOnRight})`)
    for (let i = 0; i < pts.length - 1; i += 1) {
      assert.equal(segHitsBox(pts[i], pts[i + 1], gutterBlock), false)
    }
    // Prefer E/W leave when diamondOuterSide succeeds
    const acy = a.y + a.h / 2
    const leaveX = pts[0][0]
    const sideLeave = Math.abs(pts[0][1] - acy) < 1 && (Math.abs(leaveX - a.x) < 1 || Math.abs(leaveX - (a.x + a.w)) < 1)
    assert.ok(sideLeave, `E/W leave expected when outer clears, got ${JSON.stringify(pts[0])}`)
  }
})

test('H1 production: diamondOuterSide validates every segment or returns null', () => {
  const a = { x: 200, y: 100, w: 80, h: 80 }
  const b = { x: 40, y: 260, w: 100, h: 40 }
  // Wall covering all reasonable outer channels on the right
  const wall = { x: 270, y: 90, w: 400, h: 220 }
  const placed = new Map([
    ['hang', a],
    ['spine', b],
    ['wall', wall],
  ])
  const cleared = diamondOuterSide(a, b, true, placed, 'hang', 'spine', 3)
  // With maxDepth 3 the wall still blocks; must not return an unchecked OUTER_GAP path
  if (cleared) {
    assert.equal(pathClear(cleared, placed, 'hang', 'spine'), true)
  } else {
    assert.equal(cleared, null)
  }
  // Unbounded search with placed=null would skip validation — engine always passes placed when routing.
  const blind = [
    [a.x + a.w, a.y + a.h / 2],
    [a.x + a.w + OUTER_GAP, a.y + a.h / 2],
    [a.x + a.w + OUTER_GAP, b.y + b.h / 2],
    [b.x + b.w, b.y + b.h / 2],
  ]
  assert.equal(pathClear(blind, placed, 'hang', 'spine'), false, 'blind OUTER_GAP hits wall')
})

test('H1 integration: S3 diamond rejoin leaves E/W and has 0 foreign box hits', () => {
  const spec = JSON.parse(readFileSync('preview/synthetic-rejoin/fixtures/S3-outer-gutter-blocked.zh-CN.json', 'utf8'))
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const rejoin = g.connections.find((e) => e.id === 'c:n-21->n-3')
  assert.ok(rejoin)
  const from = byId.get('n-21')
  const [x, y] = rejoin.points[0]
  const cx = from.position.x + from.data.w / 2
  const cy = from.position.y + from.data.h / 2
  const leaveW = Math.abs(x - from.position.x) < 1.5 && Math.abs(y - cy) < 2
  const leaveE = Math.abs(x - (from.position.x + from.data.w)) < 1.5 && Math.abs(y - cy) < 2
  assert.ok(leaveW || leaveE, `diamond leave E/W, got (${x},${y}) vs box`)
  assert.ok(!(Math.abs(y - from.position.y) < 1.5 && Math.abs(x - cx) < 2), 'must not leave N')
  assert.ok(!(Math.abs(y - (from.position.y + from.data.h)) < 1.5 && Math.abs(x - cx) < 2), 'must not leave S')
  const hits = []
  for (let i = 0; i < rejoin.points.length - 1; i += 1) {
    for (const n of g.nodes) {
      if (n.id === 'n-21' || n.id === 'n-3') continue
      const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
      if (segHitsBox(rejoin.points[i], rejoin.points[i + 1], box)) hits.push(n.id)
    }
  }
  assert.deepEqual(hits, [])
  assert.ok(bendsOf(rejoin.points) <= 2)
})

test('NOTE: H1-diamond fixture is topology probe, not a failing-before gate', () => {
  // Documented: this JSON did not reproduce baseline box hits under de0ec80.
  // Keep it as a smoke probe only — do not treat green here as H1 regression proof.
  const spec = JSON.parse(
    readFileSync('preview/synthetic-rejoin/fixtures/H1-diamond-both-channels-blocked.zh-CN.json', 'utf8'),
  )
  const g = buildProcedureGraph(spec, fields, undefined, 'vertical')
  assert.deepEqual(g.errors, [])
})
