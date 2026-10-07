// A link between two boxes of different sizes, whose middles differ by a few px, runs straight, steps sideways by a
// few px and runs on; it is drawn as one straight line instead (src/core/links.js, issue 142).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { straightenJog, JOG_MAX } from '../src/core/links.js'
import { buildJustificationGraph } from '../src/renderers/justification/tree/layout.js'
import { buildRelationshipGraph } from '../src/renderers/relationship/graph/layout.js'

const box = (x, y, w, h) => ({ x, y, w, h })

test('between two layers: down, a short step sideways, down becomes one vertical line at the mean', () => {
  const out = straightenJog([[100, 0], [100, 50], [103, 50], [103, 90]], box(40, -20, 120, 20), box(50, 90, 100, 40))
  assert.deepEqual(out, [[101.5, 0], [101.5, 90]])
})

test('within one layer: along, a short step up or down, along becomes one horizontal line at the mean', () => {
  const out = straightenJog([[368, 436.5], [320, 436.5], [320, 439], [290, 439]], box(368, 410, 100, 53), box(190, 403, 100, 72))
  assert.deepEqual(out, [[368, 437.75], [290, 437.75]])
})

test('a step of JOG_MAX or more is a turn and stays', () => {
  const pts = [[100, 0], [100, 50], [100 + JOG_MAX, 50], [100 + JOG_MAX, 90]]
  assert.deepEqual(straightenJog(pts, box(40, -20, 200, 20), box(40, 90, 200, 40)), pts)
})

test('a line that would leave a node (or its round corner) is not drawn: the link stays as it is', () => {
  const pts = [[100, 0], [100, 50], [108, 50], [108, 90]]
  assert.deepEqual(straightenJog(pts, box(98, -20, 20, 20), box(60, 90, 100, 40)), pts, 'the line (x 104) is 6 px from the first node\'s edge, closer than the round corner allows')
})

test('other routes are left alone: more or fewer points, a link that is already straight, a turn', () => {
  const three = [[0, 0], [0, 50], [50, 50]]
  const two = [[0, 0], [0, 50]]
  const five = [[0, 0], [0, 10], [4, 10], [4, 30], [8, 30]]
  const a = box(-50, -50, 100, 50)
  const b = box(-50, 50, 100, 50)
  for (const pts of [three, two, five]) assert.deepEqual(straightenJog(pts, a, b), pts)
  assert.deepEqual(straightenJog([[0, 0], [0, 50], [3, 50], [3, 90]], undefined, b), [[0, 0], [0, 50], [3, 50], [3, 90]])
})

// the Z shape between two nodes: a short middle leg between two long ones
const isJog = (p) => {
  if (p.length !== 4) return false
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
  return len(p[1], p[2]) > 0 && len(p[1], p[2]) < JOG_MAX && len(p[0], p[1]) > JOG_MAX && len(p[2], p[3]) > JOG_MAX
}

test('no justification or relationship example draws a link that steps sideways by a few px', () => {
  for (const [dir, build] of [['examples/justification', buildJustificationGraph], ['examples/relationship', buildRelationshipGraph]]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.zh-CN.json'))) {
      const spec = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
      for (const orientation of ['horizontal', 'vertical']) {
        const g = build(spec, {}, undefined, orientation)
        for (const c of g.connections) assert.ok(!isJog(c.points), `${dir}/${f} ${orientation}: ${c.from} -> ${c.to} ${JSON.stringify(c.points)}`)
      }
    }
  }
})
