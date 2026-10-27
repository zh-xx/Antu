// ============================================================
//  src/shell/printTiles.js — print across sheets (issue 123)
//
//  Printing fits the whole picture onto one sheet, so a big diagram arrives with its text under
//  the readable floor. This builds the other choice: the picture at its own size, cut into sheets.
//
//  Two rules decide where the knife falls, and both matter for how it reads afterwards:
//    1. **Balanced**, not at fixed multiples. Cutting 1334 px at every 1032 leaves a 302 px strip on
//       the second sheet (and 750 px at every 703 a 47 px strip below) — sheets that look like a
//       misprint. Dividing the content evenly fills every sheet by the same amount.
//    2. **In a gap**, not through a card. The cut search nearest free band to the even position,
//       as far as one page's capacity allows, so a card is not sliced across two sheets.
//
//  The tiles are DOM clones of the drawn viewport, shifted by the cut: print needs no interactivity,
//  and cloning keeps the picture exactly as it was laid out.
// ============================================================

import { sheetsOf } from '../core/paper.js'
import { TEXT_OK_PX } from '../core/canvas.js'

/** The wrapper that holds the tiles; one at a time, removed after printing */
export const TILES_CLASS = 'antu-print-tiles'

/** Take the tiles away (after printing, or before building new ones) */
export function removeTiles(app) {
  app.querySelector(`.${TILES_CLASS}`)?.remove()
  delete app.dataset.printTiles
}

/** Every drawn node, in flow coordinates: the viewport carries pan/zoom, each node its own position */
function boxesOf(root) {
  const boxes = []
  for (const node of root.querySelectorAll('.react-flow__node')) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform ?? '')
    if (!m) continue
    const width = node.offsetWidth || Number.parseFloat(node.style.width) || 0
    const height = node.offsetHeight || Number.parseFloat(node.style.height) || 0
    boxes.push({ x: Number(m[1]), y: Number(m[2]), w: width, h: height })
  }
  return boxes
}

/**
 * Cut positions along one axis: `count` slices of `span`, pushed to the nearest free band
 * (no node crossing the line) as far as `limit` on either side allows.
 * @param {Array<{start: number, end: number}>} spans node extents on this axis, ascending
 * @param {number} count   how many sheets
 * @param {number} span    content length on this axis
 * @param {number} limit   how far a cut may move from its even position (a page's spare room)
 */
export function cutsOf(spans, count, span, limit) {
  const cuts = [0]
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  for (let i = 1; i < count; i += 1) {
    const even = (span * i) / count
    const low = Math.max(cuts[i - 1] + 1, even - limit)
    const high = Math.min(span - 1, even + limit)
    // The fewest cards crossed wins; among equals, the nearest to the even position, so the sheets stay
    // balanced. A free band (no card crossing at all) is simply the score 0.
    let best = Math.round(Math.min(Math.max(even, low), high))
    let bestScore = Number.POSITIVE_INFINITY
    for (let at = Math.ceil(low); at <= Math.floor(high); at += 1) {
      let crossed = 0
      for (const s of sorted) if (s.start < at && at < s.end) crossed += 1
      const score = crossed * 1e6 + Math.abs(at - even)
      if (score < bestScore) {
        bestScore = score
        best = at
      }
    }
    cuts.push(best)
  }
  cuts.push(span)
  return cuts
}

/** The type size the picture is drawn at (CSS px at 100 %): the **median** text size on the cards, divided by
 *  the zoom the reader is looking through. The median, not the smallest: a date or a source line is set two
 *  steps down by design, and letting that drive the scale would shrink the whole picture for the sake of a
 *  footnote. Read from the DOM because each type has its own font constants. */
function fontPxOf(root) {
  const viewport = root?.querySelector('.react-flow__viewport')
  if (!viewport) return 0
  const m = /scale\(([\d.]+)\)/.exec(viewport.style.transform ?? '')
  const zoom = m ? Number(m[1]) : 1
  const sizes = []
  for (const el of viewport.querySelectorAll('.react-flow__node *')) {
    if (!el.textContent?.trim()) continue
    const px = Number.parseFloat(getComputedStyle(el).fontSize)
    if (px > 0) sizes.push(px)
  }
  if (!sizes.length || !zoom) return 0
  sizes.sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)] / zoom
}

