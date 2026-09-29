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
//    2. a stage far taller than the rest is cut in two, the halves side by side in its box;
//    3. a stage may be mirrored, so the side its links to the next stage leave by is free;
//    4. the boxes are set side by side, tops aligned, each as tall as its own content;
//    5. a link from one stage to another is routed by router.js (fewest bends, then shortest,
//       clear of every node, stage title and label, never along a box's edge);
//    6. the whole picture is straightened once more, and a link that still crosses another is
//       routed afresh (the loop gives way, the main line keeps the direct route).
//
//  Everything is computed in one frame, the vertical one (flow down, columns across). The
//  horizontal orientation is that picture transposed: node and label sizes go in with width
//  and height swapped, and every coordinate comes out with x and y swapped. One code path,
//  two orientations.
// ============================================================

import { elkLayoutSync } from './elk.js'
import { straighten, linkCost, bendsOf } from './straighten.js'
import { routeLink, edgesOf, runsAlongBorder } from './router.js'
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

/**
 * When a stage is cut in two (②): taller than SPLIT_RATIO times the median stage, taller than
 * SPLIT_MIN_H, and taller than SPLIT_ASPECT times the picture's width
 */
const SPLIT_RATIO = 1.5
const SPLIT_MIN_H = 480
const SPLIT_ASPECT = 0.7

/**
 * Where to cut a stage's picture in two: between two layers, where the fewest links cross (a
 * forward link across the cut costs more than a loop) and the two halves come out about as tall.
 * @returns {Set<string>[] | null} the two sets of node ids, top half first
 */
function cutInTwo(lay) {
  const rects = [...lay.placed.entries()]
  if (rects.length < 4) return null
  const tops = [...new Set(rects.map(([, r]) => r.y))].sort((a, b) => a - b)
  let best = null
  for (let i = 1; i < tops.length; i += 1) {
    const cut = tops[i]
    const top = new Set(rects.filter(([, r]) => r.y < cut).map(([id]) => id))
    const bottom = new Set(rects.filter(([, r]) => r.y >= cut).map(([id]) => id))
    if (top.size < 2 || bottom.size < 2) continue
    const across = lay.inner.filter((g) => top.has(g.from) !== top.has(g.to))
    const forward = across.filter((g) => !g.isBack).length
    const loops = across.length - forward
    const hTop = Math.max(...rects.filter(([id]) => top.has(id)).map(([, r]) => r.y + r.h))
    const hBottom = Math.max(...rects.map(([, r]) => r.y + r.h)) - cut
    const score = forward * 1000 + loops * 300 + Math.abs(hTop - hBottom)
    if (!best || score < best.score) best = { score, top, bottom }
  }
  return best ? [best.top, best.bottom] : null
}

