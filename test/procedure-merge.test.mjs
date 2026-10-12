// Links into one node that join into one trunk (src/renderers/procedure/flow/merge.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { joinsAsTrunk, ownPart } from '../src/renderers/procedure/flow/merge.js'

// The trunk: from the left, up a channel at x=100, along the top at y=20, down into the node's top at (300, 40)
const trunk = [
  [40, 200],
  [100, 200],
  [100, 20],
  [300, 20],
  [300, 40],
]

test('a line that runs into another one and stays on it to the node joins it', () => {
  const pts = [
    [40, 400],
    [100, 400],
    [100, 20],
    [300, 20],
    [300, 40],
  ]
  assert.equal(joinsAsTrunk(pts, trunk), true)
  // Its own part, where its label goes, ends where it meets the trunk
  assert.deepEqual(ownPart(pts, [trunk]), [
    [40, 400],
    [100, 400],
    [100, 200],
  ])
})

test('a line that runs along another for a while and leaves it does not join it', () => {
  const pts = [
    [40, 400],
    [100, 400],
    [100, 20],
    [250, 20],
    [250, 40],
  ]
  assert.equal(joinsAsTrunk(pts, trunk), false)
})

test('a line that goes into another point of the node and only touches the trunk does not join it', () => {
  const pts = [
    [100, 400],
    [100, 300],
    [280, 300],
    [280, 40],
  ]
  // It crosses nothing and shares nothing: two lines of their own, which is fine
  assert.equal(joinsAsTrunk(pts, trunk), true)
  assert.deepEqual(ownPart(pts, [trunk]), pts)
})

test('a line that crosses the trunk before it joins it does not join it', () => {
  const pts = [
    [60, 100],
    [160, 100],
    [160, 0],
    [300, 0],
    [300, 40],
  ]
  // It crosses the top run of the trunk on its way up, and goes in where the trunk does after a run of its own
  assert.equal(joinsAsTrunk(pts, trunk), false)
})

test('a line one pixel off the trunk is not a join (it would read as a double line)', () => {
  const pts = [
    [40, 400],
    [101, 400],
    [101, 21],
    [300, 21],
    [300, 40],
  ]
  // Not on the trunk, and its last run lies beside it: it neither joins nor stands apart
  assert.equal(joinsAsTrunk(pts, trunk), false)
})
