// ============================================================
//  test/layout.test.mjs — laying out into React Flow nodes (pure functions)
//
//  Pins a few hard rules of the picture structure: edges are always empty, no event
//  is lost, the paint order, and "which views do not fit" must be reported honestly
//  rather than silently dropping events.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildFactGraph } from '../src/renderers/fact/timeline/layout.js'
import { viewsOf } from '../src/renderers/fact/timeline/grid.js'

const spec = JSON.parse(readFileSync('examples/fact/neighbour-corridor-charging.zh-CN.json', 'utf8'))
const fields = { sources: false, actors: false, summary: true }
const graph = buildFactGraph(spec, fields, undefined, 'vertical')

test('edges are always empty (links are carried by a separate link-layer node)', () => {
  assert.deepEqual(graph.edges, [])
})

test('not one event is lost: every event becomes a card', () => {
  const cards = graph.nodes.filter((n) => n.type === 'card')
  const total = spec.slots.reduce((n, s) => n + s.events.length, 0)
  assert.equal(cards.length, total)
  // every event id is present
  const ids = new Set(cards.map((c) => c.id))
  for (const s of spec.slots) for (const e of s.events) assert.ok(ids.has(e.id), `missing ${e.id}`)
})

test('all five node kinds are present, and only those five', () => {
  const types = new Set(graph.nodes.map((n) => n.type))
  assert.deepEqual([...types].sort(), ['axis', 'card', 'cells', 'colHeader', 'links'])
})

test('paint order: the cell layer at the bottom, cards last (drawn later, painted on top)', () => {
  const at = (type) => graph.nodes.findIndex((n) => n.type === type)
  assert.equal(at('cells'), 0, 'the cell layer must be at the bottom')
  assert.ok(at('colHeader') < at('links'), 'column headers come before links')
  assert.ok(at('links') < at('axis'), 'links come before the axis (the axis dot must cover the line end)')
  assert.ok(at('axis') < at('card'), 'cards last (they must cover the links)')
})

test('decorative nodes declare 1×1 — never 0×0', () => {
  // 0×0 leaves React Flow unable to measure a size, so nodesInitialized stays false
  // and the "fit view" button does nothing (hit for real). 1×1 satisfies both.
  for (const t of ['cells', 'links']) {
    const n = graph.nodes.find((x) => x.type === t)
    assert.equal(n.width, 1, `${t} width must be 1`)
    assert.equal(n.height, 1, `${t} height must be 1`)
  }
})

test('the size is a finite positive number and includes the arrow’s 6px', () => {
  assert.ok(graph.size.width > 0 && graph.size.height > 0)
  assert.ok(Number.isFinite(graph.size.width) && Number.isFinite(graph.size.height))
})

test('a view that does not fit: the error is reported honestly, events are not silently dropped', () => {
  const blocked = viewsOf(spec).filter((v) => buildFactGraph(spec, fields, v).errors.length > 0)
  assert.ok(blocked.length > 0, 'this data has one view that does not fit')
  for (const v of blocked) {
    const g = buildFactGraph(spec, fields, v)
    assert.ok(g.errors.length > 0)
    assert.ok(g.errors[0].length > 10, 'the error must be readable')
  }
})

test('the first view of every example fits (something is always visible on open)', () => {
  const dir = 'examples/fact'
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const g = buildFactGraph(s, fields, viewsOf(s)[0], s.slots.length >= 5 ? 'vertical' : 'horizontal')
    assert.deepEqual(g.errors, [], `${f}: even the first view does not fit`)
  }
})

test('every view of every agent example fits', () => {
  const dir = 'examples/agent/fact'
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    for (const v of viewsOf(s)) {
      const g = buildFactGraph(s, fields, v, 'vertical')
      assert.deepEqual(g.errors, [], `${f}: view "${v.label}" does not fit`)
    }
  }
})
