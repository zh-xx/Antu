// @ts-check
// Painted decision diamond = rhombus through bbox face midpoints (N/E/S/W).
// Bbox-edge anchors that miss this outline are illegal even when distBox === 0.

/**
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 */
export function diamondVertices(n) {
  const x = /** @type {number} */ (n.position?.x ?? n.x)
  const y = /** @type {number} */ (n.position?.y ?? n.y)
  const w = /** @type {number} */ (n.data?.w ?? n.w)
  const h = /** @type {number} */ (n.data?.h ?? n.h)
  const cx = x + w / 2
  const cy = y + h / 2
  return {
    N: /** @type {[number, number]} */ ([cx, y]),
    E: /** @type {[number, number]} */ ([x + w, cy]),
    S: /** @type {[number, number]} */ ([cx, y + h]),
    W: /** @type {[number, number]} */ ([x, cy]),
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

/**
 * Point on a painted diamond edge (vertex→vertex), t∈[0,1].
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 * @param {'N'|'E'|'S'|'W'} fromVert
 * @param {'N'|'E'|'S'|'W'} toVert
 * @param {number} t
 * @returns {number[]}
 */
export function diamondEdgePoint(n, fromVert, toVert, t) {
  const v = diamondVertices(n)
  const a = /** @type {[number, number]} */ (v[fromVert])
  const b = /** @type {[number, number]} */ (v[toVert])
  const u = Math.max(0, Math.min(1, t))
  return /** @type {[number, number]} */ ([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
}

/**
 * Multi-attach on a free cardinal *side* (issue 190 S2): stagger along the two outline
 * edges that meet at that vertex. Never returns the opposite trunk pair (N/S for E/W side).
 * index/count are 0-based among siblings sharing this side.
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 * @param {'E'|'W'|'N'|'S'} side
 * @param {number} index
 * @param {number} count
 * @returns {number[]}
 */
export function staggerOnDiamondSide(n, side, index, count) {
  const v = diamondVertices(n)
  if (count <= 1) return /** @type {number[]} */ (v[side])
  // Pair edges meeting at `side`; alternate edges so two siblings split NE/SE (etc.).
  /** @type {Record<'E'|'W'|'N'|'S', ['N'|'E'|'S'|'W', 'N'|'E'|'S'|'W'][]>} */
  const edges = {
    E: [
      ['N', 'E'],
      ['S', 'E'],
    ],
    W: [
      ['N', 'W'],
      ['S', 'W'],
    ],
    N: [
      ['W', 'N'],
      ['E', 'N'],
    ],
    S: [
      ['W', 'S'],
      ['E', 'S'],
    ],
  }
  const pair = edges[side]
  const edge = pair[index % pair.length]
  // Stay near the side vertex (t→1) but not on it when count>1 — distinct outline ports.
  const slot = Math.floor(index / pair.length)
  const t = 1 - (0.28 + slot * 0.12)
  return diamondEdgePoint(n, edge[0], edge[1], Math.max(0.45, Math.min(0.92, t)))
}
