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
//    ⑥ link: main edges connect directly, branches take orthogonal polylines,
//      back edges go round the outside; several edges into the same target merge
//
//  **What it does not do**: crossing minimisation, orthogonal edge avoidance,
//  merging several main-line nodes in one layer. The real corpus has a longest
//  chain of 20 layers and a maximum out-degree of 7, and this is enough; if it
//  ever is not, that can be discussed then.
// ============================================================

import { validateProcedure, hintsOfProcedure } from './rules.js'
import {
  PAD,
  GAP_Y,
  GAP_X,
  CORNER_R,
  BACK_LANE_W,
  BACK_LANE_START,
  STAGE_GUTTER_V,
  STAGE_GUTTER_H,
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

  // ③ the main line: walk the main edges; when none is marked main, infer it as
  // "the first unconditional, unvisited outgoing edge"
  const entries = ids.filter((id) => inE.get(id).length === 0)
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

  // ④ fix the columns within each layer: the main line centred, the rest right, left, right, left...
  const maxLayer = Math.max(0, ...ids.map((id) => layer.get(id) ?? 0))
  const rows = []
  for (let L = 0; L <= maxLayer; L += 1) {
    const inLayer = ids
      .filter((id) => (layer.get(id) ?? 0) === L)
      .sort((a, b) => order.get(a) - order.get(b))
    if (inLayer.length === 0) continue
    const col = new Map()
    const spineHere = inLayer.filter((id) => spineSet.has(id))
    const others = inLayer.filter((id) => !spineSet.has(id))
    spineHere.forEach((id, i) => col.set(id, i))
    const taken = new Set(col.values())
    const cand = []
    for (let s = 1; cand.length < others.length * 2 + 4; s += 1) cand.push(s, -s)
    const free = cand.filter((c) => !taken.has(c))
    others.forEach((id, i) => col.set(id, free[i]))
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
  const acrossCenter = (c) => PAD + gutter + (c - minCol) * colPitch + colPitch / 2

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
    alongPos += r.extent + GAP_Y
  }
  const contentAlong = alongPos - GAP_Y + PAD
  const contentAcross = PAD * 2 + gutter + (maxCol - minCol + 1) * colPitch - GAP_X
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

  const maxRight = Math.max(...[...placed.values()].map((p) => p.x + p.w))
  const maxBottom = Math.max(...[...placed.values()].map((p) => p.y + p.h))
  const backList = spec.edges.filter((e) => back.has(keyOf(e)))
  const laneIndex = new Map()
  backList.forEach((e) => {
    const k = `${e.from}|${e.to}`
    if (!laneIndex.has(k)) laneIndex.set(k, laneIndex.size)
  })

  // An edge is on the main line when it joins two consecutive main-line nodes. Reading it off the
  // spine rather than off `main: true` matters when nothing is marked: the engine inferred the
  // spine in step ③, and the highlight must follow what was inferred, not only what was written.
  const spineNext = new Map(spine.slice(0, -1).map((id, i) => [id, spine[i + 1]]))

  // The back-edge lanes run outside the node field, so the content box has to grow to hold
  // them (plus the padding): the viewport fits to `size` and the image export crops to it,
  // so a lane left outside would be cut off.
  if (laneIndex.size > 0) {
    const lastLane = BACK_LANE_START + (laneIndex.size - 1) * BACK_LANE_W + PAD
    if (vertical) size.width = Math.max(size.width, maxRight + lastLane)
    else size.height = Math.max(size.height, maxBottom + lastLane)
  }

  const connections = []
  for (const [k, group] of grouped) {
    const { from, to } = group[0]
    const s = placed.get(from)
    const t = placed.get(to)
    const isBack = back.has(keyOf(group[0]))
    const labels = group.map((e) => e.condition).filter(Boolean)
    const label = labels.length ? labels.join(' / ') : ''

    // labelAnchor says how the label sits on labelAt (the renderer only reads it, never guesses):
    //   rise    starts just after the point and grows upwards from it (the last drop into a
    //           target: a long label must never run down into the box it points at)
    //   over    centred, sitting on top of the point (above a horizontal segment)
    //   center  centred on the point, masking the line under it (on a back-edge lane)
    let points
    let labelAt
    let labelAnchor

    if (isBack) {
      // round the outside: the exit is on the source node's side along the layer
      // direction, pulled back along an outside lane
      const lane = (laneIndex.get(k) ?? 0)
      if (vertical) {
        const lx = maxRight + BACK_LANE_START + lane * BACK_LANE_W
        const sy = s.y + s.h / 2
        const ty = t.y + t.h / 2
        points = [
          [s.x + s.w, sy],
          [lx, sy],
          [lx, ty],
          [t.x + t.w, ty],
        ]
        labelAt = { x: lx, y: (sy + ty) / 2 }
        labelAnchor = 'center'
      } else {
        const ly = maxBottom + BACK_LANE_START + lane * BACK_LANE_W
        const sx = s.x + s.w / 2
        const tx = t.x + t.w / 2
        points = [
          [sx, s.y + s.h],
          [sx, ly],
          [tx, ly],
          [tx, t.y + t.h],
        ]
        labelAt = { x: (sx + tx) / 2, y: ly }
        labelAnchor = 'center'
      }
    } else if (vertical) {
      const sx = s.x + s.w / 2
      const tx = t.x + t.w / 2
      const sBottom = s.y + s.h
      const tTop = t.y
      if (Math.abs(sx - tx) < 0.5) {
        points = [
          [sx, sBottom],
          [sx, tTop],
        ]
        // Just above the target, like the elbows below: the middle of the gap is where sibling
        // branches turn, so a label there would sit on their horizontal run
        labelAt = { x: sx + 6, y: tTop - 3 }
        labelAnchor = 'rise'
      } else {
        const yMid = (sBottom + tTop) / 2
        points = [
          [sx, sBottom],
          [sx, yMid],
          [tx, yMid],
          [tx, tTop],
        ]
        // On the target's own drop, not the middle of the shared run: branches leaving one
        // source share that run, so labels in its middle land on top of each other, while each
        // branch drops into its own column
        labelAt = { x: tx + 6, y: tTop - 3 }
        labelAnchor = 'rise'
      }
    } else {
      const sy = s.y + s.h / 2
      const ty = t.y + t.h / 2
      const sRight = s.x + s.w
      const tLeft = t.x
      if (Math.abs(sy - ty) < 0.5) {
        points = [
          [sRight, sy],
          [tLeft, ty],
        ]
        // The second half of the run, for the same reason as the vertical case: siblings turn
        // at the middle
        labelAt = { x: ((sRight + tLeft) / 2 + tLeft) / 2, y: sy - 4 }
        labelAnchor = 'over'
      } else {
        const xMid = (sRight + tLeft) / 2
        points = [
          [sRight, sy],
          [xMid, sy],
          [xMid, ty],
          [tLeft, ty],
        ]
        labelAt = { x: (xMid + tLeft) / 2, y: ty - 4 }
        labelAnchor = 'over'
      }
    }

    connections.push({
      id: `c:${from}->${to}`,
      from,
      to,
      kind: isBack ? 'back' : spineNext.get(from) === to ? 'main' : 'branch',
      merged: group.length,
      points,
      d: toPathD(points),
      label,
      labelAt,
      labelAnchor,
    })
  }

  // ⑦ stage bands. Cut **along the main line**, not per node: a stage's branch nodes reach into the
  // next stage's layers (a delay branch hangs below the step that started it), so bands taken per
  // node would overlap. Along the spine a stage runs from its first main-line node to the next
  // stage's first one; the cut lies in the middle of the gap between the two layers. So bands are
  // contiguous and never overlap, by construction. A stage that never appears on the main line
  // gets no band (its nodes still render as usual).
  const stageBands = []
  if (showStages) {
    const rowOf = new Map(rows.map((r, i) => [r.layer, i]))
    const edgeOf = (rowIdx) => (rowIdx <= 0 ? PAD : rows[rowIdx].along - GAP_Y / 2)
    const endAlong = contentAlong - PAD
    let cur = null
    for (const id of spine) {
      const sid = byId.get(id).stageId
      if (!sid || !stageById.has(sid)) continue
      if (cur && cur.stageId === sid) continue
      const at = edgeOf(rowOf.get(layer.get(id) ?? 0))
      if (cur) cur.to = at
      cur = { stageId: sid, label: stageById.get(sid).label, from: at, to: endAlong }
      stageBands.push(cur)
    }
    // The first band starts at the top of the content, even if the entry sits before any stage
    if (stageBands.length) stageBands[0].from = Math.min(stageBands[0].from, PAD)
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
    gutter,
    size,
    stats,
  }
}
