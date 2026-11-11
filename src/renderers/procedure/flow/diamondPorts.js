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
  // Spread t so high-degree siblings do not clamp onto the same anchor.
  const slot = Math.floor(index / pair.length)
  const t = 1 - (0.22 + slot * 0.16 + (index % pair.length) * 0.04)
  return diamondEdgePoint(n, edge[0], edge[1], Math.max(0.4, Math.min(0.9, t)))
}

/**
 * True when `p` sits on a painted diamond cardinal tip (N/E/S/W vertex), not a slant.
 * Face/side classification alone is insufficient — a SW-edge attach still "faces W".
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 * @param {number[]} p
 * @param {number} [tol]
 */
export function isCardinalDiamondTip(n, p, tol = 2.5) {
  const v = diamondVertices(n)
  for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
    const t = /** @type {[number, number]} */ (v[f])
    if (Math.hypot(p[0] - t[0], p[1] - t[1]) <= tol) return true
  }
  return false
}

/**
 * Enter-port ranking after hard filters (clear / reserved / trunk / cross budget / collinear).
 * Lexico: cross → tipRank (0 = cardinal tip, 1 = slant) → bends → length.
 * Tip is a class: a free legal tip beats any same-cross slant even when the tip needs more
 * bends. Callers must already refuse illegal / occupied / crossing / pierce candidates.
 * @param {{ cross: number, tipRank: number, bends: number, len: number }} a
 * @param {{ cross: number, tipRank: number, bends: number, len: number }} b
 */
export function betterDiamondEnterCandidate(a, b) {
  if (a.cross !== b.cross) return a.cross < b.cross
  if (a.tipRank !== b.tipRank) return a.tipRank < b.tipRank
  if (a.bends !== b.bends) return a.bends < b.bends
  return a.len + 1e-6 < b.len
}

/**
 * Port candidates for one cardinal side: exact tip first (when free), then slant
 * stagger slots for multi-attach / fifth-edge exceptions. Callers filter by reservation.
 * @param {{ position?: { x: number, y: number }, x?: number, y?: number, data?: { w: number, h: number }, w?: number, h?: number }} n
 * @param {'N'|'E'|'S'|'W'} side
 * @param {{ includeTip?: boolean, staggerSlots?: number }} [opts]
 * @returns {number[][]}
 */
export function diamondSidePortCandidates(n, side, opts = {}) {
  const includeTip = opts.includeTip !== false
  const staggerSlots = opts.staggerSlots ?? 4
  /** @type {number[][]} */
  const out = []
  const v = diamondVertices(n)
  if (includeTip) out.push(/** @type {number[]} */ (v[side]))
  for (let slot = 0; slot < staggerSlots; slot += 1) {
    // count≥2 forces slant ports (never the tip) — used only after tip is considered.
    const p = staggerOnDiamondSide(n, side, slot, Math.max(slot + 1, 2))
    out.push(p)
  }
  return out
}

/**
 * Orthogonal candidates from a diamond outline port to a target box.
 * Enter is recomputed on a target face (side / top / bottom) — never by rewriting an old
 * 2-point path's second vertex in place.
 * @param {number[]} port
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {{ x: number, y: number, w: number, h: number } | null | undefined} [fromBox]
 * @param {number} [outGap]
 * @returns {number[][][]}
 */
export function orthoRoutesFromPort(port, b, fromBox = null, outGap = 28) {
  const bcx = b.x + b.w / 2
  const bcy = b.y + b.h / 2
  const toRight = port[0] <= bcx
  const enterW = /** @type {[number, number]} */ ([b.x, bcy])
  const enterE = /** @type {[number, number]} */ ([b.x + b.w, bcy])
  const enterN = /** @type {[number, number]} */ ([bcx, b.y])
  const enterS = /** @type {[number, number]} */ ([bcx, b.y + b.h])
  const sideEnter = toRight ? enterW : enterE
  const outToward = port[0] + (toRight ? outGap : -outGap)
  const outAway = port[0] + (toRight ? -outGap : outGap)
  const midX = (port[0] + sideEnter[0]) / 2
  /** @type {number[][][]} */
  const routes = [
    [port, [sideEnter[0], port[1]], sideEnter],
    [port, [port[0], sideEnter[1]], sideEnter],
    [port, [outToward, port[1]], [outToward, sideEnter[1]], sideEnter],
    [port, [outAway, port[1]], [outAway, sideEnter[1]], sideEnter],
    [port, [midX, port[1]], [midX, sideEnter[1]], sideEnter],
    [port, [port[0], bcy], sideEnter],
    // Enter top / bottom (useful when the target sits beside a crowded same-row sibling).
    [port, [port[0], enterN[1]], enterN],
    [port, [outToward, port[1]], [outToward, enterN[1]], enterN],
    [port, [port[0], enterS[1]], enterS],
    [port, [outToward, port[1]], [outToward, enterS[1]], enterS],
  ]
  if (Math.abs(port[1] - sideEnter[1]) < 1) routes.unshift([port, sideEnter])

  // Rail above / below source (and target) — clears same-row boxes that block a mid-Y run.
  const top = Math.min(fromBox ? fromBox.y : port[1], b.y)
  const bot = Math.max(fromBox ? fromBox.y + fromBox.h : port[1], b.y + b.h)
  for (const gap of [24, 40, 64, 88]) {
    const railAbove = top - gap
    const railBelow = bot + gap
    const enterTopish = toRight ? enterW : enterE
    routes.push(
      [port, [port[0], railAbove], [enterTopish[0], railAbove], enterTopish],
      [port, [port[0], railBelow], [enterTopish[0], railBelow], enterTopish],
      // Drop onto the target's near vertical face from the rail (matches classic outer U).
      [port, [port[0], railAbove], [b.x + (toRight ? 0 : b.w), railAbove], [b.x + (toRight ? 0 : b.w), bcy]],
      [port, [port[0], railBelow], [b.x + (toRight ? 0 : b.w), railBelow], [b.x + (toRight ? 0 : b.w), bcy]],
    )
  }
  return routes
}
