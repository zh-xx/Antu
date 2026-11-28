// @ts-check
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

import { validateProcedure, hintsOfProcedure } from './rules.js'
import { elkLayoutSync } from './elk.js'
import { straighten, linkCost } from './straighten.js'
import { layoutColumnsGen, titleBoxOf, bookmarkBoxOf } from './columns.js'
import {
  layoutMainlineGen,
  economyRepath,
  spreadRectPorts,
  settleGeometryPasses,
  ensureConnectionLabels,
  separateNearParallelCorridors,
  clearStageTitleStrokes,
} from './mainline.js'
import { pathClear, pathCrossCount, findCollinearAmbiguities } from './hangSpineRoute.js'
import { applyStackedStageBands } from './stackedStages.js'
import { analyseProcedureGraph, edgeKey } from './spine.js'
import { polishLinks } from './polish.js'
import { edgesOf } from './router.js'
import { layoutRuleTable } from './ruleTable.js'
import { buildFlowCellGrid, alignStageBoxesToCellGrid } from './cellGrid.js'
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
  LABEL_FONT,
  LABEL_LINE,
  LABEL_PAD_X,
  LABEL_MAX_W,
  MAINLINE_LABEL_MAX_W,
  LABEL_SLACK,
  sizeOf,
  TABLE_GAP,
  wrapLines,
} from './metrics.js'

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

/** The straight run kept before a link meets its node: longer than the arrowhead (7) */
const END_RUN = 12

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
    // The last leg keeps a straight run into the node (END_RUN): the arrowhead points along the last
    // drawn segment, and a segment of length 0 has no direction (the browser then draws it pointing
    // right, whichever side the link enters from; issue #23)
    const outShare = i === points.length - 2 ? Math.max(0, outLen - END_RUN) : outLen / 2
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
 * Line count follows word-aware wrapLines (same chunks ConnectionLayerNode paints) and a
 * slack-scaled greedy ceil, so Chromium scrollWidth/Height stay inside the chip.
 */
export function labelBox(text, maxW = LABEL_MAX_W) {
  const str = String(text ?? '')
  const rawW = textEm(str) * LABEL_FONT * LABEL_SLACK
  const textW = rawW + 6
  const innerMaxW = maxW - LABEL_PAD_X * 2
  const width = Math.min(maxW, Math.ceil(textW + LABEL_PAD_X * 2))
  // Pure CJK condition strings do not hit mixed-script/Latin expansion in Chromium, so 9 chars stay single-line.
  const pureCjk = !/[0-9A-Za-z()（）]/.test(str)
  const lineSlack = pureCjk ? 1.05 : LABEL_SLACK
  const wordLines = wrapLines(str, innerMaxW, LABEL_FONT, pureCjk ? 1.05 : undefined)
  const greedyLines = Math.max(1, Math.ceil((textEm(str) * LABEL_FONT * lineSlack) / innerMaxW - 1e-9))
  const lines = Math.max(wordLines, greedyLines)
  return { width, height: lines * LABEL_LINE + 2 }
}

/**
 * After stage-grid alignment, originCross / stageBoxes may sit left/above of PAD.
 * Shift every piece of ink so the canvas origin stays non-negative with PAD inset.
 * Mutates placed (=== best.placed), connections, stageBoxes, cellGrid, and size in place.
 * @param {{
 *   placed: Map<string, { x: number, y: number, w: number, h: number }>,
 *   connections: Array<{ points?: number[][], labelAt?: { x: number, y: number }, labelSize?: { width: number, height: number }, d?: string, dCurve?: string }>,
 *   stageBoxes: Array<{ x: number, y: number, w: number, h: number }>,
 *   cellGrid: ReturnType<typeof buildFlowCellGrid> | null,
 *   size: { width: number, height: number },
 *   vertical: boolean,
 * }} args
 */
/**
 * Run a vertical-frame geometry pass (settleGeometryPasses / separateNearParallelCorridors)
 * on real coordinates: when horizontal (`vertical === false`), transpose to vertical frame
 * before running and transpose back afterward so flow/cross axes never invert.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {boolean} vertical
 * @param {(p: Map<string, { x: number, y: number, w: number, h: number }>, conns: object[]) => void} fn
 */
