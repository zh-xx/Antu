// ============================================================
//  src/core/links.js — small repairs to the polyline of a link
//
//  The orthogonal router anchors a link at the middle of the side of each node. Two nodes of different sizes whose middles
//  differ by a few pixels (a box 53 high beside one 72 high) then get a link that runs straight, steps sideways by 2 or 3
//  px, and runs on: drawn with round corners it looks like a link that missed. `straightenJog` makes that link one straight line.
//  It works in the frame the layouts route in (the layouts turn the whole picture afterwards when it is drawn left to
//  right), for a link between two layers and for one between two nodes of a layer.
// ============================================================

/** A sideways step of less than this (px) is a slip, not a turn */
export const JOG_MAX = 12

/** The distance kept from the corner of a node, where a link may still meet it (the corners are round) */
const MARGIN = 8

/**
 * @param points the link in the frame: [x, y] points
 * @param a      the rectangle {x, y, w, h} of the node it leaves
 * @param b      the rectangle of the node it enters
 * @returns the points; two of them, on one vertical line, when the link was a short Z whose line lies within both nodes
 */
export function straightenJog(points, a, b, maxJog = JOG_MAX) {
  if (!Array.isArray(points) || points.length !== 4 || !a || !b) return points
  const [p0, p1, p2, p3] = points
  const within = (v, lo, len) => v >= lo + MARGIN && v <= lo + len - MARGIN
  // down, a short step sideways, down (a link between two layers)
  if (p0[0] === p1[0] && p1[1] === p2[1] && p2[0] === p3[0]) {
    const step = Math.abs(p2[0] - p1[0])
    if (step === 0 || step >= maxJog) return points
    const x = (p0[0] + p3[0]) / 2
    return within(x, a.x, a.w) && within(x, b.x, b.w) ? [[x, p0[1]], [x, p3[1]]] : points
  }
  // along, a short step up or down, along (a link between two nodes of one layer)
  if (p0[1] === p1[1] && p1[0] === p2[0] && p2[1] === p3[1]) {
    const step = Math.abs(p2[1] - p1[1])
    if (step === 0 || step >= maxJog) return points
    const y = (p0[1] + p3[1]) / 2
    return within(y, a.y, a.h) && within(y, b.y, b.h) ? [[p0[0], y], [p3[0], y]] : points
  }
  return points
}
