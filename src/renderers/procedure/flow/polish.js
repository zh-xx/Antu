// ============================================================
//  src/renderers/procedure/flow/polish.js — the last passes over a laid-out flowchart's links
//
//  After the nodes are placed and every link has a route, a person drawing the chart would still tidy it: a box that
//  a line comes down into off its middle is moved under the line; a line out of a diamond downward leaves by its lower
//  point; a step of a few pixels is drawn out straight; a line that runs along a stage box's edge, crosses another
//  line, goes round the picture or comes into its node from behind is routed again (joining a line into the same node
//  where that reads better, merge.js); and a label left on a line or a box is placed again.
//
//  Both layouts use it: the column layout (columns.js, in its frame, where the flow runs down) and the single-graph
//  layout (layout.js, turned into the same frame when the picture runs left to right).
//
//  ctx: { placed: Map<id, {x,y,w,h}> (moved in place), connections (their points replaced), diamonds: Set<id>,
//         titles: rects no line may cross, boxes: the stage boxes, borders: their edges, within(c): the box link c
//         stays in, or null, boxOf(id): the box node id stays in, or null }
// ============================================================

import { routeLink, runsAlongBorder } from './router.js'
import { bendsOf } from './straighten.js'
import { joinsAsTrunk, ownPart } from './merge.js'
import { PAD, STAGE_PAD } from './metrics.js'

/** Who gives way when two links cross: the loop first, the main line last */
export const GIVE_WAY = { back: 0, branch: 1, main: 2 }

/** In px of line: what a bend costs when two routes of one link are compared, and coming into a node from behind */
const ROUTE_BEND = 150
const ROUTE_BEHIND = 400
const ROUTE_CROSS = 600

/** Whether a route comes into its target from the side away from its source (it went past and came back) */
function entersFromBehind(pts, a, b) {
  if (pts.length < 2) return false
  const [p, q] = pts.slice(-2)
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  if (Math.abs(p[1] - q[1]) < 0.5) return q[0] < p[0] ? acx < b.x : acx > b.x + b.w
  return q[1] < p[1] ? acy < b.y : acy > b.y + b.h
}

/** How far a route goes past both its ends (the outside of the two boxes), in px; past by more than OVERSHOOT reads as a detour */
const OVERSHOOT = 40
function overshoot(pts, a, b) {
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  return Math.max(
    0,
    Math.max(...xs) - Math.max(a.x + a.w, b.x + b.w),
    Math.min(a.x, b.x) - Math.min(...xs),
    Math.max(...ys) - Math.max(a.y + a.h, b.y + b.h),
    Math.min(a.y, b.y) - Math.min(...ys),
  )
}

/** The length of a polyline */
const lengthOf = (pts) => pts.slice(1).reduce((s, q, i) => s + Math.abs(q[0] - pts[i][0]) + Math.abs(q[1] - pts[i][1]), 0)

/** How many times a polyline crosses the given links */
function crossingsOf(points, links) {
  const cross = ([a, b], [c, d]) => {
    const av = Math.abs(a[0] - b[0]) < 0.5
    const cv = Math.abs(c[0] - d[0]) < 0.5
    if (av === cv) return false
    const [v0, v1, h0, h1] = av ? [a, b, c, d] : [c, d, a, b]
    return (
      v0[0] > Math.min(h0[0], h1[0]) + 0.5 &&
      v0[0] < Math.max(h0[0], h1[0]) - 0.5 &&
      h0[1] > Math.min(v0[1], v1[1]) + 0.5 &&
      h0[1] < Math.max(v0[1], v1[1]) - 0.5
    )
  }
  const mine = segsOf(points)
  return links.reduce((n, o) => n + mine.reduce((k, s) => k + segsOf(o.points).filter((t) => cross(s, t)).length, 0), 0)
}

const overlaps = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
const segHits = ([p, q], r, m) =>
  Math.max(p[0], q[0]) > r.x - m && Math.min(p[0], q[0]) < r.x + r.w + m && Math.max(p[1], q[1]) > r.y - m && Math.min(p[1], q[1]) < r.y + r.h + m
const segsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q])

