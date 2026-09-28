// ============================================================
//  src/renderers/procedure/flow/straighten.js — fewer bends after ELK
//
//  ELK's layered router attaches a link to the side of a node that faces the flow: out of the
//  bottom, into the top (vertical). So a link between two nodes that are not exactly in line is
//  always a Z (two bends), and a loop back is four bends. A person drawing a flowchart does it
//  differently: straight where it can be, and otherwise one bend, out of the side of a decision
//  and down into the next step — the order of preference the reader asked for.
//
//  So after ELK, every link is offered simpler routes, fewest bends first:
//    forward   0 bends  straight, when the two nodes overlap across the flow
//              1 bend   out of the source's side, then along into the target's top; or
//                       out of the source's bottom, then across into the target's side
//    back      1 bend   out of the source's side, then back into the target's bottom
//              2 bends  a U: out of the source's side, round, into the target's side
//  A route is taken only if it is clear: no segment through a node or a stage title, no
//  segment lying on another link, no more crossings than the route it replaces, and room for its
//  label beside it. Otherwise ELK's route stays. The result can only lose bends, never gain.
//
//  Ends always sit where a diamond has a point (the middle of a side), so a decision needs no
//  snapping here. Pure geometry: the unit tests pin it directly.
// ============================================================

/** Room kept between a link and a node it passes, and between a label and anything else */
const CLEAR = 8
const LABEL_CLEAR = 3
/** Two links running side by side closer than this read as one */
const PARALLEL_GAP = 12
/** A side exit needs this much room before it turns */
const MIN_RUN = 14
/** Distance of a U's far side from the nodes it goes round, and the step when that is taken */
const U_GAP = 20
const U_STEP = 10
const U_TRIES = 12

/** Number of bends of a polyline, collinear points not counted */
export function bendsOf(points) {
  let n = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const collinear = (px === cx && cx === nx) || (py === cy && cy === ny)
    if (!collinear) n += 1
  }
  return n
}

/**
 * How much a link bends, weighted: a bend on the main line costs most, one on a loop least; a
 * forward arrow that meets a diamond beside its point (on a slanted edge) costs like a bend,
 * because it reads as aimed at nothing. The layout keeps the placement with the lowest total.
 */
const WEIGHT = { main: 3, branch: 2, back: 1 }
export function linkCost(c, placed, diamonds, points = c.points) {
  if (points.length < 2) return 0
  let cost = bendsOf(points) * (WEIGHT[c.kind] ?? 1)
  if (c.kind !== 'back') {
    for (const [id, pt] of [
      [c.from, points[0]],
      [c.to, points[points.length - 1]],
    ]) {
      if (!diamonds.has(id)) continue
      const r = placed.get(id)
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      // The four points of a diamond lie on its two middle lines
      const atPoint = Math.abs(pt[0] - cx) < 1 || Math.abs(pt[1] - cy) < 1
      if (!atPoint) cost += WEIGHT[c.kind]
    }
  }
  return cost
}

const segmentsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q])
const lengthOf = (pts) => segmentsOf(pts).reduce((s, [p, q]) => s + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]), 0)

/** Does the axis-aligned segment p–q pass through the rectangle grown by m (touching the edge is not passing) */
function segHitsRect([p, q], r, m) {
  const x0 = Math.min(p[0], q[0])
  const x1 = Math.max(p[0], q[0])
  const y0 = Math.min(p[1], q[1])
  const y1 = Math.max(p[1], q[1])
  return x1 > r.x - m && x0 < r.x + r.w + m && y1 > r.y - m && y0 < r.y + r.h + m
}

const rectsOverlap = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m

