// ============================================================
//  src/renderers/procedure/flow/router.js — an orthogonal router for links ELK does not route
//
//  In the column layout (layout.js) each stage is laid out by ELK on its own, so a link from one
//  stage to another, and a rule's link to the end it leads to, has no route from ELK. This finds
//  one: the route with the fewest bends, then the shortest, that
//    - passes through no node (with room to spare) and no stage title,
//    - runs over no condition label,
//    - lies on no other link (running side by side closer than PARALLEL_GAP reads as one line),
//      unless the caller allows the two to share (rule links into one end merge into one trunk),
//    - crosses as few other links as it can.
//
//  How: a grid made of the coordinates that matter (every obstacle's edges with the clearance
//  added, the ports, the middles between them), and Dijkstra over (grid point, heading). A turn
//  costs as much as a long detour, so "straight, else one bend" wins over "shorter".
//
//  Ports are the middles of a node's sides (where a diamond has its points) and, on a box, a
//  quarter out either way on its top and bottom. A link leaves forwards and arrives from
//  before: out of the bottom or a side, into the top or a side; the other way round costs extra
//  but is allowed (a loop back up).
//
//  Coordinates are the layout's frame: the flow runs down (+y). Pure geometry, unit-tested.
// ============================================================

/** Room kept between a link and a node it passes */
const CLEAR = 10
/** Two links closer than this, side by side, read as one */
export const PARALLEL_GAP = 10
/** What a bend costs, in pixels of length: more than any detour on one screen */
const BEND = 600
/** What crossing another link costs: more than two bends, so a detour always beats a crossing */
const CROSS = 1400
/** An off-centre port costs a little: the middle of a side is where a link is expected */
const QUARTER = 16
/** Ports: leaving through the top or arriving through the bottom goes against the flow */
/** The straight run kept out of and into a node: the first grid line clear of it, longer than the arrowhead (7) */
const END_RUN = CLEAR + 1

const PORT_COST = { out: { bottom: 0, right: 40, left: 40, top: 700 }, in: { top: 0, left: 40, right: 40, bottom: 700 } }

// Headings: 0 east, 1 south, 2 west, 3 north
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

const hitsRect = (x0, y0, x1, y1, r, m) =>
  Math.max(x0, x1) > r.x - m && Math.min(x0, x1) < r.x + r.w + m && Math.max(y0, y1) > r.y - m && Math.min(y0, y1) < r.y + r.h + m

/** The ports of a node box: [x, y, side, offCentre] */
function portsOf(r, diamond, sidePorts = false) {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const list = [
    [cx, r.y, 'top'],
    [cx, r.y + r.h, 'bottom'],
    [r.x, cy, 'left'],
    [r.x + r.w, cy, 'right'],
  ]
  if (!diamond) {
    for (const f of [0.25, 0.75]) {
      list.push([r.x + r.w * f, r.y, 'top', true], [r.x + r.w * f, r.y + r.h, 'bottom', true])
    }
    // A diagram whose links leave and arrive on the sides as much as top and bottom asks for a
    // quarter port there too: with one port a side takes one link, and the next one has to go round
    if (sidePorts) {
      for (const f of [0.25, 0.75]) {
        list.push([r.x, r.y + r.h * f, 'left', true], [r.x + r.w, r.y + r.h * f, 'right', true])
      }
    }
  }
  return list
}
const OUTWARD = { top: 3, bottom: 1, left: 2, right: 0 }

/** A route running along a box edge, closer than this, reads as part of the box */
export const BORDER_GAP = 10