/** Whether two axis-parallel segments lie on one another for some length */
function linesShare([a, b], [c, d]) {
  if (a[0] === b[0] && c[0] === d[0] && a[0] === c[0]) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 0.5
  if (a[1] === b[1] && c[1] === d[1] && a[1] === c[1]) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 0.5
  return false
}

/** Whether two rectangles come within `m` of each other */
function rectsOverlapAt(a, b, m) {
  return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
}

/**
 * The routing of one link among the others: a route of its own, or one that joins another forward link into the same
 * node where that reads better (merge.js). Returns { routeFor, joinable, routeScore, labelRect }.
 */
export function linkRouting(ctx) {
  const { placed, diamonds, titles = [], borders = [], within = () => null, boxes = [] } = ctx
  const nodeRects = [...placed.values()]
  const labelRect = (c) => (c.labelAt ? { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height } : null)
  // Two forward links into one node may join into one trunk (a loop, drawn dashed, keeps its own line)
  const isLoop = (g) => g.isBack ?? g.kind === 'back'
  const joinable = (g, c) => c.to === g.to && !isLoop(g) && c.kind !== 'back'
  // How a route reads: its length, a bend as a good stretch of line, coming in from behind the node worse still
  const routeScore = (pts, g) =>
    lengthOf(pts) + ROUTE_BEND * bendsOf(pts) + (!isLoop(g) && entersFromBehind(pts, placed.get(g.from), placed.get(g.to)) ? ROUTE_BEHIND : 0)
  // A route for link g (a group or a link already drawn) among the links drawn so far: of its own, or joining
  // another forward link into the same node where that reads better (merge.js). `routes`: the links it must keep
  // clear of; `taken`: more end points it may not use
  const routeFor = (g, routes, taken = []) => {
    const others = routes.filter((c) => c !== g)
    const labels = others.map(labelRect).filter(Boolean)
    const route = (merge) =>
      routeLink({
        from: placed.get(g.from),
        to: placed.get(g.to),
        fromDiamond: diamonds.has(g.from),
        toDiamond: diamonds.has(g.to),
        nodes: nodeRects,
        blocks: [...titles, ...labels],
        routes: others.map((c) => ({ points: c.points, share: merge && joinable(g, c) })),
        taken,
        inAt: merge ? others.filter((c) => joinable(g, c)).map((c) => c.points[c.points.length - 1]) : undefined,
        join: merge,
        soft: within(g) ? undefined : boxes,
        borders,
        bounds: within(g),
      })
    const plain = route(false)
    // Joining is tried only where a route of its own reads badly (it is a second search)
    const S = placed.get(g.from)
    const T = placed.get(g.to)
    const fine = plain && !entersFromBehind(plain, S, T) && overshoot(plain, S, T) <= OVERSHOOT && bendsOf(plain) < 3
    const merged = !fine && others.some((c) => joinable(g, c)) ? route(true) : null
    const joins = merged && others.every((c) => !joinable(g, c) || joinsAsTrunk(merged, c.points))
    // Joining another line is taken only where it reads better than a route of its own
    return joins && (!plain || routeScore(merged, g) < routeScore(plain, g)) ? merged : plain
  }
  return { routeFor, joinable, routeScore, labelRect }
}