/** Two segments on the same line, sharing more than a point */
function segsOverlap([a, b], [c, d]) {
  const aV = Math.abs(a[0] - b[0]) < 0.5
  const cV = Math.abs(c[0] - d[0]) < 0.5
  if (aV !== cV) return false
  const [k, s] = aV ? [0, 1] : [1, 0]
  if (Math.abs(a[k] - c[k]) >= PARALLEL_GAP) return false
  const lo = Math.max(Math.min(a[s], b[s]), Math.min(c[s], d[s]))
  const hi = Math.min(Math.max(a[s], b[s]), Math.max(c[s], d[s]))
  return hi - lo > 2
}

/** A proper crossing of two perpendicular segments (meeting at an end does not count) */
function segsCross([a, b], [c, d]) {
  const aV = Math.abs(a[0] - b[0]) < 0.5
  const cV = Math.abs(c[0] - d[0]) < 0.5
  if (aV === cV) return false
  const [v0, v1, h0, h1] = aV ? [a, b, c, d] : [c, d, a, b]
  const x = v0[0]
  const y = h0[1]
  return (
    x > Math.min(h0[0], h1[0]) + 0.5 &&
    x < Math.max(h0[0], h1[0]) - 0.5 &&
    y > Math.min(v0[1], v1[1]) + 0.5 &&
    y < Math.max(v0[1], v1[1]) - 0.5
  )
}

/**
 * @param {object[]} connections  from layout.js: { id, from, to, kind, points, label, labelAt, labelSize }
 * @param {Map<string,{x,y,w,h}>} placed  node boxes
 * @param {{x,y,w,h}[]} obstacles  other things a link or a label must not cross (stage titles)
 * @param {boolean} vertical
 * @param {Set<string>} diamonds  ids of decision nodes (a straight link meets one only at its point)
 * @returns the connections, each with its points and label box possibly replaced
 */
