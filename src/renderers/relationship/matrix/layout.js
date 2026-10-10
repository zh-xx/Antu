// ============================================================
//  src/renderers/relationship/matrix/layout.js — the relation matrix (issue #91): parties × parties
//
//  The fifth way of drawing a relationship diagram, from the same JSON as the graph. The graph shows
//  how parties are tied together; the matrix answers "is there any relation between A and B, and what
//  kind?" and shows at a glance which pairs have none. A cell reads from the row's party to the column's
//  party. A relation with no direction (a contract, a marriage) stands in both
//  cells of its pair. Several relations between one pair stack in one cell.
//
//  Rows and columns follow the camps (`groups`, in written order), the parties of no camp last, each
//  camp in a ruled cell of its own, in the head row and the head column. It is drawn as a table: ruled
//  cells, square corners, the text of every relation in full (the row grows with it, nothing is cut). Every relation lands in at least one cell (two when undirected), so
//  nothing is dropped, and any valid JSON draws.
//
//  The whole picture is one decoration layer (1×1 to React Flow, drawn at full size inside), because a
//  table has no boxes to move or link. Pure JS, so Node computes the same geometry for antu_layout and
//  the tests check every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { wrapLineCount } from '../../fact/cardGeometry.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
export const CELL_W = 136
export const MIN_CELL_H = 44
const HEAD_FONT = 13
const HEAD_LH = 18
const CHIP_FONT = 11.5
const CHIP_LH = 15
const CHIP_PAD_Y = 4
const CHIP_PAD_X = 8
const CHIP_GAP = 4
const CELL_PAD = 6
const BAND = 24
const ROWHEAD_W = 168
/** Node estimates widen Latin text a little (the page's real font is wider than the em table) */
const SCALE = { latin: 1.2, cjk: 1.06 }

/** A hyphenated word may break at the hyphen on the page, which the estimate does not know: leave a margin */
const lineCount = (text, width, font) => Math.max(1, wrapLineCount(text, (width * 0.86) / font, SCALE))

/**
 * The order of the parties and the bands they stand under: the camps in written order, then the
 * parties of no camp.
 * @returns { order: entity[], bands: [{ id, label, from, to }] }  from/to: index range in `order`
 */
export function matrixOrder(spec, ungroupedLabel = '') {
  const known = new Set((spec.groups ?? []).map((g) => g.id))
  const buckets = (spec.groups ?? []).map((g) => ({ id: g.id, label: g.label, members: spec.entities.filter((e) => e.groupId === g.id) }))
  const rest = spec.entities.filter((e) => !known.has(e.groupId))
  if (rest.length) buckets.push({ id: null, label: ungroupedLabel, members: rest })
  const order = []
  const bands = []
  for (const b of buckets) {
    if (!b.members.length) continue
    bands.push({ id: b.id, label: b.label, from: order.length, to: order.length + b.members.length - 1 })
    order.push(...b.members)
  }
  return { order, bands }
}

