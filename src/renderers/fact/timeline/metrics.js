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

/** A column (lane) with no event keeps its heading but not the room for cards: that a party did nothing on its own is
 *  itself information, an empty full-size column only pushes the rest apart. Vertical: its width; horizontal: its height */
export const EMPTY_LANE_W = 104
export const EMPTY_LANE_H = 52

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
 * A card on the axis that names two or more parties says who, whatever the parties switch says (issue
 * 172). An act of several parties goes to the axis, so a party who only ever acts with others has an
 * empty column; the names on the card are how the reader sees that party took part. They stand on the
 * time's line, right of the time, in small grey text cut short with an ellipsis when long (the overlay
 * lists them all), so no card grows: every card of a diagram is one height, and a row of its own would
 * have grown every card.
 */
export const isJointCard = (event, side) => side === SIDE.AXIS && (Array.isArray(event.actorIds) ? event.actorIds.length : 0) >= 2

/**
 * Which columns a row has cards in, for the staggered layout. Only a shared column stops two rows
 * from coming closer than a whole row: in a view split by party a column is one party, in a view
 * split by group it is one group. Links need no room of their own: rows are always at least half a
 * row apart, and a card stands in its cell with a gap above and below, so a link (at the middle of
 * its row) always runs through the gap between the cards of a neighbouring column, and an axis dot
 * never sits under a card on the axis.
 */
export function footprintOf(row, grid) {
  const taken = new Set()
  row.cells.forEach((_, key) => {
    const col = grid.columns.findIndex((c) => c.key === key)
    if (col >= 0) taken.add(col)
  })
  return taken
}

/** How far down a row may start after the one before it, at least, in the staggered layout (in cell heights) */
export const STAGGER_STEP = 0.5

/**
 * The top of each row, in cell heights from the first. Without stagger it is the row number. With
 * stagger, a row starts half a row after the one before it, but no closer than a whole row to any
 * earlier row that has a card in one of its columns: cards never overlap, and no link runs under a
 * card (see footprintOf). Every row is still below the one before it, so the order of the dots on the
 * axis is the order of the slots.
 */
export function rowTopsOf(grid, stagger) {
  if (!stagger) return grid.rows.map((_, i) => i)
  const prints = grid.rows.map((row) => footprintOf(row, grid))
  const tops = []
  prints.forEach((print, i) => {
    let top = i === 0 ? 0 : tops[i - 1] + STAGGER_STEP
    for (let j = 0; j < i; j++) {
      if ([...print].some((k) => prints[j].has(k))) top = Math.max(top, tops[j] + 1)
    }
    tops.push(top)
  })
  return tops
}

/**
 * Turn the grid into pixels. What comes back is enough to build the nodes.
 *
 * @param grid    the grid computed by timeline/grid.js
 * @param fields  which fields are on (affects card height and therefore cell height)
 * @param isH     horizontal or not (time runs along the horizontal axis)
 * @param stagger vertical only: rows with no column in common may overlap by half (off unless asked: the page asks for it by default, see TimelineRenderer.jsx)
 */
export function makeMetrics(grid, fields, isH, stagger = false) {
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

  // Each lane's start and size along the lane axis: a lane with no event is thin (EMPTY_LANE_W / _H)
  const used = new Set()
  grid.rows.forEach((row) => row.cells.forEach((_, key) => used.add(key)))
  const lanes = []
  let laneEnd = 0
  grid.columns.forEach((c) => {
    const size = used.has(c.key) ? laneExtent : isH ? EMPTY_LANE_H : EMPTY_LANE_W
    lanes.push({ start: laneEnd, size })
    laneEnd += size
  })

  // Grid origin: the header area is reserved at the top when vertical, on the left when horizontal
  const originX = isH ? HEADER_W : 0
  const originY = isH ? 0 : HEADER_H

  // Width and height one cell takes on screen (vertical: width = lane width, height = time point height; swapped when horizontal)
  const cellBoxW = isH ? slotExtent : laneExtent
  const cellBoxH = isH ? laneExtent : slotExtent

  // Where each slot starts along the time axis, in slot extents (the row number, unless staggered)
  const staggered = stagger && !isH
  const rowTops = rowTopsOf(grid, staggered)
  const timeSpan = rowCount === 0 ? 0 : (rowTops[rowCount - 1] + 1) * slotExtent

  // Where the top-left corner of a cell is. Slots run along the time axis, lanes along the lane axis.
  const cellAt = (slotIndex, laneIndex) =>
    isH
      ? { x: originX + rowTops[slotIndex] * slotExtent, y: lanes[laneIndex].start }
      : { x: lanes[laneIndex].start, y: originY + rowTops[slotIndex] * slotExtent }

  // Centre line of the lane the axis sits in (measured along the lane axis)
  const axisLane = lanes[grid.axisColumnIndex] ?? { start: 0, size: laneExtent }
  const axisCenter = axisLane.start + axisLane.size / 2

  // The content size must count the arrow in (see ARROW_EXTENT)
  const contentW = isH ? originX + timeSpan + ARROW_EXTENT : laneEnd
  const contentH = isH ? laneEnd : originY + timeSpan + ARROW_EXTENT

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
    lanes,
    originX,
    originY,
    cellBoxW,
    cellBoxH,
    cellAt,
    rowTops,
    timeSpan,
    staggered,
    axisCenter,
    contentW,
    contentH,
  }
}
