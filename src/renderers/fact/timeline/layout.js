// ============================================================
//  src/renderers/fact/timeline/layout.js — entry point for timeline layout
//
//  Row = slot (index into the slots array; top to bottom is chronological order)
//  Column = side × party: each party on side 1, the axis, each party on side 2
//
//  This file only "strings things together":
//    grid.js     works out which row and which column each event falls in
//    metrics.js  turns rows and columns into pixels
//    nodes.js    turns pixels into React Flow nodes
//
//  Node order decides the drawing order (later ones sit on top):
//    cell layer → column headings → link layer → axis → cards
//  The link layer comes before the axis so the axis dots cover the end of the line (the line
//  never pokes into the circle); cards come last and cover the lines.
// ============================================================

import { buildGrid } from './grid.js'
import { makeMetrics } from './metrics.js'
import { axisNode, cellsNode, headerNodes, linksNode, placeCard } from './nodes.js'

/**
 * Turn a validated fact spec into React Flow nodes.
 * edges is always empty; the links from cards to axis dots are carried by a separate "link layer"
 * node.
 */
export function buildFactGraph(spec, fields = {}, view, orientation = 'vertical') {
  const isH = orientation === 'horizontal'
  // The view is an input to layout too: it decides what the sides split by and which columns exist
  const grid = buildGrid(spec, view)
  const m = makeMetrics(grid, fields, isH)

  const nodes = [cellsNode(m), ...headerNodes(grid, m)]

  // Card position and link are computed together: the link has to hug the edge of the card
  const cards = []
  const links = []
  grid.rows.forEach((row) => {
    row.cells.forEach((event, key) => {
      const col = grid.columns.findIndex((c) => c.key === key)
      if (col < 0) return
      const { node, link } = placeCard(event, col, row.index, grid, m, fields)
      cards.push(node)
      if (link) links.push(link)
    })
  })

  if (links.length) nodes.push(linksNode(links, isH))
  nodes.push(axisNode(grid, m))
  nodes.push(...cards)

  return {
    // Events this view cannot place end up here (for instance several at one time point when
    // there is no side split). They must be carried out: otherwise events would be dropped
    // silently and the interface would show nothing missing.
    errors: grid.errors,
    sideLabels: grid.sideLabels,
    nodes,
    edges: [],
    grid,
    layout: 'grid',
    size: { width: m.contentW, height: m.contentH },
  }
}