/** The tidying passes, in order (see the top of this file). Changes ctx.placed and ctx.connections in place */
export function polishLinks(ctx) {
  const { placed, connections, diamonds, titles = [], borders = [], within = () => null, boxOf = () => null } = ctx
  const nodeRects = [...placed.values()]
  const { routeFor, joinable, routeScore, labelRect } = linkRouting(ctx)

  // A node that one straight line comes down into, off its middle (or from the slanted side of a diamond): moved under
  // the line, with the straight chain below it, when there is room, so the line leaves a diamond by its point and meets
  // the middle of the top it enters, as a person would draw it. Nodes beside it, other lines and the stage box's edge
  // decide whether there is room; where there is none the line stays as the router drew it
  // A line leaving a node that moves sideways by dx keeps its far end: its first segment gives way (a vertical one is
  // moved with its turn, a horizontal one is made longer or shorter, never reversed). A line entering one is the same
  // read from the other end
  const moveStart = (o, dx) => {
    const q = o.points.map((pt) => [...pt])
    if (q.length < 2) return null
    if (q[0][0] === q[1][0]) {
      if (q.length < 3 || q[1][1] !== q[2][1]) return null
      q[0][0] += dx
      q[1][0] += dx
      if (Math.sign(q[2][0] - q[1][0]) !== Math.sign(o.points[2][0] - o.points[1][0]) || q[2][0] === q[1][0]) return null
    } else if (q[0][1] === q[1][1]) {
      q[0][0] += dx
      if (Math.sign(q[1][0] - q[0][0]) !== Math.sign(o.points[1][0] - o.points[0][0]) || q[1][0] === q[0][0]) return null
    } else return null
    return q
  }
  const moveEnd = (o, dx) => {
    const back = moveStart({ points: [...o.points].reverse() }, dx)
    return back ? back.reverse() : null
  }
  const segmentsClear = (pts, rects) => segsOf(pts).every((sg) => rects.every((r) => !segHits(sg, r, 4)))
  const isVertical = (c) => c.points.length === 2 && c.points[0][0] === c.points[1][0]
  // A line that is straight but for a step of a few px: it goes with the box it leads to (the step is drawn out afterwards)
  const isNearVertical = (c) => {
    const q = c.points
    return isVertical(c) || (q.length === 4 && q[0][0] === q[1][0] && q[1][1] === q[2][1] && q[2][0] === q[3][0] && Math.abs(q[1][0] - q[2][0]) <= 8)
  }

  // What it takes to move node `id` sideways by dx: the nodes below it joined by one straight vertical line each move
  // with it (their lines too); every other line at them gives way at the near end. `inLink` (when the node's own line in
  // gives way too) is moved with it. null when some line cannot give way
  const planShift = (id, dx, inLink, skip) => {
    const chain = [id]
    const dxs = [dx]
    const chainLinks = new Set()
    const adapted = new Map()
    if (inLink) {
      const pts = moveEnd(inLink, dx)
      if (!pts) return null
      adapted.set(inLink, pts)
    }
    for (let k = 0; k < chain.length; k += 1) {
      const m = chain[k]
      for (const o of connections) {
        if (o === skip || o === inLink) continue
        if (o.to === m && !chainLinks.has(o)) return null
        if (o.from !== m) continue
        if (o.kind !== 'back' && isNearVertical(o) && connections.filter((q) => q.to === o.to).length === 1) {
          chainLinks.add(o)
          if (chain.includes(o.to)) continue
          chain.push(o.to)
          // Below a diamond the box follows the diamond's point, not the place the line happened to leave by
          const S = placed.get(m)
          const T = placed.get(o.to)
          dxs.push(diamonds.has(m) ? S.x + S.w / 2 + dxs[k] - (T.x + T.w / 2) : dxs[k])
        } else {
          const pts = moveStart(o, dxs[k])
          if (!pts) return null
          adapted.set(o, pts)
        }
      }
    }
    return { dx, dxs, chain, rects: chain.map((n) => placed.get(n)), chainLinks, adapted }
  }
  // Whether a plan has room: inside its stage box, clear of every node it does not move, of the stage titles, of other
  // lines and labels, with its adapted lines still clear of the nodes
  const roomFor = (plan, others, skip) => {
    const { chain, rects, chainLinks, adapted } = plan
    // Every node at the place it will stand: this plan's and the pushed ones' shifted, the rest where they are
    const shifted = new Map()
    rects.forEach((r, n) => shifted.set(r, plan.dxs[n]))
    for (const q of others) q.rects.forEach((r, n) => shifted.set(r, q.dxs[n]))
    const finalOf = (r) => (shifted.has(r) ? { x: r.x + shifted.get(r), y: r.y, w: r.w, h: r.h } : r)
    const after = nodeRects.map((r) => ({ orig: r, now: finalOf(r) }))
    const live = (o) => o !== skip && !chainLinks.has(o) && !adapted.has(o) && !others.some((q) => q.chainLinks.has(o) || q.adapted.has(o))
    return (
      rects.every((r, n) => {
        const to = finalOf(r)
        const box = boxOf(chain[n])
        if (box && (to.x < box.x + STAGE_PAD || to.x + to.w > box.x + box.w - STAGE_PAD)) return false
        if (after.some((q) => !rects.includes(q.orig) && rectsOverlapAt(to, q.now, 14))) return false
        if (titles.some((q) => rectsOverlapAt(to, q, 4))) return false
        if (connections.some((o) => live(o) && segsOf(o.points).some((sg) => segHits(sg, to, 2)))) return false
        return !connections.some((o) => live(o) && labelRect(o) && rectsOverlapAt(to, labelRect(o), 4))
      }) &&
      [...adapted.entries()].every(
        ([o, pts]) =>
          segmentsClear(pts, after.filter((q) => q.orig !== placed.get(o.from) && q.orig !== placed.get(o.to)).map((q) => q.now)) &&
          crossingsOf(pts, connections.filter((q) => live(q))) <= crossingsOf(o.points, connections.filter((q) => live(q))),
      )
    )
  }
  const applyPlan = (plan) => {
    plan.rects.forEach((r, n) => {
      r.x += plan.dxs[n]
    })
    for (const o of plan.chainLinks) {
      const n = plan.chain.indexOf(o.from)
      if (diamonds.has(o.from)) {
        // Straight down from the point of the diamond to the box below it
        const S = placed.get(o.from)
        const T = placed.get(o.to)
        o.points = [[S.x + S.w / 2, S.y + S.h], [S.x + S.w / 2, T.y]]
      } else o.points = o.points.map(([px, py]) => [px + plan.dxs[n], py])
      if (o.labelAt) o.labelAt = { x: o.labelAt.x + plan.dxs[n], y: o.labelAt.y }
    }
    for (const [o, pts] of plan.adapted) o.points = pts
  }

  const alignDown = () => {
    let moved = false
    for (const c of connections) {
      // A straight vertical line, or a bent one that a shift would straighten: a Z (down, across, down: a jog) or an L
      // (down, then across into the side of the box below)
      const isZ =
        (c.points.length === 4 && c.points[0][0] === c.points[1][0] && c.points[1][1] === c.points[2][1] && c.points[2][0] === c.points[3][0]) ||
        (c.points.length === 3 && c.points[0][0] === c.points[1][0] && c.points[1][1] === c.points[2][1])
      if (c.kind === 'back' || !(isVertical(c) || isZ)) continue
      const S = placed.get(c.from)
      const T = placed.get(c.to)
      if (!S || !T || connections.filter((o) => o.to === c.to).length !== 1) continue
      const fromDiamond = diamonds.has(c.from)
      // The only line out of a box leaves by its middle; one of several keeps the place the router gave it
      const onlyOut = connections.filter((o) => o.from === c.from && o.kind !== 'back').length === 1
      const x = fromDiamond || onlyOut ? S.x + S.w / 2 : c.points[0][0]
      const startY = fromDiamond ? S.y + S.h : c.points[0][1]
      const dx = x - (T.x + T.w / 2)
      const atVertex = !fromDiamond || Math.abs(c.points[0][1] - startY) < 0.5
      if (Math.abs(dx) < 0.5 && atVertex) continue
      const endY = isVertical(c) || c.points.length === 4 ? c.points[c.points.length - 1][1] : T.y
      if (Math.abs(dx) < 0.5) {
        c.points = [[x, startY], [x, endY]]
        moved = true
        continue
      }
      const plan = planShift(c.to, dx, null, c)
      if (!plan) continue
      // A node in the way (a sibling beside it) is pushed aside by what it takes to clear it, when it can give way
      const pushed = []
      const to = { x: T.x + dx, y: T.y, w: T.w, h: T.h }
      let blocked = false
      for (const q of nodeRects) {
        if (plan.rects.includes(q) || !rectsOverlapAt(to, q, 14)) continue
        const id = [...placed.keys()].find((k) => placed.get(k) === q)
        const ins = connections.filter((o) => o.to === id)
        if (!id || ins.length !== 1 || ins[0].kind === 'back' || diamonds.has(id)) {
          blocked = true
          break
        }
        const need = dx < 0 ? to.x - 14 - (q.x + q.w) : to.x + to.w + 14 - q.x
        const shift = dx < 0 ? Math.min(0, need) : Math.max(0, need)
        const pq = planShift(id, shift, ins[0], c)
        if (!pq || !roomFor(pq, [plan], c)) {
          blocked = true
          break
        }
        pushed.push(pq)
      }
      if (blocked || !roomFor(plan, pushed, c)) continue
      applyPlan(plan)
      for (const pq of pushed) applyPlan(pq)
      c.points = [[x, startY], [x, endY]]
      moved = true
    }
    return moved
  }
  for (let pass = 0; pass < 3 && alignDown(); pass += 1);

  // A line that leaves a diamond downward from its slanted side (the router aimed it at the box below) is made to leave by
  // the diamond's lower point, with a short jog under it where the box stands off the point: it reads as leaving the point
  for (const c of connections) {
    if (c.kind === 'back' || !diamonds.has(c.from) || c.points.length < 2) continue
    const S = placed.get(c.from)
    const [p0, p1] = c.points
    const bottom = S.y + S.h
    const cx = S.x + S.w / 2
    if (p0[0] !== p1[0] || p1[1] <= p0[1] || p0[1] >= bottom - 1.5 || p0[1] < S.y + S.h / 2 || p1[1] - bottom < 24) continue
    const g = Math.min(14, (p1[1] - bottom) / 2)
    const pts = Math.abs(p0[0] - cx) < 4 ? [[cx, bottom], ...c.points.slice(1)] : [[cx, bottom], [cx, bottom + g], [p0[0], bottom + g], ...c.points.slice(1)]
    const others = connections.filter((o) => o !== c)
    if (crossingsOf(pts, others) > crossingsOf(c.points, others)) continue
    if (segsOf(pts).some((sg, i, all) => nodeRects.some((r) => r !== S && r !== placed.get(c.to) && segHits(sg, r, 2)) && i < all.length)) continue
    if (others.some((o) => segsOf(o.points).some((sg) => segsOf(pts).slice(0, 3).some((sc) => linesShare(sg, sc))))) continue
    c.points = pts
  }

  // A step of a few pixels in a line (a run, a jog of 8 px or less across it, a run on the same way) is a rounding
  // of two things that nearly line up: it is taken out by moving the part of the line before it, or the part after
  // it, by the jog, where the end that moves stays on its box's side (a diamond only at its point), the line stays
  // clear of the nodes and of the other lines, and it crosses no more of them. Either way, in a line down the stage
  // or across between stages
  const onFace = (pt, id, k) => {
    const r = placed.get(id)
    // k: the axis the end moved along (0 across a top or bottom, 1 up or down a side)
    if (diamonds.has(id)) return Math.abs(pt[k] - (k === 0 ? r.x + r.w / 2 : r.y + r.h / 2)) < 0.5
    return k === 0 ? pt[0] >= r.x + 8 && pt[0] <= r.x + r.w - 8 : pt[1] >= r.y + 8 && pt[1] <= r.y + r.h - 8
  }
  const tidy = (pts) => pts.filter((q, i) => i === 0 || i === pts.length - 1 || !(pts[i - 1][0] === q[0] && q[0] === pts[i + 1][0]) && !(pts[i - 1][1] === q[1] && q[1] === pts[i + 1][1])).filter((q, i, all) => i === 0 || q[0] !== all[i - 1][0] || q[1] !== all[i - 1][1])
  for (let pass = 0; pass < 2; pass += 1) {
    for (const c of connections) {
      const others = connections.filter((o) => o !== c)
      // A line joined by another, or joining one, keeps its shape (the join would come apart)
      if (others.some((o) => o.to === c.to && segsOf(o.points).some((t) => segsOf(c.points).some((sg) => linesShare(sg, t))))) continue
      for (let i = 1; i < c.points.length - 2; i += 1) {
        const q = c.points
        const [a0, a1, b1, b0] = [q[i - 1], q[i], q[i + 1], q[i + 2]]
        const k = a1[0] === b1[0] ? 1 : 0 // the jog runs along axis k
        const jog = b1[k] - a1[k]
        if (Math.abs(jog) < 0.5 || Math.abs(jog) > 8) continue
        // The runs either side go the same way, across the jog
        if (a0[k] !== a1[k] || b1[k] !== b0[k] || Math.sign(a1[1 - k] - a0[1 - k]) !== Math.sign(b0[1 - k] - b1[1 - k])) continue
        const shift = (pts, from, to, d) => pts.map((pt, j) => (j >= from && j <= to ? (k === 0 ? [pt[0] + d, pt[1]] : [pt[0], pt[1] + d]) : pt))
        const tries = [shift(q, 0, i, jog), shift(q, i + 1, q.length - 1, -jog)]
        const ok = (pts, movedEnd) => {
          const end = movedEnd === 'start' ? pts[0] : pts[pts.length - 1]
          if (!onFace(end, movedEnd === 'start' ? c.from : c.to, k)) return false
          if (segsOf(pts).some((sg, j, all) => nodeRects.some((r) => !(j === 0 && r === placed.get(c.from)) && !(j === all.length - 1 && r === placed.get(c.to)) && segHits(sg, r, r === placed.get(c.from) || r === placed.get(c.to) ? -0.5 : 2)))) return false
          if (others.some((o) => segsOf(o.points).some((t) => segsOf(pts).some((sg) => linesShare(sg, t))))) return false
          return crossingsOf(pts, others) <= crossingsOf(q, others)
        }
        const pick = [ok(tries[0], 'start') && tries[0], ok(tries[1], 'end') && tries[1]].find(Boolean)
        if (!pick) continue
        c.points = tidy(pick)
        break
      }
    }
  }

  // A link ELK routed inside a stage may still run along the edge of the box (a loop round the
  // outside of the content sits exactly one padding in): routed afresh, inside the box, off the
  // edge, if the router finds such a route
  for (const c of connections) {
    const hugs = c.points.slice(1).some((q, i) => runsAlongBorder(c.points[i][0], c.points[i][1], q[0], q[1], borders))
    if (!hugs) continue
    const others = connections.filter((o) => o !== c)
    const labels = others.map(labelRect).filter(Boolean)
    const pts = routeLink({
      from: placed.get(c.from),
      to: placed.get(c.to),
      fromDiamond: diamonds.has(c.from),
      toDiamond: diamonds.has(c.to),
      nodes: nodeRects,
      blocks: [...titles, ...labels],
      routes: others.map((o) => ({ points: o.points })),
      borders,
      bounds: within(c),
    })
    if (!pts || crossingsOf(pts, others) > crossingsOf(c.points, others)) continue
    c.points = pts
    if (c.labelSize) c.labelAt = placeLabel(pts, c.labelSize, nodeRects, [...titles, ...labels], others, borders)
  }

  // How a route of link c reads among the others, as one number (the lower the better): its length, its bends, coming
  // into its node from behind, going past both its ends, and every link it crosses. Every reroute below is kept only
  // when it lowers this, so a crossing is not traded for a long way round, nor a bend for a detour
  const scoreOf = (c, pts, others) => routeScore(pts, c) + overshoot(pts, placed.get(c.from), placed.get(c.to)) + ROUTE_CROSS * crossingsOf(pts, others)
  const reroute = (c) => {
    const others = connections.filter((o) => o !== c)
    const pts = routeFor(c, connections)
    if (!pts || scoreOf(c, pts, others) >= scoreOf(c, c.points, others)) return
    c.points = pts
    if (c.labelSize) {
      const labels = others.map(labelRect).filter(Boolean)
      c.labelAt = placeLabel(ownPart(pts, others.filter((o) => joinable(c, o)).map((o) => o.points)), c.labelSize, nodeRects, [...titles, ...labels], others, borders)
    }
  }

  // A link that crosses another is routed afresh. Loops first, then branches, the main line last: a loop is the one
  // to give way, so the main line keeps the direct route
  const byGiveWay = [...connections].sort((a, b) => GIVE_WAY[a.kind] - GIVE_WAY[b.kind])
  for (const c of byGiveWay) {
    if (crossingsOf(c.points, connections.filter((o) => o !== c)) > 0) reroute(c)
  }

  // A link that still reads badly (it comes into its node from behind, goes well past both its ends, or turns three
  // times or more) is routed again the same way
  for (const c of byGiveWay) {
    if (c.kind === 'back') continue
    const S = placed.get(c.from)
    const T = placed.get(c.to)
    if (entersFromBehind(c.points, S, T) || overshoot(c.points, S, T) > OVERSHOOT || bendsOf(c.points) >= 3) reroute(c)
  }

  // Last of all: a label that ended up on another link (links moved after it was placed) is
  // placed again, beside its own link
  for (const c of connections) {
    const r = labelRect(c)
    if (!r) continue
    const others = connections.filter((o) => o !== c)
    if (!others.some((o) => segsOf(o.points).some((sg) => segHits(sg, r, 2))) && !nodeRects.some((n) => rectsOverlapAt(r, n, 2))) continue
    const labels = others.map(labelRect).filter(Boolean)
    c.labelAt = placeLabel(c.points, c.labelSize, nodeRects, [...titles, ...labels], others, borders)
  }

}

