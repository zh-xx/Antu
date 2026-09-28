// ============================================================
//  src/renderers/procedure/flow/columns.js — the column layout: one column per stage
//
//  A contract flow is one long main line, stage after stage, so laid out as a single graph it
//  is a strip whichever way it runs (01: 750×1610 top-down, 2388×412 left-right). Here each
//  stage is a column: the stages run across, left to right, and the flow inside a stage runs
//  down. The picture comes out near the shape of a screen, and it reads like a page set in
//  columns.
//
//  ELK cannot do this in one pass (measured on 01: with the stages as its compound nodes it
//  either stacks them in the wrong order and leaves 4 of 16 links unrouted, or ignores the
//  direction inside them and draws a 2074×221 strip). So:
//    1. each stage is laid out by ELK on its own, top-down, links inside it routed and then
//       straightened (straighten.js), exactly as the single-graph layout does;
//    2. the columns are set side by side, tops aligned, in the order of `stages`;
//    3. a link from one stage to another is routed by router.js (fewest bends, then shortest,
//       clear of every node, stage title and label).
//
//  Everything is computed in one frame, the vertical one (flow down, columns across). The
//  horizontal orientation is that picture transposed: node and label sizes go in with width
//  and height swapped, and every coordinate comes out with x and y swapped. One code path,
//  two orientations.
// ============================================================

import { elkLayoutSync } from './elk.js'
import { straighten, linkCost } from './straighten.js'
import { routeLink } from './router.js'
import { textEm } from '../../fact/cardGeometry.js'
import {
  LAYER_GAP,
  NODE_GAP,
  STAGE_PAD_TOP,
  STAGE_PAD,
  STAGE_TITLE_FONT,
  PAD,
  COLUMN_GAP,
  COLUMN_MIN_W,
  sizeOf,
} from './metrics.js'

/** Who gives way when two links cross: the loop first, the main line last */
const GIVE_WAY = { back: 0, branch: 1, main: 2 }

/** Main-line links: ELK keeps them straight first */
const MAIN_PRIORITY = { 'elk.layered.priority.straightness': '10', 'elk.layered.priority.direction': '10' }

