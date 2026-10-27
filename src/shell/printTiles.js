// ============================================================
//  src/shell/printTiles.js — print across sheets (issue 123)
//
//  Printing today fits the whole picture onto one sheet, so a big diagram arrives with its
//  text under the readable floor (the geometry report says how far under). This builds the
//  other choice: the picture at its own size, cut into sheets — page 1 is the top-left tile,
//  page 2 the next one to the right, and so on, with the designed type size untouched.
//
//  It works by cloning the drawn viewport, once per tile, and shifting the clone by the
//  sheet's offset inside a page-sized box with `overflow: hidden`. Cloning the DOM (rather
//  than re-laying-out) keeps the picture exactly as drawn, and print needs no interactivity.
// ============================================================

import { sheetsOf } from '../core/paper.js'

/** The wrapper that holds the tiles; one at a time, removed after printing */
export const TILES_CLASS = 'antu-print-tiles'

/** Take the tiles away (after printing, or before building new ones) */
export function removeTiles(app) {
  app.querySelector(`.${TILES_CLASS}`)?.remove()
  delete app.dataset.printTiles
}

/** Where the drawn content starts, in flow coordinates: React Flow keeps pan/zoom on the
 *  viewport and each node's own position on the node, so the nodes answer this directly. */
function originOf(root) {
  const xs = []
  const ys = []
  for (const node of root.querySelectorAll('.react-flow__node')) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform ?? '')
    if (m) {
      xs.push(Number(m[1]))
      ys.push(Number(m[2]))
    }
  }
  if (!xs.length) return { x: 0, y: 0 }
  return { x: Math.min(...xs), y: Math.min(...ys) }
}

/**
 * Build one clipped page per sheet.
 * @param {Element} app   `.antu-app`
 * @param {Element} root  the element the diagram is drawn in (`.antu-canvas`)
 * @param {{width: number, height: number}} area printable area, CSS px
 * @param {{width: number, height: number}} size content size, CSS px
 * @returns {{across: number, down: number, total: number}} what stands in the DOM now (0: nothing built)
 */
export function buildTiles(app, root, area, size) {
  removeTiles(app)
  const viewport = root?.querySelector('.react-flow__viewport')
  const sheets = sheetsOf(size, area)
  if (!viewport || sheets.total <= 1) return { across: 0, down: 0, total: 0 }

  // One margin around the content, so a card on the edge is not cut through its border
  const pad = 8
  const origin = originOf(root)
  const wrap = document.createElement('div')
  wrap.className = TILES_CLASS
  for (let row = 0; row < sheets.down; row += 1) {
    for (let col = 0; col < sheets.across; col += 1) {
      const tile = document.createElement('div')
      tile.className = 'antu-print-tile'
      tile.dataset.page = String(row * sheets.across + col + 1)
      const copy = viewport.cloneNode(true)
      copy.removeAttribute('style')
      // The clone sits at the sheet's own offset inside the page: no reader pan/zoom, no fitting
      copy.style.transform = `translate(${pad - origin.x - col * area.width}px, ${pad - origin.y - row * area.height}px)`
      tile.append(copy)
      wrap.append(tile)
    }
  }
  app.append(wrap)
  app.dataset.printTiles = ''
  return sheets
}
