// @ts-check
// ============================================================
//  hangSpineRoute.js — hang → spine orthogonal corridors (Mainline)
//
//  Extracted from mainline.js so routeHangToSpine and its helpers are the
//  production path used by layout *and* unit-tested without copy-paste forks.
// ============================================================

/** Clearance outside the hang box for a distant rejoin corridor */
export const OUTER_GAP = 28

/**
 * Axis-aligned segment vs rectangle: interior intersection (edge touch alone is not a hit).
 * `pad` shrinks the box (positive) so port stubs on the face are allowed.
 * @param {number[]} p
 * @param {number[]} q
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {number} [pad]
 */
export function segHitsBox(p, q, box, pad = 0.5) {
  const [x1, y1] = p
  const [x2, y2] = q
  const minx = Math.min(x1, x2)
  const maxx = Math.max(x1, x2)
  const miny = Math.min(y1, y2)
  const maxy = Math.max(y1, y2)
  const bx = box.x
  const by = box.y
  const bw = box.w
  const bh = box.h
  if (maxx < bx + pad || minx > bx + bw - pad || maxy < by + pad || miny > by + bh - pad) return false
  if (Math.abs(y1 - y2) < 0.5) {
    return y1 > by + pad && y1 < by + bh - pad && maxx > bx + pad && minx < bx + bw - pad
  }
  if (Math.abs(x1 - x2) < 0.5) {
    return x1 > bx + pad && x1 < bx + bw - pad && maxy > by + pad && miny < by + bh - pad
  }
  return false
}

/**
 * Every segment of an orthogonal polyline must clear every foreign placed box.
 * @param {number[][]} pts
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {number} [pad]
 */
export function pathClear(pts, placed, fromId, toId, pad = 0.5) {
  if (!placed || !pts?.length) return true
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (const [id, r] of placed) {
      if (id === fromId || id === toId) continue
      if (segHitsBox(pts[i], pts[i + 1], r, pad)) return false
    }
  }
  return true
}

/**
 * Preferred hang → spine rejoin: hang may use N/S. Leave the travel face, run in the hang
 * lane to the spine mid-height, enter the spine's hang-side face (1 bend).
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} hangOnRight
 */
export function hangLaneRejoin(a, b, hangOnRight) {
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const goingDown = bcy >= acy
  return [
    [acx, goingDown ? a.y + a.h : a.y],
    [acx, bcy],
    [hangOnRight ? b.x + b.w : b.x, bcy],
  ]
}

/**
 * Inward gutter: leave the face toward the spine, run between hang and trunk, enter spine side.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} hangOnRight
 */
export function gutterRejoin(a, b, hangOnRight) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const ax = hangOnRight ? a.x : a.x + a.w
  const bx = hangOnRight ? b.x + b.w : b.x
  if (Math.abs(acy - bcy) < 2) {
    return [
      [ax, acy],
      [bx, bcy],
    ]
  }
  const gutterX = (ax + bx) / 2
  return [
    [ax, acy],
    [gutterX, acy],
    [gutterX, bcy],
    [bx, bcy],
  ]
}

/**
 * Ensure a hang→spine polyline ends on the spine box face centre.
 * Alternate return rails (railY ≠ bcy) must not leave the last point floating on the
 * face-line extended above/below the box — that reads as a dangling arrow in the renderer.
 * @param {number[][]} pts
 * @param {{ x: number, y: number, w: number, h: number }} b spine
 * @param {boolean} hangOnRight
 * @returns {number[][]}
 */
export function attachSpineEntry(pts, b, hangOnRight) {
  if (!pts?.length) return pts
  const bcy = b.y + b.h / 2
  const faceX = hangOnRight ? b.x + b.w : b.x
  const last = pts[pts.length - 1]
  if (Math.abs(last[0] - faceX) < 0.5 && Math.abs(last[1] - bcy) < 0.5) return pts
  const out = pts.map((p) => p.slice())
  // Approach column sits just outside the spine face toward the hang, so the vertical
  // drop/rise to bcy does not run on the face itself (through stacked spine boxes).
  const approachX = hangOnRight ? faceX + 12 : faceX - 12
  if (Math.abs(last[1] - bcy) >= 0.5) {
    if (Math.abs(last[0] - faceX) < 0.5) {
      // Was ending on the extended face line — pull back to the approach column at railY.
      out[out.length - 1] = [approachX, last[1]]
    } else if (Math.abs(last[0] - approachX) >= 0.5) {
      out.push([approachX, last[1]])
    }
    out.push([approachX, bcy])
    out.push([faceX, bcy])
    return out
  }
  if (Math.abs(last[0] - faceX) >= 0.5) out.push([faceX, bcy])
  return out
}

