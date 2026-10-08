// ============================================================
//  src/shell/dockPlace.js — where the control capsule goes on a canvas of a given width
//
//  The capsule sits at the bottom, between the zoom buttons (bottom left) and the minimap (bottom right). It
//  used to be centred whatever the width: on a canvas narrower than about 1200 px the widest capsule ran under
//  the minimap and hid the export button, and below about 800 px it ran into the zoom buttons and off the
//  canvas (an embedded diagram in a side panel meets this first). The rule, in this order:
//    1. centred on the canvas when that leaves it clear of both;
//    2. else moved sideways into the free strip between them;
//    3. else the minimap gives way (it is the one a reader can do without);
//    4. else the capsule wraps onto more lines within the strip.
//  Pure computation, so a test checks it at every width; shell/Canvas.jsx measures and applies it.
// ============================================================

/** Space kept between the capsule and its neighbours, and from the canvas edge (React Flow's panel margin) */
export const DOCK_GAP = 12
export const DOCK_EDGE = 15

/**
 * @param width         the canvas width
 * @param natural       the capsule's width on one line
 * @param zoomRight     the right edge of the zoom buttons, or null when there are none
 * @param minimapWidth  the minimap's width, or null when there is none
 * @returns {{ left: number, maxWidth: number | null, hideMinimap: boolean }}  `left` from the canvas's left edge;
 *          `maxWidth` set when the capsule has to wrap
 */
export function placeDock({ width, natural, zoomRight = null, minimapWidth = null }) {
  const lo = zoomRight == null ? DOCK_EDGE : zoomRight + DOCK_GAP
  const right = (minimap) => (minimap ? width - DOCK_EDGE - minimapWidth - DOCK_GAP : width - DOCK_EDGE)
  const place = (hi) => Math.min(Math.max(width / 2 - natural / 2, lo), hi - natural)

  if (minimapWidth != null && natural <= right(true) - lo) return { left: place(right(true)), maxWidth: null, hideMinimap: false }
  const hideMinimap = minimapWidth != null
  const hi = right(false)
  if (natural <= hi - lo) return { left: place(hi), maxWidth: null, hideMinimap }
  return { left: lo, maxWidth: Math.max(hi - lo, 0), hideMinimap }
}
