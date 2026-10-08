// ============================================================
//  src/renderers/fact/timeline/nodes.js — build React Flow nodes from the computed numbers
//
//  metrics.js computes, this file builds. One short section per node type:
//    cell layer, column headings, axis, link layer, cards
//
//  Decoration nodes (cells, links) must declare width/height: 1, for the reason in the cellsNode
//  comment below: that one was a real pitfall, do not change it back to 0.
// ============================================================

import { SIDE } from './grid.js'
import { CARD_W } from '../cardGeometry.js'
import { DOT_SIZE, HEADER_W, groupIndexOf } from './metrics.js'

/** Attributes shared by decoration nodes: not draggable, not selectable, not connectable, not focusable */
const DECORATION = {
  draggable: false,
  selectable: false,
  connectable: false,
  focusable: false,
}

/**
 * Data for a card: party names and sources are resolved here, so the overlay can use them
 * directly without going back to the spec.
 */
export function cardData(event, grid, rowIndex) {
  const actorNames = (Array.isArray(event.actorIds) ? event.actorIds : []).map(
    (id) => grid.actorById.get(id)?.name || id,
  )
  const sources = (Array.isArray(event.sourceIds) ? event.sourceIds : [])
    .map((id) => grid.sourceById.get(id))
    .filter(Boolean)
  return { event, actorNames, sources, sourceCount: sources.length, row: rowIndex }
}

/**
 * The cell layer (bottom-most, hidden by default, controlled by a switch).
 * It only hands out the row and column counts and the cell size; how many cells to draw is the
 * component's business.
 */
export function cellsNode(m) {
  return {
    id: '__cells__',
    type: 'cells',
    position: { x: 0, y: 0 },
    // The decoration layer's size has to satisfy two rules that fight each other, so it can only
    // be 1×1:
    //   not declared → React Flow sets a "sizeless" node to visibility:hidden entirely, invisible
    //   declared 0×0 → it never gets measured, and if a single node has no measured value React
    //                  Flow judges nodesInitialized false, so the fitView queue path never
    //                  settles (symptom: the "fit view" button on the canvas does nothing)
    // 1×1 satisfies both: the node has a size so it is visible and measurable; how big it really
    // draws is decided by the SVG inside.
    width: 1,
    height: 1,
    style: { pointerEvents: 'none' },
    data: {
      cols: m.colCount,
      rows: m.rowCount,
      cellW: m.cellBoxW,
      cellH: m.cellBoxH,
      originX: m.originX,
      originY: m.originY,
      isH: m.isH,
    },
    ...DECORATION,
  }
}

/**
 * Column headings: a row above the grid when vertical, a column on the left when horizontal.
 *
 * A side with one column has one heading, the side's title. A side with several columns (several
 * parties) names the side **once** and each column by its party: vertical, the side title spans the
 * side's columns and the party names stand under it, one per column; horizontal, the side title is
 * on the first lane of the side and every lane carries its party's name. (Writing the side title on
 * every column made a side of two parties read as two columns of the same name.)
 */
export function headerNodes(grid, m) {
  const countOf = (side) => grid.columns.filter((c) => c.side === side).length
  const firstOf = (side) => grid.columns.findIndex((c) => c.side === side)
  const nodes = []
  grid.columns.forEach((col, ci) => {
    const n = countOf(col.side)
    const many = col.side !== SIDE.AXIS && n > 1
    const first = ci === firstOf(col.side)
    const base = { type: 'colHeader', ...DECORATION }
    const common = { isH: m.isH, side: col.side, groupIndex: groupIndexOf(col.side) }
    if (!many) {
      nodes.push({
        ...base,
        id: `__head__${col.key}`,
        position: m.isH ? { x: 0, y: ci * m.laneExtent } : { x: ci * m.laneExtent, y: 0 },
        data: { ...common, width: m.isH ? HEADER_W : m.laneExtent, height: m.isH ? m.laneExtent : null, sideTitle: grid.sideLabels[col.side], colTitle: null },
      })
      return
    }
    if (m.isH) {
      nodes.push({
        ...base,
        id: `__head__${col.key}`,
        position: { x: 0, y: ci * m.laneExtent },
        data: { ...common, width: HEADER_W, height: m.laneExtent, sideTitle: first ? grid.sideLabels[col.side] : null, colTitle: col.actorName },
      })
      return
    }
    // Vertical: one node for the whole side, written at its first column
    if (!first) return
    const cols = grid.columns.slice(ci, ci + n)
    nodes.push({
      ...base,
      id: `__head__${col.key}`,
      position: { x: ci * m.laneExtent, y: 0 },
      data: { ...common, width: n * m.laneExtent, height: null, sideTitle: grid.sideLabels[col.side], colTitle: null, actors: cols.map((c) => c.actorName), laneW: m.laneExtent },
    })
  })
  return nodes
}