/**
 * Outer corridor last resort: leave travel face (N/S), run outside the hang column, enter spine side.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} hangOnRight
 * @param {number} [depth]
 * @param {number} [railY] vertical rail y for the return (defaults to spine mid-height)
 */
export function outerCorridor(a, b, hangOnRight, depth = 0, railY = undefined) {
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const goingDown = bcy >= acy
  const leaveY = goingDown ? a.y + a.h : a.y
  const rail = railY === undefined ? bcy : railY
  const outer = hangOnRight
    ? Math.max(a.x + a.w, b.x + b.w) + OUTER_GAP + depth
    : Math.min(a.x, b.x) - OUTER_GAP - depth
  const faceX = hangOnRight ? b.x + b.w : b.x
  if (Math.abs(rail - bcy) < 0.5) {
    return [
      [acx, leaveY],
      [outer, leaveY],
      [outer, rail],
      [faceX, rail],
    ]
  }
  return attachSpineEntry(
    [
      [acx, leaveY],
      [outer, leaveY],
      [outer, rail],
    ],
    b,
    hangOnRight,
  )
}

/**
 * Search outer X and return-rail Y until the U clears every foreign box.
 * Prefer spine mid-height; else rails above/below hang and spine boxes.
 * When `others` is set, prefer a box-clear path with 0 edge crossings.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} hangOnRight
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {number} [maxDepth]
 * @param {number[][][] | null | undefined} [others]
 * @returns {number[][] | null}
 */
export function clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId, maxDepth = 16, others = null) {
  const bcy = b.y + b.h / 2
  const rails = [bcy]
  for (let k = 1; k <= 10; k += 1) {
    const gap = 20 + k * 16
    rails.push(Math.min(a.y, b.y) - gap, Math.max(a.y + a.h, b.y + b.h) + gap)
  }
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  for (const railY of rails) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const pts = outerCorridor(a, b, hangOnRight, d * 16, railY)
      if (!pathClear(pts, placed, fromId, toId)) continue
      if (!others) return pts
      const cross = pathCrossCount(pts, others)
      if (cross === 0) return pts
      if (cross < bestCross) {
        bestCross = cross
        best = pts
      }
    }
  }
  return others ? best : null
}

/**
 * Diamond hang→spine outer side: leave E/W (not N/S), escalate outward and return-rail Y until
 * leave/vertical/return clear every foreign box. Returns null when no clear channel exists.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} hangOnRight
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {number} [maxDepth]
 * @param {number[][][] | null | undefined} [others]
 * @returns {number[][] | null}
 */
export function diamondOuterSide(a, b, hangOnRight, placed = null, fromId = null, toId = null, maxDepth = 12, others = null) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const leaveX = hangOnRight ? a.x + a.w : a.x
  const spineFace = hangOnRight ? b.x + b.w : b.x
  const rails = [bcy]
  for (let k = 1; k <= 8; k += 1) {
    const gap = 20 + k * 16
    rails.push(Math.min(a.y, b.y) - gap, Math.max(a.y + a.h, b.y + b.h) + gap)
  }
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  for (const railY of rails) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const outer = hangOnRight ? leaveX + OUTER_GAP + d * 16 : leaveX - OUTER_GAP - d * 16
      const raw =
        Math.abs(railY - bcy) < 0.5
          ? [
              [leaveX, acy],
              [outer, acy],
              [outer, railY],
              [spineFace, railY],
            ]
          : attachSpineEntry(
              [
                [leaveX, acy],
                [outer, acy],
                [outer, railY],
              ],
              b,
              hangOnRight,
            )
      if (!pathClear(raw, placed, fromId, toId)) continue
      if (!others) return raw
      const cross = pathCrossCount(raw, others)
      if (cross === 0) return raw
      if (cross < bestCross) {
        bestCross = cross
        best = raw
      }
    }
  }
  return others ? best : null
}