export function straighten(connections, placed, obstacles, vertical, diamonds = new Set()) {
  // Work in along/across coordinates: along is the direction the layers run
  const P = (a, c) => (vertical ? [c, a] : [a, c])
  const box = (id) => {
    const r = placed.get(id)
    const [a0, c0, al, ac] = vertical ? [r.y, r.x, r.h, r.w] : [r.x, r.y, r.w, r.h]
    return { a0, a1: a0 + al, am: a0 + al / 2, c0, c1: c0 + ac, cm: c0 + ac / 2 }
  }
  const nodeRects = [...placed.entries()].map(([id, r]) => ({ id, ...r }))

  const labelRectOf = (c) =>
    c.labelAt && c.labelSize ? { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height } : null

  const clearOfNodes = (pts, from, to) =>
    segmentsOf(pts).every((s, i, all) =>
      nodeRects.every((r) => {
        // The first segment leaves its source and the last one enters its target: those two
        // touch their own node by construction
        if ((i === 0 && r.id === from) || (i === all.length - 1 && r.id === to)) return true
        return !segHitsRect(s, r, r.id === from || r.id === to ? 0 : CLEAR)
      }),
    )
  const clearOfObstacles = (pts) => segmentsOf(pts).every((s) => obstacles.every((o) => !segHitsRect(s, o, 2)))

  const candidatesFor = (c) => {
    const S = box(c.from)
    const T = box(c.to)
    const list = []
    if (c.kind !== 'back') {
      // 0 bends: an across value both nodes reach (a diamond only at its point)
      const within = (b, id, x) =>
        diamonds.has(id) ? Math.abs(x - b.cm) < 1 : x >= b.c0 + CLEAR && x <= b.c1 - CLEAR
      const lo = Math.max(S.c0, T.c0)
      const hi = Math.min(S.c1, T.c1)
      for (const x of [S.cm, T.cm, (lo + hi) / 2]) {
        if (T.a0 > S.a1 && within(S, c.from, x) && within(T, c.to, x)) list.push([P(S.a1, x), P(T.a0, x)])
      }
      // Where a link may meet a box's top or bottom: its middle, or a quarter out either way
      // (so two links into one box need not share its middle); a diamond only at its point
      const spots = (b, id) => (diamonds.has(id) ? [b.cm] : [b.cm, b.cm - (b.c1 - b.c0) / 4, b.cm + (b.c1 - b.c0) / 4])
      // 1 bend: out of the side, along into the top
      for (const x of spots(T, c.to)) {
        const side = x > S.cm ? 1 : -1
        if ((side > 0 ? x >= S.c1 + MIN_RUN : x <= S.c0 - MIN_RUN) && T.a0 > S.am + MIN_RUN) {
          list.push([P(S.am, side > 0 ? S.c1 : S.c0), P(S.am, x), P(T.a0, x)])
        }
      }
      // 1 bend: out of the bottom, across into the side
      for (const x of spots(S, c.from)) {
        const tx = x > T.cm ? T.c1 : T.c0
        if ((x > T.cm ? x >= T.c1 + MIN_RUN : x <= T.c0 - MIN_RUN) && T.am > S.a1 + MIN_RUN) {
          list.push([P(S.a1, x), P(T.am, x), P(T.am, tx)])
        }
      }
      // 2 bends: a Z from a proper spot to a proper spot, crossing over at one of a few levels.
      // Same bends as ELK's own, but never out of a diamond's slanted edge.
      if (T.a0 - S.a1 > MIN_RUN * 2) {
        const levels = [0.5, 0.25, 0.75].map((t) => S.a1 + MIN_RUN + (T.a0 - S.a1 - MIN_RUN * 2) * t)
        for (const sx of spots(S, c.from)) {
          for (const tx of spots(T, c.to)) {
            if (Math.abs(sx - tx) < 1) continue
            for (const a of levels) list.push([P(S.a1, sx), P(a, sx), P(a, tx), P(T.a0, tx)])
          }
        }
      }
    } else if (T.a1 < S.a0) {
      // 0 bends: straight back, where the two overlap across the flow. A loop may meet a diamond
      // on a slanted edge (a dashed line into its side reads as "back to this question"), so
      // its end slides onto the outline there; not too far out, where the edge is nearly flat.
      const edgeOf = (b, id, x, top) => {
        if (!diamonds.has(id)) return top ? b.a0 : b.a1
        const dy = ((b.a1 - b.a0) / 2) * (1 - Math.abs(x - b.cm) / ((b.c1 - b.c0) / 2))
        return top ? b.am - dy : b.am + dy
      }
      const reach = (b, id, x) =>
        diamonds.has(id) ? Math.abs(x - b.cm) <= (b.c1 - b.c0) * 0.35 : x >= b.c0 + CLEAR && x <= b.c1 - CLEAR
      const lo = Math.max(S.c0, T.c0)
      const hi = Math.min(S.c1, T.c1)
      const xs = [(lo + hi) / 2]
      for (let x = lo + CLEAR; x <= hi - CLEAR; x += 6) xs.push(x)
      for (const x of xs) {
        if (reach(S, c.from, x) && reach(T, c.to, x)) list.push([P(edgeOf(S, c.from, x, true), x), P(edgeOf(T, c.to, x, false), x)])
      }
      // 1 bend: out of the side, across, up into a diamond's lower slanted edge (its points
      // are often all taken: in from above, out to "yes" and to "no")
      if (diamonds.has(c.to)) {
        // Every few pixels along both lower edges, clear of the bottom point; the gap a loop
        // has to rise through can be narrow
        const w = T.c1 - T.c0
        const xs = []
        for (let t = 0.04; t <= 0.35; t += 0.02) xs.push(T.cm - w * t, T.cm + w * t)
        for (const x of xs) {
          const side = x > S.cm ? 1 : -1
          if (side > 0 ? x < S.c1 + MIN_RUN : x > S.c0 - MIN_RUN) continue
          list.push([P(S.am, side > 0 ? S.c1 : S.c0), P(S.am, x), P(edgeOf(T, c.to, x, false), x)])
        }
      }
      // 1 bend: out of the side, back into the bottom
      const side = T.cm > S.cm ? 1 : -1
      if (side > 0 ? T.cm >= S.c1 + MIN_RUN : T.cm <= S.c0 - MIN_RUN) {
        list.push([P(S.am, side > 0 ? S.c1 : S.c0), P(S.am, T.cm), P(T.a1, T.cm)])
      }
      // 1 bend: out of the top, across into the side
      if (S.cm > T.cm ? S.cm >= T.c1 + MIN_RUN : S.cm <= T.c0 - MIN_RUN) {
        list.push([P(S.a0, S.cm), P(T.am, S.cm), P(T.am, S.cm > T.cm ? T.c1 : T.c0)])
      }
      // 2 bends: a U round the outside, on either side, as close in as is clear
      for (const s of [-1, 1]) {
        const base = s > 0 ? Math.max(S.c1, T.c1) : Math.min(S.c0, T.c0)
        for (let k = 0; k < U_TRIES; k += 1) {
          const x = base + s * (U_GAP + k * U_STEP)
          const ex = s > 0 ? S.c1 : S.c0
          const tx = s > 0 ? T.c1 : T.c0
          list.push([P(S.am, ex), P(S.am, x), P(T.am, x), P(T.am, tx)])
        }
      }
    }
    return list
  }
  /**
   * One attempt. `others(c)` are the links c is judged against. With `loopsLast`, forward links
   * are routed as if the loops were not there yet, and each loop is then fitted round them: a
   * rectify-and-retry pair (a decision down to "rectify", and "rectify" back up) otherwise
   * blocks itself, the loop sitting on the one short route its forward link needed. If a loop
   * then finds no clear route, the attempt fails and the caller tries without.
   */
  const attempt = (loopsLast) => {
    const out = connections.map((c) => ({ ...c }))
    const settled = new Set(out.filter((c) => !(loopsLast && c.kind === 'back')))
    const others = (self) => out.filter((o) => o !== self && settled.has(o))

    const crossingsWith = (pts, self) =>
      others(self).reduce(
        (n, o) => n + segmentsOf(pts).reduce((k, s) => k + segmentsOf(o.points).filter((t) => segsCross(s, t)).length, 0),
        0,
      )
    const liesOnAnother = (pts, self) =>
      others(self).some((o) => segmentsOf(pts).some((s) => segmentsOf(o.points).some((t) => segsOverlap(s, t))))
    const runsThroughALabel = (pts, self) =>
      others(self).some((o) => {
        const lr = labelRectOf(o)
        return lr && segmentsOf(pts).some((s) => segHitsRect(s, lr, 1))
      })

    // Where the label can go beside a route: along each segment, near its start and at its
    // middle, on either side. The first spot clear of everything wins.
    const placeLabel = (c, pts, keepCurrent = false) => {
      if (!c.labelSize) return { ok: true, at: null }
      const { width: w, height: h } = c.labelSize
      const blocked = (r) =>
        nodeRects.some((n) => rectsOverlap(r, n, LABEL_CLEAR)) ||
        obstacles.some((o) => rectsOverlap(r, o, LABEL_CLEAR)) ||
        others(c).some((o) => {
          const lr = labelRectOf(o)
          return (lr && rectsOverlap(r, lr, LABEL_CLEAR)) || segmentsOf(o.points).some((s) => segHitsRect(s, r, LABEL_CLEAR))
        }) ||
        segmentsOf(pts).some((s) => segHitsRect(s, r, 1))
      // The label ELK chose is kept while it is still clear
      const cur = labelRectOf(c)
      if (cur && keepCurrent && !blocked(cur)) return { ok: true, at: c.labelAt }
      for (const [p, q] of segmentsOf(pts)) {
        const horizontal = Math.abs(p[1] - q[1]) < 0.5
        const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
        const need = horizontal ? w : h
        if (len < need + 8) continue
        const dir = horizontal ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1])
        for (const t of [6, (len - need) / 2]) {
          for (const side of [-1, 1]) {
            let r
            if (horizontal) {
              const x = dir > 0 ? p[0] + t : p[0] - t - w
              r = { x, y: side < 0 ? p[1] - 4 - h : p[1] + 4, w, h }
            } else {
              const y = dir > 0 ? p[1] + t : p[1] - t - h
              r = { x: side < 0 ? p[0] - 4 - w : p[0] + 4, y, w, h }
            }
            if (!blocked(r)) return { ok: true, at: { x: r.x, y: r.y } }
          }
        }
      }
      return { ok: false }
    }

    const fits = (c, pts) =>
      clearOfNodes(pts, c.from, c.to) && clearOfObstacles(pts) && !liesOnAnother(pts, c) && !runsThroughALabel(pts, c)

    // Take a route that runs through other links' labels, moving each of those labels to
    // another clear spot beside its own link. All or nothing: returns an undo, or null (and
    // nothing changed) if one of them has nowhere to go.
    const takeMovingLabels = (c, pts) => {
      const blocking = others(c).filter((o) => {
        const lr = labelRectOf(o)
        return lr && segmentsOf(pts).some((s) => segHitsRect(s, lr, 1))
      })
      const saved = { points: c.points, labelAt: c.labelAt, moved: blocking.map((o) => [o, o.labelAt]) }
      const undo = () => {
        c.points = saved.points
        c.labelAt = saved.labelAt
        for (const [m, at] of saved.moved) m.labelAt = at
      }
      c.points = pts
      for (const o of blocking) {
        o.labelAt = null
        const spot = placeLabel(o, o.points)
        if (!spot.ok) {
          undo()
          return null
        }
        o.labelAt = spot.at
      }
      return undo
    }

    // Try the simpler routes for c. `must`: its current route no longer fits, so any clear
    // route will do, fewest crossings first.
    const improve = (c, must) => {
      const cost = linkCost(c, placed, diamonds)
      const was = crossingsWith(c.points, c)
      const len = lengthOf(c.points)
      const options = candidatesFor(c)
        .map((pts) => ({ pts, cost: linkCost(c, placed, diamonds, pts), len: lengthOf(pts) }))
        .filter((o) => must || (o.cost < cost && o.len <= len * 1.6 + 40))
        .map((o) => ({ ...o, cross: crossingsWith(o.pts, c) }))
        .sort((a, b) => (must ? a.cross - b.cross : 0) || a.cost - b.cost || a.len - b.len)
      for (const o of options) {
        if (!must && o.cross > was) continue
        if (!clearOfNodes(o.pts, c.from, c.to) || !clearOfObstacles(o.pts) || liesOnAnother(o.pts, c)) continue
        const undo = takeMovingLabels(c, o.pts)
        if (!undo) continue
        const label = placeLabel(c, o.pts)
        if (!label.ok) {
          undo()
          continue
        }
        if (label.at) c.labelAt = label.at
        return true
      }
      return false
    }

    // Main line first, it is what the reader follows; then the branches, then the loops. A
    // link is judged against the others as they are now, so a pass that changed something runs
    // again: a sibling freed by it may now find its short route.
    const rank = { main: 0, branch: 1, back: 2 }
    const order = [...out].sort((a, b) => rank[a.kind] - rank[b.kind])
    const pass = (list) => {
      for (let n = 0, changed = true; changed && n < 4; n += 1) {
        changed = false
        for (const c of list) if (c.points.length >= 2 && linkCost(c, placed, diamonds) > 0 && improve(c, false)) changed = true
      }
    }
    pass(order.filter((c) => settled.has(c)))
    if (loopsLast) {
      for (const c of order.filter((o) => !settled.has(o))) {
        settled.add(c)
        const ok = fits(c, c.points) && placeLabel(c, c.points, true)
        if (ok?.ok) {
          if (ok.at) c.labelAt = ok.at
        } else if (!improve(c, true)) {
          return null
        }
      }
      pass(order)
    }
    return out
  }

  return attempt(true) ?? attempt(false)
}
