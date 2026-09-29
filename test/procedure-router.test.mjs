// Unit tests for flow/router.js: the orthogonal router for links ELK does not route
// (between stage columns, and inside a stage when a link has to give way).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeLink, runsAlongBorder, edgesOf } from '../src/renderers/procedure/flow/router.js'
import { bendsOf } from '../src/renderers/procedure/flow/straighten.js'

const A = { x: 0, y: 0, w: 100, h: 40 }
const B = { x: 0, y: 200, w: 100, h: 40 }
const C = { x: 220, y: 0, w: 100, h: 40 }
const X = { x: 0, y: 90, w: 100, h: 40 }

test('straight when nothing is in the way, from the middle of a side', () => {
  const pts = routeLink({ from: A, to: B, nodes: [A, B] })
  assert.deepEqual(pts, [
    [50, 40],
    [50, 200],
  ])
})

test('round a node in the way, never through it', () => {
  const pts = routeLink({ from: A, to: B, nodes: [A, B, X] })
  assert.ok(pts && bendsOf(pts) <= 3)
  const through = pts.slice(1).some((q, i) => {
    const p = pts[i]
    return Math.max(p[0], q[0]) > X.x && Math.min(p[0], q[0]) < X.x + X.w && Math.max(p[1], q[1]) > X.y && Math.min(p[1], q[1]) < X.y + X.h
  })
  assert.ok(!through, 'the route runs through the node in the way')
})

test('into the next column: out of the side, through the middle of the gap', () => {
  const pts = routeLink({ from: B, to: C, nodes: [A, B, C] })
  assert.equal(bendsOf(pts), 2)
  // the vertical run sits in the middle of the gap between the columns, not against either
  const run = pts.find((p, i) => i > 0 && p[0] === pts[i - 1][0])
  assert.ok(run[0] > 100 + 20 && run[0] < 220 - 20, `the run hugs a side at x=${run[0]}`)
})

test('a route never runs along a box edge, and never leaves its bounds', () => {
  const box = { x: -20, y: -30, w: 140, h: 290 }
  const borders = edgesOf(box)
  const pts = routeLink({ from: A, to: B, nodes: [A, B, X], borders, bounds: box })
  assert.ok(pts, 'there is room inside the box')
  for (let i = 1; i < pts.length; i += 1) {
    assert.ok(!runsAlongBorder(...pts[i - 1], ...pts[i], borders), 'a segment runs along the box edge')
  }
  for (const [x, y] of pts) assert.ok(x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
})

test('a port another link uses is taken', () => {
  const first = routeLink({ from: A, to: B, nodes: [A, B] })
  const second = routeLink({ from: A, to: B, nodes: [A, B], routes: [{ points: first }] })
  assert.ok(second)
  assert.notDeepEqual(second[0], first[0], 'two links leave from one point')
})