/**
 * Outward corridor: leave the hang face away from the spine when clear.
 * @returns {number[][] | null}
 * @param {number[][][] | null | undefined} [others]
 */
export function interLaneCorridor(a, b, hangOnRight, placed, fromId, toId, others = null) {
  if (!placed) return null
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const hangOuter = hangOnRight ? a.x + a.w : a.x
  const lo = Math.min(acy, bcy)
  const hi = Math.max(acy, bcy)
  let nearestInner = hangOnRight ? Infinity : -Infinity
  let found = false
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    const further = hangOnRight ? r.x >= hangOuter - 1 : r.x + r.w <= hangOuter + 1
    if (!further) continue
    if (r.y + r.h <= lo + 0.5 || r.y >= hi - 0.5) {
      if (r.y + r.h <= a.y + 0.5 || r.y >= a.y + a.h - 0.5) continue
    }
    found = true
    if (hangOnRight) nearestInner = Math.min(nearestInner, r.x)
    else nearestInner = Math.max(nearestInner, r.x + r.w)
  }
  let mid
  if (found) {
    const gap = hangOnRight ? nearestInner - hangOuter : hangOuter - nearestInner
    if (gap < 8) return null
    mid = hangOnRight ? hangOuter + gap / 2 : hangOuter - gap / 2
  } else {
    mid = hangOnRight ? hangOuter + OUTER_GAP : hangOuter - OUTER_GAP
  }
  const spineFace = hangOnRight ? b.x + b.w : b.x
  const rails = [bcy]
  for (let k = 1; k <= 8; k += 1) {
    const gap = 20 + k * 16
    rails.push(Math.min(a.y, b.y) - gap, Math.max(a.y + a.h, b.y + b.h) + gap)
  }
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  for (const railY of rails) {
    const raw =
      Math.abs(railY - bcy) < 0.5
        ? [
            [hangOuter, acy],
            [mid, acy],
            [mid, railY],
            [spineFace, railY],
          ]
        : attachSpineEntry(
            [
              [hangOuter, acy],
              [mid, acy],
              [mid, railY],
            ],
            b,
            hangOnRight,
          )
    if (!pathClear(raw, placed, fromId, toId)) continue
    if (!others) return raw
    const cross = pathCrossCount(raw, others)
    if (cross === 0) return raw
    if (cross < bestCross) {
      bestCross = cross
      best = raw
    }
  }
  return others ? best : null
}

/** True when another box sits on the hang's vertical lane between leaveY and targetY. */
export function hangLaneBlocked(a, leaveY, targetY, placed, fromId, toId) {
  if (!placed) return false
  const acx = a.x + a.w / 2
  const lo = Math.min(leaveY, targetY)
  const hi = Math.max(leaveY, targetY)
  if (hi <= lo + 0.5) return false
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (Math.abs(r.x + r.w / 2 - acx) > r.w / 2 + 2) continue
    if (r.y + r.h > lo + 0.5 && r.y < hi - 0.5) return true
  }
  return false
}

/** True when a box sits on the inward gutter x between hang and spine over the y span. */
export function gutterBlocked(a, b, hangOnRight, placed, fromId, toId) {
  if (!placed) return false
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const ax = hangOnRight ? a.x : a.x + a.w
  const bx = hangOnRight ? b.x + b.w : b.x
  const gutterX = (ax + bx) / 2
  const lo = Math.min(acy, bcy)
  const hi = Math.max(acy, bcy)
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (r.x > gutterX + 2 || r.x + r.w < gutterX - 2) continue
    if (hi <= lo + 0.5) continue
    if (r.y + r.h > lo + 0.5 && r.y < hi - 0.5) return true
  }
  return false
}

/**
 * Straight side-to-side link between same-row boxes (0 bends). Does not check obstacles.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 */
export function sideHorizontal(a, b) {
  const ay = a.y + a.h / 2
  const by = b.y + b.h / 2
  if (a.x + a.w / 2 <= b.x + b.w / 2) {
    return [
      [a.x + a.w, ay],
      [b.x, by],
    ]
  }
  return [
    [a.x, ay],
    [b.x + b.w, by],
  ]
}

