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
