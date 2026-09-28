// ============================================================
//  src/renderers/procedure/flow/layout.js — laying out the flowchart (pure computation)
//
//  Input: a procedure spec that has already passed validation. Output:
//    nodes        React Flow nodes (position, size, the text to show)
//    connections  the geometry of the links (the polyline points, and where the
//                 condition label goes)
//    size         how large the content is
//
//  **edges is always an empty array**, the same as fact's timeline: the links are
//  drawn by a self-drawn layer, for the reason in spec/procedure/schema-draft.md
//  §6.1 (a back edge has to go round, and several edges into the same target have
//  to merge; React Flow's built-in edges can do neither).
//
//  The six layout steps (rules in spec/procedure/schema-draft.md §6.1):
//    ① recognise back edges (drop them, and what is left is a DAG)
//    ② on the DAG take the "longest path from the entry" = the layer number
//    ③ recognise the main line (walk the main edges; infer when unmarked)
//    ④ fix the columns within each layer: the main line centred, the rest
//      alternating right and left
//    ⑤ compute coordinates (axis-agnostic: a vertical layout runs layers
//      downwards, a horizontal one to the right)
//    ⑥ link: several edges into the same target merge; then route.js lays every
//      link on node-free gaps and channels (no link ever runs behind a node)
//    ⑦ stage bands, cut along the main line
//    ⑧ the rule lane: contingent clauses as cards beside the stages they apply
//      to; the rules that end the contract join one trunk into their end
//
//  **What it does not do**: crossing minimisation, merging several main-line
//  nodes in one layer.
// ============================================================

import { validateProcedure, hintsOfProcedure, ruleEndIds } from './rules.js'
import { routeLinks } from './route.js'
// The same text measure the fact cards use, so a CJK character counts the same everywhere
import { textEm } from '../../fact/cardGeometry.js'
import {
  PAD,
  layerGap,
  GAP_X,
  CORNER_R,
  OUTER,
  STAGE_GUTTER_V,
  STAGE_GUTTER_H,
  TRACK,
  RULE_W,
  RULE_GAP,
  RULE_STACK_GAP,
  SCOPE_BAR_GAP,
  SCOPE_BAR_PITCH,
  ruleHeight,
  sizeOf,
  acrossOf,
  extentOf,
} from './metrics.js'

const keyOf = (e) => `${e.from}|${e.to}|${e.condition ?? ''}`

/**
 * Draw a polyline point list as an SVG d (with rounded corners).
 * It lives here rather than in the rendering layer: it is pure geometry, and a
 * unit test can pin it down directly.
 */
export function toPathD(points, r = CORNER_R) {
  if (!Array.isArray(points) || points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }
  const d = [`M ${points[0][0]} ${points[0][1]}`]
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const inLen = Math.hypot(cx - px, cy - py)
    const outLen = Math.hypot(nx - cx, ny - cy)
    const rr = Math.max(0, Math.min(r, inLen / 2, outLen / 2))
    if (rr === 0) {
      d.push(`L ${cx} ${cy}`)
      continue
    }
    const inUx = (cx - px) / (inLen || 1)
    const inUy = (cy - py) / (inLen || 1)
    const outUx = (nx - cx) / (outLen || 1)
    const outUy = (ny - cy) / (outLen || 1)
    d.push(`L ${cx - inUx * rr} ${cy - inUy * rr}`)
    d.push(`Q ${cx} ${cy} ${cx + outUx * rr} ${cy + outUy * rr}`)
  }
  const last = points[points.length - 1]
  d.push(`L ${last[0]} ${last[1]}`)
  return d.join(' ')
}

const emptyStats = () => ({
  nodes: 0,
  edges: 0,
  connections: 0,
  layers: 0,
  widest: 0,
  backEdges: 0,
  decisions: 0,
  ends: 0,
  groupedEdges: 0,
})

/**
 * Lay out one procedure spec.
 *
 * The signature matches fact's kinds (spec, fields, view, orientation), because
 * the registry calls them all with the same four parameters. **procedure has no
 * views**; view is accepted and unused (see spec/procedure/schema-draft.md §4.7).
 */