/** Node placements tried per stage; the one with the least bending is kept (as in layout.js) */
const PLACEMENTS = [
  { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED' },
  { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' },
  { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF' },
]

/** The box of a stage title, in the frame: where a link must not run */
export const titleBoxOf = (box, label, vertical) => {
  const w = Math.min(box.w - STAGE_PAD * 2, textEm(label) * STAGE_TITLE_FONT + 4)
  return vertical
    ? { x: box.x + STAGE_PAD - 2, y: box.y + 7, w, h: 18 }
    : { x: box.x + 7, y: box.y + STAGE_PAD - 2, w: 18, h: w }
}

/**
 * @param {object} p
 * @param {object[]} p.nodes        the spec's nodes
 * @param {object[]} p.groups       links from layout.js: { from, to, isBack, isMain, merged, label }
 * @param {object[]} p.stages       the stages that have nodes, in order
 * @param {Set<string>} p.ruleEnds  ends reached only through rules
 * @param {Function} p.labelBox     text -> { width, height }
 * @param {boolean} p.vertical
 * @returns {{ placed: Map, stageBoxes: object[], connections: object[], size: {width,height}, frame: object }}
 *   `frame` carries what the rule placement needs, still in the frame: the column boxes, every
 *   node box, every link and label, and a function to turn frame geometry into the real one.
 */
export function layoutColumns({ nodes, groups, stages, ruleEnds, labelBox, vertical }) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // The title strip runs along the real top of a box: the frame's top when vertical, its left
  // when the picture is transposed
  const PAD_A0 = vertical ? STAGE_PAD_TOP : STAGE_PAD
  const PAD_C0 = vertical ? STAGE_PAD : STAGE_PAD_TOP
  const diamonds = new Set(nodes.filter((n) => n.kind === 'decision').map((n) => n.id))
  // Sizes in the frame: transposed when the real picture runs left to right
  const frameSize = (n) => {
    const { w, h } = sizeOf(n)
    return vertical ? { w, h } : { w: h, h: w }
  }
  const frameLabel = (text) => {
    const b = labelBox(text)
    return vertical ? b : { width: b.height, height: b.width }
  }

  // ① each stage on its own
  const columns = stages.map((st) => {
    const own = nodes.filter((n) => n.stageId === st.id)
    const ownIds = new Set(own.map((n) => n.id))
    const inner = groups.filter((g) => ownIds.has(g.from) && ownIds.has(g.to))
    // Links leaving or entering the stage: ELK does not route them (router.js does, later), but
    // it is told they exist, as links to a placeholder after the last layer and from one before
    // the first. Otherwise it gives away the side a link needs to get out (the bottom point of a
    // decision to a branch, say) and the link to the next stage has to cross that branch.
    const outs = groups.filter((g) => ownIds.has(g.from) && !ownIds.has(g.to) && !g.isBack)
    const ins = groups.filter((g) => !ownIds.has(g.from) && ownIds.has(g.to) && !g.isBack)
    let best = null
    for (const placement of PLACEMENTS) {
      const tried = layoutStage(own, inner, placement, outs, ins)
      const cost = tried.connections.reduce((s, c) => s + linkCost(c, tried.placed, diamonds), 0)
      if (!best || cost < best.cost) best = { ...tried, cost }
    }
    // The column: its content, the title strip (at the real top, which is the frame's left when
    // transposed), never narrower than a readable rule card below it
    const titleW = textEm(st.label) * STAGE_TITLE_FONT + STAGE_PAD * 2
    const w = Math.max(best.width + PAD_C0 + STAGE_PAD, vertical ? titleW : 0, vertical ? COLUMN_MIN_W : 0)
    const h = Math.max(best.height + PAD_A0 + STAGE_PAD, vertical ? 0 : titleW)
    return { st, ...best, w, h }
  })

  function layoutStage(own, inner, placement, outs = [], ins = []) {
    const EXIT = '__exit__'
    const ENTRY = '__entry__'
    const ghosts = []
    if (outs.length) ghosts.push({ id: EXIT, width: 1, height: 1, layoutOptions: { 'elk.layered.layering.layerConstraint': 'LAST_SEPARATE' } })
    if (ins.length) ghosts.push({ id: ENTRY, width: 1, height: 1, layoutOptions: { 'elk.layered.layering.layerConstraint': 'FIRST_SEPARATE' } })
    const ghostEdges = [
      ...outs.map((g, i) => ({ id: `x${i}`, sources: [g.from], targets: [EXIT], layoutOptions: g.isMain ? MAIN_PRIORITY : {} })),
      ...ins.map((g, i) => ({ id: `y${i}`, sources: [ENTRY], targets: [g.to], layoutOptions: g.isMain ? MAIN_PRIORITY : {} })),
    ]
    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.padding': '[top=0,left=0,bottom=0,right=0]',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': String(NODE_GAP),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
        'elk.spacing.edgeNode': '16',
        'elk.spacing.edgeEdge': '10',
        'elk.spacing.edgeLabel': '4',
        'elk.layered.spacing.edgeNodeBetweenLayers': '16',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        ...placement,
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.edgeLabels.inline': 'false',
        'elk.separateConnectedComponents': 'false',
      },
      children: [
        ...own.map((n) => {
          const { w, h } = frameSize(n)
          const opts = ruleEnds.has(n.id) ? { 'elk.layered.layering.layerConstraint': 'LAST' } : {}
          return { id: n.id, width: w, height: h, layoutOptions: opts }
        }),
        ...ghosts,
      ],
      // Back edges go in reversed, as in layout.js
      edges: inner.map((g, i) => ({
        id: `g${i}`,
        sources: [g.isBack ? g.to : g.from],
        targets: [g.isBack ? g.from : g.to],
        labels: g.label ? [{ id: `l${i}`, text: g.label, ...frameLabel(g.label) }] : [],
        layoutOptions: g.isMain ? MAIN_PRIORITY : {},
      })),
    }
    graph.edges.push(...ghostEdges)
    const laid = elkLayoutSync(graph)
    const placed = new Map(
      laid.children.filter((c) => c.id !== EXIT && c.id !== ENTRY).map((c) => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]),
    )
    const byEdge = new Map((laid.edges ?? []).map((e) => [e.id, e]))
    const connections = inner.map((g, i) => {
      const e = byEdge.get(`g${i}`)
      const sec = e?.sections?.[0]
      const points = sec ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((pt) => [pt.x, pt.y]) : []
      if (g.isBack) points.reverse()
      if (points.length >= 2) {
        points[0] = snapToDiamond(points[0], placed.get(g.from), diamonds.has(g.from))
        points[points.length - 1] = snapToDiamond(points[points.length - 1], placed.get(g.to), diamonds.has(g.to))
      }
      const lab = e?.labels?.[0]
      return {
        id: `c:${g.from}->${g.to}`,
        from: g.from,
        to: g.to,
        kind: g.isBack ? 'back' : g.isMain ? 'main' : 'branch',
        merged: g.merged,
        points,
        label: g.label,
        labelAt: lab ? { x: lab.x, y: lab.y } : null,
        labelSize: lab ? { width: lab.width, height: lab.height } : null,
      }
    })
    const straightened = straighten(connections, placed, [], true, diamonds)
    // The content box, links and labels included (a loop can reach past the nodes)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const grow = (x, y) => {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    for (const r of placed.values()) {
      grow(r.x, r.y)
      grow(r.x + r.w, r.y + r.h)
    }
    for (const c of straightened) {
      for (const [x, y] of c.points) grow(x, y)
      if (c.labelAt) {
        grow(c.labelAt.x, c.labelAt.y)
        grow(c.labelAt.x + c.labelSize.width, c.labelAt.y + c.labelSize.height)
      }
    }
    // Normalise to start at 0,0
    const shift = ([x, y]) => [x - x0, y - y0]
    for (const [id, r] of placed) placed.set(id, { ...r, x: r.x - x0, y: r.y - y0 })
    for (const c of straightened) {
      c.points = c.points.map(shift)
      if (c.labelAt) c.labelAt = { x: c.labelAt.x - x0, y: c.labelAt.y - y0 }
    }
    return { placed, connections: straightened, width: x1 - x0, height: y1 - y0 }
  }

  // ② columns side by side, tops aligned
  const placed = new Map()
  const boxes = []
  const connections = []
  let cx = PAD
  for (const col of columns) {
    const box = { stageId: col.st.id, label: col.st.label, x: cx, y: PAD, w: col.w, h: col.h }
    boxes.push(box)
    // The content sits centred across the column, clear of the title strip
    const ox = cx + PAD_C0 + (col.w - PAD_C0 - STAGE_PAD - col.width) / 2
    const oy = PAD + PAD_A0
    for (const [id, r] of col.placed) placed.set(id, { ...r, x: r.x + ox, y: r.y + oy })
    for (const c of col.connections) {
      connections.push({
        ...c,
        points: c.points.map(([x, y]) => [x + ox, y + oy]),
        labelAt: c.labelAt ? { x: c.labelAt.x + ox, y: c.labelAt.y + oy } : null,
      })
    }
    cx += col.w + COLUMN_GAP
  }
  // Every column as tall as the tallest: the row of boxes reads as one band
  const tallest = Math.max(...boxes.map((b) => b.h))
  for (const b of boxes) b.h = tallest

  // ③ links between stages: main line first, then branches, then loops
  const titles = boxes.map((b) => titleBoxOf(b, b.label, vertical))
  const nodeRects = [...placed.values()]
  const labelRect = (c) => (c.labelAt ? { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height } : null)
  const rank = (g) => (g.isMain ? 0 : g.isBack ? 2 : 1)
  const cross = groups.filter((g) => byId.get(g.from).stageId !== byId.get(g.to).stageId).sort((a, b) => rank(a) - rank(b))
  for (const g of cross) {
    const labels = connections.map(labelRect).filter(Boolean)
    const points =
      routeLink({
        from: placed.get(g.from),
        to: placed.get(g.to),
        fromDiamond: diamonds.has(g.from),
        toDiamond: diamonds.has(g.to),
        nodes: nodeRects,
        blocks: [...titles, ...labels],
        // Loops are not in the way yet: the link to the next stage takes the direct route, and a
        // loop it then crosses gives way below
        routes: connections.filter((c) => c.kind !== 'back' || g.isBack).map((c) => ({ points: c.points })),
      }) ?? fallbackRoute(placed.get(g.from), placed.get(g.to))
    const size = g.label ? frameLabel(g.label) : null
    const at = size ? placeLabel(points, size, nodeRects, [...titles, ...labels], connections) : null
    connections.push({
      id: `c:${g.from}->${g.to}`,
      from: g.from,
      to: g.to,
      kind: g.isBack ? 'back' : g.isMain ? 'main' : 'branch',
      merged: g.merged,
      points,
      label: g.label,
      labelAt: at,
      labelSize: size,
    })
  }

  // Once more over the whole picture, now that the links between stages are there: a loop
  // inside a stage may go round the side a link to the next stage leaves by, and has an
  // equally simple route on the other side that crosses nothing
  const all = straighten(connections, placed, titles, true, diamonds)
  connections.splice(0, connections.length, ...all)

  // Last: a link that still crosses another is routed afresh by the router, which counts a
  // crossing as worse than one more bend; the new route is kept only if it crosses less
  // Loops first, then branches, the main line last: a loop is the one to give way, so the main
  // line keeps the direct route
  const byGiveWay = [...connections].sort((a, b) => GIVE_WAY[a.kind] - GIVE_WAY[b.kind])
  for (const c of byGiveWay) {
    const others = connections.filter((o) => o !== c)
    const before = crossingsOf(c.points, others)
    if (before === 0) continue
    const labels = others.map(labelRect).filter(Boolean)
    const pts = routeLink({
      from: placed.get(c.from),
      to: placed.get(c.to),
      fromDiamond: diamonds.has(c.from),
      toDiamond: diamonds.has(c.to),
      nodes: nodeRects,
      blocks: [...titles, ...labels],
      routes: others.map((o) => ({ points: o.points })),
    })
    if (!pts || crossingsOf(pts, others) >= before) continue
    c.points = pts
    if (c.labelSize) c.labelAt = placeLabel(pts, c.labelSize, nodeRects, [...titles, ...labels], others)
  }

  // The content box
  let width = cx - COLUMN_GAP + PAD
  let height = PAD + tallest + PAD
  for (const c of connections) {
    for (const [x, y] of c.points) {
      width = Math.max(width, x + PAD)
      height = Math.max(height, y + PAD)
    }
    if (c.labelAt) {
      width = Math.max(width, c.labelAt.x + c.labelSize.width + PAD)
      height = Math.max(height, c.labelAt.y + c.labelSize.height + PAD)
    }
  }

  const frame = { boxes, placed, connections, titles, width, height, diamonds }
  return { frame, ...toReal(frame, vertical) }
}