/**
 * A spot for a label beside its route: along each segment, the longest first, near the start or
 * in the middle, on either side; clear of nodes, other labels, titles and every link.
 */
export function placeLabel(points, size, nodeRects, blocks, links, borders = [], opts = {}) {
  const { width: w, height: h } = size
  // What is wrong with a spot, weighted: 0 is clear. Past the top or left of the picture (the
  // content grows right and down only) or over a node is worst; over another link or label, or
  // on a box's edge (it would read as the box's), next; touching its own link, least.
  const badness = (r) =>
    (r.x < PAD / 2 || r.y < PAD / 2 ? 100 : 0) +
    nodeRects.filter((n) => overlaps(r, n, 3)).length * 50 +
    blocks.filter((b) => overlaps(r, b, 3)).length * 20 +
    links.filter((c) => segsOf(c.points).some((s) => segHits(s, r, 3))).length * 10 +
    borders.filter((s) => segHits(s, r, 3)).length * 5 +
    (segsOf(points).some((s) => segHits(s, r, 1)) ? 30 : 0)
  // Every spot beside every long enough segment: the middle first, then near the ends, then
  // every few pixels along; tight to the line, then a little further off
  let best = null
  for (const [p, q] of segsOf(points)) {
    const horizontal = Math.abs(p[1] - q[1]) < 0.5
    const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
    const need = horizontal ? w : h
    if (len < need + 8) continue
    const dir = horizontal ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1])
    const spots = [(len - need) / 2, 6, len - need - 6]
    for (let t = 6; t <= len - need - 6; t += 8) spots.push(t)
    for (const off of [4, 14]) {
      for (const t of spots) {
        for (const side of [1, -1]) {
          const r = horizontal
            ? { x: dir > 0 ? p[0] + t : p[0] - t - w, y: side < 0 ? p[1] - off - h : p[1] + off, w, h }
            : { x: side < 0 ? p[0] - off - w : p[0] + off, y: dir > 0 ? p[1] + t : p[1] - t - h, w, h }
          const bad = badness(r)
          if (bad === 0) return { x: r.x, y: r.y }
          // Longer segments first on a tie: a label reads with the long run of its line
          if (!best || bad < best.bad || (bad === best.bad && len > best.len)) best = { bad, len, x: r.x, y: r.y }
        }
      }
    }
  }
  // Where no spot beside the line is clear (a crowded corridor), a diagram may allow the label ON its
  // line: the middle of a segment, the label's own background hiding the line under it. It only wins
  // over a beside spot that is worse than this one, and only where the segment is longer than the label.
  if (opts.onLine) {
    for (const [p, q] of segsOf(points)) {
      const horizontal = Math.abs(p[1] - q[1]) < 0.5
      const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
      if (len < (horizontal ? w : h) + 8) continue
      const r = { x: (p[0] + q[0]) / 2 - w / 2, y: (p[1] + q[1]) / 2 - h / 2, w, h }
      const bad = badness(r) - 30 + 4
      if (!best || bad < best.bad) best = { bad, len, x: r.x, y: r.y }
    }
  }
  if (best) return { x: best.x, y: best.y }
  // No segment long enough: beside the middle of the longest one
  const [p, q] = segsOf(points).sort(
    (a, b) => Math.abs(b[1][0] - b[0][0]) + Math.abs(b[1][1] - b[0][1]) - (Math.abs(a[1][0] - a[0][0]) + Math.abs(a[1][1] - a[0][1])),
  )[0]
  return { x: Math.max(PAD / 2, (p[0] + q[0]) / 2 + 4), y: Math.max(PAD / 2, (p[1] + q[1]) / 2 - h / 2) }
}