/** True when another box sits on the shared mid-row between a and b. */
export function rowBlocked(a, b, placed, fromId, toId) {
  if (!placed) return false
  const y = (a.y + a.h / 2 + b.y + b.h / 2) / 2
  const lo = Math.min(a.x + a.w, b.x + b.w)
  const hi = Math.max(a.x, b.x)
  if (hi <= lo + 0.5) return false
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (y <= r.y + 0.5 || y >= r.y + r.h - 0.5) continue
    if (r.x + r.w > lo + 0.5 && r.x < hi - 0.5) return true
  }
  return false
}

/**
 * Same-row route that clears foreign boxes: prefer 0-bend; else U above then below,
 * escalating the corridor offset until pathClear. Returns null if none clear.
 * When `others` is set, prefer a box-clear path with 0 edge crossings.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {number} [maxDepth]
 * @param {number[][][] | null | undefined} [others]
 * @returns {number[][] | null}
 */
export function clearSideHorizontal(a, b, placed, fromId, toId, maxDepth = 16, others = null) {
  const straight = sideHorizontal(a, b)
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  const consider = (pts) => {
    if (!pathClear(pts, placed, fromId, toId)) return false
    if (!others) return true
    const cross = pathCrossCount(pts, others)
    if (cross === 0) return true
    if (cross < bestCross) {
      bestCross = cross
      best = pts
    }
    return false
  }
  if (consider(straight)) return straight
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const aRight = a.x + a.w / 2 <= b.x + b.w / 2
  const ax = aRight ? a.x + a.w : a.x
  const bx = aRight ? b.x : b.x + b.w
  for (const preferAbove of [true, false]) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const gap = 24 + d * 16
      const rail = preferAbove
        ? Math.min(a.y, b.y) - gap
        : Math.max(a.y + a.h, b.y + b.h) + gap
      const pts = [
        [ax, acy],
        [ax, rail],
        [bx, rail],
        [bx, bcy],
      ]
      if (consider(pts)) return pts
    }
  }
  return others ? best : null
}

/**
 * Side-channel U with escalating depth until clear. PreferLeft chooses initial side.
 * When `others` is set, prefer a box-clear path with 0 edge crossings.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} preferLeft
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {number} [maxDepth]
 * @param {number[][][] | null | undefined} [others]
 * @returns {number[][] | null}
 */
export function clearSideChannel(a, b, preferLeft, placed, fromId, toId, maxDepth = 16, others = null) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  for (const left of preferLeft ? [true, false] : [false, true]) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const gap = 24 + d * 16
      const side = left ? Math.min(a.x, b.x) - gap : Math.max(a.x + a.w, b.x + b.w) + gap
      const pts = [
        [left ? a.x : a.x + a.w, acy],
        [side, acy],
        [side, bcy],
        [left ? b.x : b.x + b.w, bcy],
      ]
      if (!pathClear(pts, placed, fromId, toId)) continue
      if (!others) return pts
      const cross = pathCrossCount(pts, others)
      if (cross === 0) return pts
      if (cross < bestCross) {
        bestCross = cross
        best = pts
      }
    }
  }
  return others ? best : null
}

/** Orthogonal segment pair: true when a vertical and a horizontal properly cross. */
export function orthoSegsCross(a, b) {
  const [p, q] = a
  const [r, s] = b
  const av = Math.abs(p[0] - q[0]) < 0.5
  const bv = Math.abs(r[0] - s[0]) < 0.5
  if (av === bv) return false
  const [v0, v1, h0, h1] = av ? [p, q, r, s] : [r, s, p, q]
  return (
    v0[0] > Math.min(h0[0], h1[0]) + 0.5 &&
    v0[0] < Math.max(h0[0], h1[0]) - 0.5 &&
    h0[1] > Math.min(v0[1], v1[1]) + 0.5 &&
    h0[1] < Math.max(v0[1], v1[1]) - 0.5
  )
}

function segsOf(pts) {
  return pts.slice(1).map((q, i) => [pts[i], q])
}

/** How many proper orthogonal crossings `pts` has against other polylines. */
export function pathCrossCount(pts, others = []) {
  if (!pts?.length || !others?.length) return 0
  const mine = segsOf(pts)
  let n = 0
  for (const o of others) {
    if (!o?.length) continue
    for (const s of mine) {
      for (const t of segsOf(o)) {
        if (orthoSegsCross(s, t)) n += 1
      }
    }
  }
  return n
}