/** Turn the frame's geometry into the real one (a transpose when the picture runs left to right) */
export function toReal(frame, vertical) {
  const T = vertical ? (pt) => pt : ([x, y]) => [y, x]
  const R = vertical ? (r) => r : (r) => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w })
  const placed = new Map([...frame.placed].map(([id, r]) => [id, R(r)]))
  const stageBoxes = frame.boxes.map((b) => R(b))
  const connections = frame.connections.map((c) => ({
    ...c,
    points: c.points.map(T),
    labelAt: c.labelAt ? (vertical ? c.labelAt : { x: c.labelAt.y, y: c.labelAt.x }) : null,
    labelSize: c.labelSize ? (vertical ? c.labelSize : { width: c.labelSize.height, height: c.labelSize.width }) : null,
  }))
  const size = vertical ? { width: frame.width, height: frame.height } : { width: frame.height, height: frame.width }
  return { placed, stageBoxes, connections, size }
}

/** A point on a diamond's bounding box slid along its segment onto the outline (as layout.js) */
function snapToDiamond(pt, b, diamond) {
  if (!diamond || !b) return pt
  const [x, y] = pt
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const onTopOrBottom = Math.abs(y - b.y) < 0.5 || Math.abs(y - (b.y + b.h)) < 0.5
  if (onTopOrBottom) {
    const dy = (b.h / 2) * (1 - Math.min(1, Math.abs(x - cx) / (b.w / 2)))
    return [x, y < cy ? cy - dy : cy + dy]
  }
  const dx = (b.w / 2) * (1 - Math.min(1, Math.abs(y - cy) / (b.h / 2)))
  return [x < cx ? cx - dx : cx + dx, y]
}

