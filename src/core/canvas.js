// ============================================================
//  src/core/canvas.js — pure canvas-level computation
//
//  Why a file of its own: **the zoom factor that "just fits the whole diagram"
//  has to be computed in two places** — the renderer uses it to set minZoom, and
//  the MCP's antu_layout uses it to tell the agent "how small this diagram will
//  be on screen". Both used to carry their own copy of 1.12, so changing one and
//  forgetting the other produced "the advice the agent got disagrees with the
//  actual rendering".
//
//  Plain JS, no React, so Node and the MCP can import it directly.
// ============================================================

/** The padding ratio for fitView. React Flow's fitViewOptions.padding and this value must agree. */
export const FIT_PADDING = 0.12

/**
 * The zoom factor at which the content just fits the viewport, capped at 1.
 *
 * Why cap at 1: when the diagram is smaller than the viewport the computation
 * gives a factor above 1, which is "scale up to fill" and not what we want (a
 * small diagram should show at its own size).
 */
export function fitZoom(size, viewport) {
  if (!size || !viewport || !size.width || !size.height) return 1
  const zx = viewport.width / (size.width * (1 + FIT_PADDING))
  const zy = viewport.height / (size.height * (1 + FIT_PADDING))
  return Math.min(zx, zy, 1)
}

/**
 * The zoom for a diagram that opens fitted to its **width** and is read top to bottom (the fact
 * chronicle): a long column fitted whole would shrink its text below reading size, so only the
 * width has to fit and the reader scrolls down. Capped at 1, like fitZoom.
 */
export function fitWidthZoom(size, viewport) {
  if (!size || !viewport || !size.width) return 1
  return Math.min(viewport.width / (size.width * (1 + FIT_PADDING)), 1)
}

// ------------------------------------------------------------
//  How big the text is on one screen (#43, the guard)
//
//  An agent that cannot look at the page still has to know whether the reader can read it. The engine knows: the
//  page opens fitted to the screen, so the body text is drawn at its font size times the fit zoom. Every kind of
//  diagram reports that one number, in pixels, against one pair of thresholds, instead of each kind comparing the
//  zoom against a threshold of its own (a zoom says nothing until it is multiplied by the font).
//
//  Only ever a note, never a refusal: the reader can zoom in (up to 3×), so small text is harder to read, not wrong.
//  A diagram smaller than the screen is not shrunk (fitZoom caps at 1), so its text is at full size or larger.
// ------------------------------------------------------------

/** Below this the body text needs zooming in to be read */
/** The screen the reports of `layout` and the choice of how a diagram opens are judged at */
export const REFERENCE_CANVAS = { width: 1600, height: 900 }

export const TEXT_MIN_PX = 9
/** Below this the body text is small, though readable */
export const TEXT_OK_PX = 11

/** The body text's size on screen, in px, rounded to a tenth */
export const textPx = (font, fit) => Math.round(font * Math.min(fit, 1) * 10) / 10

/**
 * The lines of a geometry report about the text on one screen. Every kind says it in these words.
 * @param t        { font, canvas: {width, height}, open: {name, fit}, other: {name, fit}, folded?: fit }
 * @param split    how this kind of diagram is split when it is too big, e.g. "one diagram per issue"
 */
export function textSizeLines(t, split) {
  const where = `Text on one screen (${t.canvas.width}×${t.canvas.height})`
  const open = textPx(t.font, t.open.fit)
  const other = textPx(t.font, t.other.fit)
  const px = (n) => n.toFixed(1)
  const lines = []
  if (t.open.fit >= 1 && t.other.fit >= 1) lines.push(`${where}: full size (${t.font} px) either way.`)
  else lines.push(`${where}: ${px(open)} px as it opens (${t.open.name}), ${px(other)} px ${t.other.name}. Full size is ${t.font} px.`)
  const best = Math.max(open, other)
  if (best < TEXT_MIN_PX) {
    lines.push(`Note: the text is too small to read without zooming in (under ${TEXT_MIN_PX} px). Consider ${split}; do not drop facts to make it fit.`)
  } else if (best < TEXT_OK_PX) {
    lines.push(`Note: the text is small (under ${TEXT_OK_PX} px); the reader can zoom in. ${split[0].toUpperCase()}${split.slice(1)} would make it easier to read.`)
  }
  if (t.folded !== undefined && best < TEXT_OK_PX) {
    const folded = t.folded >= 1 ? `full size (${t.font} px)` : `${px(textPx(t.font, t.folded))} px`
    lines.push(`With every issue folded the text is ${folded}: the reader can fold issues ("Fold issues" in the bar) instead of your splitting it.`)
  }
  return lines
}
