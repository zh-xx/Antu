// @ts-check
// Painted decision diamond = rhombus through bbox face midpoints (N/E/S/W).
// Bbox-edge anchors that miss this outline are illegal even when distBox === 0.

/**
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 */
export function diamondVertices(n) {
  const x = n.position?.x ?? n.x
  const y = n.position?.y ?? n.y
  const w = n.data?.w ?? n.w
  const h = n.data?.h ?? n.h
  const cx = x + w / 2
  const cy = y + h / 2
  return {
    N: [cx, y],
    E: [x + w, cy],
    S: [cx, y + h],
    W: [x, cy],
  }
}

/**
 * @param {number[]} p
 * @param {number[]} a
 * @param {number[]} b
 */
function distPointToSeg(p, a, b) {
  const [px, py] = p
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Distance to painted diamond outline (not the axis-aligned bbox).
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 * @param {number[]} p
 */
export function distDiamondOutline(n, p) {
  const v = diamondVertices(n)
  const edges = [
    [v.N, v.E],
    [v.E, v.S],
    [v.S, v.W],
    [v.W, v.N],
  ]
  let best = Infinity
  for (const [a, b] of edges) best = Math.min(best, distPointToSeg(p, a, b))
  return best
}

/**
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 * @param {number[]} p
 * @param {number} [tol]
 */
export function onDiamondOutline(n, p, tol = 1.5) {
  return distDiamondOutline(n, p) <= tol
}