/** Mirror a stage's picture left to right, nodes, links and labels together */
function mirrorSegment(seg) {
  const W = seg.width
  for (const [id, r] of seg.placed) seg.placed.set(id, { ...r, x: W - r.x - r.w })
  for (const c of seg.connections) {
    c.points = c.points.map(([x, y]) => [W - x, y])
    if (c.labelAt) c.labelAt = { x: W - c.labelAt.x - c.labelSize.width, y: c.labelAt.y }
  }
}

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
 *   `frame` is the same picture before the transpose (the frame geometry), for inspection.
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

  // ① each stage on its own (a set of its nodes; a stage cut in two is laid out once per part)
  const layOut = (st, own) => {
    const ownIds = new Set(own.map((n) => n.id))
    const inner = groups.filter((g) => ownIds.has(g.from) && ownIds.has(g.to))
    // Links leaving or entering: ELK does not route them (router.js does, later), but it is told
    // they exist, as links to a placeholder after the last layer and from one before the first.
    // Otherwise it gives away the side a link needs to get out (the bottom point of a decision
    // to a branch, say) and the link to the next stage has to cross that branch.
    const outs = groups.filter((g) => ownIds.has(g.from) && !ownIds.has(g.to) && !g.isBack)
    const ins = groups.filter((g) => !ownIds.has(g.from) && ownIds.has(g.to) && !g.isBack)
    let best = null
    for (const placement of PLACEMENTS) {
      const tried = layoutStage(own, inner, placement, outs, ins)
      const cost = tried.connections.reduce((s, c) => s + linkCost(c, tried.placed, diamonds), 0)
      if (!best || cost < best.cost) best = { ...tried, cost }
    }
    return { st, ids: ownIds, inner, ...best }
  }
  const whole = stages.map((st) => layOut(st, nodes.filter((n) => n.stageId === st.id)))

  // ② A stage far taller than the others turns the picture back into a strip (03: one stage of
  // nine steps beside a stage of two ends). It is cut in two, where the fewest links cross the
  // cut and the halves come out even, and the halves stand side by side in the stage's box.
  // Only when the picture is not already wide: splitting a tall stage of a wide picture helps
  // nothing.
  const heights = whole.map((l) => l.height).sort((a, b) => a - b)
  const median = heights[Math.floor((heights.length - 1) / 2)]
  const roughWidth = whole.reduce((s, l) => s + l.width + STAGE_PAD * 2 + COLUMN_GAP, 0)
  const segments = []
  for (const lay of whole) {
    const tall = lay.height > SPLIT_MIN_H && lay.height > median * SPLIT_RATIO && lay.height > roughWidth * SPLIT_ASPECT
    const parts = tall ? cutInTwo(lay) : null
    if (parts) for (const ids of parts) segments.push(layOut(lay.st, nodes.filter((n) => ids.has(n.id))))
    else segments.push(lay)
  }
  const segOf = new Map()
  segments.forEach((seg, i) => {
    for (const id of seg.ids) segOf.set(id, i)
  })

  // ③ A link into the next stage leaves by the node's side facing it. If other nodes of the
  // stage stand on that side (01: "rectify" beside "second payment"), the link has to go out
  // underneath and round, three bends instead of two. The stage's picture may be mirrored left
  // to right: whichever leaves more of those sides free is kept.
  segments.forEach((seg, k) => {
    const blockedIf = (mirror) => {
      const rects = [...seg.placed.entries()]
      const side = (id, towards) => {
        const r = seg.placed.get(id)
        return rects.some(([o, q]) => {
          if (o === id || q.y >= r.y + r.h || q.y + q.h <= r.y) return false
          const right = q.x >= r.x + r.w
          const left = q.x + q.w <= r.x
          return towards === 'right' ? (mirror ? left : right) : mirror ? right : left
        })
      }
      let n = 0
      for (const g of groups) {
        if (g.isBack) continue
        const a = segOf.get(g.from)
        const b = segOf.get(g.to)
        if (a === k && b > k && side(g.from, 'right')) n += 1
        if (b === k && a < k && side(g.to, 'left')) n += 1
      }
      return n
    }
    if (blockedIf(true) < blockedIf(false)) mirrorSegment(seg)
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

  // ④ The stages side by side, tops aligned, each box as tall as its own content (a box
  // stretched to the tallest one is mostly empty). A stage cut in two holds both halves side by
  // side, a column gap apart.
  const placed = new Map()
  const boxes = []
  const connections = []
  let cx = PAD
  for (const st of stages) {
    const segs = segments.filter((seg) => seg.st === st)
    const content = segs.reduce((s, seg) => s + seg.width, 0) + COLUMN_GAP * (segs.length - 1)
    const titleW = textEm(st.label) * STAGE_TITLE_FONT + STAGE_PAD * 2
    const w = Math.max(content + PAD_C0 + STAGE_PAD, vertical ? titleW : 0, vertical ? COLUMN_MIN_W : 0)
    const h = Math.max(Math.max(...segs.map((seg) => seg.height)) + PAD_A0 + STAGE_PAD, vertical ? 0 : titleW)
    boxes.push({ stageId: st.id, label: st.label, x: cx, y: PAD, w, h })
    // The content sits centred across the box, clear of the title strip
    let ox = cx + PAD_C0 + (w - PAD_C0 - STAGE_PAD - content) / 2
    const oy = PAD + PAD_A0
    for (const seg of segs) {
      for (const [id, r] of seg.placed) placed.set(id, { ...r, x: r.x + ox, y: r.y + oy })
      for (const c of seg.connections) {
        connections.push({
          ...c,
          points: c.points.map(([x, y]) => [x + ox, y + oy]),
          labelAt: c.labelAt ? { x: c.labelAt.x + ox, y: c.labelAt.y + oy } : null,
        })
      }
      ox += seg.width + COLUMN_GAP
    }
    cx += w + COLUMN_GAP
  }
  const tallest = Math.max(...boxes.map((b) => b.h))

  // A route never runs along a box's edge (it would read as part of the box), and a link
  // inside one stage stays inside that stage's box
  const borders = boxes.flatMap(edgesOf)
  const boxOfStage = new Map(boxes.map((b) => [b.stageId, b]))
  const within = (c) => {
    const a = byId.get(c.from).stageId
    return a === byId.get(c.to).stageId ? boxOfStage.get(a) : null
  }

  // ⑤ links between segments (between stages, or between the two halves of a stage): main line
  // first, then branches, then loops
  const titles = boxes.map((b) => titleBoxOf(b, b.label, vertical))
  const nodeRects = [...placed.values()]
  const labelRect = (c) => (c.labelAt ? { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height } : null)
  const rank = (g) => (g.isMain ? 0 : g.isBack ? 2 : 1)
  const cross = groups.filter((g) => segOf.get(g.from) !== segOf.get(g.to)).sort((a, b) => rank(a) - rank(b))
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
        // ...but where a loop leaves or arrives is still taken
        taken: connections.flatMap((c) => [c.points[0], c.points[c.points.length - 1]]),
        borders,
        bounds: within(g),
      }) ?? fallbackRoute(placed.get(g.from), placed.get(g.to))
    const size = g.label ? frameLabel(g.label) : null
    const at = size ? placeLabel(points, size, nodeRects, [...titles, ...labels], connections, borders) : null
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
  const all = straighten(connections, placed, titles, true, diamonds, { borders, within })
  connections.splice(0, connections.length, ...all)

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
      borders,
      bounds: within(c),
    })
    if (!pts || crossingsOf(pts, others) >= before) continue
    // A crossing is worse than one more bend, but not worse than a long way round: when two links
    // must cross or one goes right round the stage (03: the main line out of the lower left and
    // the renewal loop back to the upper left), they cross
    if (bendsOf(pts) > bendsOf(c.points) + 1 || lengthOf(pts) > lengthOf(c.points) * 1.6 + 80) continue
    c.points = pts
    if (c.labelSize) c.labelAt = placeLabel(pts, c.labelSize, nodeRects, [...titles, ...labels], others, borders)
  }

  // Last of all: a label that ended up on another link (links moved after it was placed) is
  // placed again, beside its own link
  for (const c of connections) {
    const r = labelRect(c)
    if (!r) continue
    const others = connections.filter((o) => o !== c)
    if (!others.some((o) => segsOf(o.points).some((sg) => segHits(sg, r, 2)))) continue
    const labels = others.map(labelRect).filter(Boolean)
    c.labelAt = placeLabel(c.points, c.labelSize, nodeRects, [...titles, ...labels], others, borders)
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

  const frame = { boxes, placed, connections, titles, borders, width, height, diamonds }
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
