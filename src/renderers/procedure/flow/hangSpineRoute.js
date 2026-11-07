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
 */
export function outerCorridor(a, b, hangOnRight, depth = 0) {
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const goingDown = bcy >= acy
  const leaveY = goingDown ? a.y + a.h : a.y
  const outer = hangOnRight
    ? Math.max(a.x + a.w, b.x + b.w) + OUTER_GAP + depth
    : Math.min(a.x, b.x) - OUTER_GAP - depth
  return [
    [acx, leaveY],
    [outer, leaveY],
    [outer, bcy],
    [hangOnRight ? b.x + b.w : b.x, bcy],
  ]
}

/**
 * Diamond hang→spine outer side: leave E/W (not N/S), escalate outward until leave/vertical/return
 * clear every foreign box. Returns null when no clear outer channel exists (honest failure).
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
  for (let d = 0; d <= maxDepth; d += 1) {
    const outer = hangOnRight ? leaveX + OUTER_GAP + d * 16 : leaveX - OUTER_GAP - d * 16
    const pts = [
      [leaveX, acy],
      [outer, acy],
      [outer, bcy],
      [spineFace, bcy],
    ]
    if (pathClear(pts, placed, fromId, toId)) return pts
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
  const pts = [
    [hangOuter, acy],
    [mid, acy],
    [mid, bcy],
    [spineFace, bcy],
  ]
  if (!pathClear(pts, placed, fromId, toId)) return null
  return pts
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
 * Hang → spine: hang-lane → between-lane → inward gutter → outer.
 * Decision sources skip hang-lane N/S leave (fromDiamond): prefer clear inward gutter, then
 * clear outward corridor, then validated diamond outer side. Never legalize a blocked gutter.
 * When every E/W channel fails, escalate to N/S outerCorridor (honest residual) only if clear,
 * else the furthest validated diamond attempt is impossible — return a far outerCorridor that
 * still may hit (caller polish may repair); prefer returning the first pathClear candidate.
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
    if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
      const g = gutterRejoin(a, b, hangOnRight)
      if (pathClear(g, placed, fromId, toId)) return g
    }
    const between = interLaneCorridor(a, b, hangOnRight, placed, fromId, toId)
    if (between) return between
    const outerSide = diamondOuterSide(a, b, hangOnRight, placed, fromId, toId)
    if (outerSide) return outerSide
    // Honest escalation: N/S outerCorridor when every E/W channel fails and that path clears.
    for (let d = 0; d <= 12; d += 1) {
      const oc = outerCorridor(a, b, hangOnRight, d * 16)
      if (pathClear(oc, placed, fromId, toId)) return oc
    }
    // No validated channel remains. Still must emit a polyline for layout — never re-enter a
    // known-blocked gutter (H1). Prefer the deepest E/W outer candidate (may still hit); the
    // caller/polish may repair. Blind unvalidated OUTER_GAP is not used as a "success".
    const deep = diamondOuterSide(a, b, hangOnRight, placed, fromId, toId, 40)
    if (deep) return deep
    // Emit deepest unchecked E/W geometry only as a last structural placeholder (ports E/W).
    const leaveX = hangOnRight ? a.x + a.w : a.x
    const outer = hangOnRight ? leaveX + OUTER_GAP + 40 * 16 : leaveX - OUTER_GAP - 40 * 16
    const acy2 = a.y + a.h / 2
    const bcy2 = b.y + b.h / 2
    return [
      [leaveX, acy2],
      [outer, acy2],
      [outer, bcy2],
      [hangOnRight ? b.x + b.w : b.x, bcy2],
    ]
  }
  const leaveY = bcy >= acy ? a.y + a.h : a.y
  if (!hangLaneBlocked(a, leaveY, bcy, placed, fromId, toId)) {
    return hangLaneRejoin(a, b, hangOnRight)
  }
  const between = interLaneCorridor(a, b, hangOnRight, placed, fromId, toId)
  if (between) return between
  if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
    return gutterRejoin(a, b, hangOnRight)
  }
  return outerCorridor(a, b, hangOnRight)
}
