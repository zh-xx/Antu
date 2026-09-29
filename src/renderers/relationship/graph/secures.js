// ============================================================
//  src/renderers/relationship/graph/secures.js — where a guarantee is tied to the claim it secures
//
//  A guarantee secures one particular claim (spec/relationship/schema-draft.md §4.4), and the
//  reader has to see which. The guarantee is drawn from the guarantor to the creditor; this finds
//  the point on the claim's own line nearest to the middle of the guarantee's line, where a short
//  tie is drawn between the two. Pure geometry, so a unit test can pin it.
// ============================================================

const segsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q])

/** The middle of a polyline: halfway along its length */
export function midpointOf(points) {
  const segs = segsOf(points)
  const total = segs.reduce((n, [p, q]) => n + Math.hypot(q[0] - p[0], q[1] - p[1]), 0)
  let left = total / 2
  for (const [p, q] of segs) {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (left <= len && len > 0) {
      const f = left / len
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
    }
    left -= len
  }
  return points[0]
}

/** The point on a polyline nearest to `pt` */
export function nearestOn(points, pt) {
  let best = null
  for (const [p, q] of segsOf(points)) {
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const len2 = dx * dx + dy * dy
    const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - p[0]) * dx + (pt[1] - p[1]) * dy) / len2))
    const at = [p[0] + dx * f, p[1] + dy * f]
    const d = Math.hypot(at[0] - pt[0], at[1] - pt[1])
    if (!best || d < best.d) best = { at, d }
  }
  return best
}

/**
 * The ties to draw: for each guarantee that names a claim, from the middle of its line to the
 * nearest point on the claim's line, when that is near enough to read as a tie.
 * @returns {{ id: string, from: number[], to: number[] }[]}
 */
export function securesTies(connections, maxDist = 140) {
  const byRelation = new Map(connections.map((c) => [c.relationId, c]))
  const ties = []
  for (const c of connections) {
    if (!c.secures || c.points.length < 2) continue
    const claim = byRelation.get(c.secures)
    if (!claim || claim.points.length < 2) continue
    const from = midpointOf(c.points)
    const near = nearestOn(claim.points, from)
    // Far away, the tie would be a long slanting line across the picture and say less than it costs
    if (near && near.d <= maxDist) ties.push({ id: c.id, claimId: claim.id, from, to: near.at })
  }
  return ties
}

/**
 * What looking at one entity brings out: the relations that touch it, the claims those of its guarantees
 * secure (so the reader sees what a guarantee is for), and every entity on the end of any of those.
 * Everything else fades. Pure, so the link layer and the entities agree, and a unit test can pin it.
 * @returns {{ lines: Set<string>, entities: Set<string> }}  relation ids and entity ids
 */
export function lookedAt(connections, entityId) {
  const lines = new Set(connections.filter((c) => c.from === entityId || c.to === entityId).map((c) => c.relationId))
  for (const c of connections) if (lines.has(c.relationId) && c.secures) lines.add(c.secures)
  const entities = new Set([entityId])
  for (const c of connections) if (lines.has(c.relationId)) [c.from, c.to].forEach((id) => entities.add(id))
  return { lines, entities }
}
