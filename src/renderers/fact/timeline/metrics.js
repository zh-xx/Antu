// ============================================================
//  src/renderers/fact/timeline/metrics.js — every number that is "computed"
//
//  Computation only, no nodes. Three things:
//    1. size constants (how wide a cell is, how much margin, how big the header area is)
//    2. estimating line counts (how many lines the title, how many the party tags)
//    3. direction-neutral coordinate mapping (where a cell is, where the axis is, how big the diagram is)
//
//  The point of the third: these numbers do not themselves change with direction, they are merely
//  **hung on different axes**. When vertical, time runs along the vertical axis, when horizontal
//  along the horizontal. So the mapping is written once and isH decides how to hang it, instead of
//  two copies.
// ============================================================

import { SIDE } from './grid.js'
import {
  ACTOR_FONT,
  ACTOR_TAG_GAP,
  ACTOR_TAG_PAD,
  CARD_INNER_W,
  LABEL_LINE_EM,
  textEm,
  textWidth,
  MAX_LABEL_LINES,
  cardHeightOf,
} from '../cardGeometry.js'

/** Cell width and margin */
export const CELL_W = 316

/** Margin between card and cell (used vertically too) */
export const CELL_GAP = 28

/** Header area: when vertical, height is reserved at the top; when horizontal, width on the left.
 *  More is reserved horizontally than vertically, because the heading text has to fit within one
 *  column (the corridor-charging case's "joint or objective course" needs about 126px). */
export const HEADER_H = 96
export const HEADER_W = 150

/** Axis dot diameter */
export const DOT_SIZE = 10

/**
 * How far the arrow at the end of the axis reaches beyond the axis line (see AxisLineNode:
 * below the axis when vertical, to the right of it when horizontal).
 *
 * **It must be counted into the content size**, otherwise the exported image crops the arrow
 * out: the content stops at the axis line, the arrow sits 6px beyond it, outside the capture
 * range. Measured once: the axis in the exported image was bare.
 */
export const ARROW_EXTENT = 6

/** Side → colour index (corresponding to g0 / g1 / g2 in the CSS) */
export function groupIndexOf(side) {
  if (side === SIDE.SIDE1) return 0
  if (side === SIDE.SIDE2) return 1
  return 2
}

/**
 * How many lines the titles actually need diagram-wide (the maximum, because every card in one
 * diagram must be the same height). Estimated by **drawn width** (see textWidth in
 * cardGeometry.js): character widths differ, so counting characters under-estimates an English
 * title and truncates it. The estimate is capped at TITLE_LINES.
 */
export function labelLinesOf(grid) {
  let max = 1
  for (const row of grid.rows) {
    row.cells.forEach((event) => {
      const em = textEm(event.label || '')
      max = Math.max(max, Math.min(MAX_LABEL_LINES, Math.ceil(em / LABEL_LINE_EM)))
    })
  }
  return max
}

/**
 * How many lines the party tags need diagram-wide (again the maximum).
 * Tags wrap, and counting them as one line would take the extra height out of the title and the
 * summary and squash the text. Estimated from the name width (textWidth again, not character
 * count); each tag has 7px padding on each side and tags are 4px apart. Like the title, it
 * over-estimates rather than under-estimates.
 */
export function actorLinesOf(grid, fields) {
  if (!fields.actors) return 0
  let max = 0
  for (const row of grid.rows) {
    row.cells.forEach((event) => {
      const names = (Array.isArray(event.actorIds) ? event.actorIds : []).map(
        (id) => grid.actorById.get(id)?.name || id,
      )
      if (names.length === 0) return
      const width =
        names.reduce((n, name) => n + textWidth(name, ACTOR_FONT) + ACTOR_TAG_PAD, 0) +
        ACTOR_TAG_GAP * (names.length - 1)
      max = Math.max(max, Math.ceil(width / CARD_INNER_W))
    })
  }
  return max
}

/**
 * Turn the grid into pixels. What comes back is enough to build the nodes.
 *
 * @param grid    the grid computed by timeline/grid.js
 * @param fields  which fields are on (affects card height and therefore cell height)
 * @param isH     horizontal or not (time runs along the horizontal axis)
 */
export function makeMetrics(grid, fields, isH) {
  const colCount = grid.columns.length
  const rowCount = grid.rows.length

  // Card height is computed from "which fields to show" and "how many lines the title really
  // takes", and cell height then follows the card. Both follow the content, so a card never
  // leaves an empty block.
  const labelLines = labelLinesOf(grid)
  const actorLines = actorLinesOf(grid, fields)
  const cardH = cardHeightOf(fields, labelLines, actorLines)
  const cellH = cardH + CELL_GAP

  // How much length one time point takes, how much one lane takes. These two numbers do not
  // themselves change with direction, they are merely hung on different axes: vertical time runs
  // along the vertical, horizontal time along the horizontal.
  const slotExtent = isH ? CELL_W : cellH
  const laneExtent = isH ? cellH : CELL_W

  // Grid origin: the header area is reserved at the top when vertical, on the left when horizontal
  const originX = isH ? HEADER_W : 0
  const originY = isH ? 0 : HEADER_H

  // Width and height one cell takes on screen (vertical: width = lane width, height = time point height; swapped when horizontal)
  const cellBoxW = isH ? slotExtent : laneExtent
  const cellBoxH = isH ? laneExtent : slotExtent

  // Where the top-left corner of a cell is. Slots run along the time axis, lanes along the lane axis.
  const cellAt = (slotIndex, laneIndex) =>
    isH
      ? { x: originX + slotIndex * slotExtent, y: laneIndex * laneExtent }
      : { x: laneIndex * laneExtent, y: originY + slotIndex * slotExtent }

  // Centre line of the lane the axis sits in (measured along the lane axis)
  const axisCenter = grid.axisColumnIndex * laneExtent + laneExtent / 2

  // The content size must count the arrow in (see ARROW_EXTENT)
  const contentW = isH ? originX + rowCount * slotExtent + ARROW_EXTENT : colCount * laneExtent
  const contentH = isH ? colCount * laneExtent : originY + rowCount * slotExtent + ARROW_EXTENT

  return {
    isH,
    colCount,
    rowCount,
    labelLines,
    actorLines,
    cardH,
    cellH,
    slotExtent,
    laneExtent,
    originX,
    originY,
    cellBoxW,
    cellBoxH,
    cellAt,
    axisCenter,
    contentW,
    contentH,
  }
}
