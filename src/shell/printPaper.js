// ============================================================
//  src/shell/printPaper.js — the paper a printed diagram lands on
//
//  The quantities (A4, margins, mm→px, the three paper levels) live in
//  `src/core/paper.js`. This file keeps what is specific to the browser print path:
//  picking an orientation from the diagram's shape, waiting for frames, and opening
//  the print dialog. `printableArea` / `pageSize` stay as thin wrappers so existing
//  callers and tests keep the same names.
// ============================================================

import {
  A4_MM,
  PRINT_MARGIN_MM,
  levelForOrientation,
  paperOf,
} from '../core/paper.js'

export { A4_MM, PRINT_MARGIN_MM }

/**
 * The area a diagram may use on the printed sheet, in CSS pixels.
 * @param {'portrait'|'landscape'} orientation
 * @returns {{width: number, height: number}}
 */
export function printableArea(orientation = 'portrait') {
  // Default only when the argument is omitted; an explicit bad value fails via levelForOrientation.
  return { ...paperOf(levelForOrientation(orientation)).canvas }
}

/**
 * Which way up the sheet goes for a diagram of this shape.
 * A wider picture gets the landscape sheet, a taller one the portrait sheet; a square or
 * an unknown size gets portrait.
 * @param {number} width the diagram's content width
 * @param {number} height the diagram's content height
 * @returns {'portrait'|'landscape'}
 */
export function paperFor(width, height) {
  if (!(Number.isFinite(width) && Number.isFinite(height)) || width <= 0 || height <= 0) return 'portrait'
  return width > height ? 'landscape' : 'portrait'
}

/**
 * The `size` the `@page` rule needs for this orientation.
 * @param {'portrait'|'landscape'} orientation
 * @returns {string}
 */
export function pageSize(orientation) {
  return paperOf(levelForOrientation(orientation)).pageSize
}

/** Wait a given number of animation frames: a resize and a fit each need one to settle. */
export function frames(count = 2) {
  return new Promise((resolve) => {
    let left = Math.max(1, count)
    const step = () => {
      left -= 1
      if (left <= 0) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

/**
 * Show the browser's print preview, and wait until it is done with the page.
 * Chrome runs `print()` to the end of the dialog, so the promise resolves on `afterprint`;
 * a browser that never fires it (headless, or a refused dialog) must not hold the page
 * hostage, so a timeout resolves it too.
 */
export function showPrintDialog({ timeoutMs = 60000 } = {}) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.removeEventListener('afterprint', finish)
      resolve()
    }
    window.addEventListener('afterprint', finish)
    try {
      window.print()
    } catch {
      // the browser refused to open a dialog: the caller still has to put the page back
      finish()
      return
    }
    setTimeout(finish, timeoutMs)
  })
}