/** Only if the router finds nothing (it should not): out of the side, across, into the side */
function fallbackRoute(a, b) {
  const y0 = a.y + a.h / 2
  const y1 = b.y + b.h / 2
  const x0 = a.x + a.w
  const x1 = b.x
  const mx = (x0 + x1) / 2
  return [
    [x0, y0],
    [mx, y0],
    [mx, y1],
    [x1, y1],
  ]
}

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

/**
 * A spot for a label beside its route: along each segment, the longest first, near the start or
 * in the middle, on either side; clear of nodes, other labels, titles and every link.
 */
export function placeLabel(points, size, nodeRects, blocks, links) {
  const { width: w, height: h } = size
  const blocked = (r) =>
    nodeRects.some((n) => overlaps(r, n, 3)) ||
    blocks.some((b) => overlaps(r, b, 3)) ||
    links.some((c) => segsOf(c.points).some((s) => segHits(s, r, 3))) ||
    segsOf(points).some((s) => segHits(s, r, 1))
  const segs = segsOf(points).sort(
    (a, b) => Math.abs(b[1][0] - b[0][0]) + Math.abs(b[1][1] - b[0][1]) - (Math.abs(a[1][0] - a[0][0]) + Math.abs(a[1][1] - a[0][1])),
  )
  for (const [p, q] of segs) {
    const horizontal = Math.abs(p[1] - q[1]) < 0.5
    const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
    const need = horizontal ? w : h
    if (len < need + 8) continue
    const dir = horizontal ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1])
    for (const t of [(len - need) / 2, 6, len - need - 6]) {
      for (const side of [1, -1]) {
        const r = horizontal
          ? { x: dir > 0 ? p[0] + t : p[0] - t - w, y: side < 0 ? p[1] - 4 - h : p[1] + 4, w, h }
          : { x: side < 0 ? p[0] - 4 - w : p[0] + 4, y: dir > 0 ? p[1] + t : p[1] - t - h, w, h }
        if (!blocked(r)) return { x: r.x, y: r.y }
      }
    }
  }
  // Nowhere clear: beside the middle of the longest segment
  const [p, q] = segs[0]
  return { x: (p[0] + q[0]) / 2 + 4, y: (p[1] + q[1]) / 2 - h / 2 }
}

