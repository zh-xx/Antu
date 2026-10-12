// ============================================================
//  src/renderers/procedure/flow/merge.js — links into one node that join into one trunk
//
//  Two links into the same node, drawn as a person draws them, meet before it and go in as one
//  line through one point: the second runs into the first and shares its last stretch. Without
//  that, the second has to find a port of its own, and when the node has none left on the near
//  side (a diamond has four points) it goes round the picture and comes in from behind.
//
//  The router may run along a link marked `share`; this checks that what it did reads as a
//  join: the shared part is the end of both lines (from where they meet to the node), the new
//  line does not cross the one it joins, and both go in at the same point.
//
//  Pure geometry: the unit tests pin it directly.
// ============================================================

const EPS = 0.5

const segsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q])
const isV = ([a, b]) => Math.abs(a[0] - b[0]) < EPS
const lo = (u, v) => Math.min(u, v)
const hi = (u, v) => Math.max(u, v)

/** How long two axis-parallel segments lie on one another (0 when they do not) */
function sharedLength(s, t) {
  if (isV(s) !== isV(t)) return 0
  const k = isV(s) ? 0 : 1
  if (Math.abs(s[0][k] - t[0][k]) >= EPS) return 0
  const m = 1 - k
  return Math.max(0, lo(hi(s[0][m], s[1][m]), hi(t[0][m], t[1][m])) - hi(lo(s[0][m], s[1][m]), lo(t[0][m], t[1][m])))
}

/** Whether two parallel segments run side by side, off one another but closer than GAP (they read as a double line) */
const GAP = 10
function runsBeside(s, t) {
  if (isV(s) !== isV(t)) return false
  const k = isV(s) ? 0 : 1
  const d = Math.abs(s[0][k] - t[0][k])
  if (d < EPS || d >= GAP) return false
  const m = 1 - k
  return lo(hi(s[0][m], s[1][m]), hi(t[0][m], t[1][m])) - hi(lo(s[0][m], s[1][m]), lo(t[0][m], t[1][m])) > EPS
}

/** Whether a point lies on a segment */
function onSeg([x, y], [a, b]) {
  return x >= lo(a[0], b[0]) - EPS && x <= hi(a[0], b[0]) + EPS && y >= lo(a[1], b[1]) - EPS && y <= hi(a[1], b[1]) + EPS
}

/** Whether two segments cross properly (not just touch at an end) */
function crossesProperly(s, t) {
  if (isV(s) === isV(t)) return false
  const [v, h] = isV(s) ? [s, t] : [t, s]
  const x = v[0][0]
  const y = h[0][1]
  return x > lo(h[0][0], h[1][0]) + EPS && x < hi(h[0][0], h[1][0]) - EPS && y > lo(v[0][1], v[1][1]) + EPS && y < hi(v[0][1], v[1][1]) - EPS
}

/**
 * Whether `pts` (a new link) and `other` (a link into the same node) read as two lines that join:
 * where they lie on one another it is the end of both, they go in at one point, and they do not
 * cross. Two links that do not touch at all pass too.
 */
export function joinsAsTrunk(pts, other) {
  const mine = segsOf(pts)
  const theirs = segsOf(other)
  if (mine.some((s) => theirs.some((t) => crossesProperly(s, t) || runsBeside(s, t)))) return false
  const shared = mine.map((s) => theirs.some((t) => sharedLength(s, t) > EPS))
  const first = shared.indexOf(true)
  if (first < 0) return true
  // The same end point, and every segment from the first shared one to the end lies on the other line
  const [ex, ey] = pts[pts.length - 1]
  const [ox, oy] = other[other.length - 1]
  if (Math.abs(ex - ox) >= EPS || Math.abs(ey - oy) >= EPS) return false
  if (!shared.slice(first).every(Boolean)) return false
  // ...wholly, not only in part: the line runs into the other one and stays on it (the first shared segment may
  // start before the join, on its way in)
  for (let k = first; k < mine.length; k += 1) {
    const s = mine[k]
    if ((k > first && !onAny(s[0], theirs)) || !onAny(s[1], theirs)) return false
  }
  return true
}

const onAny = (p, segs) => segs.some((t) => onSeg(p, t))

/** The part of `pts` before it joins any of the `others` (where its label goes); all of it when it joins none */
export function ownPart(pts, others) {
  const theirs = others.flatMap((o) => segsOf(o))
  const mine = segsOf(pts)
  const first = mine.findIndex((s) => theirs.some((t) => sharedLength(s, t) > EPS))
  if (first < 0) return pts
  // Up to where it meets the other line: the end of the shared stretch nearest its own start
  const s = mine[first]
  const k = isV(s) ? 1 : 0
  const dir = Math.sign(s[1][k] - s[0][k])
  let join = s[1][k]
  for (const t of theirs) {
    if (sharedLength(s, t) <= EPS) continue
    const near = dir > 0 ? lo(t[0][k], t[1][k]) : hi(t[0][k], t[1][k])
    join = dir > 0 ? Math.min(join, Math.max(near, s[0][k])) : Math.max(join, Math.min(near, s[0][k]))
  }
  const end = [...s[0]]
  end[k] = join
  return [...pts.slice(0, first + 1), end]
}