/** Max length treated as a short face stub / necessary attachment (not ambiguous ownership). */
export const COLLINEAR_ATTACH_TOL = 24
/** Overlaps at or above this length are reported when not a short attachment. */
export const COLLINEAR_AMBIGUOUS_MIN = 48
/**
 * Unrelated edges (no shared endpoint) that still share a rail for at least this long
 * are separated for ownership readability. Hard scanner fail stays at COLLINEAR_AMBIGUOUS_MIN;
 * this floor does not raise that threshold — it only drives repair of short residual jogs
 * left just under 48 (V10a H 29.4, B10 V 36, …).
 */
export const COLLINEAR_UNRELATED_READABILITY_MIN = 4

/**
 * Length of collinear axis-aligned overlap between two orthogonal segments (0 if not collinear).
 * @param {number[]} p
 * @param {number[]} q
 * @param {number[]} r
 * @param {number[]} s
 */
export function collinearOverlapLen(p, q, r, s) {
  const v1 = Math.abs(p[0] - q[0]) < 0.5
  const v2 = Math.abs(r[0] - s[0]) < 0.5
  if (v1 !== v2) return 0
  if (v1) {
    if (Math.abs(p[0] - r[0]) > 1) return 0
    const a0 = Math.min(p[1], q[1])
    const a1 = Math.max(p[1], q[1])
    const b0 = Math.min(r[1], s[1])
    const b1 = Math.max(r[1], s[1])
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
  }
  if (Math.abs(p[1] - r[1]) > 1) return 0
  const a0 = Math.min(p[0], q[0])
  const a1 = Math.max(p[0], q[0])
  const b0 = Math.min(r[0], s[0])
  const b1 = Math.max(r[0], s[0])
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

/**
 * Distance from point to the overlapping interval of two collinear segments (∞ if no overlap).
 * Used to recognize short necessary attachments near a shared endpoint.
 * @param {number[]} pt
 * @param {number[]} p
 * @param {number[]} q
 * @param {number[]} r
 * @param {number[]} s
 */
export function distToCollinearOverlap(pt, p, q, r, s) {
  const len = collinearOverlapLen(p, q, r, s)
  if (len <= 0) return Infinity
  const v = Math.abs(p[0] - q[0]) < 0.5
  if (v) {
    if (Math.abs(pt[0] - p[0]) > 1.5) return Infinity
    const lo = Math.max(Math.min(p[1], q[1]), Math.min(r[1], s[1]))
    const hi = Math.min(Math.max(p[1], q[1]), Math.max(r[1], s[1]))
    if (pt[1] >= lo - 0.5 && pt[1] <= hi + 0.5) return 0
    return Math.min(Math.abs(pt[1] - lo), Math.abs(pt[1] - hi))
  }
  if (Math.abs(pt[1] - p[1]) > 1.5) return Infinity
  const lo = Math.max(Math.min(p[0], q[0]), Math.min(r[0], s[0]))
  const hi = Math.min(Math.max(p[0], q[0]), Math.max(r[0], s[0]))
  if (pt[0] >= lo - 0.5 && pt[0] <= hi + 0.5) return 0
  return Math.min(Math.abs(pt[0] - lo), Math.abs(pt[0] - hi))
}

/**
 * Scan connection polylines for ambiguous collinear overlaps.
 * Distinguishes:
 * - shortNecessaryAttachment: shared endpoint + overlap near that point (≤ COLLINEAR_ATTACH_TOL)
 * - unrelatedOverlap: no shared endpoint, long coincidence (ownership unclear)
 * - branchSharedRail: same source, distinct leave ports, long shared segment
 * - sharedEndpointCorridor: shared endpoint but long overlap far from that point (e.g. opposite
 *   dir on same rail) — reported for readability, optional hard-fail via `strictCorridor`
 * @param {{ id: string, from: string, to: string, points: number[][] }[]} connections
 * @param {{ ambiguousMin?: number, attachTol?: number }} [opts]
 */
export function findCollinearAmbiguities(connections, opts = {}) {
  const ambiguousMin = opts.ambiguousMin ?? COLLINEAR_AMBIGUOUS_MIN
  const attachTol = opts.attachTol ?? COLLINEAR_ATTACH_TOL
  /** @type {string[]} */
  const unrelatedOverlaps = []
  /** @type {string[]} */
  const branchSharedRails = []
  /** @type {string[]} */
  const sharedEndpointCorridors = []
  /** @type {string[]} */
  const shortAttachments = []
  const cs = connections.filter((c) => c.points?.length >= 2)
  for (let i = 0; i < cs.length; i += 1) {
    for (let j = i + 1; j < cs.length; j += 1) {
      const a = cs[i]
      const b = cs[j]
      const a0 = a.points[0]
      const a1 = a.points[a.points.length - 1]
      const b0 = b.points[0]
      const b1 = b.points[b.points.length - 1]
      const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5
      /** @type {number[] | null} */
      let sharedPt = null
      if (near(a0, b0) || near(a0, b1)) sharedPt = a0
      else if (near(a1, b0) || near(a1, b1)) sharedPt = a1
      const sameSource = a.from === b.from
      const distinctLeave = sameSource && !near(a0, b0)
      for (let u = 0; u < a.points.length - 1; u += 1) {
        for (let v = 0; v < b.points.length - 1; v += 1) {
          const p = a.points[u]
          const q = a.points[u + 1]
          const r = b.points[v]
          const s = b.points[v + 1]
          const len = collinearOverlapLen(p, q, r, s)
          if (len < ambiguousMin) continue
          const tag = `${a.id}~${b.id}:${len.toFixed(1)}`
          if (sharedPt) {
            const d = distToCollinearOverlap(sharedPt, p, q, r, s)
            if (d <= attachTol) {
              shortAttachments.push(tag)
              continue
            }
            sharedEndpointCorridors.push(tag)
            continue
          }
          if (sameSource && distinctLeave) {
            branchSharedRails.push(tag)
            continue
          }
          unrelatedOverlaps.push(tag)
        }
      }
    }
  }
  return {
    unrelatedOverlaps: [...new Set(unrelatedOverlaps)],
    branchSharedRails: [...new Set(branchSharedRails)],
    sharedEndpointCorridors: [...new Set(sharedEndpointCorridors)],
    shortAttachments: [...new Set(shortAttachments)],
    /** Scanner tolerances for independent recomputation. */
    tolerances: { ambiguousMin, attachTol },
  }
}

/**
 * Wrap-around hang→spine: leave hang outer, rail above/below the whole placed set, run to the
 * far side of the spine, enter the opposite face. Used when same-side U corridors cannot avoid
 * both boxes and leave-edge crossings (dense nested hangs like L4).
 * @returns {number[][] | null}
 * @param {number[][][] | null | undefined} [others]
 */
export function clearWrapAround(a, b, hangOnRight, placed, fromId, toId, maxDepth = 24, others = null) {
  if (!placed) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [id, r] of placed) {
    if (id === fromId) continue
    minX = Math.min(minX, r.x)
    maxX = Math.max(maxX, r.x + r.w)
    minY = Math.min(minY, r.y)
    maxY = Math.max(maxY, r.y + r.h)
  }
  if (!Number.isFinite(minX)) return null
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const leaveTop = a.y
  const leaveBot = a.y + a.h
  const hangOuter = hangOnRight ? a.x + a.w : a.x
  const farFace = hangOnRight ? b.x : b.x + b.w // enter from the side opposite the hang
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  for (const preferAbove of [true, false]) {
    for (let d = 0; d <= maxDepth; d += 1) {
      // Keep wrap rails well clear of the placed bbox so downward/upward leaves of
      // neighbouring hangs are not pinned against the wrap (L4 horizontal n-7→n-8).
      const gap = 48 + d * 20
      const railY = preferAbove ? minY - gap : maxY + gap
      const outerHang = hangOnRight ? hangOuter + OUTER_GAP + d * 8 : hangOuter - OUTER_GAP - d * 8
      const outerFar = hangOnRight ? minX - OUTER_GAP - d * 8 : maxX + OUTER_GAP + d * 8
      const leaveY = preferAbove ? leaveTop : leaveBot
      const pts = [
        [acx, leaveY],
        [outerHang, leaveY],
        [outerHang, railY],
        [outerFar, railY],
        [outerFar, bcy],
        [farFace, bcy],
      ]
      if (!pathClear(pts, placed, fromId, toId)) continue
      if (!others) return pts
      const cross = pathCrossCount(pts, others)
      if (cross === 0) return pts
      if (cross < bestCross) {
        bestCross = cross
        best = pts
      }
    }
  }
  // Also try leaving from the outer side face (helps when N/S leave skims a neighbor).
  for (const preferAbove of [true, false]) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const gap = 48 + d * 20
      const railY = preferAbove ? minY - gap : maxY + gap
      const outerHang = hangOnRight ? hangOuter + OUTER_GAP + d * 8 : hangOuter - OUTER_GAP - d * 8
      const outerFar = hangOnRight ? minX - OUTER_GAP - d * 8 : maxX + OUTER_GAP + d * 8
      const pts = [
        [hangOuter, acy],
        [outerHang, acy],
        [outerHang, railY],
        [outerFar, railY],
        [outerFar, bcy],
        [farFace, bcy],
      ]
      if (!pathClear(pts, placed, fromId, toId)) continue
      if (!others) return pts
      const cross = pathCrossCount(pts, others)
      if (cross === 0) return pts
      if (cross < bestCross) {
        bestCross = cross
        best = pts
      }
    }
  }
  return others ? best : null
}