/**
 * Rule cards in the column layout. A rule applies in some stages; its card sits under the
 * columns of those stages, exactly as wide as they are, so how far a rule reaches is seen from
 * the card itself (no scope bar, no "applies to …" line). Cards that do not overlap share a row;
 * the rows stack below the columns. A rule that ends the procedure (`endId`) gets a link from
 * its card up to that end, routed like any other; links into the same end may run together
 * and merge.
 *
 * @returns {{ cards: object[], links: object[], width: number, height: number }} in the real
 *   geometry; width and height are the new content size
 */
export function placeRules({ frame, rules, stages, vertical, ruleHeight, textEm, gap, stackGap, cardW, cardMinW }) {
  const colOf = new Map(frame.boxes.map((b, i) => [b.stageId, i]))
  const stageLabel = new Map(stages.map((st) => [st.id, st.label]))
  const bottom = Math.max(...frame.boxes.map((b) => b.y + b.h))

  // Each card's columns
  const items = rules.map((r, index) => {
    const cols = (r.stageIds ?? []).filter((id) => colOf.has(id)).map((id) => colOf.get(id))
    const all = cols.length === 0
    const lo = all ? 0 : Math.min(...cols)
    const hi = all ? frame.boxes.length - 1 : Math.max(...cols)
    const x0 = frame.boxes[lo].x
    const span = frame.boxes[hi].x + frame.boxes[hi].w - x0
    const foot = (r.sourceIds ?? []).length > 0
    return { r, index, lo, hi, x0, span, foot, all }
  })

  // Rules over the same stages form a block that fills exactly those columns. Several in one
  // block share its width side by side, as many as fit at a readable width, instead of each
  // taking a full row (03: seven rules over one stage would stack seven deep).
  //   vertical:   k cards per row, each (span - gaps) / k wide
  //   transposed: a card has a fixed real width, so its frame width is its real height; the
  //               cards are packed along the span as they fit
  const groups = new Map()
  // A rule that ends the procedure goes first in its block, and its block into the top row: its
  // link up to the end is then short and passes no other card
  const ends = (it) => (it.r.endId ? 0 : 1)
  for (const it of [...items].sort((a, b) => ends(a) - ends(b) || a.index - b.index)) {
    const key = `${it.lo}|${it.hi}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  }
  const blocks = [...groups.values()].map((members) => {
    const { lo, hi, x0, span } = members[0]
    let rowsIn = []
    if (vertical) {
      const k = Math.max(1, Math.min(members.length, Math.floor((span + stackGap) / (cardMinW + stackGap))))
      const w = (span - (k - 1) * stackGap) / k
      for (let m = 0; m < members.length; m += k) rowsIn.push(members.slice(m, m + k))
      for (const row of rowsIn) {
        row.forEach((it, n) => {
          it.real = { w, h: ruleHeight(it.r, textEm, w, it.foot) }
          it.dx = n * (w + stackGap)
        })
      }
    } else {
      for (const it of members) it.real = { w: cardW, h: ruleHeight(it.r, textEm, cardW, it.foot) }
      // A lone card stretches to fill its stages
      if (members.length === 1) members[0].real.h = Math.max(span, members[0].real.h)
      let row = []
      let used = 0
      for (const it of members) {
        if (row.length && used + stackGap + it.real.h > span) {
          rowsIn.push(row)
          row = []
          used = 0
        }
        it.dx = row.length ? used + stackGap : 0
        used = it.dx + it.real.h
        row.push(it)
      }
      if (row.length) rowsIn.push(row)
    }
    // Frame sizes and the block's own rows
    let dy = 0
    let fwMax = span
    for (const row of rowsIn) {
      const fhRow = Math.max(...row.map((it) => (vertical ? it.real.h : it.real.w)))
      for (const it of row) {
        it.fw = vertical ? it.real.w : it.real.h
        it.fh = vertical ? it.real.h : it.real.w
        it.dy = dy
        fwMax = Math.max(fwMax, it.dx + it.fw)
      }
      dy += fhRow + stackGap
    }
    return {
      members,
      lo,
      hi,
      x0,
      fw: fwMax,
      fh: dy - stackGap,
      index: Math.min(...members.map((m) => m.index)),
      ends: members.some((m) => m.r.endId) ? 0 : 1,
    }
  })

  // Blocks into rows: those with a rule that ends the procedure first, then by the leftmost
  // column, wider first, then the order written
  const sorted = [...blocks].sort((a, b) => a.ends - b.ends || a.lo - b.lo || b.hi - b.lo - (a.hi - a.lo) || a.index - b.index)
  const rows = []
  for (const bl of sorted) {
    let row = rows.find((rw) => rw.blocks.every((o) => bl.x0 >= o.x0 + o.fw + gap || bl.x0 + bl.fw + gap <= o.x0))
    if (!row) {
      row = { blocks: [] }
      rows.push(row)
    }
    row.blocks.push(bl)
  }
  let y = bottom + gap
  for (const row of rows) {
    const h = Math.max(...row.blocks.map((o) => o.fh))
    for (const bl of row.blocks) {
      for (const it of bl.members) {
        it.x = bl.x0 + it.dx
        it.y = y + it.dy
      }
    }
    y += h + stackGap
  }

  // Links from a card up to the end it leads to
  const cardRect = (o) => ({ x: o.x, y: o.y, w: o.fw, h: o.fh })
  const nodeRects = [...frame.placed.values()]
  const allCards = items.map(cardRect)
  const labels = frame.connections
    .filter((c) => c.labelAt)
    .map((c) => ({ x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height }))
  const linksFrame = []
  for (const it of items) {
    const endId = it.r.endId
    if (!endId || !frame.placed.has(endId)) continue
    const from = cardRect(it)
    const to = frame.placed.get(endId)
    const points =
      routeLink({
        from,
        to,
        toDiamond: false,
        nodes: [...nodeRects, ...allCards.filter((c) => c.x !== from.x || c.y !== from.y)],
        blocks: [...frame.titles, ...labels],
        routes: [
          ...frame.connections.map((c) => ({ points: c.points })),
          ...linksFrame.map((l) => ({ points: l.points, share: l.to === endId })),
        ],
        outSides: ['top'],
        // Coming from below is how a card reaches its end: no cost for arriving at the bottom
        portCost: { in: { bottom: 0 } },
      }) ?? [
        [from.x + from.w / 2, from.y],
        [to.x + to.w / 2, to.y + to.h],
      ]
    linksFrame.push({ id: `rt:${it.r.id}`, to: endId, points })
  }

  // Into the real geometry
  const T = vertical ? (pt) => pt : ([x, yy]) => [yy, x]
  const cards = items.map((o) => ({
    rule: o.r,
    x: vertical ? o.x : o.y,
    y: vertical ? o.y : o.x,
    w: o.real.w,
    h: o.real.h,
    stageLabels: (o.r.stageIds ?? []).filter((id) => stageLabel.has(id)).map((id) => stageLabel.get(id)),
    allStages: o.all,
    spanShown: true,
  }))
  const links = linksFrame.map((l) => ({ ...l, points: l.points.map(T), arrow: true }))
  let fwMax = frame.width
  let fhMax = Math.max(frame.height, y - stackGap + PAD)
  for (const o of items) fwMax = Math.max(fwMax, o.x + o.fw + PAD)
  for (const l of linksFrame) {
    for (const [x, yy] of l.points) {
      fwMax = Math.max(fwMax, x + PAD)
      fhMax = Math.max(fhMax, yy + PAD)
    }
  }
  return { cards, links, width: vertical ? fwMax : fhMax, height: vertical ? fhMax : fwMax }
}
