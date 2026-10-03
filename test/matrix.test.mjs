// ============================================================
//  test/matrix.test.mjs — the relationship matrix (issue #91): order, cells, sizes (pure functions)
//
//  What must hold:
//    1. every relation of every relationship example is in at least one cell (two when it has no direction)
//    2. the parties stand camp by camp in written order, the parties of no camp last, each once
//    3. cells and chips do not overlap and stay inside their cell and the content; a row is as tall as
//       the chips of its fullest cell
//    4. any valid JSON draws; the table for the clipboard has every party down and across
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { buildMatrixGraph, matrixCells, matrixOrder, matrixTable } from '../src/renderers/relationship/matrix/layout.js'
import { isDirected } from '../src/renderers/relationship/graph/rules.js'
import { relationshipKnowledge } from '../src/renderers/relationship/schema.js'
import { registerKnowledge, layoutKindsOf } from '../src/core/registry.js'
import { layoutReport, formatLayoutReport } from '../tools/lib/report.mjs'

const DIR = 'examples/relationship'
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
const load = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
const entity = (id, extra = {}) => ({ id, kind: 'person', label: `Party ${id}`, ...extra })
const rel = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, ...extra })
const spec = (entities, relations, extra = {}) => ({ type: 'relationship', specVersion: 1, title: 't', entities, relations, ...extra })

test('the matrix is a registered relationship kind, after the chain', () => {
  registerKnowledge('relationship', relationshipKnowledge)
  assert.deepEqual(layoutKindsOf('relationship').slice(0, 4), ['graph', 'focus', 'chain', 'matrix'])
})

for (const f of files) {
  test(`${f}: every relation in a cell, nothing overlaps`, () => {
    const s = load(f)
    const g = buildMatrixGraph(s, {})
    assert.deepEqual(g.errors, [])
    const { order } = matrixOrder(s)
    assert.deepEqual([...order.map((e) => e.id)].sort(), s.entities.map((e) => e.id).sort(), 'each party once')
    const cells = matrixCells(s, order)
    const seen = new Map()
    for (const rels of cells.values()) for (const r of rels) seen.set(r.id, (seen.get(r.id) ?? 0) + 1)
    for (const r of s.relations) assert.equal(seen.get(r.id), isDirected(r) && r.from !== r.to ? 1 : r.from === r.to ? 1 : 2, `${r.id}: in one cell, or two when it has no direction`)
    const layer = g.nodes[0].data
    const chips = layer.cells.flatMap((c) => c.chips.map((ch) => ({ ...ch, cell: c })))
    for (const ch of chips) {
      assert.ok(ch.x >= ch.cell.x && ch.y >= ch.cell.y && ch.x + ch.w <= ch.cell.x + ch.cell.w && ch.y + ch.h <= ch.cell.y + ch.cell.h, `${ch.id}: chip inside its cell`)
    }
    for (const c of layer.cells) {
      for (let i = 1; i < c.chips.length; i++) assert.ok(c.chips[i].y >= c.chips[i - 1].y + c.chips[i - 1].h, 'chips in a cell do not overlap')
      assert.ok(c.x + c.w <= g.size.width && c.y + c.h <= g.size.height, 'cell inside the content')
    }
    // Rows tile the grid: each starts where the one above ends
    for (let i = 1; i < layer.rowHeads.length; i++) assert.equal(layer.rowHeads[i].y, layer.rowHeads[i - 1].y + layer.rowHeads[i - 1].h)
  })
}

test('camps in written order, then the parties of no camp', () => {
  const s = spec(
    [entity('a', { groupId: 'g2' }), entity('b'), entity('c', { groupId: 'g1' }), entity('d', { groupId: 'g2' })],
    [rel('r1', 'a', 'b', 'contract')],
    { groups: [{ id: 'g1', label: 'One' }, { id: 'g2', label: 'Two' }] },
  )
  const { order, bands } = matrixOrder(s, 'None')
  assert.deepEqual(order.map((e) => e.id), ['c', 'a', 'd', 'b'])
  assert.deepEqual(bands.map((b) => [b.label, b.from, b.to]), [['One', 0, 0], ['Two', 1, 2], ['None', 3, 3]])
})

test('a relation with no direction stands in both cells of its pair; a directed one in one', () => {
  const s = spec([entity('a'), entity('b')], [rel('r1', 'a', 'b', 'contract'), rel('r2', 'a', 'b', 'debt')])
  const cells = matrixCells(s, s.entities)
  assert.deepEqual(cells.get('0|1').map((r) => r.id), ['r1', 'r2'], 'both in row a, column b')
  assert.deepEqual(cells.get('1|0').map((r) => r.id), ['r1'], 'only the contract is mirrored')
  const g = buildMatrixGraph(s, {})
  assert.equal(g.stacked, 1, 'one cell holds two')
  const stacked = g.nodes[0].data.cells.find((c) => c.row === 'a' && c.col === 'b')
  assert.equal(stacked.chips.length, 2)
  assert.ok(stacked.h >= stacked.chips.reduce((n, ch) => n + ch.h, 0), 'the row is as tall as its fullest cell')
})

test('the table for the clipboard has every party down and across', () => {
  const s = load('sample-group-guarantee.en.json')
  const t = matrixTable(s)
  assert.equal(t.headers.length, s.entities.length + 1)
  assert.equal(t.rows.length, s.entities.length)
  assert.ok(t.rows.every((r) => r.length === s.entities.length + 1))
  assert.ok(t.rows.flat().some((c) => c.includes('Holds 70%')))
})

test('the report says how full the table is, by kind', () => {
  const s = load('sample-group-guarantee.en.json')
  const r = layoutReport(s, { kind: 'matrix' })
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'matrix')
  assert.match(formatLayoutReport(r), /of 56 possible pairs/)
})
