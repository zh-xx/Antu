// ============================================================
//  src/renderers/procedure/flow/layout.js — laying out the flowchart (pure computation)
//
//  Input: a procedure spec that has already passed validation. Output:
//    nodes        React Flow nodes (position, size, the text to show)
//    connections  the geometry of the links (the polyline points, and where the
//                 condition label goes)
//    rules        the rule cards and their lane (spec/procedure/schema-draft.md §11)
//    size         how large the content is
//
//  **edges is always an empty array**, the same as fact's timeline: the links are
//  drawn by a self-drawn layer (ConnectionLayerNode), from the points computed here.
//
//  Who does what:
//    ① back edges (DFS) and ② the main line are recognised here: they are meaning
//      (dashed loops, the highlighted main line), not geometry
//    ③ placement and routing are ELK's layered algorithm (elk.js): layering, crossing
//      minimisation, node placement, orthogonal routing, and room for the condition labels.
//      Each stage is a box holding its nodes (an ELK compound node); main-line edges get
//      priority, so they stay straight
//    ④ stage spans are read off the stage boxes, for the rule lane
//    ⑤ the rule lane is placed beside the node field
//
//  The hand-written layering and router this replaced gave 12 and 38 crossings on
//  contracts 01 and 03; ELK gives 0 and 2 (see elk.js).
// ============================================================