/** Path length (sum of segment lengths). Used to prefer short legal corridors. */
export function pathLength(pts) {
  if (!pts || pts.length < 2) return 0
  let n = 0
  for (let i = 0; i < pts.length - 1; i += 1) {
    n += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
  }
  return n
}

/** Orthogonal bend count (direction changes). */
export function pathBendCount(pts) {
  if (!pts || pts.length < 3) return 0
  let n = 0
  for (let i = 1; i < pts.length - 1; i += 1) {
    const dx1 = pts[i][0] - pts[i - 1][0]
    const dy1 = pts[i][1] - pts[i - 1][1]
    const dx2 = pts[i + 1][0] - pts[i][0]
    const dy2 = pts[i + 1][1] - pts[i][1]
    const a = Math.abs(dx1) > Math.abs(dy1) ? 'H' : 'V'
    const b = Math.abs(dx2) > Math.abs(dy2) ? 'H' : 'V'
    if (a !== b) n += 1
  }
  return n
}

/**
 * Best pathClear candidate among `candidates`, else null.
 * When `others` is provided: fewer crossings, then fewer bends, then shorter length
 * (rule-engine direction: validity first, then crossing, bend, length).
 * Without `others`: first clear candidate (legacy).
 * @param {Array<number[][] | null | undefined>} candidates
 * @param {number[][][] | null | undefined} [others] other edge polylines already routed
 */