/**
 * The axis (including the axis dot of every slot).
 * Position: hugging the centre line of the axis-dot column and running down from the header area
 * when vertical, and the other way round when horizontal.
 */
export function axisNode(grid, m) {
  // Axis dots are laid along the time axis; the position is an offset from the node's origin (top when vertical, left when horizontal)
  const dotOffsets = grid.rows.map(
    (r) => m.rowTops[r.index] * m.slotExtent + m.slotExtent / 2 - DOT_SIZE / 2,
  )
  return {
    id: '__axis__',
    type: 'axis',
    position: m.isH
      ? { x: m.originX, y: m.axisCenter - 1 }
      : { x: m.axisCenter - 1, y: m.originY },
    data: { isH: m.isH, length: m.timeSpan, dotSize: DOT_SIZE, dotOffsets },
    ...DECORATION,
  }
}

/** The link layer. One node for the whole layer, placed before the cards, so cards always cover the lines. */
export function linksNode(segments, isH) {
  return {
    id: '__links__',
    type: 'links',
    position: { x: 0, y: 0 },
    // Same as the cell layer: for why 1×1, see the comment in cellsNode
    width: 1,
    height: 1,
    style: { pointerEvents: 'none' },
    data: { segments, isH },
    ...DECORATION,
  }
}

/**
 * One card, and the link from it to its axis dot (no link when the card is in the axis lane itself).
 *
 * The link: from the edge of the card facing the axis to the axis dot. It runs as a horizontal
 * line on the left/right of the card when vertical, and as a vertical line above/below it when
 * horizontal.
 */
export function placeCard(event, colIndex, rowIndex, grid, m, fields) {
  const cell = m.cellAt(rowIndex, colIndex)
  const cardX = cell.x + (m.cellBoxW - CARD_W) / 2
  const cardY = cell.y + (m.cellBoxH - m.cardH) / 2

  let link = null
  if (m.isH) {
    const cx = cardX + CARD_W / 2
    if (colIndex < grid.axisColumnIndex) {
      const from = cardY + m.cardH
      link = { left: cx, top: from, height: m.axisCenter - from }
    } else if (colIndex > grid.axisColumnIndex) {
      link = { left: cx, top: m.axisCenter, height: cardY - m.axisCenter }
    }
  } else {
    const cy = cardY + m.cardH / 2
    if (colIndex < grid.axisColumnIndex) {
      const from = cardX + CARD_W
      link = { left: from, top: cy, width: m.axisCenter - from }
    } else if (colIndex > grid.axisColumnIndex) {
      link = { left: m.axisCenter, top: cy, width: cardX - m.axisCenter }
    }
  }

  const node = {
    id: event.id,
    type: 'card',
    position: { x: cardX, y: cardY },
    data: {
      ...cardData(event, grid, rowIndex),
      groupIndex: groupIndexOf(grid.columns[colIndex].side),
      // The single source of size: the styles no longer write width and height
      cardW: CARD_W,
      cardH: m.cardH,
      labelLines: m.labelLines,
      fields,
      isH: m.isH,
    },
  }
  return { node, link }
}