/** Does the axis-aligned segment run along one of the edges (parallel, closer than BORDER_GAP)? */
export function runsAlongBorder(x0, y0, x1, y1, borders) {
  const horizontal = Math.abs(y0 - y1) < 0.5
  for (const [[bx0, by0], [bx1, by1]] of borders) {
    const bh = Math.abs(by0 - by1) < 0.5
    if (bh !== horizontal) continue
    if (horizontal) {
      if (Math.abs(by0 - y0) >= BORDER_GAP) continue
      if (Math.min(Math.max(x0, x1), Math.max(bx0, bx1)) - Math.max(Math.min(x0, x1), Math.min(bx0, bx1)) > 0.5) return true
    } else {
      if (Math.abs(bx0 - x0) >= BORDER_GAP) continue
      if (Math.min(Math.max(y0, y1), Math.max(by0, by1)) - Math.max(Math.min(y0, y1), Math.min(by0, by1)) > 0.5) return true
    }
  }
  return false
}

/** The four edges of a box, as border segments */
export const edgesOf = (r) => [
  [
    [r.x, r.y],
    [r.x + r.w, r.y],
  ],
  [
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ],
  [
    [r.x, r.y],
    [r.x, r.y + r.h],
  ],
  [
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
  ],
]

/** A tiny binary heap of [cost, state] */
class Heap {
  constructor() {
    this.a = []
  }
  push(item) {
    const a = this.a
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.a
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
  get size() {
    return this.a.length
  }
}

/**
 * Route one link.
 * @param {object} p
 * @param {{x,y,w,h}} p.from   source box
 * @param {{x,y,w,h}} p.to     target box
 * @param {boolean} [p.fromDiamond] [p.toDiamond]  a diamond only has its four points
 * @param {{x,y,w,h}[]} p.nodes      every node box (the two ends included; they are skipped)
 * @param {{x,y,w,h}[]} p.blocks     other things not to cross: stage titles, labels, cards
 * @param {{points:number[][], share?:boolean}[]} p.routes  links already drawn; `share` ones may be run along
 * @param {string[]} [p.outSides] [p.inSides]  restrict the sides used (default: all)
 * @param {object} [p.portCost]  override what a side costs: { in: { bottom: 0 } } for a link from below
 * @param {number[][][]} [p.borders]  box edges ([[x0,y0],[x1,y1]]) a route may cross but not run along
 * @param {{x,y,w,h}} [p.bounds]  keep the whole route inside this rectangle (a link inside one stage)
 * @param {number[][]} [p.taken]  more points no route may start or end at (ends of links left out of `routes`)
 * @param {boolean} [p.sidePorts]  also offer a quarter port on each side (left and right), not only top and bottom
 * @param {number} [p.crossCost]  what crossing another link costs, in pixels of length (default: more than two bends)
 * @returns {number[][] | null}  the polyline, first point on the source, last on the target
 */
export function routeLink(p) {
  const { from, to, nodes, blocks = [], routes = [], borders = [], bounds = null } = p
  const portCost = { out: { ...PORT_COST.out, ...p.portCost?.out }, in: { ...PORT_COST.in, ...p.portCost?.in } }
  // What crossing another link costs. The flowchart keeps it high (a detour always beats a crossing);
  // a diagram with links across the whole picture may lower it, so a link does not go right round
  const crossCost = p.crossCost ?? CROSS
  // A port another link already leaves or arrives at is taken: two links out of one point read
  // as one link that forks (links allowed to merge, `share`, may use it)
  const taken = [
    ...routes.filter((rt) => !rt.share && rt.points.length).flatMap((rt) => [rt.points[0], rt.points[rt.points.length - 1]]),
    ...(p.taken ?? []),
  ]
  const free = ([x, y]) => !taken.some(([tx, ty]) => Math.abs(tx - x) < 1 && Math.abs(ty - y) < 1)
  const outPorts = portsOf(from, p.fromDiamond, p.sidePorts).filter(([x, y, s]) => (!p.outSides || p.outSides.includes(s)) && free([x, y]))
  const inPorts = portsOf(to, p.toDiamond, p.sidePorts).filter(([x, y, s]) => (!p.inSides || p.inSides.includes(s)) && free([x, y]))

  // Obstacles: nodes with clearance, the two ends without (the route starts on their edge)
  const isEnd = (r) => r === from || r === to || (r.x === from.x && r.y === from.y) || (r.x === to.x && r.y === to.y)
  const solid = nodes.filter((r) => !isEnd(r))

  // The grid
  const xsSet = new Set()
  const ysSet = new Set()
  for (const r of solid) {
    xsSet.add(r.x - CLEAR - 1).add(r.x + r.w + CLEAR + 1)
    ysSet.add(r.y - CLEAR - 1).add(r.y + r.h + CLEAR + 1)
  }
  for (const r of blocks) {
    xsSet.add(r.x - 4).add(r.x + r.w + 4)
    ysSet.add(r.y - 4).add(r.y + r.h + 4)
  }
  for (const [[bx0, by0], [bx1, by1]] of borders) {
    xsSet.add(bx0 - BORDER_GAP - 1).add(bx0 + BORDER_GAP + 1).add(bx1 - BORDER_GAP - 1).add(bx1 + BORDER_GAP + 1)
    ysSet.add(by0 - BORDER_GAP - 1).add(by0 + BORDER_GAP + 1).add(by1 - BORDER_GAP - 1).add(by1 + BORDER_GAP + 1)
  }
  for (const [x, y] of [...outPorts, ...inPorts]) {
    xsSet.add(x)
    ysSet.add(y)
  }
  for (const r of [from, to]) {
    xsSet.add(r.x - CLEAR - 1).add(r.x + r.w + CLEAR + 1)
    ysSet.add(r.y - CLEAR - 1).add(r.y + r.h + CLEAR + 1)
  }
  // Beside existing links, so a new one can run parallel at the right distance
  for (const rt of routes) {
    for (const [x, y] of rt.points) {
      xsSet.add(x - PARALLEL_GAP - 1).add(x + PARALLEL_GAP + 1)
      ysSet.add(y - PARALLEL_GAP - 1).add(y + PARALLEL_GAP + 1)
    }
  }
  const sortNum = (s) => [...s].map((v) => Math.round(v * 2) / 2).sort((a, b) => a - b).filter((v, i, a) => i === 0 || v !== a[i - 1])
  let xs = sortNum(xsSet)
  let ys = sortNum(ysSet)
  // Middles between neighbours: the centre of a channel is where a lone link looks best
  const withMid = (v) => v.flatMap((x, i) => (i === 0 ? [x] : [(v[i - 1] + x) / 2, x]))
  xs = withMid(xs)
  ys = withMid(ys)
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))
  const W = xs.length
  const H = ys.length

  // Segments of the existing links, split by direction, for the overlap and crossing tests
  const hSegs = []
  const vSegs = []
  for (const rt of routes) {
    for (let k = 1; k < rt.points.length; k += 1) {
      const [x0, y0] = rt.points[k - 1]
      const [x1, y1] = rt.points[k]
      if (Math.abs(y0 - y1) < 0.5) hSegs.push({ y: y0, a: Math.min(x0, x1), b: Math.max(x0, x1), share: rt.share })
      else vSegs.push({ x: x0, a: Math.min(y0, y1), b: Math.max(y0, y1), share: rt.share })
    }
  }

  // Is the axis-aligned segment clear, and how many links does it cross?
  const segCheck = (x0, y0, x1, y1) => {
    if (bounds && (Math.min(x0, x1) < bounds.x || Math.max(x0, x1) > bounds.x + bounds.w || Math.min(y0, y1) < bounds.y || Math.max(y0, y1) > bounds.y + bounds.h)) return null
    if (runsAlongBorder(x0, y0, x1, y1, borders)) return null
    if (solid.some((r) => hitsRect(x0, y0, x1, y1, r, CLEAR))) return null
    // The two ends: never through their inside (touching the edge is how a route starts)
    if ([from, to].some((r) => hitsRect(x0, y0, x1, y1, r, -0.5))) return null
    if (blocks.some((r) => hitsRect(x0, y0, x1, y1, r, 2))) return null
    if (Math.abs(y0 - y1) < 0.5) {
      const a = Math.min(x0, x1)
      const b = Math.max(x0, x1)
      if (hSegs.some((s) => !s.share && Math.abs(s.y - y0) < PARALLEL_GAP && Math.min(b, s.b) - Math.max(a, s.a) > 0.5)) return null
      // Half-open along the step ([a, b)): a crossing that falls exactly on a grid point is
      // counted once, by the step that starts there, not by neither
      return vSegs.filter((s) => !s.share && s.x >= a - 0.01 && s.x < b - 0.01 && y0 > s.a + 0.5 && y0 < s.b - 0.5).length
    }
    const a = Math.min(y0, y1)
    const b = Math.max(y0, y1)
    if (vSegs.some((s) => !s.share && Math.abs(s.x - x0) < PARALLEL_GAP && Math.min(b, s.b) - Math.max(a, s.a) > 0.5)) return null
    return hSegs.filter((s) => !s.share && s.y >= a - 0.01 && s.y < b - 0.01 && x0 > s.a + 0.5 && x0 < s.b - 0.5).length
  }

  // Can we step from grid point (i, j) one cell in heading d? And at what cost?
  const stepCache = new Map()
  const step = (i, j, d) => {
    const key = (j * W + i) * 4 + d
    if (stepCache.has(key)) return stepCache.get(key)
    let res = null
    const ni = i + DX[d]
    const nj = j + DY[d]
    if (ni >= 0 && nj >= 0 && ni < W && nj < H) {
      const cross = segCheck(xs[i], ys[j], xs[ni], ys[nj])
      if (cross !== null) res = { ni, nj, cost: Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + cross * crossCost }
    }
    stepCache.set(key, res)
    return res
  }

  // Targets: arriving at a port, heading into the node
  const goal = new Map()
  for (const [x, y, side, quarter] of inPorts) {
    const i = xi.get(Math.round(x * 2) / 2)
    const j = yi.get(Math.round(y * 2) / 2)
    if (i === undefined || j === undefined) continue
    const inward = (OUTWARD[side] + 2) % 4
    goal.set((j * W + i) * 4 + inward, portCost.in[side] + (quarter ? QUARTER : 0))
  }

  // A link keeps a straight run of END_RUN into its node. Grid lines sit a pixel or two from a
  // port (another node's clearance line, a neighbouring link), and a turn on one of them leaves a
  // stub shorter than the arrowhead: the head then sits sideways on a 1px jog. So no turning on
  // the stretch of an arrival port's own axis nearer than END_RUN (issue #23). Only the arrival
  // end: the start has no head, and holding it too costs extra bends in tight columns
  const noTurn = new Set()
  for (const [x, y, side] of inPorts) {
    const i = xi.get(Math.round(x * 2) / 2)
    const j = yi.get(Math.round(y * 2) / 2)
    if (i === undefined || j === undefined) continue
    const d = OUTWARD[side]
    for (let a = i + DX[d], b = j + DY[d]; a >= 0 && b >= 0 && a < W && b < H; a += DX[d], b += DY[d]) {
      if (Math.abs(xs[a] - x) + Math.abs(ys[b] - y) >= END_RUN) break
      noTurn.add(b * W + a)
    }
  }

  const dist = new Map()
  const prev = new Map()
  const heap = new Heap()
  // A route leaves its port straight out: no turning on the node's own edge
  const starts = new Set()
  for (const [x, y, side, quarter] of outPorts) {
    const i = xi.get(Math.round(x * 2) / 2)
    const j = yi.get(Math.round(y * 2) / 2)
    if (i === undefined || j === undefined) continue
    const s = (j * W + i) * 4 + OUTWARD[side]
    const c = portCost.out[side] + (quarter ? QUARTER : 0)
    starts.add(s)
    if (c < (dist.get(s) ?? Infinity)) {
      dist.set(s, c)
      heap.push([c, s])
    }
  }

  let best = null
  let bestCost = Infinity
  while (heap.size) {
    const [c, s] = heap.pop()
    if (c > (dist.get(s) ?? Infinity)) continue
    if (c >= bestCost) break
    if (goal.has(s)) {
      const total = c + goal.get(s)
      if (total < bestCost) {
        bestCost = total
        best = s
      }
    }
    const d = s % 4
    const cell = (s - d) / 4
    const i = cell % W
    const j = (cell - i) / W
    for (const nd of starts.has(s) || noTurn.has(cell) ? [d] : [d, (d + 1) % 4, (d + 3) % 4]) {
      const st = step(i, j, nd)
      if (!st) continue
      const ns = (st.nj * W + st.ni) * 4 + nd
      const nc = c + st.cost + (nd === d ? 0 : BEND)
      if (nc < (dist.get(ns) ?? Infinity)) {
        dist.set(ns, nc)
        prev.set(ns, s)
        heap.push([nc, ns])
      }
    }
  }
  if (best === null) return null

  // Walk back, keeping only the corners
  const pts = []
  for (let s = best; s !== undefined; s = prev.get(s)) {
    const cell = (s - (s % 4)) / 4
    const i = cell % W
    const j = (cell - i) / W
    pts.push([xs[i], ys[j]])
  }
  pts.reverse()
  const out = [pts[0]]
  for (let k = 1; k < pts.length - 1; k += 1) {
    const [ax, ay] = out[out.length - 1]
    const [bx, by] = pts[k]
    const [cx, cy] = pts[k + 1]
    const straight = (ax === bx && bx === cx) || (ay === by && by === cy)
    if (!straight) out.push(pts[k])
  }
  out.push(pts[pts.length - 1])
  return centre(out, segCheck)
}

