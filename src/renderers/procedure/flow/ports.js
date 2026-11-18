// @ts-check
// ============================================================
//  src/renderers/procedure/flow/ports.js — the legal ports of a node
//
//  A node is not limited to its four faces. Every node accepts links at a set of
//  legal ports: the four cardinal ones (face centres / diamond vertices) are the
//  preferred ones, the rest (quarter points on a rectangle, edge midpoints on a
//  diamond, and any spaced point on the outline) are equally legal, only ranked
//  lower. Preference is a tie-break, never a prohibition.
//
//  Why: a decision has six links in real statute diagrams (one in, one rejoin,
//  four outcomes). With four ports only, two links must share one point, which
//  either folds the ink (a stub that doubles back) or drags one link across the
//  whole picture. Giving the node more legal ports, ranked, keeps the cardinal
//  habit while letting a fifth or sixth link attach close by.
// ============================================================

/** A legal port: the point, which face it sits on, and its preference tier (0 best). */
/**
 * @typedef {{ x: number, y: number, face: 'N'|'E'|'S'|'W'|'NE'|'SE'|'SW'|'NW', tier: number }} Port
 */

/**
 * The legal ports of a box. Rectangles: 4 cardinals plus quarter points on each side
 * (12). Diamonds: the 4 vertices plus the 4 edge midpoints (8); the diamond's outline
 * is slanted, so an orthogonal link meets it at those midpoints.
 * @param {{ x: number, y: number, w: number, h: number }} r
 * @param {boolean} diamond
 * @returns {Port[]}
 */
export function legalPorts(r, diamond) {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const x0 = r.x
  const x1 = r.x + r.w
  const y0 = r.y
  const y1 = r.y + r.h
  if (diamond) {
    return [
      { x: cx, y: y0, face: 'N', tier: 0 },
      { x: x1, y: cy, face: 'E', tier: 0 },
      { x: cx, y: y1, face: 'S', tier: 0 },
      { x: x0, y: cy, face: 'W', tier: 0 },
      { x: (cx + x1) / 2, y: (y0 + cy) / 2, face: 'NE', tier: 1 },
      { x: (cx + x1) / 2, y: (y1 + cy) / 2, face: 'SE', tier: 1 },
      { x: (cx + x0) / 2, y: (y1 + cy) / 2, face: 'SW', tier: 1 },
      { x: (cx + x0) / 2, y: (y0 + cy) / 2, face: 'NW', tier: 1 },
    ]
  }
  /** @type {Port[]} */
  const out = [
    { x: cx, y: y0, face: 'N', tier: 0 },
    { x: x1, y: cy, face: 'E', tier: 0 },
    { x: cx, y: y1, face: 'S', tier: 0 },
    { x: x0, y: cy, face: 'W', tier: 0 },
  ]
  for (const t of [0.25, 0.75]) {
    out.push({ x: x0 + r.w * t, y: y0, face: 'N', tier: 1 })
    out.push({ x: x0 + r.w * t, y: y1, face: 'S', tier: 1 })
    out.push({ x: x1, y: y0 + r.h * t, face: 'E', tier: 1 })
    out.push({ x: x0, y: y0 + r.h * t, face: 'W', tier: 1 })
  }
  return out
}

/**
 * Which legal port a point sits on, or null. A link may also leave a rectangle at any
 * spaced point of a face (multi-leave is legal there); those return `{ face, tier: 2 }`.
 * @param {{ x: number, y: number, w: number, h: number }} r
 * @param {boolean} diamond
 * @param {number[]} pt
 * @param {number} [near]
 * @returns {Port | null}
 */
export function portAt(r, diamond, pt, near = 2) {
  for (const p of legalPorts(r, diamond)) {
    if (Math.abs(p.x - pt[0]) <= near && Math.abs(p.y - pt[1]) <= near) return p
  }
  if (diamond) return null
  const x0 = r.x
  const x1 = r.x + r.w
  const y0 = r.y
  const y1 = r.y + r.h
  const x = pt[0]
  const y = pt[1]
  const CORNER = 12
  if (Math.abs(y - y0) <= near && x > x0 + CORNER && x < x1 - CORNER) return { x, y: y0, face: 'N', tier: 2 }
  if (Math.abs(y - y1) <= near && x > x0 + CORNER && x < x1 - CORNER) return { x, y: y1, face: 'S', tier: 2 }
  if (Math.abs(x - x0) <= near && y > y0 + CORNER && y < y1 - CORNER) return { x: x0, y, face: 'W', tier: 2 }
  if (Math.abs(x - x1) <= near && y > y0 + CORNER && y < y1 - CORNER) return { x: x1, y, face: 'E', tier: 2 }
  return null
}

/**
 * Distance from a point to a diamond's outline (its four slanted edges).
 * @param {{ x: number, y: number, w: number, h: number }} r
 * @param {number[]} pt
 */
export function diamondOutlineDist(r, pt) {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const v = [
    [cx, r.y],
    [r.x + r.w, cy],
    [cx, r.y + r.h],
    [r.x, cy],
  ]
  let best = Infinity
  for (let i = 0; i < 4; i += 1) {
    const [a, b] = [v[i], v[(i + 1) % 4]]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    const px = a[0] + t * dx
    const py = a[1] + t * dy
    best = Math.min(best, Math.hypot(pt[0] - px, pt[1] - py))
  }
  return best
}
