// ============================================================
//  src/renderers/justification/tree/crossings.js — how badly a placement of nodes tangles its links
//
//  Used to choose among several layouts of one issue (layout.js). The links are taken as straight lines
//  between the node centres: cheap, and it ranks two placements the way the routed lines end up ranking
//  them. A line that runs through a node it does not join is counted too, since the router would have to
//  go round it and would cross something doing so.
// ============================================================

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

/** Whether segments ab and cd cross at a point inside both (touching at an end does not count) */
function cross(a, b, c, d) {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

/** Whether the segment ab passes through the inside of the rectangle r */
function through(a, b, r) {
  const inset = 2
  const x0 = r.x + inset
  const x1 = r.x + r.w - inset
  const y0 = r.y + inset
  const y1 = r.y + r.h - inset
  const inside = (p) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1
  if (inside(a) || inside(b)) return true
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  return corners.some((c, i) => cross(a, b, c, corners[(i + 1) % 4]))
}

/**
 * @param rects  Map of node id -> {x, y, w, h}
 * @param ends   [{from, to}] the links, by node id
 */
export function crossScore(rects, ends) {
  const mid = (id) => {
    const r = rects.get(id)
    return [r.x + r.w / 2, r.y + r.h / 2]
  }
  const lines = ends.map((e) => ({ e, a: mid(e.from), b: mid(e.to) }))
  let score = 0
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const p = lines[i]
      const q = lines[j]
      const shared = p.e.from === q.e.from || p.e.from === q.e.to || p.e.to === q.e.from || p.e.to === q.e.to
      if (!shared && cross(p.a, p.b, q.a, q.b)) score += 1
    }
    for (const [id, r] of rects) {
      if (id !== lines[i].e.from && id !== lines[i].e.to && through(lines[i].a, lines[i].b, r)) score += 1
    }
  }
  return score
}

/** How many times the routed lines (polylines of horizontal and vertical runs) cross one another */
export function routedCrossings(lines) {
  const segs = (pts) => pts.slice(1).map((q, i) => [pts[i], q])
  const isH = ([a, b]) => Math.abs(a[1] - b[1]) < 0.5
  const meet = (s, t) => {
    if (isH(s) === isH(t)) return false
    const [h, v] = isH(s) ? [s, t] : [t, s]
    const x = v[0][0]
    const y = h[0][1]
    return (
      x > Math.min(h[0][0], h[1][0]) + 1 &&
      x < Math.max(h[0][0], h[1][0]) - 1 &&
      y > Math.min(v[0][1], v[1][1]) + 1 &&
      y < Math.max(v[0][1], v[1][1]) - 1
    )
  }
  let n = 0
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (segs(lines[i]).some((s) => segs(lines[j]).some((t) => meet(s, t)))) n += 1
    }
  }
  return n
}