/**
 * Slide each middle segment (both its ends are corners) to the centre of the free channel it
 * runs in, so a link through a gap runs down the middle of it rather than hugging one side.
 * A segment whose channel is open on one side (nothing beside it for SPAN) stays where it is:
 * the router already put it as close in as is clear. No move adds a crossing.
 */
const SPAN = 160
function centre(points, segCheck) {
  const pts = points.map((p) => [...p])
  for (let k = 1; k < pts.length - 2; k += 1) {
    const vertical = Math.abs(pts[k][0] - pts[k + 1][0]) < 0.5
    const ax = vertical ? 0 : 1
    const here = pts[k][ax]
    const crossesAt = (v) => {
      const a = [...pts[k - 1]]
      const b = [...pts[k]]
      const c = [...pts[k + 1]]
      const d = [...pts[k + 2]]
      b[ax] = v
      c[ax] = v
      // Moving a segment lengthens one neighbour and shortens the other: an end leg keeps END_RUN
      if (k === 1 && Math.abs(a[ax] - b[ax]) + Math.abs(a[1 - ax] - b[1 - ax]) < END_RUN) return null
      if (k + 2 === pts.length - 1 && Math.abs(c[ax] - d[ax]) + Math.abs(c[1 - ax] - d[1 - ax]) < END_RUN) return null
      const parts = [segCheck(...a, ...b), segCheck(...b, ...c), segCheck(...c, ...d)]
      return parts.some((x) => x === null) ? null : parts.reduce((s, x) => s + x, 0)
    }
    const base = crossesAt(here)
    if (base === null) continue
    const reach = (dir) => {
      let v = here
      for (let t = 2; t <= SPAN; t += 2) {
        const c = crossesAt(here + dir * t)
        if (c === null || c > base) return { v, open: false }
        v = here + dir * t
      }
      return { v, open: true }
    }
    const lo = reach(-1)
    const hi = reach(1)
    if (lo.open || hi.open) continue
    const mid = Math.round((lo.v + hi.v) / 2)
    pts[k][ax] = mid
    pts[k + 1][ax] = mid
  }
  return pts
}
