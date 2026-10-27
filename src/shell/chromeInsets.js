// ============================================================
//  src/shell/chromeInsets.js — how much of the canvas the chrome covers (issue 166)
//
//  Fit used the whole canvas, so the label card sat on the first stage and the dock
//  capsule on the rule table. Measure those overlays against the canvas and leave them
//  clear. Pure numbers go to core/canvas.js; this file only reads the DOM.
// ============================================================

import { CHROME_FIT_GAP } from '../core/canvas.js'

/**
 * How much room the label card and the dock capsule take from the canvas edges.
 * @param {HTMLElement | null | undefined} canvasEl  the `.antu-canvas` element
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function measureChromeInsets(canvasEl) {
  const empty = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!canvasEl || typeof canvasEl.getBoundingClientRect !== 'function') return empty
  const canvas = canvasEl.getBoundingClientRect()
  if (!canvas.width || !canvas.height) return empty

  const app = canvasEl.closest?.('.antu-app') || canvasEl.getRootNode?.()?.host?.closest?.('.antu-app') || null
  const root = app || (canvasEl.getRootNode?.() instanceof ShadowRoot ? canvasEl.getRootNode() : canvasEl.ownerDocument)
  const header = root?.querySelector?.('.antu-header')
  const dock = canvasEl.querySelector?.('.antu-dock-capsule')

  let top = 0
  let bottom = 0
  if (header) {
    const r = header.getBoundingClientRect()
    // Clear the header's height: content opens below it (a left inset would shrink zoom for every kind)
    top = Math.max(0, r.bottom - canvas.top + CHROME_FIT_GAP)
  }
  if (dock) {
    const r = dock.getBoundingClientRect()
    // Folded or open: anything that paints over the bottom edge counts
    if (r.height > 0 && r.bottom > canvas.top && r.top < canvas.bottom) {
      bottom = Math.max(0, canvas.bottom - r.top + CHROME_FIT_GAP)
    }
  }
  return { top, right: 0, bottom, left: 0 }
}
