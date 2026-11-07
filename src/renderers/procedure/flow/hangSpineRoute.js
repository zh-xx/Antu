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
  return [
    [acx, leaveY],
    [outer, leaveY],
    [outer, rail],
    [hangOnRight ? b.x + b.w : b.x, rail],
  ]
}

/**
 * Search outer X and return-rail Y until the U clears every foreign box.
 * Prefer spine mid-height; else rails above/below hang and spine boxes.
 * @returns {number[][] | null}
 */
export function clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId, maxDepth = 16) {
  const bcy = b.y + b.h / 2
  const rails = [bcy]
  for (let k = 1; k <= 10; k += 1) {
    const gap = 20 + k * 16
    rails.push(Math.min(a.y, b.y) - gap, Math.max(a.y + a.h, b.y + b.h) + gap)
  }
  for (const railY of rails) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const pts = outerCorridor(a, b, hangOnRight, d * 16, railY)
      if (pathClear(pts, placed, fromId, toId)) return pts
    }
  }
  return null
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
 * @returns {number[][] | null}
 */
export function diamondOuterSide(a, b, hangOnRight, placed = null, fromId = null, toId = null, maxDepth = 12) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const leaveX = hangOnRight ? a.x + a.w : a.x
  const spineFace = hangOnRight ? b.x + b.w : b.x
  const rails = [bcy]
  for (let k = 1; k <= 8; k += 1) {
    const gap = 20 + k * 16
    rails.push(Math.min(a.y, b.y) - gap, Math.max(a.y + a.h, b.y + b.h) + gap)
  }
  for (const railY of rails) {
    for (let d = 0; d <= maxDepth; d += 1) {
      const outer = hangOnRight ? leaveX + OUTER_GAP + d * 16 : leaveX - OUTER_GAP - d * 16
      const pts = [
        [leaveX, acy],
        [outer, acy],
        [outer, railY],
        [spineFace, railY],
      ]
      if (pathClear(pts, placed, fromId, toId)) return pts
    }
  }
  return null
}

/**
 * Outward corridor: leave the hang face away from the spine when clear.
 * @returns {number[][] | null}
 */
export function interLaneCorridor(a, b, hangOnRight, placed, fromId, toId) {
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
  for (const railY of rails) {
    const pts = [
      [hangOuter, acy],
      [mid, acy],
      [mid, railY],
      [spineFace, railY],
    ]
    if (pathClear(pts, placed, fromId, toId)) return pts
  }
  return null
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
 * @returns {number[][] | null}
 */
export function clearSideHorizontal(a, b, placed, fromId, toId, maxDepth = 16) {
  const straight = sideHorizontal(a, b)
  if (pathClear(straight, placed, fromId, toId)) return straight
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
      if (pathClear(pts, placed, fromId, toId)) return pts
    }
  }
  return null
}

/**
 * Side-channel U with escalating depth until clear. PreferLeft chooses initial side.
 * @returns {number[][] | null}
 */
export function clearSideChannel(a, b, preferLeft, placed, fromId, toId, maxDepth = 16) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
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
      if (pathClear(pts, placed, fromId, toId)) return pts
    }
  }
  return null
}

/**
 * First pathClear candidate among `candidates`, else null.
 * @param {Array<number[][] | null | undefined>} candidates
 */
export function firstClearPath(candidates, placed, fromId, toId) {
  for (const pts of candidates) {
    if (!pts || pts.length < 2) continue
    if (pathClear(pts, placed, fromId, toId)) return pts
  }
  return null
}

/**
 * Hang → spine: hang-lane → between-lane → inward gutter → outer.
 * Decision sources skip hang-lane N/S leave (fromDiamond): prefer clear inward gutter, then
 * clear outward corridor, then validated diamond outer side. Never legalize a blocked gutter.
 * Every returned polyline is pathClear when a clear channel exists; only if search is exhausted
 * do we emit a structural E/W placeholder (never a known-blocked gutter).
 *
 * @param {{ x: number, y: number, w: number, h: number }} a hang
 * @param {{ x: number, y: number, w: number, h: number }} b spine
 * @param {boolean} hangOnRight
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 * @param {boolean} [fromDiamond]
 */
export function routeHangToSpine(a, b, hangOnRight, placed, fromId, toId, fromDiamond = false) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  if (fromDiamond) {
    const candidates = []
    if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
      candidates.push(gutterRejoin(a, b, hangOnRight))
    }
    candidates.push(interLaneCorridor(a, b, hangOnRight, placed, fromId, toId))
    candidates.push(diamondOuterSide(a, b, hangOnRight, placed, fromId, toId))
    candidates.push(clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId))
    candidates.push(clearOuterCorridor(a, b, !hangOnRight, placed, fromId, toId))
    const clear = firstClearPath(candidates, placed, fromId, toId)
    if (clear) return clear
    // Exhausted: E/W structural placeholder — never re-enter known-blocked gutter (H1).
    const leaveX = hangOnRight ? a.x + a.w : a.x
    const outer = hangOnRight ? leaveX + OUTER_GAP + 40 * 16 : leaveX - OUTER_GAP - 40 * 16
    return [
      [leaveX, acy],
      [outer, acy],
      [outer, bcy],
      [hangOnRight ? b.x + b.w : b.x, bcy],
    ]
  }
  const leaveY = bcy >= acy ? a.y + a.h : a.y
  const candidates = []
  if (!hangLaneBlocked(a, leaveY, bcy, placed, fromId, toId)) {
    candidates.push(hangLaneRejoin(a, b, hangOnRight))
  }
  candidates.push(interLaneCorridor(a, b, hangOnRight, placed, fromId, toId))
  if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
    candidates.push(gutterRejoin(a, b, hangOnRight))
  }
  candidates.push(clearOuterCorridor(a, b, hangOnRight, placed, fromId, toId))
  candidates.push(clearOuterCorridor(a, b, !hangOnRight, placed, fromId, toId))
  const clear = firstClearPath(candidates, placed, fromId, toId)
  if (clear) return clear
  // Exhausted: deepest same-side outer (may still hit) over hang-lane through boxes.
  return outerCorridor(a, b, hangOnRight, 160)
}
