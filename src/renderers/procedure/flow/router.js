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
function portsOf(r, diamond, sidePorts = false, sideSpread = 0) {
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
      // `sideSpread`: the two side ports at least this far from the middle (kept clear of the corners), not only a
      // quarter of the way: on a low box a quarter is 12 px, and two links side by side read as one
      const off = sideSpread ? Math.min(Math.max(sideSpread, r.h / 4), r.h / 2 - 8) : r.h / 4
      for (const d of [-off, off]) {
        list.push([r.x, r.y + r.h / 2 + d, 'left', true], [r.x + r.w, r.y + r.h / 2 + d, 'right', true])
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
 * @param {number} [p.sideSpread]  with sidePorts, put the two side ports this far from the middle of the side (px)
 * @param {number} [p.parallelGap]  how far apart two links running side by side must be (default PARALLEL_GAP)
 * @param {number[][]} [p.inAt]  arrive only at one of these points (a link that joins another into the same node)
 * @param {{x,y,w,h}[]} [p.soft]  boxes a route may run through but a little dearer (5% more per pixel): a link between
 *   two stages then takes the gap between their boxes rather than a strip inside one, where both are as short
 * @param {boolean} [p.exhaustive]  search without the A* estimate (for the tests: it must find routes as cheap)
 * @param {Function} [p.onCost]  called with the cost of the route found (for the tests)
 * @param {boolean} [p.join]  a `share` link is one to join (merge.js): the route may lie exactly on it, a little cheaper
 *   than beside it, and keeps such a run where it is (without it, `share` links may only be run along, as a bundle)
 * @param {number} [p.crossCost]  what crossing another link costs, in pixels of length (default: more than two bends)
 * @returns {number[][] | null}  the polyline, first point on the source, last on the target
 */
export function routeLink(p) {
  const { from, to, nodes, blocks = [], routes = [], borders = [], bounds = null } = p
  const portCost = { out: { ...PORT_COST.out, ...p.portCost?.out }, in: { ...PORT_COST.in, ...p.portCost?.in } }
  // What crossing another link costs. The flowchart keeps it high (a detour always beats a crossing);
  // a diagram with links across the whole picture may lower it, so a link does not go right round
  const crossCost = p.crossCost ?? CROSS
  const gap = p.parallelGap ?? PARALLEL_GAP
  // A port another link already leaves or arrives at is taken: two links out of one point read
  // as one link that forks (links allowed to merge, `share`, may use it)
  const taken = [
    ...routes.filter((rt) => !rt.share && rt.points.length).flatMap((rt) => [rt.points[0], rt.points[rt.points.length - 1]]),
    ...(p.taken ?? []),
  ]
  const free = ([x, y]) => !taken.some(([tx, ty]) => Math.abs(tx - x) < 1 && Math.abs(ty - y) < 1)
  const outPorts = portsOf(from, p.fromDiamond, p.sidePorts, p.sideSpread).filter(([x, y, s]) => (!p.outSides || p.outSides.includes(s)) && free([x, y]))
  // `inAt`: only these points (a link joining another goes in where that one does)
  const at = (pt) => !p.inAt || p.inAt.some(([ax, ay]) => Math.abs(ax - pt[0]) < 1 && Math.abs(ay - pt[1]) < 1)
  const inPorts = portsOf(to, p.toDiamond, p.sidePorts, p.sideSpread).filter(([x, y, s]) => (!p.inSides || p.inSides.includes(s)) && free([x, y]) && at([x, y]))

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
      xsSet.add(x - gap - 1).add(x + gap + 1)
      ysSet.add(y - gap - 1).add(y + gap + 1)
      // ...and on a link it may join, exactly on it
      if (rt.share && p.join) {
        xsSet.add(x)
        ysSet.add(y)
      }
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
      if (hSegs.some((s) => !s.share && Math.abs(s.y - y0) < gap && Math.min(b, s.b) - Math.max(a, s.a) > 0.5)) return null
      // Half-open along the step ([a, b)): a crossing that falls exactly on a grid point is
      // counted once, by the step that starts there, not by neither
      return vSegs.filter((s) => !s.share && s.x >= a - 0.01 && s.x < b - 0.01 && y0 > s.a + 0.5 && y0 < s.b - 0.5).length
    }
    const a = Math.min(y0, y1)
    const b = Math.max(y0, y1)
    if (vSegs.some((s) => !s.share && Math.abs(s.x - x0) < gap && Math.min(b, s.b) - Math.max(a, s.a) > 0.5)) return null
    return hSegs.filter((s) => !s.share && s.y >= a - 0.01 && s.y < b - 0.01 && x0 > s.a + 0.5 && x0 < s.b - 0.5).length
  }

  // A run that lies on a link it may join, for part of its length: centre() keeps it where it is
  const alongShared = (x0, y0, x1, y1) =>
    Math.abs(y0 - y1) < 0.5
      ? hSegs.some((s) => s.share && Math.abs(s.y - y0) < 0.5 && Math.min(Math.max(x0, x1), s.b) - Math.max(Math.min(x0, x1), s.a) > 0.5)
      : vSegs.some((s) => s.share && Math.abs(s.x - x0) < 0.5 && Math.min(Math.max(y0, y1), s.b) - Math.max(Math.min(y0, y1), s.a) > 0.5)

  // Every edge of the grid (one cell east, or one cell south, from a grid point) worked out once: whether a route may
  // run along it, how many links it crosses, whether it lies on a link it may join. The tests are those of segCheck,
  // run only for the edges near each obstacle (found by a binary search on the grid lines), so the search itself only
  // looks things up. hBad[j * W + i]: the edge from (i, j) east; vBad: the edge from (i, j) south
  const N = W * H
  const hBad = new Uint8Array(N)
  const vBad = new Uint8Array(N)
  const hCross = new Uint16Array(N)
  const vCross = new Uint16Array(N)
  const hOn = new Uint8Array(N)
  const vOn = new Uint8Array(N)
  // First index whose value is >= v (values sorted)
  const lb = (arr, v) => {
    let a = 0
    let b = arr.length
    while (a < b) {
      const m = (a + b) >> 1
      if (arr[m] < v) a = m + 1
      else b = m
    }
    return a
  }
  // Edges that may touch the box [x0, x1] x [y0, y1]: a cell wider each way than the binary search finds
  const near = (x0, x1, y0, y1, fn) => {
    const i0 = Math.max(0, lb(xs, x0) - 1)
    const i1 = Math.min(W - 1, lb(xs, x1) + 1)
    const j0 = Math.max(0, lb(ys, y0) - 1)
    const j1 = Math.min(H - 1, lb(ys, y1) + 1)
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) fn(i, j)
  }
  const markIf = (test) => (i, j) => {
    const k = j * W + i
    if (i + 1 < W && !hBad[k] && test(xs[i], ys[j], xs[i + 1], ys[j])) hBad[k] = 1
    if (j + 1 < H && !vBad[k] && test(xs[i], ys[j], xs[i], ys[j + 1])) vBad[k] = 1
  }
  for (const r of solid) near(r.x - CLEAR, r.x + r.w + CLEAR, r.y - CLEAR, r.y + r.h + CLEAR, markIf((a, b, c, d) => hitsRect(a, b, c, d, r, CLEAR)))
  for (const r of [from, to]) near(r.x, r.x + r.w, r.y, r.y + r.h, markIf((a, b, c, d) => hitsRect(a, b, c, d, r, -0.5)))
  for (const r of blocks) near(r.x - 2, r.x + r.w + 2, r.y - 2, r.y + r.h + 2, markIf((a, b, c, d) => hitsRect(a, b, c, d, r, 2)))
  for (const bd of borders) {
    const [[bx0, by0], [bx1, by1]] = bd
    near(Math.min(bx0, bx1) - BORDER_GAP, Math.max(bx0, bx1) + BORDER_GAP, Math.min(by0, by1) - BORDER_GAP, Math.max(by0, by1) + BORDER_GAP, markIf((a, b, c, d) => runsAlongBorder(a, b, c, d, [bd])))
  }
  for (const sg of hSegs) {
    if (sg.share) {
      near(sg.a, sg.b, sg.y, sg.y, (i, j) => {
        if (p.join && i + 1 < W && Math.abs(sg.y - ys[j]) < 0.5 && xs[i] >= sg.a - 0.5 && xs[i + 1] <= sg.b + 0.5) hOn[j * W + i] = 1
      })
      continue
    }
    // Lying beside it, closer than the gap
    near(sg.a, sg.b, sg.y - gap, sg.y + gap, (i, j) => {
      if (i + 1 < W && Math.abs(sg.y - ys[j]) < gap && Math.min(xs[i + 1], sg.b) - Math.max(xs[i], sg.a) > 0.5) hBad[j * W + i] = 1
    })
    // Crossed by a vertical edge
    near(sg.a, sg.b, sg.y, sg.y, (i, j) => {
      if (j + 1 < H && sg.y >= ys[j] - 0.01 && sg.y < ys[j + 1] - 0.01 && xs[i] > sg.a + 0.5 && xs[i] < sg.b - 0.5) vCross[j * W + i] += 1
    })
  }
  for (const sg of vSegs) {
    if (sg.share) {
      near(sg.x, sg.x, sg.a, sg.b, (i, j) => {
        if (p.join && j + 1 < H && Math.abs(sg.x - xs[i]) < 0.5 && ys[j] >= sg.a - 0.5 && ys[j + 1] <= sg.b + 0.5) vOn[j * W + i] = 1
      })
      continue
    }
    near(sg.x - gap, sg.x + gap, sg.a, sg.b, (i, j) => {
      if (j + 1 < H && Math.abs(sg.x - xs[i]) < gap && Math.min(ys[j + 1], sg.b) - Math.max(ys[j], sg.a) > 0.5) vBad[j * W + i] = 1
    })
    near(sg.x, sg.x, sg.a, sg.b, (i, j) => {
      if (i + 1 < W && sg.x >= xs[i] - 0.01 && sg.x < xs[i + 1] - 0.01 && ys[j] > sg.a + 0.5 && ys[j] < sg.b - 0.5) hCross[j * W + i] += 1
    })
  }
  // Inside a soft box (see p.soft): the edge's middle in it
  const hSoft = new Uint8Array(N)
  const vSoft = new Uint8Array(N)
  for (const r of p.soft ?? []) {
    near(r.x, r.x + r.w, r.y, r.y + r.h, (i, j) => {
      const k = j * W + i
      const inside = (x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h
      if (i + 1 < W && inside((xs[i] + xs[i + 1]) / 2, ys[j])) hSoft[k] = 1
      if (j + 1 < H && inside(xs[i], (ys[j] + ys[j + 1]) / 2)) vSoft[k] = 1
    })
  }
  const inBounds = (x0, y0, x1, y1) =>
    !bounds || !(Math.min(x0, x1) < bounds.x || Math.max(x0, x1) > bounds.x + bounds.w || Math.min(y0, y1) < bounds.y || Math.max(y0, y1) > bounds.y + bounds.h)

  // Can we step from grid point (i, j) one cell in heading d? And at what cost?
  const step = (i, j, d) => {
    const ni = i + DX[d]
    const nj = j + DY[d]
    if (ni < 0 || nj < 0 || ni >= W || nj >= H) return null
    // The edge between the two points, named by its west or north end
    const horizontal = d === 0 || d === 2
    const k = horizontal ? j * W + Math.min(i, ni) : Math.min(j, nj) * W + i
    if (horizontal ? hBad[k] : vBad[k]) return null
    if (!inBounds(xs[i], ys[j], xs[ni], ys[nj])) return null
    const len = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j])
    const cross = horizontal ? hCross[k] : vCross[k]
    const on = horizontal ? hOn[k] : vOn[k]
    const soft = horizontal ? hSoft[k] : vSoft[k]
    return { ni, nj, cost: len * (on ? 0.8 : soft ? 1.05 : 1) + cross * crossCost }
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

  // A*: what is left to go is at least the distance to the nearest arrival port (a run on a link it joins costs 0.8 of
  // its length, so the estimate is scaled to stay below the true cost). The route found is the cheapest one, as before;
  // only far fewer grid points are looked at
  // ...plus the turns it must still make: none when the port is straight ahead, heading the way it goes in; one when
  // it goes in across the present heading; two otherwise. Grid lines are rounded to half a pixel and ports are not:
  // the tests allow for that, so the estimate never goes above the true cost (it would miss the best route)
  const ends = inPorts.map(([x, y, side]) => [x, y, (OUTWARD[side] + 2) % 4])
  const scale = p.join && routes.some((rt) => rt.share) ? 0.8 : 1
  const est = (s) => {
    if (p.exhaustive) return 0
    const d = s % 4
    const cell = (s - d) / 4
    const i = cell % W
    const j = (cell - i) / W
    const x = xs[i]
    const y = ys[j]
    let m = Infinity
    for (const [gx, gy, hd] of ends) {
      let turns
      if (d === hd) {
        const ahead = DX[d] ? Math.abs(gy - y) < 0.5 && (gx - x) * DX[d] > -0.5 : Math.abs(gx - x) < 0.5 && (gy - y) * DY[d] > -0.5
        turns = ahead ? 0 : 2
      } else turns = (d + 2) % 4 === hd ? 2 : 1
      m = Math.min(m, Math.max(0, Math.abs(gx - x) + Math.abs(gy - y) - 0.5) * scale + turns * BEND)
    }
    return m
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
      heap.push([c + est(s), s, c])
    }
  }

  let best = null
  let bestCost = Infinity
  while (heap.size) {
    const [f, s, c] = heap.pop()
    if (c > (dist.get(s) ?? Infinity)) continue
    if (f >= bestCost) break
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
        heap.push([nc + est(ns), ns, nc])
      }
    }
  }
  p.onCost?.(bestCost)
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
  return centre(out, segCheck, p.join ? alongShared : undefined)
}

/**
 * Slide each middle segment (both its ends are corners) to the centre of the free channel it
 * runs in, so a link through a gap runs down the middle of it rather than hugging one side.
 * A segment whose channel is open on one side (nothing beside it for SPAN) stays where it is:
 * the router already put it as close in as is clear. No move adds a crossing.
 */
const SPAN = 160
function centre(points, segCheck, onShared = () => false) {
  const pts = points.map((p) => [...p])
  for (let k = 1; k < pts.length - 2; k += 1) {
    const vertical = Math.abs(pts[k][0] - pts[k + 1][0]) < 0.5
    const ax = vertical ? 0 : 1
    const here = pts[k][ax]
    // A run on a link it joins stays on it
    if (onShared(...pts[k], ...pts[k + 1])) continue
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