export function firstClearPath(candidates, placed, fromId, toId, others = null) {
  /** @type {number[][] | null} */
  let best = null
  let bestCross = Infinity
  let bestBends = Infinity
  let bestLen = Infinity
  for (const pts of candidates) {
    if (!pts || pts.length < 2) continue
    if (!pathClear(pts, placed, fromId, toId)) continue
    if (!others) return pts
    const cross = pathCrossCount(pts, others)
    const bends = pathBendCount(pts)
    const len = pathLength(pts)
    if (
      cross < bestCross ||
      (cross === bestCross && bends < bestBends) ||
      (cross === bestCross && bends === bestBends && len < bestLen)
    ) {
      bestCross = cross
      bestBends = bends
      bestLen = len
      best = pts
    }
  }
  return others ? best : null
}

/**
 * Hang → spine corridors.
 * Decision sources (fromDiamond): clear inward gutter → clear outer diamond side →
 * clear outer U → inter-lane → opposite outer. Never legalize a blocked gutter (H1).
 * Non-diamond: hang-lane → inter-lane → gutter → outer.
 *
 * Contract: every returned polyline is pathClear-verified. Exhausted search escalates
 * outer depth, then clearSideChannel. If no clear corridor exists, returns **null** —
 * never an unchecked outerCorridor that can cut boxes while looking like success.
 * Callers / layout boundary must keep the edge (connectivity) via validated current-engine
 * full-layout fallback or an explicit residual diagnostic — not silent unsafe ink.
 *
 * @param {{ x: number, y: number, w: number, h: number }} a hang
 * @param {{ x: number, y: number, w: number, h: number }} b spine
 * @param {boolean} hangOnRight
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {boolean} [fromDiamond]
 * @param {number[][][] | null | undefined} [others] already-routed polylines (crossing preference)
 * @returns {number[][] | null}
 */