/** Which relations stand in which cell: Map "rowIndex|colIndex" -> relation[] (in written order) */
export function matrixCells(spec, order) {
  const at = new Map(order.map((e, i) => [e.id, i]))
  const cells = new Map()
  const put = (r, c, rel) => {
    const key = `${r}|${c}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(rel)
  }
  for (const rel of spec.relations) {
    const r = at.get(rel.from)
    const c = at.get(rel.to)
    put(r, c, rel)
    if (!isDirected(rel) && r !== c) put(c, r, rel)
  }
  return cells
}

export function buildMatrixGraph(spec, fields = {}) {
  const errors = validateRelationship(spec)
  const hints = hintsOfRelationship(spec)
  const empty = { errors, hints, nodes: [], edges: [], connections: [], size: { width: 0, height: 0 }, stats: { entities: 0, relations: 0, groups: 0, kinds: {} } }
  if (errors.length) return empty
  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const entities = spec.entities
  const relations = spec.relations
  if (entities.length > SCALE_HINT_ENTITIES) hints.push(tEn('rhint.tooLarge', { n: entities.length, limit: SCALE_HINT_ENTITIES }))
  const party = makePartyData(spec, t)
  const textIndex = new Map(relations.map((r, i) => [r.id, i]))
  const textOf = (r) => party.labelTexts[textIndex.get(r.id)]

  const { order, bands } = matrixOrder(spec, t('rel.matrix.ungrouped'))
  const cells = matrixCells(spec, order)
  const n = order.length
  const hasBands = Boolean(spec.groups?.length)
  const bandSize = hasBands ? BAND : 0

  // Column heads wrap inside the column; their tallest sets the head row
  const headLines = (label, w) => lineCount(label, w - 8, HEAD_FONT)
  const headH = Math.max(...order.map((e) => headLines(e.label, CELL_W))) * HEAD_LH + 12
  const rowHeadW = ROWHEAD_W

  // A cell's chips stack; the row is as tall as its tallest cell
  const chipsOf = (rels) =>
    rels.map((rel) => {
      const text = textOf(rel)
      const h = lineCount(text, CELL_W - CELL_PAD * 2 - CHIP_PAD_X * 2, CHIP_FONT) * CHIP_LH + CHIP_PAD_Y * 2
      return { rel, text, h }
    })
  const rowH = []
  for (let r = 0; r < n; r++) {
    let h = Math.max(MIN_CELL_H, Math.ceil(headLines(order[r].label, rowHeadW) * HEAD_LH + 12))
    for (let c = 0; c < n; c++) {
      const rels = cells.get(`${r}|${c}`)
      if (!rels) continue
      const chips = chipsOf(rels)
      h = Math.max(h, chips.reduce((s, x) => s + x.h, 0) + CHIP_GAP * (chips.length - 1) + CELL_PAD * 2)
    }
    rowH.push(h)
  }

  const gridX = PAD + bandSize + rowHeadW
  const gridY = PAD + bandSize + headH
  const rowY = []
  let y = gridY
  for (let r = 0; r < n; r++) {
    rowY.push(y)
    y += rowH[r]
  }
  const width = gridX + n * CELL_W + PAD
  const height = Math.ceil(y + PAD)

  const layer = { width, height, // The empty cell where the head row and the head column meet (and the band row and column): ruled like the rest
    corner: { x: PAD, y: PAD, w: gridX - PAD, h: gridY - PAD }, bands: [], heads: [], rowHeads: [], cells: [], diagonal: [], chipsTotal: 0, filled: 0 }
  bands.forEach((b, bi) => {
    const x0 = gridX + b.from * CELL_W
    const w = (b.to - b.from + 1) * CELL_W
    const y0 = rowY[b.from]
    const h = rowY[b.to] + rowH[b.to] - y0
    layer.bands.push({ id: b.id, label: b.label, tone: bi % 2, top: { x: x0, y: PAD, w, h: BAND }, left: { x: PAD, y: y0, w: BAND, h } })
  })
  order.forEach((e, i) => {
    layer.heads.push({ id: e.id, text: e.label, x: gridX + i * CELL_W, y: PAD + bandSize, w: CELL_W, h: headH })
    layer.rowHeads.push({ id: e.id, text: e.label, x: PAD + bandSize, y: rowY[i], w: rowHeadW, h: rowH[i] })
    layer.diagonal.push({ x: gridX + i * CELL_W, y: rowY[i], w: CELL_W, h: rowH[i] })
  })
  for (const [key, rels] of cells) {
    const [r, c] = key.split('|').map(Number)
    const x = gridX + c * CELL_W
    const y0 = rowY[r]
    let cy = y0 + CELL_PAD
    const chips = chipsOf(rels).map((ch) => {
      const out = { id: ch.rel.id, kind: ch.rel.kind, text: ch.text, x: x + CELL_PAD, y: cy, w: CELL_W - CELL_PAD * 2, h: ch.h }
      cy += ch.h + CHIP_GAP
      return out
    })
    layer.chipsTotal += chips.length
    layer.filled += 1
    layer.cells.push({ row: order[r].id, col: order[c].id, x, y: y0, w: CELL_W, h: rowH[r], chips })
  }

  const nodes = [
    {
      id: '__matrix__',
      type: 'matrixLayer',
      position: { x: 0, y: 0 },
      // Decoration layer: 1×1 for React Flow, drawn at full size inside (see fact/timeline/nodes.js cellsNode)
      width: 1,
      height: 1,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      style: { pointerEvents: 'none' },
      data: layer,
    },
  ]

  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  const stacked = [...cells.values()].filter((rels) => rels.length > 1).length
  return {
    errors,
    hints,
    nodes,
    edges: [],
    connections: [],
    order: order.map((e) => e.id),
    filled: layer.filled,
    stacked,
    possible: n * (n - 1),
    size: { width: Math.ceil(width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