export function buildProcedureGraph(spec, fields = {}, view, orientation = 'vertical') {
  const errors = validateProcedure(spec)
  const hints = hintsOfProcedure(spec)
  const vertical = orientation !== 'horizontal'
  const dir = vertical ? 'vertical' : 'horizontal'

  if (errors.length) {
    return {
      errors,
      hints,
      orientation: dir,
      nodes: [],
      edges: [],
      connections: [],
      rows: [],
      spine: [],
      stageBands: [],
      rules: [],
      ruleLinks: [],
      gutter: 0,
      size: { width: 0, height: 0 },
      stats: emptyStats(),
    }
  }

  const nodes = spec.nodes
  const stageById = new Map((spec.stages ?? []).map((s) => [s.id, s]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const order = new Map(nodes.map((n, i) => [n.id, i]))
  const ids = nodes.map((n) => n.id)

  const outE = new Map(ids.map((id) => [id, []]))
  const inE = new Map(ids.map((id) => [id, []]))
  spec.edges.forEach((e, index) => {
    outE.get(e.from).push({ ...e, index })
    inE.get(e.to).push({ ...e, index })
  })

  // ① recognise back edges: DFS; an edge into a node "still on the current path" is a back edge
  const back = new Set()
  const color = new Map()
  const walk = (u) => {
    color.set(u, 1)
    for (const e of outE.get(u)) {
      const c = color.get(e.to) ?? 0
      if (c === 1) back.add(keyOf(e))
      else if (c === 0) walk(e.to)
    }
    color.set(u, 2)
  }
  for (const id of ids) if ((color.get(id) ?? 0) === 0) walk(id)

  // ② with the back edges removed it is a DAG. Kahn topological order + relaxation = the longest path from the entry
  const dagOut = new Map(ids.map((id) => [id, []]))
  const indeg = new Map(ids.map((id) => [id, 0]))
  for (const e of spec.edges) {
    if (back.has(keyOf(e))) continue
    dagOut.get(e.from).push(e)
    indeg.set(e.to, indeg.get(e.to) + 1)
  }
  const layer = new Map()
  const queue = ids.filter((id) => indeg.get(id) === 0)
  queue.forEach((id) => layer.set(id, 0))
  for (let i = 0; i < queue.length; i += 1) {
    const u = queue[i]
    const lu = layer.get(u) ?? 0
    for (const e of dagOut.get(u)) {
      layer.set(e.to, Math.max(layer.get(e.to) ?? 0, lu + 1))
      indeg.set(e.to, indeg.get(e.to) - 1)
      if (indeg.get(e.to) === 0) queue.push(e.to)
    }
  }

  // An end reached only through a rule has no incoming edge but is not an entry: it goes in the
  // last layer, beside the flow's own end, and is placed outermost there (step ④) so the rule
  // trunk reaches it from outside without crossing anything
  const ruleEnds = new Set([...ruleEndIds(spec)].filter((id) => byId.has(id) && inE.get(id).length === 0))
  if (ruleEnds.size) {
    const last = Math.max(0, ...ids.filter((id) => !ruleEnds.has(id)).map((id) => layer.get(id) ?? 0))
    for (const id of ruleEnds) layer.set(id, last)
  }

  // ③ the main line: walk the main edges; when none is marked main, infer it as
  // "the first unconditional, unvisited outgoing edge"
  const entries = ids.filter((id) => inE.get(id).length === 0 && !ruleEnds.has(id))
  const spine = []
  const spineSet = new Set()
  {
    let cur = entries[0]
    const guard = new Set()
    while (cur !== undefined && !guard.has(cur)) {
      guard.add(cur)
      spine.push(cur)
      spineSet.add(cur)
      if (byId.get(cur).kind === 'end') break
      const outs = outE.get(cur)
      const pick =
        outs.find((e) => e.main === true) ??
        outs.find((e) => !e.condition && !guard.has(e.to)) ??
        outs.find((e) => !guard.has(e.to))
      cur = pick?.to
    }
  }

  // ④ fix the columns within each layer. The main line sits in column 0. Every other node goes
  // under the nodes that lead into it (the mean column of its forward predecessors), so a
  // side branch keeps to one side of the main line and runs down its own column: the branch
  // reads as a strand, and the main line keeps a free side for the loops that return to it.
  // A node whose only predecessor is on the main line has no side yet; those alternate,
  // starting with the side that has fewer nodes in the layer. Ties keep the data order.
  const dagIn = new Map(ids.map((id) => [id, []]))
  for (const e of spec.edges) if (!back.has(keyOf(e))) dagIn.get(e.to).push(e.from)
  const colOf = new Map()
  const maxLayer = Math.max(0, ...ids.map((id) => layer.get(id) ?? 0))
  const rows = []
  for (let L = 0; L <= maxLayer; L += 1) {
    const inLayer = ids
      .filter((id) => (layer.get(id) ?? 0) === L)
      .sort((a, b) => order.get(a) - order.get(b))
    if (inLayer.length === 0) continue
    const col = new Map()
    inLayer.filter((id) => spineSet.has(id)).forEach((id, i) => col.set(id, i))
    const pull = new Map()
    for (const id of inLayer) {
      if (col.has(id) || ruleEnds.has(id)) continue
      const cs = dagIn.get(id).filter((p) => colOf.has(p)).map((p) => colOf.get(p))
      pull.set(id, cs.length ? cs.reduce((n, c) => n + c, 0) / cs.length : 0)
    }
    const others = [...pull.keys()]
    const right = others.filter((id) => pull.get(id) > 0)
    const left = others.filter((id) => pull.get(id) < 0)
    for (const id of others.filter((id) => pull.get(id) === 0)) {
      ;(right.length <= left.length ? right : left).push(id)
    }
    // Each side fills outwards from the main line: nearest pull first, never two in one column,
    // and a node lands under its predecessors when that column is still free
    const byPull = (a, b) => Math.abs(pull.get(a)) - Math.abs(pull.get(b)) || order.get(a) - order.get(b)
    let next = Math.max(...[...col.values()]) + 1
    if (!Number.isFinite(next)) next = 1
    for (const id of right.sort(byPull)) {
      const c = Math.max(next, Math.round(pull.get(id)))
      col.set(id, c)
      next = c + 1
    }
    for (const id of inLayer.filter((id) => ruleEnds.has(id))) {
      col.set(id, next)
      next += 1
    }
    next = -1
    for (const id of left.sort(byPull)) {
      const c = Math.min(next, Math.round(pull.get(id)))
      col.set(id, c)
      next = c - 1
    }
    for (const [id, c] of col) colOf.set(id, c)
    rows.push({
      layer: L,
      ids: inLayer,
      col,
      extent: Math.max(...inLayer.map((id) => extentOf(byId.get(id), vertical))),
    })
  }

  // ⑤ coordinates: axis-agnostic. In a vertical layout layers run downwards, in a horizontal one to the right.
  // The stage gutter (when drawn) sits on the "across start" side: left when vertical, top when
  // horizontal, so it moves every column over by the same amount and nothing else changes.
  const showStages = fields?.stages !== false && Array.isArray(spec.stages) && spec.stages.length > 0
  const gutter = showStages ? (vertical ? STAGE_GUTTER_V : STAGE_GUTTER_H) : 0
  const colPitch = Math.max(...ids.map((id) => acrossOf(byId.get(id), vertical))) + GAP_X
  const allCols = rows.flatMap((r) => [...r.col.values()])
  const minCol = Math.min(...allCols)
  const maxCol = Math.max(...allCols)
  const acrossCenter = (c) => PAD + gutter + OUTER + (c - minCol) * colPitch + colPitch / 2

  const gap = layerGap(vertical)
  const placed = new Map()
  let alongPos = PAD
  for (const r of rows) {
    for (const id of r.ids) {
      const n = byId.get(id)
      const { w, h } = sizeOf(n)
      const c = r.col.get(id)
      const ac = acrossCenter(c)
      placed.set(id, {
        x: vertical ? ac - w / 2 : alongPos,
        y: vertical ? alongPos : ac - h / 2,
        w,
        h,
        ac,
        layer: r.layer,
        col: c,
        alongStart: alongPos,
      })
    }
    r.along = alongPos
    alongPos += r.extent + gap
  }
  const contentAlong = alongPos - gap + PAD
  const contentAcross = PAD * 2 + gutter + OUTER * 2 + (maxCol - minCol + 1) * colPitch
  const size = vertical
    ? { width: contentAcross, height: contentAlong }
    : { width: contentAlong, height: contentAcross }

  // ⑥ links. First merge "several edges between the same pair of nodes" into one (§6.1, the second rule)
  const grouped = new Map()
  for (const e of spec.edges) {
    const k = `${e.from}|${e.to}`
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k).push(e)
  }

  // An edge is on the main line when it joins two consecutive main-line nodes. Reading it off the
  // spine rather than off `main: true` matters when nothing is marked: the engine inferred the
  // spine in step ③, and the highlight must follow what was inferred, not only what was written.
  const spineNext = new Map(spine.slice(0, -1).map((id, i) => [id, spine[i + 1]]))

  // Boxes in along/across coordinates, the language route.js speaks
  const rowIndex = new Map(rows.map((r, i) => [r.layer, i]))
  const boxes = new Map(
    [...placed.entries()].map(([id, p]) => {
      const a0 = vertical ? p.y : p.x
      const c0 = vertical ? p.x : p.y
      const al = vertical ? p.h : p.w
      const ac = vertical ? p.w : p.h
      // tip: a diamond meets its links only at its points, so a link may not land beside its centre
      const tip = byId.get(id).kind === 'decision'
      return [id, { a0, a1: a0 + al, c0, c1: c0 + ac, am: a0 + al / 2, cm: p.ac, row: rowIndex.get(p.layer), tip }]
    }),
  )
  // Channels: every column centre, and the middle of every gutter (one outside each edge too)
  const channels = []
  for (let c = minCol - 1; c <= maxCol; c += 1) {
    if (c >= minCol) channels.push(acrossCenter(c))
    channels.push(acrossCenter(c) + colPitch / 2)
  }

  const groups = [...grouped.values()].map((group) => {
    const { from, to } = group[0]
    const isBack = back.has(keyOf(group[0]))
    const labels = group.map((e) => e.condition).filter(Boolean)
    const isMain = !isBack && spineNext.get(from) === to
    return { from, to, isBack, isMain, merged: group.length, label: labels.length ? labels.join(' / ') : '' }
  })
  const routed = routeLinks({ groups, boxes, rows, channels, vertical, gap })

  // labelAnchor says how the label sits on labelAt (the renderer only reads it, never guesses):
  //   rise    starts just right of the point and grows upwards (vertical: the last drop into a
  //           target, so a long label never runs down into the box it points at)
  //   lead    ends just before the point and sits above it (horizontal: the same, turned)
  //   center  centred on the point, masking the line under it (on a back edge's lane)
  const connections = groups.map((g, i) => {
    const r = routed[i]
    return {
      id: `c:${g.from}->${g.to}`,
      from: g.from,
      to: g.to,
      kind: g.isBack ? 'back' : g.isMain ? 'main' : 'branch',
      merged: g.merged,
      points: r.points,
      d: toPathD(r.points),
      label: g.label,
      labelAt: r.labelAt,
      labelAnchor: r.labelAnchor,
    }
  })

  // The content box holds what was drawn: a line in an outer channel, or in the gap after the
  // last layer, must not be cropped by the viewport fit or the image export
  for (const c of connections) {
    for (const [x, y] of c.points) {
      size.width = Math.max(size.width, x + PAD)
      size.height = Math.max(size.height, y + PAD)
    }
  }
  const backList = spec.edges.filter((e) => back.has(keyOf(e)))

  // ⑦ stage bands. Cut **along the main line**, not per node: a stage's branch nodes reach into the
  // next stage's layers (a delay branch hangs below the step that started it), so bands taken per
  // node would overlap. Along the spine a stage runs from its first main-line node to the next
  // stage's first one; the cut lies in the middle of the gap between the two layers. So bands are
  // contiguous and never overlap, by construction. A stage that never appears on the main line
  // gets no band (its nodes still render as usual).
  const stageSpans = []
  if (stageById.size) {
    const rowOf = new Map(rows.map((r, i) => [r.layer, i]))
    const edgeOf = (rowIdx) => (rowIdx <= 0 ? PAD : rows[rowIdx].along - gap / 2)
    const endAlong = contentAlong - PAD
    let cur = null
    for (const id of spine) {
      const sid = byId.get(id).stageId
      if (!sid || !stageById.has(sid)) continue
      if (cur && cur.stageId === sid) continue
      const at = edgeOf(rowOf.get(layer.get(id) ?? 0))
      if (cur) cur.to = at
      cur = { stageId: sid, label: stageById.get(sid).label, from: at, to: endAlong }
      stageSpans.push(cur)
    }
    // The first band starts at the top of the content, even if the entry sits before any stage
    if (stageSpans.length) stageSpans[0].from = Math.min(stageSpans[0].from, PAD)
  }
  // The spans are computed whether or not the bands are drawn: the rule lane is placed by them
  const stageBands = showStages ? stageSpans : []

  // ⑧ the rule lane. A rule is a clause that may fire anywhere in its stages ("if the supplier
  // is late, a penalty of …"); drawn as edges from some step, it would claim a moment it does
  // not have, and repeat once per stage it covers. So it is a card in a lane of its own, beside
  // the node field, level with the first stage it applies to; the stages it covers are written
  // on it. Cards stack in stage order and never overlap.
  // A rule that ends the contract (`endId`) joins a trunk running between the node field and
  // the lane, down to its end. One trunk per end, so five termination grounds read as five
  // roads into one door rather than five lines across the page.
  const showRules = fields?.rules !== false && Array.isArray(spec.rules) && spec.rules.length > 0
  const rulesOut = []
  const ruleLinks = []
  if (showRules) {
    const stageOrder = new Map((spec.stages ?? []).map((st, i) => [st.id, i]))
    const spanOf = new Map(stageSpans.map((b) => [b.stageId, b]))
    const firstStage = (r) => {
      const known = (r.stageIds ?? []).filter((id) => stageOrder.has(id))
      return known.length ? known.reduce((a, b) => (stageOrder.get(a) <= stageOrder.get(b) ? a : b)) : null
    }
    const sorted = spec.rules
      .map((r, i) => ({ r, i, first: firstStage(r) }))
      .sort((a, b) => (stageOrder.get(a.first) ?? -1) - (stageOrder.get(b.first) ?? -1) || a.i - b.i)

    const fieldEnd = (vertical ? size.width : size.height) - PAD
    const laneC0 = fieldEnd + RULE_GAP
    let cursor = PAD
    let laneAcross = 0
    for (const { r, first } of sorted) {
      const h = ruleHeight(r, textEm)
      const along = vertical ? h : RULE_W
      const across = vertical ? RULE_W : h
      const a0 = Math.max(spanOf.get(first)?.from ?? PAD, cursor)
      cursor = a0 + along + RULE_STACK_GAP
      laneAcross = Math.max(laneAcross, across)
      rulesOut.push({
        rule: r,
        x: vertical ? laneC0 : a0,
        y: vertical ? a0 : laneC0,
        w: RULE_W,
        h,
        a0,
        stageLabels: (r.stageIds ?? []).filter((id) => stageById.has(id)).map((id) => stageById.get(id).label),
        allStages: !(r.stageIds ?? []).length,
      })
    }

    // Trunks: one per end, between the node field and the lane
    const P = (a, c) => (vertical ? [c, a] : [a, c])
    const byEnd = new Map()
    for (const card of rulesOut) {
      const id = card.rule.endId
      if (!id || !placed.has(id)) continue
      if (!byEnd.has(id)) byEnd.set(id, [])
      byEnd.get(id).push(card)
    }
    let k = 0
    for (const [endId, cards] of byEnd) {
      const trunkC = laneC0 - RULE_GAP / 2 - k * TRACK
      k += 1
      const e = boxes.get(endId)
      // Each card joins the trunk a little below its top, level with its consequence
      const stubs = cards.map((c) => c.a0 + 18)
      for (const [i, a] of stubs.entries()) {
        const pts = [P(a, laneC0), P(a, trunkC)]
        ruleLinks.push({ id: `rl:${cards[i].rule.id}`, points: pts, d: toPathD(pts), arrow: false })
      }
      const pts = [P(Math.min(...stubs), trunkC), P(e.am, trunkC), P(e.am, e.c1)]
      ruleLinks.push({ id: `rt:${endId}`, to: endId, points: pts, d: toPathD(pts), arrow: true })
    }

    // Scope bars: how far a rule reaches, drawn beside the lane across the stages it covers.
    // One bar per distinct stage range (rules sharing a range share the bar), so "these two
    // apply from requirements to delivery" is seen, not read off a footer.
    const scopeBars = new Map()
    for (const card of rulesOut) {
      const spans = (card.rule.stageIds ?? []).map((id) => spanOf.get(id)).filter(Boolean)
      if (!spans.length) continue
      const from = Math.min(...spans.map((b) => b.from))
      const to = Math.max(...spans.map((b) => b.to))
      const key = `${from}|${to}`
      if (!scopeBars.has(key)) scopeBars.set(key, { from, to })
    }
    ;[...scopeBars.values()]
      .sort((a, b) => a.from - b.from || b.to - a.to)
      .forEach((bar, i) => {
        const c = laneC0 + laneAcross + SCOPE_BAR_GAP + i * SCOPE_BAR_PITCH
        const pts = [P(bar.from + 6, c), P(bar.to - 6, c)]
        ruleLinks.push({ id: `rs:${bar.from}|${bar.to}`, points: pts, d: toPathD(pts), arrow: false, scope: true })
        laneAcross = Math.max(laneAcross, c - laneC0 + 4)
      })

    // The content box grows to hold the lane
    const alongEnd = Math.max(...rulesOut.map((c) => c.a0 + (vertical ? c.h : RULE_W)))
    if (vertical) {
      size.width = Math.max(size.width, laneC0 + laneAcross + PAD)
      size.height = Math.max(size.height, alongEnd + PAD)
    } else {
      size.height = Math.max(size.height, laneC0 + laneAcross + PAD)
      size.width = Math.max(size.width, alongEnd + PAD)
    }
  }

  // the nodes go to React Flow. Sizes travel in data (the same convention as fact's cards)
  const actorById = new Map((spec.actors ?? []).map((a) => [a.id, a]))
  const sourceById = new Map((spec.sources ?? []).map((s) => [s.id, s]))
  const rfNodes = nodes.map((n) => {
    const p = placed.get(n.id)
    return {
      id: n.id,
      type: 'pnode',
      position: { x: p.x, y: p.y },
      data: {
        node: n,
        w: p.w,
        h: p.h,
        isSpine: spineSet.has(n.id),
        stageLabel: stageById.get(n.stageId)?.label ?? '',
        actorNames: (n.actorIds ?? []).map((id) => actorById.get(id)?.name ?? id),
        sources: (n.sourceIds ?? []).map((id) => sourceById.get(id)).filter(Boolean),
        sourceCount: (n.sourceIds ?? []).filter((id) => sourceById.has(id)).length,
        layer: p.layer,
        showDetail: fields?.detail !== false,
        vertical,
      },
    }
  })

  const stats = {
    nodes: nodes.length,
    edges: spec.edges.length,
    connections: connections.length,
    layers: maxLayer + 1,
    widest: Math.max(...rows.map((r) => r.ids.length)),
    backEdges: backList.length,
    decisions: nodes.filter((n) => n.kind === 'decision').length,
    ends: nodes.filter((n) => n.kind === 'end').length,
    groupedEdges: spec.edges.length - connections.length,
  }

  return {
    errors,
    hints,
    orientation: dir,
    nodes: rfNodes,
    edges: [],
    connections,
    rows: rows.map((r) => ({ layer: r.layer, along: r.along, extent: r.extent, count: r.ids.length })),
    spine,
    stageBands,
    rules: rulesOut,
    ruleLinks,
    gutter,
    size,
    stats,
  }
}