import { validateProcedure, hintsOfProcedure, ruleEndIds } from './rules.js'
import { elkLayoutSync } from './elk.js'
import { straighten, linkCost } from './straighten.js'
import { layoutColumns, placeRules } from './columns.js'
// The same text measure the fact cards use, so a CJK character counts the same everywhere
import { textEm } from '../../fact/cardGeometry.js'
import {
  PAD,
  LAYER_GAP,
  NODE_GAP,
  CORNER_R,
  CURVE_R,
  STAGE_PAD_TOP,
  STAGE_PAD,
  STAGE_TITLE_FONT,
  TRACK,
  LABEL_FONT,
  LABEL_LINE,
  LABEL_PAD_X,
  LABEL_MAX_W,
  RULE_W,
  RULE_MIN_W,
  RULE_GAP,
  RULE_STACK_GAP,
  SCOPE_BAR_GAP,
  SCOPE_BAR_PITCH,
  ruleHeight,
  sizeOf,
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

/**
 * The same polyline drawn curved: every turn becomes a wide arc (a cubic that leaves along one
 * leg and arrives along the next), so the ends still leave and meet their nodes straight on and
 * the route is the one the tests pin; only the corners change. A straight link stays straight.
 */
export function toCurveD(points, r = CURVE_R) {
  if (!Array.isArray(points) || points.length < 2) return ''
  if (points.length === 2) return toPathD(points)
  const d = [`M ${points[0][0]} ${points[0][1]}`]
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const inLen = Math.hypot(cx - px, cy - py)
    const outLen = Math.hypot(nx - cx, ny - cy)
    // A leg shared by two turns gives each half of it; an end leg is all this turn's
    const inShare = i === 1 ? inLen : inLen / 2
    const outShare = i === points.length - 2 ? outLen : outLen / 2
    const rr = Math.max(0, Math.min(r, inShare, outShare))
    if (rr === 0) {
      d.push(`L ${cx} ${cy}`)
      continue
    }
    const inUx = (cx - px) / (inLen || 1)
    const inUy = (cy - py) / (inLen || 1)
    const outUx = (nx - cx) / (outLen || 1)
    const outUy = (ny - cy) / (outLen || 1)
    const k = 0.55
    const sx = cx - inUx * rr
    const sy = cy - inUy * rr
    const ex = cx + outUx * rr
    const ey = cy + outUy * rr
    d.push(`L ${sx} ${sy}`)
    d.push(`C ${sx + inUx * rr * k} ${sy + inUy * rr * k} ${ex - outUx * rr * k} ${ey - outUy * rr * k} ${ex} ${ey}`)
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
 * The box a condition label needs: width capped at LABEL_MAX_W, text wrapped into lines of
 * LABEL_LINE. ELK reserves exactly this box; the stylesheet draws the label in it.
 */
export function labelBox(text) {
  const textW = textEm(text) * LABEL_FONT
  const width = Math.min(LABEL_MAX_W, Math.ceil(textW + LABEL_PAD_X * 2))
  const lines = Math.max(1, Math.ceil(textW / (LABEL_MAX_W - LABEL_PAD_X * 2) - 1e-9))
  return { width, height: lines * LABEL_LINE + 2 }
}

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
      stageBoxes: [],
      rules: [],
      ruleLinks: [],
      size: { width: 0, height: 0 },
      stats: emptyStats(),
    }
  }

  const nodes = spec.nodes
  const stageById = new Map((spec.stages ?? []).map((s) => [s.id, s]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = nodes.map((n) => n.id)

  const outE = new Map(ids.map((id) => [id, []]))
  const inE = new Map(ids.map((id) => [id, []]))
  spec.edges.forEach((e, index) => {
    outE.get(e.from).push({ ...e, index })
    inE.get(e.to).push({ ...e, index })
  })

  // ① recognise back edges: DFS; an edge into a node "still on the current path" is a back
  // edge. Drawn dashed: a loop back reads differently from the way forward.
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
  // Start from the entries: a search that happened to start mid-flow (whatever node is written
  // first) would take the edge back into its own start for the loop and call a forward edge
  // "back". Only nodes no entry reaches are started from afterwards.
  const starters = [...ids.filter((id) => inE.get(id).length === 0), ...ids]
  for (const id of starters) if ((color.get(id) ?? 0) === 0) walk(id)

  // An end reached only through a rule has no incoming edge, but it is not an entry
  const ruleEnds = new Set([...ruleEndIds(spec)].filter((id) => byId.has(id) && inE.get(id).length === 0))

  // ② the main line: walk the main edges; when none is marked main, infer it as
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
  // An edge is on the main line when it joins two consecutive main-line nodes, marked or inferred
  const spineNext = new Map(spine.slice(0, -1).map((id, i) => [id, spine[i + 1]]))

  // Several edges between the same pair of nodes become one link, conditions side by side (§6.1)
  const grouped = new Map()
  for (const e of spec.edges) {
    const k = `${e.from}|${e.to}`
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k).push(e)
  }
  const groups = [...grouped.values()].map((group) => {
    const { from, to } = group[0]
    const isBack = back.has(keyOf(group[0]))
    const labels = group.map((e) => e.condition).filter(Boolean)
    const isMain = !isBack && spineNext.get(from) === to
    return { from, to, isBack, isMain, merged: group.length, label: labels.length ? labels.join(' / ') : '' }
  })

  // ③ ELK. Each stage is a box (an ELK compound node) holding its nodes, drawn with its title:
  // the grouping reads at a glance, and ELK routes links across the boxes and keeps labels
  // clear of them. A node with no stage stays outside every box. An end reached only through
  // rules goes in the last layer of its box.
  const showStages = fields?.stages !== false && stageById.size > 0
  const presentStages = (spec.stages ?? []).filter((st) => nodes.some((n) => n.stageId === st.id))
  const leaf = (n) => {
    const { w, h } = sizeOf(n)
    const opts = ruleEnds.has(n.id) ? { 'elk.layered.layering.layerConstraint': 'LAST' } : {}
    return { id: n.id, width: w, height: h, layoutOptions: opts }
  }
  // Spacing is read per parent: without repeating it here, the inside of a box would fall
  // back to ELK's defaults and be laid out looser than the rest
  const spacing = {
    'elk.spacing.nodeNode': String(NODE_GAP),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
    'elk.spacing.edgeNode': '16',
    'elk.spacing.edgeEdge': '10',
    'elk.spacing.edgeLabel': '4',
    'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  }
  const stageBoxOptions = {
    ...spacing,
    'elk.padding': `[top=${STAGE_PAD_TOP},left=${STAGE_PAD},bottom=${STAGE_PAD},right=${STAGE_PAD}]`,
  }
  const buildGraph = (withStages, placement) => ({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': vertical ? 'DOWN' : 'RIGHT',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
      'elk.edgeRouting': 'ORTHOGONAL',
      ...spacing,
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // How nodes are placed across the flow: tried several ways, see PLACEMENTS below
      ...placement,
      // Keep the order the author wrote nodes and edges in wherever it costs no crossing: the
      // same JSON always gives the same picture. (Not for cycle breaking: back edges arrive
      // already reversed, and the MODEL_ORDER breaker would reverse any edge that points at a
      // node written earlier, loop or not; a node appended at the end of the list then turned
      // the main line upside down.)
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeLabels.inline': 'false',
      // An end reached only through rules has no edge at all; ELK would lay it out as a
      // separate component beside the diagram and ignore its "last layer" constraint
      'elk.separateConnectedComponents': 'false',
      // Stage boxes: links cross box borders, laid out as one graph; coordinates all absolute
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
    },
    children: withStages
      ? [
          ...presentStages.map((st) => ({
            id: `stage:${st.id}`,
            layoutOptions: stageBoxOptions,
            children: nodes.filter((n) => n.stageId === st.id).map(leaf),
          })),
          ...nodes.filter((n) => !presentStages.some((st) => st.id === n.stageId)).map(leaf),
        ]
      : nodes.map(leaf),
    // Back edges go in reversed. The loops were already recognised in step ①; handing ELK a
    // graph with no cycle means its own cycle breaking has nothing to decide, so the result
    // cannot depend on the order the nodes happen to be written in. The points are flipped
    // back below.
    edges: groups.map((g, i) => ({
      id: `g${i}`,
      sources: [g.isBack ? g.to : g.from],
      targets: [g.isBack ? g.from : g.to],
      labels: g.label ? [{ id: `l${i}`, text: g.label, ...labelBox(g.label) }] : [],
      layoutOptions: g.isMain
        ? { 'elk.layered.priority.straightness': '10', 'elk.layered.priority.direction': '10' }
        : {},
    })),
  })
  const diamonds = new Set(nodes.filter((n) => n.kind === 'decision').map((n) => n.id))

  // One complete placement: ELK with the given node placement, links read back and
  // straightened. Returns the node boxes, the stage boxes, the links and the content size.
  const place = (placement) => {
    // Any valid JSON must render: if ELK cannot lay the stages out as boxes (a forward edge from a
    // later stage back into an earlier one can make that impossible), lay out once more without
    // them rather than fail
    let laid
    const boxed = showStages && presentStages.length > 0
    try {
      laid = elkLayoutSync(buildGraph(boxed, placement))
    } catch (err) {
      if (!boxed) throw err
      laid = elkLayoutSync(buildGraph(false, placement))
    }

    // Everything shifts by the padding. Coordinates come back absolute (json.shapeCoords ROOT).
    const ox = PAD
    const oy = PAD
    const placed = new Map()
    const stageBoxes = []
    const collect = (list) => {
      for (const c of list ?? []) {
        if (c.id.startsWith('stage:')) {
          const st = stageById.get(c.id.slice('stage:'.length))
          stageBoxes.push({ stageId: st.id, label: st.label, x: c.x + ox, y: c.y + oy, w: c.width, h: c.height })
          collect(c.children)
        } else {
          placed.set(c.id, { x: c.x + ox, y: c.y + oy, w: c.width, h: c.height })
        }
      }
    }
    collect(laid.children)
    const size = { width: laid.width + ox + PAD, height: laid.height + oy + PAD }

    // ELK attaches links to a node's bounding box. A diamond only fills the middle of its box, so
    // a link leaving the bottom beside the tip would start in the empty corner under a slanted
    // edge. Slide such an end along its own segment until it meets the diamond's outline; the
    // segment keeps its direction, it only gets longer.
    const snapToDiamond = (pt, id) => {
      if (byId.get(id)?.kind !== 'decision') return pt
      const b = placed.get(id)
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

    // Links, straight from ELK's sections. A label comes back as a box (top left and size) that
    // ELK placed clear of every node; the renderer draws it exactly there.
    const byEdge = new Map(laid.edges.map((e) => [e.id, e]))
    const connections = groups.map((g, i) => {
      const e = byEdge.get(`g${i}`)
      const sec = e?.sections?.[0]
      const points = sec
        ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => [p.x + ox, p.y + oy])
        : []
      // A back edge went in reversed; turn it round so it starts at its source again
      if (g.isBack) points.reverse()
      if (points.length >= 2) {
        points[0] = snapToDiamond(points[0], g.from)
        points[points.length - 1] = snapToDiamond(points[points.length - 1], g.to)
      }
      const lab = e?.labels?.[0]
      return {
        id: `c:${g.from}->${g.to}`,
        from: g.from,
        to: g.to,
        kind: g.isBack ? 'back' : g.isMain ? 'main' : 'branch',
        merged: g.merged,
        points,
        d: toPathD(points),
        label: g.label,
        labelAt: lab ? { x: lab.x + ox, y: lab.y + oy } : null,
        labelSize: lab ? { width: lab.width, height: lab.height } : null,
      }
    })
    // Fewer bends than ELK's router leaves: straight first, then one bend (see straighten.js).
    // Stage titles are obstacles, so a link never runs through a stage's name.
    const stageTitles = stageBoxes.map((b) => ({
      x: b.x + STAGE_PAD - 2,
      y: b.y + 7,
      w: Math.min(b.w - STAGE_PAD * 2, textEm(b.label) * STAGE_TITLE_FONT + 4),
      h: 18,
    }))
    const straightened = straighten(connections, placed, stageTitles, vertical, diamonds)
    straightened.forEach((c, i) => {
      connections[i] = { ...c, d: toPathD(c.points), dCurve: toCurveD(c.points) }
    })
    // A route out round the side can reach past ELK's box: the content grows to hold it
    for (const c of connections) {
      for (const [x, y] of c.points) {
        size.width = Math.max(size.width, x + PAD)
        size.height = Math.max(size.height, y + PAD)
      }
      if (c.labelAt) {
        size.width = Math.max(size.width, c.labelAt.x + c.labelSize.width + PAD)
        size.height = Math.max(size.height, c.labelAt.y + c.labelSize.height + PAD)
      }
    }
    return { placed, stageBoxes, connections, size }
  }

  // Node placement decides how many bends are left: where two nodes are not in line no route is
  // straight. No one ELK strategy is best for every contract (Brandes–Köpf aligns across the
  // stage boxes and wins most; network simplex wins where a long branch pulls the main line
  // aside), so each is tried and the picture with the least bending is kept. ELK is quick
  // enough for this; on a tie the first one wins, so the choice is stable.
  const PLACEMENTS = [
    { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED' },
    { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' },
    { 'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF' },
  ]
  // With stages drawn, and every node in one, the stages become columns (columns.js): the flow
  // runs down inside a stage and the stages run across, so the picture is not one long strip.
  // Otherwise, one graph as before.
  const columnMode = showStages && presentStages.length > 1 && nodes.every((n) => stageById.has(n.stageId))
  let best = null
  let columnFrame = null
  if (columnMode) {
    const laid = layoutColumns({ nodes, groups, stages: presentStages, ruleEnds, labelBox, vertical })
    columnFrame = laid.frame
    best = laid
  } else {
    for (const placement of PLACEMENTS) {
      const tried = place(placement)
      const cost = tried.connections.reduce((n, c) => n + linkCost(c, tried.placed, diamonds), 0)
      if (!best || cost < best.cost) best = { ...tried, cost }
    }
  }
  const { placed, stageBoxes, size } = best
  const connections = best.connections.map((c) => ({ ...c, d: toPathD(c.points), dCurve: toCurveD(c.points) }))

  // Boxes in along/across coordinates (along = the direction the layers run)
  const boxes = new Map(
    [...placed.entries()].map(([id, p]) => {
      const a0 = vertical ? p.y : p.x
      const c0 = vertical ? p.x : p.y
      const al = vertical ? p.h : p.w
      const ac = vertical ? p.w : p.h
      return [id, { a0, a1: a0 + al, c0, c1: c0 + ac, am: a0 + al / 2, cm: c0 + ac / 2 }]
    }),
  )

  const backList = spec.edges.filter((e) => back.has(keyOf(e)))

  // Layers, read back from where ELK put the nodes (for the stats and the popover direction)
  const layerStarts = [...new Set(ids.map((id) => Math.round(boxes.get(id).a0)))].sort((a, b) => a - b)
  const layerOf = (id) => layerStarts.indexOf(Math.round(boxes.get(id).a0))
  const rows = layerStarts.map((a, i) => {
    const inRow = ids.filter((id) => layerOf(id) === i)
    return { layer: i, along: a, extent: Math.max(...inRow.map((id) => boxes.get(id).a1 - a)), count: inRow.length }
  })

  // ④ stage spans along the flow, for the rule lane: from the stage boxes when drawn, from the
  // stage's nodes otherwise
  const stageSpans = []
  {
    const extent = presentStages.map((st) => {
      const box = stageBoxes.find((b) => b.stageId === st.id)
      if (box) {
        const lo = vertical ? box.y : box.x
        return { st, lo, hi: lo + (vertical ? box.h : box.w) }
      }
      const own = nodes.filter((n) => n.stageId === st.id).map((n) => boxes.get(n.id))
      return { st, lo: Math.min(...own.map((b) => b.a0)), hi: Math.max(...own.map((b) => b.a1)) }
    })
    for (const x of extent) stageSpans.push({ stageId: x.st.id, label: x.st.label, from: x.lo, to: Math.max(x.hi, x.lo + 1) })
  }

  // ⑤ the rule lane. A rule is a clause that may fire anywhere in its stages ("if the supplier
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
  if (showRules && columnMode) {
    // The column layout: cards under the columns they apply to (columns.js)
    const placedRules = placeRules({
      frame: columnFrame,
      rules: spec.rules,
      stages: presentStages,
      vertical,
      ruleHeight,
      textEm,
      gap: RULE_GAP,
      stackGap: RULE_STACK_GAP,
      cardW: RULE_W,
      cardMinW: RULE_MIN_W,
    })
    rulesOut.push(...placedRules.cards)
    for (const l of placedRules.links) ruleLinks.push({ ...l, d: toPathD(l.points), dCurve: toCurveD(l.points) })
    size.width = Math.max(size.width, placedRules.width)
    size.height = Math.max(size.height, placedRules.height)
  } else if (showRules) {
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
    // A trunk runs down the gap between the node field and the lane, past the last layer, then
    // across to its end and into it from beyond: nothing lies past the last layer, so the trunk
    // crosses no node on the way.
    const lastA1 = Math.max(...[...boxes.values()].map((b) => b.a1))
    let k = 0
    for (const [endId, cards] of byEnd) {
      const trunkC = laneC0 - RULE_GAP / 2 - k * TRACK
      const bottom = lastA1 + LAYER_GAP / 2 + k * TRACK
      k += 1
      const e = boxes.get(endId)
      // Each card joins the trunk a little below its top, level with its consequence
      const stubs = cards.map((c) => c.a0 + 18)
      for (const [n, a] of stubs.entries()) {
        const pts = [P(a, laneC0), P(a, trunkC)]
        ruleLinks.push({ id: `rl:${cards[n].rule.id}`, points: pts, d: toPathD(pts), dCurve: toPathD(pts), arrow: false })
      }
      const pts = [P(Math.min(...stubs), trunkC), P(bottom, trunkC), P(bottom, e.cm), P(e.a1, e.cm)]
      ruleLinks.push({ id: `rt:${endId}`, to: endId, points: pts, d: toPathD(pts), dCurve: toCurveD(pts), arrow: true })
      if (vertical) size.height = Math.max(size.height, bottom + PAD)
      else size.width = Math.max(size.width, bottom + PAD)
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
        ruleLinks.push({ id: `rs:${bar.from}|${bar.to}`, points: pts, d: toPathD(pts), dCurve: toPathD(pts), arrow: false, scope: true })
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
        // the width of the text column the size was computed for; the node draws its text in it
        textW: sizeOf(n).textW,
        isSpine: spineSet.has(n.id),
        stageLabel: stageById.get(n.stageId)?.label ?? '',
        actorNames: (n.actorIds ?? []).map((id) => actorById.get(id)?.name ?? id),
        sources: (n.sourceIds ?? []).map((id) => sourceById.get(id)).filter(Boolean),
        sourceCount: (n.sourceIds ?? []).filter((id) => sourceById.has(id)).length,
        layer: layerOf(n.id),
        showDetail: fields?.detail !== false,
        vertical,
      },
    }
  })

  const stats = {
    nodes: nodes.length,
    edges: spec.edges.length,
    connections: connections.length,
    layers: rows.length,
    widest: Math.max(...rows.map((r) => r.count)),
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
    rows,
    spine,
    stageBoxes,
    rules: rulesOut,
    ruleLinks,
    // Whole pixels: ELK places on fractions, and the canvas and the exported image want integers
    size: { width: Math.ceil(size.width), height: Math.ceil(size.height) },
    stats,
  }
}