export function routeHangToSpine(a, b, hangOnRight, placed, fromId, toId, fromDiamond = false, others = null) {
  if (fromDiamond) {
    const candidates = []
    if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
      candidates.push(gutterRejoin(a, b, hangOnRight))
    }
    // Prefer true outer corridors before inter-lane: inter-lane often clears boxes yet
    // crosses the same-side leave hop (S3 / nested rejoins).
    candidates.push(diamondOuterSide(a, b, hangOnRight, placed, fromId, toId, 12, others))
    candidates.push(clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId, 16, others))
    candidates.push(interLaneCorridor(a, b, hangOnRight, placed, fromId, toId, others))
    candidates.push(clearOuterCorridor(a, b, !hangOnRight, placed, fromId, toId, 16, others))
    candidates.push(diamondOuterSide(a, b, !hangOnRight, placed, fromId, toId, 12, others))
    candidates.push(clearWrapAround(a, b, hangOnRight, placed, fromId, toId, 24, others))
    const clear = firstClearPath(candidates, placed, fromId, toId, others)
    if (clear) return clear
    // Exhausted primary depths: escalate until pathClear (no unchecked placeholder).
    const deep =
      diamondOuterSide(a, b, hangOnRight, placed, fromId, toId, 64, others) ||
      clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId, 64, others) ||
      clearWrapAround(a, b, hangOnRight, placed, fromId, toId, 64, others) ||
      diamondOuterSide(a, b, !hangOnRight, placed, fromId, toId, 64, others) ||
      clearOuterCorridor(a, b, !hangOnRight, placed, fromId, toId, 64, others)
    if (deep && pathClear(deep, placed, fromId, toId)) return deep
    const side = clearSideChannel(a, b, !hangOnRight, placed, fromId, toId, 64)
    if (side) return side
    // Exhausted: do not emit known-unsafe outerCorridor as success.
    return null
  }
  const bcy = b.y + b.h / 2
  const acy = a.y + a.h / 2
  const leaveY = bcy >= acy ? a.y + a.h : a.y
  const candidates = []
  if (!hangLaneBlocked(a, leaveY, bcy, placed, fromId, toId)) {
    candidates.push(hangLaneRejoin(a, b, hangOnRight))
  }
  // Prefer outer-face E/W leave (same helper as diamond) before N/S outer U: for a left hang
  // that is the free W face, which avoids crossing the parent's same-row leave (user S3 note;
  // also L1 step rejoins). Mirrored right hangs use E. Not fixture-hardcoded — hangOnRight.
  candidates.push(diamondOuterSide(a, b, hangOnRight, placed, fromId, toId, 12, others))
  candidates.push(clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId, 16, others))
  candidates.push(interLaneCorridor(a, b, hangOnRight, placed, fromId, toId, others))
  if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
    candidates.push(gutterRejoin(a, b, hangOnRight))
  }
  candidates.push(clearOuterCorridor(a, b, !hangOnRight, placed, fromId, toId, 16, others))
  candidates.push(diamondOuterSide(a, b, !hangOnRight, placed, fromId, toId, 12, others))
  candidates.push(clearWrapAround(a, b, hangOnRight, placed, fromId, toId, 24, others))
  const clear = firstClearPath(candidates, placed, fromId, toId, others)
  if (clear) return clear
  const deep =
    diamondOuterSide(a, b, hangOnRight, placed, fromId, toId, 64, others) ||
    clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId, 64, others) ||
    clearWrapAround(a, b, hangOnRight, placed, fromId, toId, 64, others) ||
    clearOuterCorridor(a, b, !hangOnRight, placed, fromId, toId, 64, others) ||
    clearSideChannel(a, b, !hangOnRight, placed, fromId, toId, 64)
  if (deep && pathClear(deep, placed, fromId, toId)) return deep
  return null
}
