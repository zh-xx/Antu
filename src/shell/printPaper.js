// ============================================================
//  src/shell/printPaper.js — the paper a printed diagram lands on
//
//  The browser gives a printed page the size the print CSS asks for (`@page`). A4 is
//  210 × 297 mm, and the page's own margins take PRINT_MARGIN_MM off every edge, so the
//  area the diagram may use is what is left. CSS pixels in print are 96 to the inch, so
//  millimetres turn into pixels with one factor, kept here and nowhere else.
//
//  Which way up the sheet goes is decided from the diagram's own shape: a picture wider
//  than it is tall has more room on a landscape sheet, a taller one on a portrait sheet.
//  The reading stays right either way; the diagram is fitted to the paper, not cropped.
// ============================================================

/** The page margins the print CSS asks for (`@page { margin: 12mm }`), in millimetres */
export const PRINT_MARGIN_MM = 12

/** A4, in millimetres (portrait: the long side is the height) */
export const A4_MM = Object.freeze({ width: 210, height: 297 })

/** CSS pixels per millimetre: print lays out at 96 dpi */
const PX_PER_MM = 96 / 25.4

/**
 * The area a diagram may use on the printed sheet, in CSS pixels.
 * @param {'portrait'|'landscape'} orientation
 * @returns {{width: number, height: number}}
 */
export function printableArea(orientation = 'portrait') {
  const short = (A4_MM.width - PRINT_MARGIN_MM * 2) * PX_PER_MM
  const long = (A4_MM.height - PRINT_MARGIN_MM * 2) * PX_PER_MM
  const landscape = orientation === 'landscape'
  return {
    width: Math.round(landscape ? long : short),
    height: Math.round(landscape ? short : long),
  }
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
  return orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'
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