function runInVerticalFrame(placed, connections, vertical, fn) {
  if (vertical) {
    fn(placed, connections)
    return
  }
  const flipBox = (r) => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w })
  const flipPt = ([x, y]) => [y, x]
  const vPlaced = new Map([...placed].map(([id, r]) => [id, flipBox(r)]))
  for (const c of connections) {
    c.points = (c.points ?? []).map(flipPt)
    if (c.labelAt) c.labelAt = { x: c.labelAt.y, y: c.labelAt.x }
    if (c.labelSize) c.labelSize = { width: c.labelSize.height, height: c.labelSize.width }
  }
  fn(vPlaced, connections)
  for (const [id, r] of vPlaced) placed.set(id, flipBox(r))
  for (const c of connections) {
    c.points = (c.points ?? []).map(flipPt)
    if (c.labelAt) c.labelAt = { x: c.labelAt.y, y: c.labelAt.x }
    if (c.labelSize) c.labelSize = { width: c.labelSize.height, height: c.labelSize.width }
  }
}

/**
 * Repair nodes whose centres drifted off the cell lattice (>1px). Snap to the nearest
 * free cell centre, then re-route incident edges with settleGeometryPasses.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {{ originCross: number, cellCross: number, cellAlong?: number, rows: Array<{ start: number, size: number }> } | null} cellGrid
 * @param {boolean} vertical
 * @param {Set<string>} diamonds
 * @param {Set<string>} pills
 * @param {Set<string>} [spineIds]
 */
function snapNodesToCellGrid(placed, connections, cellGrid, vertical, diamonds, pills, spineIds = new Set()) {
  if (!cellGrid?.rows?.length || !(cellGrid.cellCross > 0)) return
  const cc = cellGrid.cellCross
  const ca = typeof cellGrid.cellAlong === 'number' && cellGrid.cellAlong > 0 ? cellGrid.cellAlong : cellGrid.rows[0].size
  if (!(ca > 0)) return
  const originAlong = cellGrid.rows[0].start
  const occupied = new Set()
  const keyOf = (col, row) => `${col},${row}`
  for (const r of placed.values()) {
    const cm = vertical ? r.x + r.w / 2 : r.y + r.h / 2
    const am = vertical ? r.y + r.h / 2 : r.x + r.w / 2
    const col = Math.round((cm - cellGrid.originCross) / cc - 0.5)
    const row = Math.round((am - originAlong) / ca - 0.5)
    occupied.add(keyOf(col, row))
  }
  let moved = false
  for (const [id, r] of placed) {
    const cm = vertical ? r.x + r.w / 2 : r.y + r.h / 2
    const am = vertical ? r.y + r.h / 2 : r.x + r.w / 2
    const col = Math.round((cm - cellGrid.originCross) / cc - 0.5)
    const row = Math.round((am - originAlong) / ca - 0.5)
    const colC = cellGrid.originCross + (col + 0.5) * cc
    const rowC = originAlong + (row + 0.5) * ca
    const dCross = Math.abs(cm - colC)
    const dAlong = Math.abs(am - rowC)
    if (dCross <= 1 && dAlong <= 1) continue
    // Search nearest free cell around the intended (col,row).
    let bestCol = col
    let bestRow = row
    let bestDist = Infinity
    let found = false
    for (let rad = 0; rad <= 8 && !found; rad += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        for (let dr = -rad; dr <= rad; dr += 1) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue
          const c2 = col + dc
          const r2 = row + dr
          const k = keyOf(c2, r2)
          // Allow keeping own cell when snapping in place.
          if (occupied.has(k) && !(dc === 0 && dr === 0)) continue
          const cx = cellGrid.originCross + (c2 + 0.5) * cc
          const cy = originAlong + (r2 + 0.5) * ca
          const dist = Math.hypot(cx - cm, cy - am)
          if (dist < bestDist) {
            bestDist = dist
            bestCol = c2
            bestRow = r2
            found = true
          }
        }
      }
    }
    if (!found) continue
    occupied.delete(keyOf(col, row))
    occupied.add(keyOf(bestCol, bestRow))
    const newCross = cellGrid.originCross + (bestCol + 0.5) * cc
    const newAlong = originAlong + (bestRow + 0.5) * ca
    const oldX = r.x
    const oldY = r.y
    if (vertical) {
      r.x = newCross - r.w / 2
      r.y = newAlong - r.h / 2
    } else {
      r.x = newAlong - r.w / 2
      r.y = newCross - r.h / 2
    }
    const dx = r.x - oldX
    const dy = r.y - oldY
    moved = true
    // Translate incident route endpoints with the node; settle repairs the rest.
    for (const c of connections) {
      if (!c.points?.length) continue
      if (c.from === id) {
        c.points[0][0] += dx
        c.points[0][1] += dy
      }
      if (c.to === id) {
        const last = c.points[c.points.length - 1]
        last[0] += dx
        last[1] += dy
      }
    }
  }
  if (!moved) return
  runInVerticalFrame(placed, connections, vertical, (p, conns) => {
    settleGeometryPasses(p, conns, diamonds, spineIds, pills, vertical)
  })
  ensureConnectionLabels(connections, [...placed.values()], [], [], { force: true, preferOnLine: true })
}