/** Scales worth trying, largest first. Crossing one of these usually removes a whole row or column of
 *  sheets, which is what makes a printout read as a picture rather than as strips. */
const SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7]

/**
 * Decide the scale and the cuts for printing across sheets.
 * A picture 750 px tall on a 703 px sheet must be cut through a row of cards at 100 %, so the plan prefers
 * the largest scale that needs fewer sheets: on the fact example 0.9 makes it two sheets instead of four and
 * no card is cut at all. The type does get smaller — the chip says so, and the geometry report has already
 * warned when it falls under the readable floor.
 * @returns {{scale: number, sheets: {across: number, down: number, total: number}, cutsX: number[], cutsY: number[]}}
 */
export function planTiles(root, area, size) {
  // Never scale the type under the readable floor (core/canvas.js TEXT_OK_PX): shrinking to fit one sheet is
  // what Print already does, and it is the thing this action exists to avoid.
  const fontPx = fontPxOf(root)
  const floor = TEXT_OK_PX / Math.max(1, fontPx)
  const usable = SCALES.filter((scale) => scale >= floor - 1e-9)
  let best = null
  for (const scale of usable.length ? usable : [1]) {
    const scaled = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
    const sheets = sheetsOf(scaled, area)
    if (!sheets.total) continue
    if (!best || sheets.total < best.sheets.total) best = { scale, sheets, scaled }
  }
  if (!best) return { scale: 1, sheets: { across: 0, down: 0, total: 0 }, cutsX: [0], cutsY: [0] }
  const pad = 8
  const boxes = boxesOf(root)
  const originX = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0
  const originY = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0
  const flow = boxes.map((b) => ({
    x: (b.x - originX) * best.scale + pad,
    y: (b.y - originY) * best.scale + pad,
    w: b.w * best.scale,
    h: b.h * best.scale,
  }))
  const spanX = best.scaled.width + pad * 2
  const spanY = best.scaled.height + pad * 2
  const { across, down } = best.sheets
  const cutsX = cutsOf(flow.map((b) => ({ start: b.x, end: b.x + b.w })), across, spanX, area.width - spanX / across)
  const cutsY = cutsOf(flow.map((b) => ({ start: b.y, end: b.y + b.h })), down, spanY, area.height - spanY / down)
  return { scale: best.scale, sheets: best.sheets, cutsX, cutsY }
}

/**
 * Build one page per sheet.
 * @param {Element} app   `.antu-app`
 * @param {Element} root  the element the diagram is drawn in (`.antu-canvas`)
 * @param {{width: number, height: number}} area printable area, CSS px
 * @param {{width: number, height: number}} size content size, CSS px
 * @returns {{across: number, down: number, total: number}} what stands in the DOM now (0: nothing built)
 */
export function buildTiles(app, root, area, size) {
  removeTiles(app)
  const viewport = root?.querySelector('.react-flow__viewport')
  if (!viewport) return { across: 0, down: 0, total: 0 }
  const plan = planTiles(root, area, size)
  const sheets = plan.sheets
  if (sheets.total <= 1) return { across: 0, down: 0, total: 0 }
  const { cutsX, cutsY, scale } = plan

  const wrap = document.createElement('div')
  wrap.className = TILES_CLASS
  for (let row = 0; row < sheets.down; row += 1) {
    for (let col = 0; col < sheets.across; col += 1) {
      const tile = document.createElement('div')
      tile.className = 'antu-print-tile'
      const page = row * sheets.across + col + 1
      tile.dataset.page = String(page)
      const copy = viewport.cloneNode(true)
      copy.removeAttribute('style')
      // The clone sits at the sheet's own cut, at the planned scale: no reader pan/zoom, no fitting
      copy.style.transformOrigin = '0 0'
      copy.style.transform = `scale(${scale}) translate(${-cutsX[col] / scale}px, ${-cutsY[row] / scale}px)`
      tile.append(copy)
      const mark = document.createElement('div')
      mark.className = 'antu-print-page-mark'
      mark.textContent = `${page} / ${sheets.total}`
      tile.append(mark)
      wrap.append(tile)
    }
  }
  app.append(wrap)
  app.dataset.printTiles = ''
  return { ...sheets, scale }
}