function normalizeMainlinePositiveOrigin({ placed, connections, stageBoxes, cellGrid, size, vertical }) {
  let minX = Infinity
  let minY = Infinity
  const consider = (x, y) => {
    if (Number.isFinite(x)) minX = Math.min(minX, x)
    if (Number.isFinite(y)) minY = Math.min(minY, y)
  }
  for (const r of placed.values()) consider(r.x, r.y)
  for (const b of stageBoxes) consider(b.x, b.y)
  for (const c of connections) {
    for (const pt of c.points ?? []) consider(pt[0], pt[1])
    if (c.labelAt) consider(c.labelAt.x, c.labelAt.y)
  }
  if (cellGrid?.rows?.length) {
    const visibleCross0 = cellGrid.hasStages
      ? cellGrid.originCross + (cellGrid.stageColStart ?? 0) * cellGrid.cellCross
      : cellGrid.originCross
    const visibleAlong0 = cellGrid.rows[0].start
    if (vertical) consider(visibleCross0, visibleAlong0)
    else consider(visibleAlong0, visibleCross0)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return

  const dx = minX < PAD ? PAD - minX : 0
  const dy = minY < PAD ? PAD - minY : 0
  if (dx !== 0 || dy !== 0) {
    for (const r of placed.values()) {
      r.x += dx
      r.y += dy
    }
    for (const b of stageBoxes) {
      b.x += dx
      b.y += dy
    }
    for (const c of connections) {
      for (const pt of c.points ?? []) {
        pt[0] += dx
        pt[1] += dy
      }
      if (c.labelAt) {
        c.labelAt.x += dx
        c.labelAt.y += dy
      }
      if (c.points?.length) {
        c.d = toPathD(c.points)
        c.dCurve = toCurveD(c.points)
      }
    }
    if (cellGrid) {
      cellGrid.originCross += vertical ? dx : dy
      for (const row of cellGrid.rows) row.start += vertical ? dy : dx
    }
  }

  let maxX = 0
  let maxY = 0
  for (const r of placed.values()) {
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  for (const b of stageBoxes) {
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  for (const c of connections) {
    for (const pt of c.points ?? []) {
      maxX = Math.max(maxX, pt[0])
      maxY = Math.max(maxY, pt[1])
    }
    if (c.labelAt && c.labelSize) {
      maxX = Math.max(maxX, c.labelAt.x + c.labelSize.width)
      maxY = Math.max(maxY, c.labelAt.y + c.labelSize.height)
    }
  }
  if (cellGrid?.rows?.length) {
    const last = cellGrid.rows[cellGrid.rows.length - 1]
    const alongEnd = last.start + last.size
    const visibleCross1 = cellGrid.hasStages
      ? cellGrid.originCross +
        (cellGrid.stageColStart + (cellGrid.stageColCount > 0 ? cellGrid.stageColCount : cellGrid.cols)) *
          cellGrid.cellCross
      : cellGrid.originCross + cellGrid.cols * cellGrid.cellCross
    if (vertical) {
      maxX = Math.max(maxX, visibleCross1)
      maxY = Math.max(maxY, alongEnd)
    } else {
      maxX = Math.max(maxX, alongEnd)
      maxY = Math.max(maxY, visibleCross1)
    }
  }
  size.width = maxX + PAD
  size.height = maxY + PAD
}

/** Drain a layout generator without pausing (Node / MCP / tests). */
function finishLayout(gen) {
  let step = gen.next()
  while (!step.done) step = gen.next()
  return step.value
}

/** Drain a layout generator, pausing about every 6 ms so the page stays responsive (issue 330). */
function finishLayoutAsync(gen) {
  return new Promise((resolve, reject) => {
    const pump = () => {
      try {
        const t0 = performance.now()
        let step
        do {
          step = gen.next()
          if (step.done) {
            resolve(step.value)
            return
          }
        } while (performance.now() - t0 < 6)
        setTimeout(pump, 0)
      } catch (err) {
        reject(err)
      }
    }
    setTimeout(pump, 0)
  })
}

/**
 * Lay out one procedure spec.
 *
 * The signature matches fact's kinds (spec, fields, view, orientation), because
 * the registry calls them all with the same four parameters. **procedure has no
 * views**; view is accepted and unused (see spec/procedure/schema-draft.md §4.7).
 */
export function buildProcedureGraph(spec, fields = {}, view, orientation = 'vertical') {
  return finishLayout(layOutProcedureGraph(spec, fields, view, orientation))
}

/**
 * Same as `buildProcedureGraph`, but yields to the event loop between heavy steps so the
 * browser can paint and take input (issue 330). Used when an inlined Web Worker would duplicate
 * ELK and push the npm pack over 4 MB.
 * @returns {Promise<object>}
 */
export function buildProcedureGraphAsync(spec, fields = {}, view, orientation = 'vertical') {
  return finishLayoutAsync(layOutProcedureGraph(spec, fields, view, orientation))
}

/**
 * @returns {Generator<void, object, unknown>}
 */
function* layOutProcedureGraph(spec, fields = {}, view, orientation = 'vertical') {
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
      ruleTable: null,
      cellGrid: null,
      size: { width: 0, height: 0 },
      stats: emptyStats(),
    }
  }

  const stageById = new Map((spec.stages ?? []).map((s) => [s.id, s]))
  // ① back edges and ② the main line (shared with Mainline-first and route; spine.js)
  const { byId, back, ruleEnds, spine, spines, spineSet, groups } = analyseProcedureGraph(spec)
  // Ends reached only through rules have no flow edges. Painting them as islands on the
  // canvas confuses readers (no arrow in or out). They stay addressable for the rules table
  // via byId; they are not laid out or drawn.
  const nodes = spec.nodes.filter((n) => !ruleEnds.has(n.id))
  const ids = nodes.map((n) => n.id)

  // ③ ELK. Each stage is a box (an ELK compound node) holding its nodes, drawn with its title:
  // the grouping reads at a glance, and ELK routes links across the boxes and keeps labels
  // clear of them. A node with no stage stays outside every box.
  const showStages = fields?.stages !== false && stageById.size > 0
  const showDetail = fields?.detail === true
  const presentStages = (spec.stages ?? []).filter((st) => nodes.some((n) => n.stageId === st.id))
  const leaf = (n) => {
    const { w, h } = sizeOf(n, showDetail)
    return { id: n.id, width: w, height: h, layoutOptions: {} }
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
      if (c.labelAt && c.labelSize) {
        size.width = Math.max(size.width, c.labelAt.x + c.labelSize.width + PAD)
        size.height = Math.max(size.height, c.labelAt.y + c.labelSize.height + PAD)
      }
    }
    return { placed, stageBoxes, stageTitles, connections, size }
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
  // Current (ELK): stage *data* decides the column path; the Stages *switch* only paints boxes.
  // Mainline-first (issue 190): always one straight spine (implicit stage). Stages on → stacked
  // stage bands along the flow after layout (no side-by-side column fold — that broke the spine).
  const hasStageColumns = presentStages.length > 1 && nodes.every((n) => stageById.has(n.stageId))
  const useMainline = fields?.engine === 'mainline'
  const mainlineStages = [{ id: '__implicit__', label: '' }]
  const mainlineNodes = nodes.map((n) => ({ ...n, stageId: '__implicit__' }))
  // The column layout has no `cost` / `stageTitles`, the single graph has; both are read below
  /** @type {any} */
  let best = null
  /** @type {'mainline' | 'columns' | 'elk'} */
  let layoutEngine
  if (useMainline) {
    const realStageById =
      showStages && nodes.every((n) => n.stageId)
        ? new Map(nodes.map((n) => [n.id, n.stageId]))
        : null
    best = yield* layoutMainlineGen({
      nodes: mainlineNodes,
      groups,
      stages: mainlineStages,
      labelBox: (text) => labelBox(text, MAINLINE_LABEL_MAX_W),
      vertical,
      spine,
      spines,
      fields,
      realStageById,
    })
    layoutEngine = 'mainline'
    // Hard validity: never accept known-unsafe mainline ink as a successful layout.
    // Production chain: routeHangToSpine null → layoutStage stub + routeExhausted → stage
    // assembly spreads the flag → straighten ({...c}) keeps it → mainlineInkInvalid →
    // fall back to current engine (columns when stage data folds, else ELK). Completeness
    // and clearance of that fallback are measured post-return in tests — not assumed hardsafe.
    // ANTU_FORCE_MAINLINE_EXHAUSTION=1 (CI only): stamp one routeExhausted on the assembled
    // mainline result so the real mainlineInkInvalid path runs (does not bypass the flag).
    const forceExhaust =
      typeof globalThis !== 'undefined' &&
      /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (globalThis).process
        ?.env?.ANTU_FORCE_MAINLINE_EXHAUSTION === '1'
    if (forceExhaust && best?.connections?.length) {
      const i = best.connections.findIndex((c) => c.points?.length >= 2)
      const at = i >= 0 ? i : 0
      best.connections[at] = { ...best.connections[at], routeExhausted: true }
    }
    if (mainlineInkInvalid(best)) {
      hints.push(
        'mainline hang→spine exhausted without a clear corridor; fell back to current (ELK/columns) layout — residual mainline ink was not accepted as valid',
      )
      if (hasStageColumns) {
        best = yield* layoutColumnsGen({
          nodes,
          groups,
          stages: presentStages,
          ruleEnds,
          labelBox,
          vertical,
          fields,
        })
        layoutEngine = 'columns'
      } else {
        best = null
        for (const placement of PLACEMENTS) {
          const tried = place(placement)
          const cost = tried.connections.reduce((n, c) => n + linkCost(c, tried.placed, diamonds), 0)
          if (!best || cost < best.cost) best = { ...tried, cost }
          yield
        }
        layoutEngine = 'elk'
      }
    }
  } else if (hasStageColumns) {
    best = yield* layoutColumnsGen({
      nodes,
      groups,
      stages: presentStages,
      ruleEnds,
      labelBox,
      vertical,
      fields,
    })
    layoutEngine = 'columns'
  } else {
    for (const placement of PLACEMENTS) {
      const tried = place(placement)
      const cost = tried.connections.reduce((n, c) => n + linkCost(c, tried.placed, diamonds), 0)
      if (!best || cost < best.cost) best = { ...tried, cost }
      yield
    }
    layoutEngine = 'elk'
  }
  // The last passes over the links (polish.js), as in the column layout
  if (layoutEngine === 'elk') {
    polishSingle(best, diamonds, vertical, byId)
    yield
  }
  const { placed, size } = best
  if (layoutEngine === 'mainline' && best) {
    const canStack =
      showStages && presentStages.length >= 1 && nodes.every((n) => stageById.has(n.stageId))
    if (canStack) {
      const { stageBoxes: bands } = applyStackedStageBands({
        placed: best.placed,
        connections: best.connections,
        size: best.size,
        nodes,
        stages: presentStages,
        spine,
        vertical,
        groups,
        cellAlong: best.cellAlong,
      })
      // If stage-band separation dragged any cross-stage rail across a box or sibling edge,
      // or left long unrelated collinear rails (leave + hang→spine rejoin sharing a gutter),
      // re-settle geometry so 0-hit / 0-cross / 0-collinear invariants hold after the shift.
      const needsSettle =
        best.connections.some((c) => {
          if (!c.points?.length) return false
          if (!pathClear(c.points, best.placed, c.from, c.to)) return true
          const others = best.connections.filter((o) => o !== c).map((o) => o.points)
          return pathCrossCount(c.points, others) > 0
        }) || findCollinearAmbiguities(best.connections).unrelatedOverlaps.length > 0
      if (needsSettle) {
        const pills = new Set(nodes.filter((n) => n.kind === 'start' || n.kind === 'end').map((n) => n.id))
        const allSpine = new Set(best.spineIds ?? spine)
        runInVerticalFrame(best.placed, best.connections, vertical, (p, conns) => {
          settleGeometryPasses(p, conns, diamonds, allSpine, pills, vertical)
        })
        // Re-grow stageBoxes / size if settle pushed an outer corridor past the band edge
        let minC = Infinity
        let maxC = -Infinity
        for (const r of best.placed.values()) {
          minC = Math.min(minC, vertical ? r.x : r.y)
          maxC = Math.max(maxC, vertical ? r.x + r.w : r.y + r.h)
        }
        for (const c of best.connections) {
          for (const [x, y] of c.points ?? []) {
            minC = Math.min(minC, vertical ? x : y)
            maxC = Math.max(maxC, vertical ? x : y)
          }
        }
        const bandC0 = Math.max(16, minC - 28)
        const bandSpan = maxC + 28 - bandC0
        for (const b of bands) {
          if (vertical) {
            b.x = bandC0
            b.w = bandSpan
          } else {
            b.y = bandC0
            b.h = bandSpan
          }
          best.size.width = Math.max(best.size.width, b.x + b.w + PAD)
          best.size.height = Math.max(best.size.height, b.y + b.h + PAD)
        }
      }
      best.stageBoxes = bands
    }
  }
  // Paint only: hide bands when Stages is off, and never paint the synthetic implicit stage
  const stageBoxes = (showStages ? best.stageBoxes : []).filter((b) => b.stageId !== '__implicit__')
  if (best?.connections?.length) {
    // Last-mile economy (mainline only): an edge that still wraps the world for a short join is
    // re-routed to the direct gap/rail path when that costs no crossings. Runs after every other
    // pass, so no later repair can undo it; labels are re-placed on the new ink below.
    // Ports are a budget, not a fixed four: the four cardinals are preferred, the rest of
    // the node outline is equally legal (ports.js). Assign ports before the economy pass so a
    // link that was stacking on an occupied vertex moves to a free one nearby.
    // Port-aware ink repair is opt-in (preset field `mainlinePorts` / ANTU_MAINLINE_PORTS=1).
    // The four-port contracts asserted by test/procedure-mainline*.test.mjs are still the
    // default behaviour; this flag is the place to measure the wider port model against them.
    if (layoutEngine === 'mainline') {
      const portAware = fields?.mainlinePorts === true
      if (portAware) {
        economyRepath(best.placed, best.connections, spineSet, diamonds, vertical)
        spreadRectPorts(best.placed, best.connections, diamonds)
      }
    }
    // All engines: ELK/columns can leave a chip on a node after polish/size changes; force clear.
    const titles = (best.stageBoxes ?? [])
      .filter((b) => b.stageId !== '__implicit__')
      .map((b) => (layoutEngine === 'mainline' ? bookmarkBoxOf(b, b.label) : titleBoxOf(b, b.label, vertical)))
    ensureConnectionLabels(
      best.connections,
      [...best.placed.values()],
      titles,
      stageBoxes.flatMap((b) => edgesOf(b)),
      { force: true, preferOnLine: layoutEngine === 'mainline' },
    )
  }
  const connections = best.connections.map((c) => ({ ...c, d: toPathD(c.points), dCurve: toCurveD(c.points) }))

  // Cell grid + stage snap + positive-origin shift BEFORE rows / ruleTable / rfNodes, so those
  // consumers inherit shifted coordinates (and ruleTable sits under the updated size).
  /** @type {ReturnType<typeof buildFlowCellGrid> | null} */
  let cellGrid = null
  if (layoutEngine === 'mainline' && best?.placed) {
    cellGrid = buildFlowCellGrid({
      placed: [...best.placed.values()],
      connections,
      stageBoxes,
      vertical,
      cellCross: best.cellCross,
      cellAlong: best.cellAlong,
    })
    if (stageBoxes.length) {
      alignStageBoxesToCellGrid(stageBoxes, cellGrid, [...best.placed.values()], vertical)
    }
    // placed === best.placed (destructure above); shift both through the shared Map.
    normalizeMainlinePositiveOrigin({
      placed,
      connections,
      stageBoxes,
      cellGrid,
      size,
      vertical,
    })
    // Sanity: every node centre must sit on a cell centre (±1px). Repair off-lattice leftovers
    // from tree-fork / stage shifts, then rebuild the grid and re-route affected edges.
    const snapPills = new Set(nodes.filter((n) => n.kind === 'start' || n.kind === 'end').map((n) => n.id))
    const snapSpine = new Set(Array.isArray(best?.spineIds) ? best.spineIds : spine)
    snapNodesToCellGrid(placed, connections, cellGrid, vertical, diamonds, snapPills, snapSpine)
    // Stage-band / origin shifts can reintroduce near-parallel corridors — separate again.
    runInVerticalFrame(placed, connections, vertical, (p, conns) => {
      separateNearParallelCorridors(p, conns, diamonds, snapSpine)
    })
    cellGrid = buildFlowCellGrid({
      placed: [...placed.values()],
      connections,
      stageBoxes,
      vertical,
      cellCross: best.cellCross,
      cellAlong: best.cellAlong,
    })
    if (stageBoxes.length) {
      alignStageBoxesToCellGrid(stageBoxes, cellGrid, [...placed.values()], vertical)
      clearStageTitleStrokes(placed, connections, stageBoxes, diamonds, vertical)
    }
    // snap / corridor separation mutate points after the earlier ensureConnectionLabels —
    // re-place chips and refresh path strings so RF sees the final geometry.
    const snapTitles = stageBoxes
      .filter((b) => b.stageId !== '__implicit__')
      .map((b) => bookmarkBoxOf(b, b.label))
    ensureConnectionLabels(
      connections,
      [...placed.values()],
      snapTitles,
      stageBoxes.flatMap((b) => edgesOf(b)),
      { force: true, preferOnLine: true },
    )
    for (const c of connections) {
      if (Array.isArray(c.points) && c.points.length >= 3) {
        const cleaned = [[c.points[0][0], c.points[0][1]]]
        for (let i = 1; i < c.points.length; i += 1) {
          const p = c.points[i]
          const prev = cleaned[cleaned.length - 1]
          if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 0.5) continue
          cleaned.push([p[0], p[1]])
        }
        let changed = true
        while (changed && cleaned.length >= 3) {
          changed = false
          for (let i = 0; i < cleaned.length - 2; i += 1) {
            const [a, b, d] = [cleaned[i], cleaned[i + 1], cleaned[i + 2]]
            const sameX = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - d[0]) < 0.5
            const sameY = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - d[1]) < 0.5
            if (sameX || sameY) {
              cleaned.splice(i + 1, 1)
              changed = true
              break
            }
          }
        }
        c.points = cleaned
      }
      c.d = toPathD(c.points)
      c.dCurve = toCurveD(c.points)
    }
    let maxX = 0
    let maxY = 0
    for (const r of placed.values()) {
      maxX = Math.max(maxX, r.x + r.w)
      maxY = Math.max(maxY, r.y + r.h)
    }
    for (const c of connections) {
      for (const p of c.points ?? []) {
        maxX = Math.max(maxX, p[0])
        maxY = Math.max(maxY, p[1])
      }
      if (c.labelAt && c.labelSize) {
        maxX = Math.max(maxX, c.labelAt.x + c.labelSize.width / 2)
        maxY = Math.max(maxY, c.labelAt.y + c.labelSize.height / 2)
      }
    }
    for (const b of stageBoxes) {
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    }
    size.width = Math.max(size.width, Math.ceil(maxX + PAD))
    size.height = Math.max(size.height, Math.ceil(maxY + PAD))
  }

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

  const backList = spec.edges.filter((e) => back.has(edgeKey(e)))

  // Layers, read back from where ELK put the nodes (for the stats and the popover direction)
  const alongOf = (id) => Math.round(boxes.get(id)?.a0 ?? 0)
  const layerStarts = [...new Set(ids.map(alongOf))].sort((a, b) => a - b)
  const layerOf = (id) => layerStarts.indexOf(alongOf(id))
  const rows = layerStarts.map((a, i) => {
    const inRow = ids.filter((id) => layerOf(id) === i)
    return { layer: i, along: a, extent: Math.max(...inRow.map((id) => (boxes.get(id)?.a1 ?? 0) - a)), count: inRow.length }
  })

  // ④ The rules: a table under the diagram, whatever the orientation (a list turned on its side
  // does not read). See ruleTable.js for why a table and not cards among the nodes.
  const showRules = fields?.rules !== false && Array.isArray(spec.rules) && spec.rules.length > 0
  let ruleTable = null
  if (showRules) {
    ruleTable = layoutRuleTable({
      rules: spec.rules,
      stages: spec.stages ?? [],
      byId,
      x: PAD,
      y: size.height - PAD + TABLE_GAP,
      available: size.width - PAD * 2,
    })
    size.width = Math.max(size.width, ruleTable.x + ruleTable.w + PAD)
    size.height = ruleTable.y + ruleTable.h + PAD
  }
  // How many rules lead to each end: shown on the end, so the table and the diagram point at
  // each other
  const rulesInto = new Map()
  for (const r of spec.rules ?? []) if (r.endId) rulesInto.set(r.endId, (rulesInto.get(r.endId) ?? 0) + 1)

  // the nodes go to React Flow. Sizes travel in data (the same convention as fact's cards)
  const actorById = new Map((spec.actors ?? []).map((a) => [a.id, a]))
  const sourceById = new Map((spec.sources ?? []).map((s) => [s.id, s]))
  // Mainline may invent a local stage trunk (02 st-3) or pin secondary component spines (B08);
  // paint those as spine too so scanners/UI match input main:true / column trunks.
  const drawnSpine = new Set(spineSet)
  if (layoutEngine === 'mainline' && Array.isArray(best?.spineIds)) {
    for (const id of best.spineIds) drawnSpine.add(id)
  }
  const rfNodes = nodes.map((n) => {
    const p = placed.get(n.id)
    const sz = sizeOf(n, showDetail)
    return {
      id: n.id,
      type: 'pnode',
      position: { x: p.x, y: p.y },
      data: {
        node: n,
        w: p.w,
        h: p.h,
        // the width of the text column the size was computed for; the node draws its text in it
        textW: sz.textW,
        cut: sz.cut,
        isSpine: drawnSpine.has(n.id),
        stageLabel: stageById.get(n.stageId)?.label ?? '',
        actorNames: (n.actorIds ?? []).map((id) => actorById.get(id)?.name ?? id),
        sources: (n.sourceIds ?? []).map((id) => sourceById.get(id)).filter(Boolean),
        sourceCount: (n.sourceIds ?? []).filter((id) => sourceById.has(id)).length,
        layer: layerOf(n.id),
        ruleCount: showRules ? (rulesInto.get(n.id) ?? 0) : 0,
        showDetail,
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
    layoutEngine,
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
    /** Every component spine (primary first). Same as `spine` wrapped when only one entry. */
    spines,
    stageBoxes,
    ruleTable,
    cellGrid,
    // Whole pixels: ELK places on fractions, and the canvas and the exported image want integers
    size: { width: Math.ceil(size.width), height: Math.ceil(size.height) },
    stats,
  }
}

/**
 * True when Mainline must not be accepted: missing polylines or explicit routeExhausted
 * stubs from hang→spine corridor exhaustion. Does not reopen preexisting residual
 * pathClear hits as a blanket reject — those stay a separate residual track; C only
 * closes "absolute fallback emitted as clearance success".
 * Exported for forced-exhaustion contract tests at the layout boundary.
 * @param {{ placed?: Map<string, { x: number, y: number, w: number, h: number }>, connections?: Array<{ points?: number[][], from?: string, to?: string, routeExhausted?: boolean }> } | null | undefined} best
 */
export function mainlineInkInvalid(best) {
  if (!best?.placed || !Array.isArray(best.connections)) return true
  for (const c of best.connections) {
    if (!c.points?.length) return true
    if (c.routeExhausted) return true
  }
  return false
}

/**
 * The last passes over the links of the single-graph layout (polish.js), run in the frame polish.js works in (the flow
 * running down): a picture that runs left to right is turned for it and back. Nodes move only across the flow, so the
 * layers read back from the picture stay as they are; the content grows to hold what moved.
 */
function polishSingle(best, diamonds, vertical, byId) {
  const R = vertical ? (r) => ({ ...r }) : (r) => ({ ...r, x: r.y, y: r.x, w: r.h, h: r.w })
  const P = vertical ? (pt) => [...pt] : ([x, y]) => [y, x]
  const turn = (c) => ({
    ...c,
    points: c.points.map(P),
    labelAt: c.labelAt ? (vertical ? { ...c.labelAt } : { x: c.labelAt.y, y: c.labelAt.x }) : null,
    labelSize: c.labelSize ? (vertical ? { ...c.labelSize } : { width: c.labelSize.height, height: c.labelSize.width }) : null,
  })
  const placed = new Map([...best.placed].map(([id, r]) => [id, R(r)]))
  const boxes = best.stageBoxes.map(R)
  const connections = best.connections.map(turn)
  // A node stays in its stage box; with none, it stays clear of the left (or top) of the picture
  const free = { x: PAD / 2 - STAGE_PAD + 6, y: -1e6, w: 1e7, h: 2e7 }
  const boxOf = (id) => boxes.find((b) => b.stageId === byId.get(id)?.stageId) ?? free
  const within = (c) => {
    const b = boxOf(c.from)
    return b !== free && b === boxOf(c.to) ? b : null
  }
  polishLinks({ placed, connections, diamonds, titles: (best.stageTitles ?? []).map(R), boxes, borders: boxes.flatMap(edgesOf), within, boxOf })
  best.placed = new Map([...placed].map(([id, r]) => [id, R(r)]))
  best.connections = connections.map(turn)
  for (const r of best.placed.values()) {
    best.size.width = Math.max(best.size.width, r.x + r.w + PAD)
    best.size.height = Math.max(best.size.height, r.y + r.h + PAD)
  }
  for (const c of best.connections) {
    for (const [x, y] of c.points) {
      best.size.width = Math.max(best.size.width, x + PAD)
      best.size.height = Math.max(best.size.height, y + PAD)
    }
  }
}
