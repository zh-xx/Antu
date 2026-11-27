// @ts-check
// ============================================================
//  src/renderers/procedure/flow/mainline.js — Mainline-first flowchart layout (issue 190)
//
//  Prototype beside the current ELK + polish column layout. Same JSON, same output
//  shape as layoutColumnsGen. Order:
//    1. fix the main line in each stage as a straight vertical column (axis pinned);
//    2. hang branches in lanes as branch regions [leave, rejoin] along the spine index
//       (issue 190 C4). Preferred side is away from the next stage (or right when alone).
//       Overlapping regions prefer opposite sides when free (nested: flip the contained hang;
//       otherwise flip the later leave). Same-side fallback uses containment lanes
//       (shorter/contained → inner; container → outer). Lane order follows containment, not
//       start time. Each box has four face ports (N/S/E/W); the trunk usually owns N+S, so a
//       decision's side exits take E/W — when both are free, two exits do not share one
//       face (loop+back may share a side as a bidirectional hop). First hop sits on the
//       fork's row (0-bend); branches yield — the spine never moves for them;
//    3. branch-exit ends stay in their hang lane (so the leave→…→end chain stays one path);
//       main-line ends already on the spine stay there. Rule-only ends (no flow edges) are
//       omitted upstream — they belong in the rules table, not as islands on the canvas;
//    4. a hang that rejoins the spine enters a free side face (not the trunk's top/bottom).
//       Hang boxes may use N/S freely: leave top/bottom, run in the hang lane to the spine
//       mid-height, then enter the side (1 bend). If blocked: between-lane corridor (leave away
//       from the spine into the next-lane gap) → inward gutter → far outer;
//    5. stack leftover "pocket" nodes beside the hangs;
//    6. pack the (usually single) stage frame; route any remaining cross-segment links;
//    7. light polish, then re-pin the spine axis (polish must not leave the trunk bent).
//
//  Does not cut branches (unlike route). Does not call ELK on the main path.
//  Enabled with fields.engine === 'mainline' (About-panel switch + preset; not a schema field).
//  Caller always passes one implicit stage (`__implicit__`) for a straight trunk; stacked
//  stage bands are applied afterward in layout.js when Stages are on (issue 190).
// ============================================================

import { legalPorts } from './ports.js'
import { straighten } from './straighten.js'
import { edgesOf } from './router.js'
import { ownPart } from './merge.js'
import { polishLinks, linkRouting, placeLabel } from './polish.js'
import { titleBoxOf, bookmarkBoxOf, toReal } from './columns.js'
import { textEm } from '../../fact/cardGeometry.js'
import {
  LAYER_GAP,
  STAGE_PAD_TOP,
  STAGE_PAD,
  STAGE_TITLE_FONT,
  PAD,
  COLUMN_GAP,
  COLUMN_MIN_W,
  sizeOf,
} from './metrics.js'
import {
  OUTER_GAP,
  hangLaneBlocked,
  routeHangToSpine,
  pathClear,
  pathCrossCount,
  pathLength,
  pathBendCount,
  sideHorizontal,
  clearSideHorizontal,
  clearSideChannel,
  clearOuterCorridor,
  clearWrapAround,
  diamondOuterSide,
  firstClearPath,
  findCollinearAmbiguities,
  collinearOverlapLen,
  pathCollinearOverlapCount,
  segHitsBox,
  segRunsOnBoxEdge,
  segFalseConnectsPortOnBoxEdge,
  COLLINEAR_AMBIGUOUS_MIN,
  COLLINEAR_ATTACH_TOL,
  COLLINEAR_UNRELATED_READABILITY_MIN,
} from './hangSpineRoute.js'
import {
  diamondVertices,
  onDiamondOutline,
  staggerOnDiamondSide,
  diamondSidePortCandidates,
  isCardinalDiamondTip,
  betterDiamondEnterCandidate,
  orthoRoutesFromPort,
} from './diamondPorts.js'

/** Gap between the spine column and the first branch lane (room for a condition label on the hop) */
const LANE_GAP = 112
/** Extra room between two branch lanes */
const LANE_SEP = 28

/**
 * Cross-axis x for a box centred in integer column `col` with pitch `cellW`.
 * @param {number} col
 * @param {number} cellW
 * @param {number} w
 */
function columnX(col, cellW, w) {
  return col * cellW + (cellW - w) / 2
}
/** Centre-to-centre span above which spine→hang prefers the hang-lane / corridor helper */
const DISTANT_DY = 280

/**
 * Drain a mainline generator without pausing (Node / MCP / tests).
 * @param {Generator} gen
 */
function finishMainline(gen) {
  let step = gen.next()
  while (!step.done) step = gen.next()
  return step.value
}

/**
 * @param {object} args same shape as layoutColumns, plus `spine: string[]`
 * @returns {{ placed: Map, stageBoxes: object[], connections: object[], size: {width:number,height:number}, frame: object, spineIds?: string[], cellCross?: number, cellAlong?: number }}
 */
export function layoutMainline(args) {
  return finishMainline(layoutMainlineGen(args))
}

/**
 * Mainline-first column layout as a generator (yields between heavy routing steps).
 * @param {{
 *   nodes: object[],
 *   groups: object[],
 *   stages: object[],
 *   labelBox: (text: string) => { width: number, height: number },
 *   vertical: boolean,
 *   spine?: string[],
 *   spines?: string[][],
 *   fields?: object,
 *   realStageById?: Map<string, string> | null,
 * }} args
 * @returns {Generator<void, { placed: Map, stageBoxes: object[], connections: object[], size: {width:number,height:number}, frame: object, spineIds?: string[], cellCross?: number, cellAlong?: number }, unknown>}
 */
export function* layoutMainlineGen({ nodes, groups, stages, labelBox, vertical, spine, spines, fields, realStageById = null }) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const PAD_A0 = vertical ? STAGE_PAD_TOP : STAGE_PAD
  const PAD_C0 = vertical ? STAGE_PAD : STAGE_PAD_TOP
  const diamonds = new Set(nodes.filter((n) => n.kind === 'decision').map((n) => n.id))
  /** Start/end stadiums: E/W poles are arcs — face-parallel ink looks non-cardinal (V08b). */
  const pills = new Set(
    nodes.filter((n) => n.kind === 'start' || n.kind === 'end').map((n) => n.id),
  )
  const showDetail = fields?.detail === true
  const frameSize = (n) => {
    const { w, h } = sizeOf(n, showDetail)
    return vertical ? { w, h } : { w: h, h: w }
  }
  const frameLabel = (text) => {
    const b = labelBox(text)
    return vertical ? b : { width: b.height, height: b.width }
  }

  const spineList = spine ?? []
  /** All component spines (primary first). Falls back to a single list when older callers omit it. */
  const spinesList = Array.isArray(spines) && spines.length ? spines : spineList.length ? [spineList] : []
  // Secondary component spines get their own index maps so hang [leave, rejoin] works per trunk.
  const spineAtAll = new Map()
  for (const path of spinesList) {
    path.forEach((id, i) => {
      if (!spineAtAll.has(id)) spineAtAll.set(id, i)
    })
  }
  /** @type {Map<string, object[]>} */
  const outG = new Map(nodes.map((n) => [n.id, /** @type {object[]} */ ([])]))
  for (const g of groups) outG.get(g.from)?.push(g)

  /** @type {Array<{ st: object, ids: Set<string>, spineIds: string[], spineAxes?: string[][], placed: Map, connections: object[], width: number, height: number, cellW?: number, cellH?: number }>} */
  const segments = []

  for (let si = 0; si < stages.length; si += 1) {
    const st = stages[si]
    const own = nodes.filter((n) => n.stageId === st.id)
    const ownIds = new Set(own.map((n) => n.id))
    // Branch side: away from the next column (next is to the right → hang left = -1).
    // A lone column (only stage / implicit) hangs to the right — there is no "next" to clear.
    const branchSign = si < stages.length - 1 ? -1 : 1
    const seg = layoutStageMainline({
      own,
      ownIds,
      groups,
      outG,
      spineAt: spineAtAll,
      spineList,
      spinesList,
      frameSize,
      frameLabel,
      diamonds,
      branchSign,
      byId,
      forceHangSide: fields?.mainlineHangSide ?? null,
      vertical,
      realStageById,
    })
    segments.push({ st, ids: ownIds, ...seg })
    yield
  }

  const segOf = new Map()
  segments.forEach((seg, i) => {
    for (const id of seg.ids) segOf.set(id, i)
  })

  // Stage boxes side by side (same packing as columns.js ④)
  const placed = new Map()
  const boxes = []
  const connections = []
  /** @type {Map<string, string[][]>} stage → independent trunk id lists (never merge for pin) */
  const spineAxesByStage = new Map()
  let cx = PAD
  for (const st of stages) {
    const segs = segments.filter((seg) => seg.st === st)
    const content = segs.reduce((s, seg) => s + seg.width, 0) + COLUMN_GAP * Math.max(0, segs.length - 1)
    const implicit = st.id === '__implicit__'
    const titleW = implicit ? 0 : textEm(st.label) * STAGE_TITLE_FONT + STAGE_PAD * 2
    const padA = implicit ? PAD : PAD_A0
    const padC = implicit ? PAD : PAD_C0
    const w = Math.max(content + padC + STAGE_PAD, vertical ? titleW : 0, vertical && !implicit ? COLUMN_MIN_W : 0)
    const h = Math.max(Math.max(...segs.map((seg) => seg.height), 0) + padA + STAGE_PAD, vertical ? 0 : titleW)
    boxes.push({ stageId: st.id, label: st.label, x: cx, y: PAD, w, h })
    let ox = cx + padC + (w - padC - STAGE_PAD - content) / 2
    const oy = PAD + padA
    /** @type {string[][]} */
    const axes = []
    for (const seg of segs) {
      for (const [id, r] of seg.placed) placed.set(id, { ...r, x: r.x + ox, y: r.y + oy })
      for (const c of seg.connections) {
        connections.push({
          ...c,
          points: c.points.map(([x, y]) => [x + ox, y + oy]),
          labelAt: c.labelAt ? { x: c.labelAt.x + ox, y: c.labelAt.y + oy } : null,
        })
      }
      const segAxes = Array.isArray(seg.spineAxes) && seg.spineAxes.length ? seg.spineAxes : [seg.spineIds]
      for (const axis of segAxes) {
        if (axis?.length) axes.push([...axis])
      }
      ox += seg.width + COLUMN_GAP
    }
    spineAxesByStage.set(st.id, axes)
    cx += w + COLUMN_GAP
  }
  const tallest = Math.max(...boxes.map((b) => b.h), 0)

  const borders = boxes.filter((b) => b.stageId !== '__implicit__').flatMap(edgesOf)
  const boxOfStage = new Map(boxes.map((b) => [b.stageId, b]))
  const within = (c) => {
    const a = byId.get(c.from)?.stageId
    return a && a === byId.get(c.to)?.stageId ? boxOfStage.get(a) : null
  }
  const titles = boxes.filter((b) => b.stageId !== '__implicit__').map((b) => titleBoxOf(b, b.label, vertical))
  const nodeRects = [...placed.values()]
  const labelRect = (c) => (c.labelAt ? { x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height } : null)
  const ctx = {
    placed,
    connections,
    diamonds,
    titles,
    boxes,
    borders,
    within,
    boxOf: (id) => boxOfStage.get(byId.get(id)?.stageId) ?? null,
  }
  const { routeFor, joinable } = linkRouting(ctx)
  const rank = (g) => (g.isMain ? 0 : g.isBack ? 2 : 1)
  const cross = groups.filter((g) => segOf.get(g.from) !== segOf.get(g.to)).sort((a, b) => rank(a) - rank(b))
  for (const g of cross) {
    const loops = connections.filter((c) => c.kind === 'back' && !g.isBack)
    const points =
      routeFor(
        g,
        connections.filter((c) => !loops.includes(c)),
        loops.flatMap((c) => [c.points[0], c.points[c.points.length - 1]]),
      ) ?? fallbackRoute(placed.get(g.from), placed.get(g.to))
    const labels = connections.map(labelRect).filter(Boolean)
    const size = g.label ? frameLabel(g.label) : null
    const own = ownPart(
      points,
      connections.filter((c) => joinable(g, c)).map((c) => c.points),
    )
    const at = size ? placeLabel(own, size, nodeRects, [...titles, ...labels], connections, borders) : null
    connections.push({
      id: `c:${g.from}->${g.to}`,
      from: g.from,
      to: g.to,
      kind: g.isBack ? 'back' : g.isMain ? 'main' : 'branch',
      inputMain: !!g.inputMain,
      merged: g.merged,
      points,
      label: g.label,
      labelAt: at,
      labelSize: size,
    })
    yield
  }

  const all = straighten(connections, placed, titles, true, diamonds, { borders, within })
  connections.splice(0, connections.length, ...all)
  polishLinks(ctx)
  const cellCross = Math.max(0, ...segments.map((s) => s.cellW ?? 0))
  const cellAlong = Math.max(0, ...segments.map((s) => s.cellH ?? 0))
  // Polish may shove trunk nodes aside to clear a branch: put each trunk axis back
  // independently (multi-component spines must not share one averaged axis), then
  // re-separate columns if polish dragged whole trunks together.
  for (const axes of spineAxesByStage.values()) {
    for (const ids of axes) pinSpineAxis(placed, ids, connections)
    separateSpineAxes(placed, axes, connections, cellCross)
    pushBranchesOffSpine(placed, axes.flat(), connections, cellCross)
  }
  // straighten/polish prefer diamond-point routes; same-row forks stay side-horizontal.
  restoreSameRowLinks(placed, connections, diamonds)
  // Final: linked boxes share centres; every port on a face centre (after polish skew).
  const allSpine = new Set([...spineAxesByStage.values()].flat(2))
  restoreInputMainStraight(placed, connections, allSpine)
  preferCenteredLinks(placed, connections, diamonds, allSpine)
  // straighten/polish above can reintroduce edge crossings that per-stage repair already
  // cleared (L4 horizontal n-7→n-8 vs settlement). Crossing repair must run on the combined
  // frame before labels lock geometry.
  repairEdgeCrossings(placed, connections, diamonds, allSpine)
  restoreSameRowLinks(placed, connections, diamonds)
  restoreInputMainStraight(placed, connections, allSpine)
  repairEdgeCrossings(placed, connections, diamonds, allSpine)
  restoreInputMainStraight(placed, connections, allSpine)
  // Iterate S2 → corridor-separate → cross-repair until port/rail/cross settle (stages-on).
  settleGeometryPasses(placed, connections, diamonds, allSpine, pills, vertical)
  restoreInputMainStraight(placed, connections, allSpine)
  applyTreeForkBus(placed, connections, allSpine, diamonds, boxes, vertical, cellCross, cellAlong)
  separateBidirectionalSameRowLinks(placed, connections, diamonds)
  // Routes moved after the per-stage label pass: drop stale spots and place again.
  ensureConnectionLabels(connections, [...placed.values()], titles, borders, { force: true, preferOnLine: true })
  separateBidirectionalLabels(placed, connections)
  yield

  let width = cx - COLUMN_GAP + PAD
  let height = PAD + tallest + PAD
  for (const r of placed.values()) {
    width = Math.max(width, r.x + r.w + PAD)
    height = Math.max(height, r.y + r.h + PAD)
  }
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

  const frame = { boxes, placed, connections, titles, borders, width, height, diamonds, cellCross, cellAlong }
  return { frame, ...toReal(frame, vertical), spineIds: [...allSpine], cellCross, cellAlong }
}

/**
 * Lay out one stage: spine first, then branch lanes, then pockets.
 * @param {any} args
 */
function layoutStageMainline({
  own,
  ownIds,
  groups,
  outG,
  spineAt,
  spineList,
  spinesList = /** @type {string[][]} */ ([]),
  frameSize,
  frameLabel,
  diamonds,
  branchSign,
  byId,
  forceHangSide = null,
  vertical = true,
  realStageById = null,
}) {
  const placed = new Map()
  const drawn = new Set()

  /** @type {Map<string, object[]>} non-back incoming edges by target */
  const realInFeeders = new Map()
  for (const g of groups) {
    if (g.isBack) continue
    if (!realInFeeders.has(g.to)) realInFeeders.set(g.to, [])
    realInFeeders.get(g.to)?.push(g)
  }
  /**
   * Defer claiming a cross-stage shared sink when an in-stage feeder also reaches it,
   * so stacked stage bands do not freeze a vertical chasm from foreign discovery.
   * @param {string} fromId
   * @param {string} toId
   */
  const shouldDeferCrossStageConverge = (fromId, toId) => {
    if (!realStageById) return false
    const fs = realStageById.get(fromId)
    const ts = realStageById.get(toId)
    if (!fs || !ts || fs === ts) return false
    const feeders = realInFeeders.get(toId) ?? []
    if (feeders.length < 2) return false
    return feeders.some(
      (other) => other.from !== fromId && realStageById.get(other.from) === ts,
    )
  }
  /** @type {Array<{ from: string, to: string, leave: object }>} */
  const deferredCrossClaims = []

  /**
   * When stages fold a hang chain into its own column (02 st-3: n-7…n-12 with no global
   * spine members), invent a local trunk so the column is still a straight Mainline stack
   * rather than a pocket pile. Prefer stage-entry nodes that receive cross-stage mains.
   */
  const discoverLocalTrunk = () => {
    /** @type {Map<string, object[]>} */
    const inOwn = new Map([...ownIds].map((id) => [id, /** @type {object[]} */ ([])]))
    for (const g of groups) {
      if (ownIds.has(g.to)) inOwn.get(g.to)?.push(g)
    }
    const entries = [...ownIds].filter((id) => {
      const ins = inOwn.get(id) ?? []
      return !ins.some((g) => ownIds.has(g.from))
    })
    const ranked = [...entries].sort((a, b) => {
      const aCross = (inOwn.get(a) ?? []).some((g) => !ownIds.has(g.from) && g.isMain) ? 0 : 1
      const bCross = (inOwn.get(b) ?? []).some((g) => !ownIds.has(g.from) && g.isMain) ? 0 : 1
      if (aCross !== bCross) return aCross - bCross
      const aAny = (inOwn.get(a) ?? []).some((g) => !ownIds.has(g.from)) ? 0 : 1
      const bAny = (inOwn.get(b) ?? []).some((g) => !ownIds.has(g.from)) ? 0 : 1
      return aAny - bAny || String(a).localeCompare(String(b))
    })
    /** @type {string[]} */
    const path = []
    const guard = new Set()
    let cur = ranked[0]
    while (cur && ownIds.has(cur) && !guard.has(cur)) {
      guard.add(cur)
      path.push(cur)
      if (byId.get(cur)?.kind === 'end') break
      const outs = (outG.get(cur) ?? [])
        .filter((e) => !e.isBack && ownIds.has(e.to) && !guard.has(e.to))
        .sort(
          (p, q) =>
            Number(!!q.isMain) - Number(!!p.isMain) || String(p.to).localeCompare(String(q.to)),
        )
      const next = outs.find((e) => e.isMain) ?? outs[0]
      if (!next) break
      cur = next.to
    }
    return path
  }

  // Component spines that intersect this stage (primary first). Empty → local trunk.
  const componentSpines = (spinesList.length ? spinesList : spineList.length ? [spineList] : [])
    .map((path) => path.filter((id) => ownIds.has(id)))
    .filter((path) => path.length > 0)
  let spineHere = componentSpines[0] ? [...componentSpines[0]] : spineList.filter((id) => ownIds.has(id))
  /** @type {string[][]} */
  const extraSpines = componentSpines.slice(1)
  /** Local trunk edges (not necessarily global isMain) stay straight like a spine. */
  /** @type {Map<string, string>} */
  const localSpineNext = new Map()
  if (!spineHere.length) {
    spineHere = discoverLocalTrunk()
    for (let i = 0; i < spineHere.length - 1; i += 1) {
      localSpineNext.set(spineHere[i], spineHere[i + 1])
    }
    // Expose local trunk indices so hang leave/rejoin math still works.
    spineHere.forEach((id, i) => {
      if (!spineAt.has(id)) spineAt.set(id, i)
    })
  }

  const maxBoxH = Math.max(0, ...[...ownIds].map((id) => frameSize(byId.get(id)).h))
  // Tree-fork Case B: spine main from a decision whose ≥2 non-main peers converge on a shared
  // off-spine node spans 3 rows — skip that spine edge so it does not inflate every row's cellH.
  /** @type {Set<string>} */
  const treeForkSpineSkip = new Set()
  for (const g of groups) {
    if (!g.isMain || !ownIds.has(g.from) || !ownIds.has(g.to)) continue
    if (byId.get(g.from)?.kind !== 'decision') continue
    const nonMain = (outG.get(g.from) ?? []).filter(
      (e) => !e.isMain && !e.isBack && ownIds.has(e.to),
    )
    if (nonMain.length < 2) continue
    /** @type {Map<string, number>} */
    const sharedHits = new Map()
    for (const e of nonMain) {
      const outs = (outG.get(e.to) ?? []).filter((o) => !o.isBack && ownIds.has(o.to))
      if (outs.length !== 1) continue
      const shared = outs[0].to
      if (spineAt.has(shared) || !ownIds.has(shared)) continue
      sharedHits.set(shared, (sharedHits.get(shared) ?? 0) + 1)
    }
    if ([...sharedHits.values()].some((n) => n >= 2)) {
      treeForkSpineSkip.add(`${g.from}|${g.to}`)
    }
  }
  let maxVertNeed = 0
  for (const g of groups) {
    if (!ownIds.has(g.from) || !ownIds.has(g.to)) continue
    if (treeForkSpineSkip.has(`${g.from}|${g.to}`)) continue
    const sequentialHang = !spineAt.has(g.from) && !spineAt.has(g.to) && !g.isBack
    if (!(g.isMain || localSpineNext.get(g.from) === g.to || sequentialHang)) continue
    const ha = frameSize(byId.get(g.from)).h
    const hb = frameSize(byId.get(g.to)).h
    const lh = g.label ? frameLabel(g.label).height : 0
    // Vertical spine labels sit on the corridor ink (preferOnLine). Reserve full chip
    // height plus vertical ink stubs so lengthenLabeledHops never needs +cellH blank rows.
    const INK_PAD_V = 6
    maxVertNeed = Math.max(maxVertNeed, Math.ceil((ha + hb) / 2 + lh + (lh ? 2 * INK_PAD_V + 2 : 22)))
  }
  const cellH = Math.ceil(Math.max(maxBoxH + 34, maxVertNeed, 120))
  const rowY = (row, h) => row * cellH + (cellH - h) / 2
  const rowOfY = (y, h) => Math.round((y + h / 2) / cellH - 0.5)

  let spineW = 0
  spineHere.forEach((id, i) => {
    const { w, h } = frameSize(byId.get(id))
    placed.set(id, { x: 0, y: rowY(i, h), w, h })
    drawn.add(id)
    spineW = Math.max(spineW, w)
  })
  // Centre spine boxes on a shared axis
  for (const id of spineHere) {
    const r = placed.get(id)
    placed.set(id, { ...r, x: (spineW - r.w) / 2 })
  }
  const spineH = spineHere.length ? spineHere.length * cellH : 0

  // Secondary disconnected-component spines (B08 n-b*): parallel straight columns.
  // Leave a full hang-lane gap between trunks so a decision on the secondary column can
  // still open an inward corridor without exhausting (V08 H-off n-b2→n-x-end).
  // Keep `spineW` as the *primary* column width only — inflating it with extras made
  // spineX0 centre primary nodes inside the combined span and let hang packing shove the
  // primary past the secondary (V08b branch then wrapped over the sibling trunk).
  const primarySpineW = spineW
  /** @type {string[]} */
  const extraSpineIds = []
  {
    let colX = primarySpineW + (primarySpineW ? COLUMN_GAP + LANE_GAP : 0)
    for (const path of extraSpines) {
      let colW = 0
      let ri = 0
      for (const id of path) {
        if (drawn.has(id)) continue
        const { w, h } = frameSize(byId.get(id))
        colW = Math.max(colW, w)
        placed.set(id, { x: colX, y: rowY(ri, h), w, h })
        drawn.add(id)
        extraSpineIds.push(id)
        if (!spineAt.has(id)) spineAt.set(id, path.indexOf(id))
        ri += 1
      }
      const axisX = colX + colW / 2
      for (const id of path) {
        if (!placed.has(id)) continue
        const r = placed.get(id)
        placed.set(id, { ...r, x: axisX - r.w / 2 })
      }
      colX += colW + COLUMN_GAP
    }
  }

  // Hangs: leave the spine, follow until spine / end / already drawn (no cut).
  // Outgoing leave order is sorted by target id so input edge order cannot flip sides/lanes.
  const hangs = []
  for (const u of [...spineHere, ...extraSpineIds]) {
    const leaves = [...(outG.get(u) ?? [])].sort((p, q) => String(p.to).localeCompare(String(q.to)))
    for (const g of leaves) {
      if (!ownIds.has(g.to) && !g.isBack) continue // cross-stage later
      if (g.isMain || g.isBack || localSpineNext.get(g.from) === g.to) continue
      if (spineAt.has(g.to) && ownIds.has(g.to)) continue // arc / jump along or to spine — routed later
      if (drawn.has(g.to) && !spineAt.has(g.to)) continue
      if (shouldDeferCrossStageConverge(u, g.to)) {
        deferredCrossClaims.push({ from: u, to: g.to, leave: g })
        continue
      }
      const boxes = []
      let cur = g.to
      const seen = new Set()
      let rejoin = null
      while (cur && ownIds.has(cur) && !seen.has(cur)) {
        if (spineAt.has(cur)) {
          rejoin = cur
          break
        }
        seen.add(cur)
        boxes.push(cur)
        if (byId.get(cur).kind === 'end') break
        const outs = (outG.get(cur) ?? [])
          .filter((e) => !e.isBack && ownIds.has(e.to))
          .sort((p, q) => Number(!!q.isMain) - Number(!!p.isMain) || String(p.to).localeCompare(String(q.to)))
        const next = outs.find((e) => e.isMain) ?? outs[0]
        if (!next) break
        // Sibling outs from a hang box become further hangs rooted at this box (one level)
        for (const o of outs) {
          if (o === next) continue
          if (spineAt.has(o.to) || drawn.has(o.to) || boxes.includes(o.to)) continue
          if (shouldDeferCrossStageConverge(cur, o.to)) {
            deferredCrossClaims.push({ from: cur, to: o.to, leave: o })
            continue
          }
          hangs.push({ from: cur, rootOnSpine: false, leave: o, boxes: [], rejoin: null, parent: true })
        }
        if (shouldDeferCrossStageConverge(cur, next.to)) {
          deferredCrossClaims.push({ from: cur, to: next.to, leave: next })
          break
        }
        cur = next.to
      }
      hangs.push({ from: u, rootOnSpine: true, leave: g, boxes, rejoin, parent: false })
    }
  }

  // Safety: deferred cross-stage sinks that nobody claimed must still be discovered.
  {
    const claimed = new Set([
      ...spineHere,
      ...extraSpineIds,
      ...hangs.flatMap((h) => h.boxes),
      ...hangs.map((h) => h.leave?.to).filter(Boolean),
    ])
    for (const def of deferredCrossClaims) {
      if (claimed.has(def.to) || drawn.has(def.to) || spineAt.has(def.to)) continue
      if (!ownIds.has(def.to)) continue
      const boxes = []
      let cur = def.to
      const seen = new Set()
      let rejoin = null
      while (cur && ownIds.has(cur) && !seen.has(cur)) {
        if (spineAt.has(cur)) {
          rejoin = cur
          break
        }
        seen.add(cur)
        boxes.push(cur)
        claimed.add(cur)
        if (byId.get(cur)?.kind === 'end') break
        const outs = (outG.get(cur) ?? [])
          .filter((e) => !e.isBack && ownIds.has(e.to))
          .sort((p, q) => Number(!!q.isMain) - Number(!!p.isMain) || String(p.to).localeCompare(String(q.to)))
        const next = outs.find((e) => e.isMain) ?? outs[0]
        if (!next) break
        cur = next.to
      }
      hangs.push({
        from: def.from,
        rootOnSpine: spineAt.has(def.from),
        leave: def.leave,
        boxes,
        rejoin,
        parent: !spineAt.has(def.from),
      })
    }
  }

  // Expand one-level child hangs that only recorded the leave edge
  for (const h of hangs) {
    if (!h.parent || h.boxes.length) continue
    const boxes = []
    let cur = h.leave.to
    const seen = new Set()
    while (cur && ownIds.has(cur) && !seen.has(cur)) {
      if (spineAt.has(cur)) {
        h.rejoin = cur
        break
      }
      seen.add(cur)
      boxes.push(cur)
      if (byId.get(cur).kind === 'end') break
      const outs = (outG.get(cur) ?? []).filter((e) => !e.isBack && ownIds.has(e.to))
      const next = outs[0]
      if (!next) break
      cur = next.to
    }
    h.boxes = boxes
  }

  // Back-edge rejoins are skipped while walking the hang chain (`!e.isBack`). Attach them
  // here so each hang region knows its spine [leave, rejoin] interval (incl. upward loops).
  for (const h of hangs) {
    if (h.rejoin || !h.boxes.length) continue
    const nodes = h.leave?.to ? [h.leave.to, ...h.boxes.filter((id) => id !== h.leave.to)] : h.boxes
    for (const id of nodes) {
      const back = (outG.get(id) ?? []).find((e) => e.isBack && spineAt.has(e.to) && ownIds.has(e.to))
      if (back) {
        h.rejoin = back.to
        break
      }
    }
  }

  // Branch-exit ends stay in hang.boxes (one continuous leave→…→end path). Do not peel them
  // onto the spine: that left hang steps with a dangling stub and an end that looked unlinked.
  // Only ends still unplaced after hangs (rare; e.g. a lone stage of ends) sit on the terminus.
  /** @type {string[]} */
  const endTerminus = []
  {
    // Include secondary component spines so their ends are not re-listed as primary
    // terminus (V08: n-b3 was pinned onto the a-column via a duplicated axis membership).
    const claimed = new Set([...spineHere, ...extraSpineIds, ...hangs.flatMap((h) => h.boxes)])
    for (const n of own) {
      if (n.kind !== 'end' || claimed.has(n.id)) continue
      endTerminus.push(n.id)
      claimed.add(n.id)
    }
    for (const id of endTerminus) {
      spineW = Math.max(spineW, frameSize(byId.get(id)).w)
    }
  }

  // Branch regions: one hang → one [leave, rejoin] interval along the spine index (issue 190 C4).
  // Side and lane are decided here (before placement / local routing). Dead ends are half-open
  // (estimated span from box count). Overlap (incl. nested) → opposite sides when free; same-side
  // fallback packs by span (containment), not leave time.
  const intervals = hangs
    .filter((h) => h.boxes.length)
    .map((h) => {
      const a =
        (spineAt.has(h.from) ? spineAt.get(h.from) : spineAt.get(hangs.find((p) => p.boxes.includes(h.from))?.from)) ?? 0
      const b = (h.rejoin && spineAt.has(h.rejoin) ? spineAt.get(h.rejoin) : undefined) ?? a + Math.max(1, h.boxes.length)
      return { h, a: Math.min(a, b), b: Math.max(a, b) }
    })
  // Shared-convergence dead-end hangs (e.g. a sink reached from several distant branches/spine
  // stations) span every non-back feeder so opposite-side overlap checks see the full region.
  for (const it of intervals) {
    if (it.h.rejoin) continue
    const boxSet = new Set(it.h.boxes)
    for (const g of groups) {
      if (g.isBack || !boxSet.has(g.to)) continue
      const idx =
        spineAt.has(g.from)
          ? spineAt.get(g.from)
          : spineAt.get(hangs.find((p) => p.boxes.includes(g.from))?.from)
      if (idx !== undefined) {
        it.a = Math.min(it.a, idx)
        it.b = Math.max(it.b, idx)
      }
    }
  }

  const regionOverlaps = (p, q) => !(p.b < q.a || q.b < p.a)
  const regionContains = (outer, inner) =>
    outer.a <= inner.a && outer.b >= inner.b && (outer.a < inner.a || outer.b > inner.b)

  const isLoopHang = (h) => {
    const to = h.leave?.to
    if (!to) return false
    return (outG.get(to) ?? []).some((e) => e.isBack && e.to === h.from)
  }
  const mergesIntoSiblingOffSpineHang = (it, other) =>
    it !== other &&
    it.h.rootOnSpine &&
    other.h.rootOnSpine &&
    it.a === other.a &&
    !it.h.rejoin &&
    !other.h.rejoin &&
    it.h.boxes.some((id) => (outG.get(id) ?? []).some((e) => other.h.boxes.includes(e.to)))
  /** @type {Map<object, number>} hang → ±1 */
  const signOf = new Map()
  /** @type {Map<string, object[]>} decision id → hang intervals */
  const forkIntervals = new Map()
  for (const it of intervals) {
    signOf.set(it.h, branchSign)
    if (it.h.rootOnSpine && byId.get(it.h.from)?.kind === 'decision') {
      const list = forkIntervals.get(it.h.from)
      if (list) list.push(it)
      else forkIntervals.set(it.h.from, [it])
    }
  }
  for (const its of forkIntervals.values()) {
    if (its.length < 2) continue
    // Loop+back keeps the preferred face; remaining exits alternate onto the free opposite face.
    const ordered = [...its].sort(
      (p, q) =>
        Number(isLoopHang(q.h)) - Number(isLoopHang(p.h)) ||
        String(p.h.leave?.to ?? '').localeCompare(String(q.h.leave?.to ?? '')) ||
        String(p.h.from).localeCompare(String(q.h.from)),
    )
    ordered.forEach((it, i) => {
      signOf.set(it.h, i % 2 === 0 ? branchSign : -branchSign)
    })
  }

  // Overlapping regions on the same side: flip onto a free opposite face when possible.
  // Nested → only the contained hang moves; non-nested → the later leave moves.
  // Only spine-rooted hangs participate: child hangs (sibling leaves off a hang box) inherit
  // the parent's side/lane below so a branch-exit end cannot migrate to the opposite face.
  // Interval containment can invert for child hangs (estimated span); never flip a spine-rooted
  // hang because a child hang's interval appears to contain it. Loop+back keeps preferred.
  const byLeave = [...intervals].sort(
    (p, q) =>
      p.a - q.a ||
      p.b - q.b ||
      String(p.h.from).localeCompare(String(q.h.from)) ||
      String(p.h.leave?.to ?? '').localeCompare(String(q.h.leave?.to ?? '')),
  )
  for (const it of byLeave) {
    if (isLoopHang(it.h) || !it.h.rootOnSpine) continue
    // If this hang links directly into an earlier spine-rooted hang's box (branch-to-branch
    // merge), keep it on the target hang's side so the link does not wrap over the spine.
    const linkedHang = intervals.find(
      (o) =>
        o !== it &&
        o.h.rootOnSpine &&
        (o.a < it.a || mergesIntoSiblingOffSpineHang(it, o)) &&
        it.h.boxes.some((id) =>
          (outG.get(id) ?? []).some((e) => o.h.boxes.includes(e.to)),
        ),
    )
    if (linkedHang) {
      signOf.set(it.h, /** @type {number} */ (signOf.get(linkedHang.h)))
      continue
    }
    const sign = /** @type {number} */ (signOf.get(it.h))
    for (const other of byLeave) {
      if (other === it || other.a > it.a || !other.h.rootOnSpine) continue
      if (signOf.get(other.h) !== sign) continue
      if (!regionOverlaps(it, other)) continue
      // Interval-container stays on this face.
      if (regionContains(it, other)) continue
      // Child-span artifact: spine-rooted hang looks "inside" a child hang — skip.
      if (regionContains(other, it) && it.h.rootOnSpine && !other.h.rootOnSpine) continue
      const opp = -sign
      // Opposite face is busy on any overlap (incl. containment). Containment lanes are the
      // same-side fallback when we cannot flip — do not treat a containing opposite region as free.
      const oppBusy = intervals.some(
        (o) => o !== it && o.h.rootOnSpine && signOf.get(o.h) === opp && regionOverlaps(it, o),
      )
      if (!oppBusy) signOf.set(it.h, opp)
      break
    }
  }

  // Rejoin-facing adapt (C4): multi-box hang that rejoins a *later* spine station, when another
  // root hang already shares this side (even with non-overlapping spine intervals). Same-side
  // stacks can block the hang→spine corridor (L4 n-10 wrap) though C4 overlap flip does not
  // fire. Prefer a free opposite face — placement-first, not more U-family loops. Solitary
  // hangs keep the preferred face; loop/back (rejoin ≤ leave) and opp-busy stay put.
  for (const it of intervals) {
    if (!it.h.rootOnSpine || isLoopHang(it.h)) continue
    if (!it.h.rejoin || !spineAt.has(it.h.rejoin) || !spineAt.has(it.h.from)) continue
    const leaveIdx = /** @type {number} */ (spineAt.get(it.h.from))
    const rejoinIdx = /** @type {number} */ (spineAt.get(it.h.rejoin))
    if (rejoinIdx <= leaveIdx) continue
    if (it.h.boxes.length < 2) continue
    const sign = /** @type {number} */ (signOf.get(it.h))
    const sameSideOther = intervals.some(
      (o) => o !== it && o.h.rootOnSpine && signOf.get(o.h) === sign,
    )
    if (!sameSideOther) continue
    const opp = -sign
    const oppBusy = intervals.some(
      (o) => o !== it && o.h.rootOnSpine && signOf.get(o.h) === opp && regionOverlaps(it, o),
    )
    if (!oppBusy) signOf.set(it.h, opp)
  }

  // Same-decision root hangs must not share a face after later flips (V08: both leaves
  // collapsed inward toward the sibling component trunk and exhausted the outer corridor).
  for (const its of forkIntervals.values()) {
    if (its.length < 2) continue
    const ordered = [...its].sort((p, q) =>
      String(p.h.leave?.to ?? '').localeCompare(String(q.h.leave?.to ?? '')),
    )
    const seen = new Map()
    for (const it of ordered) {
      if (isLoopHang(it.h)) continue
      if (ordered.some((o) => mergesIntoSiblingOffSpineHang(it, o))) continue
      let sign = /** @type {number} */ (signOf.get(it.h))
      if (seen.has(sign)) {
        const opp = -sign
        const oppBusy = ordered.some(
          (o) => o !== it && !isLoopHang(o.h) && signOf.get(o.h) === opp,
        )
        if (!oppBusy) {
          signOf.set(it.h, opp)
          sign = opp
        }
      }
      seen.set(sign, it)
    }
  }

  // Preview / experiment override: force hang side by spine fork id (e.g. { 'n-4': -1 } = left).
  if (forceHangSide && typeof forceHangSide === 'object') {
    for (const it of intervals) {
      const forced = forceHangSide[it.h.from]
      if (forced === 1 || forced === -1) signOf.set(it.h, forced)
    }
  }

  // Identify which component trunk each spine node belongs to (0 = primary, 1.. = extraSpines).
  /** @type {Map<string, number>} */
  const trunkIdxOf = new Map()
  for (const id of [...spineHere, ...endTerminus]) trunkIdxOf.set(id, 0)
  extraSpines.forEach((path, ti) => {
    for (const id of path) trunkIdxOf.set(id, ti + 1)
  })
  /** @type {Map<object, number>} */
  const hangTrunk = new Map()
  for (const it of intervals) {
    if (it.h.rootOnSpine) hangTrunk.set(it.h, trunkIdxOf.get(it.h.from) ?? 0)
  }
  for (const it of intervals) {
    if (hangTrunk.has(it.h)) continue
    const parent = intervals.find((o) => o.h !== it.h && o.h.boxes.includes(it.h.from))
    hangTrunk.set(it.h, parent ? (hangTrunk.get(parent.h) ?? 0) : 0)
  }

  // Pack lanes per (trunk, side): shorter / contained intervals claim inner lanes first.
  // Child hangs are packed with their parent (same column), not as extra competing regions.
  // Occupied ranges are real intervals (not a single rightmost end) so a later shorter span
  // before an earlier point-interval (e.g. [2,3] after [4,4]) still packs into lane 0.
  /** Input main:true pairs (incl. hang→spine rejoins that are not spineNext). */
  const inputMainAt = new Set(groups.filter((g) => g.inputMain).map((g) => `${g.from}|${g.to}`))
  /** @type {Map<object, number>} */
  const laneOf = new Map()
  /** @type {Map<string, Array<Array<{ a: number, b: number, it: object }>>>} */
  const laneIntervalsByTrunkSign = new Map()
  const getIntervals = (trunk, sign) => {
    const k = `${trunk}:${sign}`
    if (!laneIntervalsByTrunkSign.has(k)) laneIntervalsByTrunkSign.set(k, [])
    return /** @type {Array<Array<{ a: number, b: number, it: object }>>} */ (laneIntervalsByTrunkSign.get(k))
  }
  /**
   * @param {{ a: number, b: number }} p
   * @param {{ a: number, b: number }} q
   */
  const laneIntervalConflicts = (p, q) => {
    const pPoint = p.a === p.b
    const qPoint = q.a === q.b
    if (pPoint && qPoint) return p.a === q.a
    if (pPoint) return p.a >= q.a && p.a <= q.b
    if (qPoint) return q.a >= p.a && q.a <= p.b
    // Positive spans: endpoint touch allowed (rejoin at k, leave at k).
    return !(p.b <= q.a || q.b <= p.a)
  }
  /** @param {{ h: object }} oIt */
  const occupiedRowsOf = (oIt) => {
    if (
      oIt.h.rejoin &&
      oIt.h.boxes.length &&
      inputMainAt.has(`${oIt.h.boxes[oIt.h.boxes.length - 1]}|${oIt.h.rejoin}`)
    ) {
      const rEnd = spineAt.get(oIt.h.rejoin)
      if (rEnd !== undefined) return { start: rEnd - oIt.h.boxes.length + 1, end: rEnd }
    }
    const oLeave = spineAt.get(oIt.h.from)
    if (oLeave === undefined) return null
    const oSameRow =
      byId.get(oIt.h.from)?.kind === 'decision' ||
      (oIt.h.boxes.length === 1 && !isLoopHang(oIt.h)) ||
      isLoopHang(oIt.h)
    const start = oSameRow ? oLeave : oLeave + 1
    return { start, end: start + oIt.h.boxes.length - 1 }
  }
  /**
   * @param {Array<{ a: number, b: number, it: object }>} laneList
   * @param {{ h: object, a: number, b: number }} it
   */
  const canShareConvergenceLane = (laneList, it) => {
    if (!it.h.rootOnSpine || it.h.rejoin || it.h.boxes.length !== 1) return false
    const boxId = it.h.boxes[0]
    const anchorRow = spineAt.get(it.h.from)
    if (anchorRow === undefined) return false
    if (
      !laneList.some((o) =>
        o.it.h.boxes.some((bid) => (outG.get(bid) ?? []).some((e) => !e.isBack && e.to === boxId)),
      )
    ) {
      return false
    }
    for (const o of laneList) {
      if (o.a === anchorRow && o.b === anchorRow && !o.it.h.rejoin && o.it.h.boxes.length === 1) {
        return false
      }
      const occ = occupiedRowsOf(o.it)
      if (!occ || (anchorRow >= occ.start && anchorRow <= occ.end)) return false
    }
    return true
  }
  /** @type {Array<{ region: object, reason: string }>} */
  const spineOpenRequests = []
  const bySpan = [...intervals]
    .filter((it) => it.h.rootOnSpine)
    .sort(
      (p, q) =>
        p.b - p.a - (q.b - q.a) ||
        p.a - q.a ||
        p.b - q.b ||
        String(p.h.from).localeCompare(String(q.h.from)) ||
        String(p.h.leave?.to ?? '').localeCompare(String(q.h.leave?.to ?? '')),
    )
  for (const it of bySpan) {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const trunk = hangTrunk.get(it.h) ?? 0
    const lanes = getIntervals(trunk, sign)
    let lane = 0
    let shared = false
    while (lanes[lane]) {
      if (canShareConvergenceLane(lanes[lane], it)) {
        shared = true
        break
      }
      if (!lanes[lane].some((o) => laneIntervalConflicts(o, it))) break
      lane += 1
    }
    if (!lanes[lane]) lanes[lane] = []
    if (shared) {
      const row = /** @type {number} */ (spineAt.get(it.h.from))
      lanes[lane].push({ a: row, b: row, it })
    } else {
      lanes[lane].push({ a: it.a, b: it.b, it })
    }
    laneOf.set(it.h, lane)
  }
  for (const it of intervals) {
    if (it.h.rootOnSpine && laneOf.has(it.h)) continue
    const parent = intervals.find((o) => o.h !== it.h && o.h.boxes.includes(it.h.from))
    if (parent && laneOf.has(parent.h)) {
      signOf.set(it.h, /** @type {number} */ (signOf.get(parent.h)))
      laneOf.set(it.h, /** @type {number} */ (laneOf.get(parent.h)))
    } else {
      if (!signOf.has(it.h)) signOf.set(it.h, branchSign)
      if (!laneOf.has(it.h)) laneOf.set(it.h, 0)
    }
  }
  // Hook only (issue 190 B3): record when same-side overlap remains after flip — spine may open later.
  for (const it of intervals) {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const peers = intervals.filter(
      (o) =>
        o !== it &&
        signOf.get(o.h) === sign &&
        regionOverlaps(it, o) &&
        !regionContains(it, o) &&
        !regionContains(o, it) &&
        laneOf.get(o.h) === laneOf.get(it.h),
    )
    if (peers.length) spineOpenRequests.push({ region: it, reason: 'same-side-overlap-lane' })
  }
  void spineOpenRequests

  /** @type {Map<number, number[]>} sign → lane widths */
  const laneWBySign = new Map([
    [1, []],
    [-1, []],
  ])
  for (const it of intervals) {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const lane = /** @type {number} */ (laneOf.get(it.h))
    const widths = /** @type {number[]} */ (laneWBySign.get(sign))
    let w = 0
    for (const id of it.h.boxes) w = Math.max(w, frameSize(byId.get(id)).w)
    widths[lane] = Math.max(widths[lane] ?? 0, w)
  }
  const sideWidth = (sign) => {
    const widths = /** @type {number[]} */ (laneWBySign.get(sign))
    if (!widths.length) return 0
    return widths.reduce((s, w) => s + (w ?? 0), 0) + LANE_SEP * Math.max(0, widths.length - 1)
  }
  const leftW = sideWidth(-1)
  const rightW = sideWidth(1)

  // Decision-sibling single ends (e.g.「不准」→终结) sit on the fork's row to the right of the
  // diamond (0-bend), not stacked under the continuing hang chain. Skip boxes the parent hang
  // already owns (shared terminus). Room toward the spine uses hopGap; room further out uses
  // an outer spur on that side.
  const isSideEndHang = (it) => {
    if (it.h.rootOnSpine || it.h.boxes.length !== 1) return false
    const id = it.h.boxes[0]
    if (byId.get(id)?.kind !== 'end') return false
    // Shared terminus already owned by the parent hang chain stays in-lane.
    if (intervals.some((o) => o.h.rootOnSpine && o.h.boxes.includes(id))) return false
    // Decision-sibling single ends sit on the fork's row.
    if (byId.get(it.h.from)?.kind === 'decision') return true
    // Multi-exit hang step → pure unshared dead-end leaf.
    const outs = (outG.get(it.h.from) ?? []).filter((e) => !e.isBack && ownIds.has(e.to))
    if (outs.length < 2) return false
    return groups.filter((g) => !g.isBack && g.to === id).length === 1
  }
  /**
   * True when a left-side side-end must sit inward toward the spine because its parent hang
   * rejoins at or above its fork (keeping the outer west upward-loop channel clear).
   */
  const leftSideEndNeedsInward = (it) => {
    const parentIt = intervals.find((o) => o.h !== it.h && o.h.boxes.includes(it.h.from))
    if (!parentIt) return false
    const fromIdx = spineAt.get(parentIt.h.from)
    if (fromIdx === undefined) return false
    if (parentIt.h.rejoin && spineAt.has(parentIt.h.rejoin)) {
      const rejoinIdx = /** @type {number} */ (spineAt.get(parentIt.h.rejoin))
      if (rejoinIdx <= fromIdx) return true
    }
    return groups.some(
      (g) =>
        parentIt.h.boxes.includes(g.from) &&
        spineAt.has(g.to) &&
        /** @type {number} */ (spineAt.get(g.to)) <= fromIdx,
    )
  }

  // Pairwise column pitch: clear leave/sibling labels without the old LANE_GAP wasteland.
  // Do not inflate for hang→spine rejoin labels: those prefer the long vertical corridor.
  // Same-hang-chain consecutive boxes (e.g. n-15→n-16) also skip — they share a column.
  /** @type {Set<string>} */
  const sameHangChain = new Set()
  for (const it of intervals) {
    for (let k = 0; k < it.h.boxes.length - 1; k += 1) {
      sameHangChain.add(`${it.h.boxes[k]}|${it.h.boxes[k + 1]}`)
    }
  }
  const maxBoxW = Math.max(0, ...[...ownIds].map((id) => frameSize(byId.get(id)).w))
  let cellW = Math.ceil(maxBoxW + 56)
  for (const g of groups) {
    if (!ownIds.has(g.from) || !ownIds.has(g.to)) continue
    if (g.isMain || localSpineNext.get(g.from) === g.to) continue
    if (!g.label) continue
    if (sameHangChain.has(`${g.from}|${g.to}`)) continue
    const fromOn = spineAt.has(g.from)
    const toOn = spineAt.has(g.to)
    // Hang→spine rejoins put their label on the vertical corridor — skip widening.
    if (!fromOn && toOn) continue
    const membershipDiffers = fromOn !== toOn
    const bothHang = !fromOn && !toOn
    if (!membershipDiffers && !bothHang) continue
    // Same hang column (shared centre) — vertical corridor, do not widen cellW.
    if (bothHang) {
      const ra = placed.get(g.from)
      const rb = placed.get(g.to)
      if (ra && rb && Math.abs(ra.x + ra.w / 2 - (rb.x + rb.w / 2)) < 2) continue
    }
    const wa = frameSize(byId.get(g.from)).w
    const wb = frameSize(byId.get(g.to)).w
    cellW = Math.max(cellW, Math.ceil((wa + wb) / 2 + frameLabel(g.label).width + 28))
  }
  const trunkReserves = (ti) => {
    let leftIn = 0
    let leftOut = 0
    let rightOut = 0
    for (const it of intervals) {
      if ((hangTrunk.get(it.h) ?? 0) !== ti || !isSideEndHang(it)) continue
      const sign = /** @type {number} */ (signOf.get(it.h))
      if (sign < 0) {
        if (leftSideEndNeedsInward(it)) leftIn = 1
        else leftOut = 1
      } else {
        rightOut = 1
      }
    }
    return { leftIn, leftOut, rightOut }
  }
  const leftLaneCount = getIntervals(0, -1).length
  const rightLaneCount = getIntervals(0, 1).length
  const r0 = trunkReserves(0)
  const spineCol = leftLaneCount + r0.leftIn + r0.leftOut
  // Ensure vertical col-0 spines clear flush top-left stage bookmarks on narrow-label specs.
  if (vertical && spineCol === 0 && realStageById?.size) {
    cellW = Math.max(cellW, 288)
  }

  /** @type {number[]} */
  const trunkCol = [spineCol]
  let nextCol = spineCol + rightLaneCount + r0.rightOut + 1
  for (let ti = 1; ti <= extraSpines.length; ti += 1) {
    const exLeft = getIntervals(ti, -1).length
    const exRight = getIntervals(ti, 1).length
    const rTi = trunkReserves(ti)
    const exCol = nextCol + exLeft + rTi.leftIn + rTi.leftOut
    trunkCol[ti] = exCol
    nextCol = exCol + exRight + rTi.rightOut + 1
  }

  for (const id of spineHere) {
    const r = placed.get(id)
    if (r) placed.set(id, { ...r, x: columnX(spineCol, cellW, r.w) })
  }
  extraSpines.forEach((path, ti) => {
    const col = trunkCol[ti + 1]
    let ri = 0
    for (const id of path) {
      if (!placed.has(id)) continue
      const r = placed.get(id)
      const { h } = frameSize(byId.get(id))
      placed.set(id, { ...r, x: columnX(col, cellW, r.w), y: rowY(ri, h) })
      ri += 1
    }
  })

  // Decision branches sit on the fork's row (centres aligned → 0-bend side link).
  // Lane keys are scoped by (trunk, side) so opposite-face siblings do not stack on one cursor.
  //
  // Place spine-rooted hangs before child hangs. Hang discovery records a sibling leave as a
  // child hang *before* the parent hang object, so a naive intervals walk drew the child first
  // while `from` (a box still inside the parent) was unplaced → `by = 0` parked branch-exit
  // ends at the canvas top and forced cross-spine routes (L1 litigation / issue 190).
  /** @type {Map<string, number>} */
  const laneCursorRow = new Map()
  const laneKey = (trunk, sign, lane) => `${trunk}:${sign}:${lane}`
  const overlapsAt = (id, x0, y0, w0, h0) => {
    for (const [oid, r] of placed) {
      if (oid === id) continue
      if (x0 + 0.5 < r.x + r.w && r.x + 0.5 < x0 + w0 && y0 + 0.5 < r.y + r.h && r.y + 0.5 < y0 + h0)
        return true
    }
    return false
  }
  const placeHang = (it) => {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const lane = /** @type {number} */ (laneOf.get(it.h))
    const trunk = hangTrunk.get(it.h) ?? 0
    const baseCol = trunkCol[trunk] ?? spineCol
    const reserve = trunkReserves(trunk).leftIn
    const leave = placed.get(it.h.from)
    const fork = byId.get(it.h.from)
    // Sibling end off a hang decision: same row, mirror outward by side unless left needs inward for an upward loop.
    if (isSideEndHang(it) && leave) {
      const id = it.h.boxes[0]
      if (drawn.has(id)) return
      const { w, h } = frameSize(byId.get(id))
      const forkRow = rowOfY(leave.y, leave.h)
      const preferDir = sign < 0 && !leftSideEndNeedsInward(it) ? -1 : 1
      const forkCol = Math.round((leave.x + leave.w / 2) / cellW - 0.5)
      const tryAtRow = (row) => {
        const y = rowY(row, h)
        const jumpsPastForeign = (x0) => {
          const cy = y + h / 2
          for (const [oid, r] of placed) {
            if (oid === id || oid === it.h.from) continue
            if (Math.abs(r.y + r.h / 2 - cy) > Math.max(r.h, h) / 2 + 2) continue
            if (leave.x + leave.w <= r.x + 0.5 && x0 + 0.5 >= r.x + r.w) return true
            if (leave.x + 0.5 >= r.x + r.w && x0 + w <= r.x + 0.5) return true
          }
          return false
        }
        const tryCol = (col) => {
          const x0 = columnX(col, cellW, w)
          return !overlapsAt(id, x0, y, w, h) && !jumpsPastForeign(x0) ? x0 : null
        }
        for (let i = 1; i <= 12; i += 1) {
          const primaryHit = tryCol(forkCol + preferDir * i)
          if (primaryHit !== null) return { x: primaryHit, y }
          const secondaryHit = tryCol(forkCol - preferDir * i)
          if (secondaryHit !== null) return { x: secondaryHit, y }
        }
        return null
      }
      let hit = tryAtRow(forkRow)
      if (!hit) {
        // Stack below the fork on the integer lattice.
        const altCol = forkCol + preferDir
        let x = columnX(altCol, cellW, w)
        for (let rStack = forkRow + 1; rStack < forkRow + 14; rStack += 1) {
          const y = rowY(rStack, h)
          if (!overlapsAt(id, x, y, w, h)) {
            hit = { x, y }
            break
          }
          x = columnX(forkCol, cellW, w)
          if (!overlapsAt(id, x, y, w, h)) {
            hit = { x, y }
            break
          }
        }
      }
      if (hit) {
        placed.set(id, { x: hit.x, y: hit.y, w, h })
        drawn.add(id)
      }
      return
    }
    // Decision fork, or a single-box short branch/end off a plain spine step (not a loop).
    const sameRowWanted = Boolean(
      it.h.rootOnSpine &&
        leave &&
        it.h.boxes.length &&
        (fork?.kind === 'decision' || (it.h.boxes.length === 1 && !isLoopHang(it.h))),
    )
    const key = laneKey(trunk, sign, lane)
    const hangCol = sign < 0 ? baseCol - 1 - reserve - lane : baseCol + 1 + lane
    const lastHangId = it.h.boxes.length ? it.h.boxes[it.h.boxes.length - 1] : null
    const rejoinBox = it.h.rejoin ? placed.get(it.h.rejoin) : null
    const preferRejoinRow = Boolean(
      lastHangId &&
        rejoinBox &&
        inputMainAt.has(`${lastHangId}|${it.h.rejoin}`),
    )
    if (preferRejoinRow) {
      const sizes = it.h.boxes.map((id) => frameSize(byId.get(id)))
      const k = sizes.length
      const rEnd = rowOfY(rejoinBox.y, rejoinBox.h)
      let rows = Array.from({ length: k }, (_, i) => rEnd - k + 1 + i)
      const chainHits = (rowList) => {
        for (let i = 0; i < it.h.boxes.length; i += 1) {
          const id = it.h.boxes[i]
          if (drawn.has(id)) continue
          const { w, h } = sizes[i]
          const x = columnX(hangCol, cellW, w)
          const y = rowY(rowList[i], h)
          if (overlapsAt(id, x, y, w, h)) return true
        }
        return false
      }
      for (let shift = 0; shift < 24 && chainHits(rows); shift += 1) {
        rows = rows.map((r) => r + 1)
      }
      let lastRow = laneCursorRow.get(key) ?? -Infinity
      for (let i = 0; i < it.h.boxes.length; i += 1) {
        const id = it.h.boxes[i]
        if (drawn.has(id)) continue
        const { w, h } = sizes[i]
        placed.set(id, { x: columnX(hangCol, cellW, w), y: rowY(rows[i], h), w, h })
        drawn.add(id)
        lastRow = Math.max(lastRow, rows[i])
      }
      laneCursorRow.set(key, lastRow + 1)
      return
    }
    const localLoop = Boolean(it.h.rootOnSpine && leave && isLoopHang(it.h))
    // Step-rooted single box: try leave row first; if that cell is taken, fall back below.
    let sameRow = sameRowWanted
    if (sameRowWanted && fork?.kind !== 'decision' && it.h.boxes.length === 1) {
      const id = it.h.boxes[0]
      if (!drawn.has(id)) {
        const { w, h } = frameSize(byId.get(id))
        const tryRow = Math.max(laneCursorRow.get(key) ?? -Infinity, rowOfY(leave.y, leave.h))
        const x = columnX(hangCol, cellW, w)
        const y = rowY(tryRow, h)
        if (overlapsAt(id, x, y, w, h)) sameRow = false
      }
    }
    let row
    if (sameRow || localLoop) {
      row = Math.max(laneCursorRow.get(key) ?? -Infinity, leave ? rowOfY(leave.y, leave.h) : 0)
    } else {
      const anchorRow = leave ? rowOfY(leave.y, leave.h) + 1 : 0
      row = Math.max(laneCursorRow.get(key) ?? 0, anchorRow)
    }
    for (const id of it.h.boxes) {
      if (drawn.has(id)) continue
      const { w, h } = frameSize(byId.get(id))
      placed.set(id, { x: columnX(hangCol, cellW, w), y: rowY(row, h), w, h })
      drawn.add(id)
      row += 1
    }
    laneCursorRow.set(key, row)
  }
  const pending = [...intervals]
  while (pending.length) {
    let progress = 0
    for (let i = 0; i < pending.length; ) {
      const it = pending[i]
      if (!it.h.rootOnSpine && !placed.has(it.h.from)) {
        i += 1
        continue
      }
      pending.splice(i, 1)
      placeHang(it)
      progress += 1
    }
    if (!progress) {
      // Broken / cyclic child anchor — place one best-effort so layout still finishes.
      placeHang(/** @type {(typeof pending)[0]} */ (pending.shift()))
    }
  }

  // Place terminus ends on the spine axis after the last spine node (stacked if several).
  let endRow =
    spineHere.length > 0
      ? (() => {
          const last = placed.get(spineHere[spineHere.length - 1])
          return last ? rowOfY(last.y, last.h) + 1 : 0
        })()
      : 0
  for (const id of endTerminus) {
    if (drawn.has(id)) continue
    const { w, h } = frameSize(byId.get(id))
    placed.set(id, { x: columnX(spineCol, cellW, w), y: rowY(endRow, h), w, h })
    drawn.add(id)
    endRow += 1
  }
  const spineColumn = [...spineHere, ...extraSpineIds, ...endTerminus.filter((id) => placed.has(id))]
  const spineIdSet = new Set(spineColumn)

  // Pockets: remaining own nodes not drawn (branch ends already sit in hang boxes)
  const leftover = own.filter((n) => !drawn.has(n.id))
  if (leftover.length) {
    const pocketSign = rightW || !leftW ? 1 : -1
    const maxColEnd = nextCol
    const pocketCol =
      pocketSign < 0
        ? spineCol - 1 - (r0.leftIn + r0.leftOut) - leftLaneCount - 1
        : maxColEnd + 1
    let prow = 0
    for (const n of leftover) {
      const { w, h } = frameSize(n)
      placed.set(n.id, { x: columnX(pocketCol, cellW, w), y: rowY(prow, h), w, h })
      drawn.add(n.id)
      prow += 1
    }
  }
  // Shift everything if any box went negative
  {
    const minX = Math.min(...[...placed.values()].map((r) => r.x))
    if (minX < 0) {
      const dx = -minX
      for (const [id, r] of placed) placed.set(id, { ...r, x: r.x + dx })
    }
  }

  // Inner connections: main straight; same-row branch/back horizontal; hang→spine rejoins enter
  // a free side face (trunk owns N/S); others elbow then polish.
  // Route non-mains with awareness of already-accepted polylines so rejoins prefer 0-crossing corridors.
  const inner = groups.filter((g) => ownIds.has(g.from) && ownIds.has(g.to))
  const connections = []
  for (const g of inner) {
    const a = placed.get(g.from)
    const b = placed.get(g.to)
    if (!a || !b) continue
    const others = connections.map((c) => c.points)
    let points
    // Global main OR local stage trunk (hang folded into its own column) stay straight.
    if (g.isMain || localSpineNext.get(g.from) === g.to) {
      const x0 = a.x + a.w / 2
      const x1 = b.x + b.w / 2
      const y0 = a.y + a.h
      const y1 = b.y
      points =
        Math.abs(x0 - x1) < 0.5
          ? [
              [x0, y0],
              [x1, y1],
            ]
          : [
              [x0, y0],
              [x0, (y0 + y1) / 2],
              [x1, (y0 + y1) / 2],
              [x1, y1],
            ]
    } else if (sameRowLink(a, b)) {
      points =
        clearSideHorizontal(a, b, placed, g.from, g.to, 16, others) ||
        acceptClear(sideHorizontal(a, b), placed, g.from, g.to)
    } else {
      points = routeCentered(a, b, diamonds.has(g.from), placed, g.from, g.to, spineIdSet, others)
    }
    // Connectivity stub if corridors exhausted (null). Mark residual — layout.js must not
    // treat this ink as a clearance success (falls back to current/ELK when any residual).
    let routeExhausted = false
    if (!points?.length) {
      points = fallbackRoute(a, b)
      routeExhausted = true
    }
    const onLocalTrunk = localSpineNext.get(g.from) === g.to
    connections.push({
      id: `c:${g.from}->${g.to}`,
      from: g.from,
      to: g.to,
      // Local stage trunks (hang folded into its own column) count as main ink for straighten/
      // pin/spine-bend reporting — they are the column's straight trunk even without global main.
      kind: g.isBack ? 'back' : g.isMain || onLocalTrunk ? 'main' : 'branch',
      /** Input main:true — may be a hang rejoin that is not spineNext / kind main. */
      inputMain: !!g.inputMain,
      merged: g.merged,
      points,
      routeExhausted,
      label: g.label,
      /** @type {{ x: number, y: number } | null} */
      labelAt: null,
      labelSize: g.label ? frameLabel(g.label) : null,
    })
  }

  polishLinks({
    placed,
    connections,
    diamonds,
    within: () => ({ x: -1e6, y: -1e6, w: 2e6, h: 2e6 }),
    boxOf: () => null,
  })
  // Hard constraint: each trunk keeps its own axis. Never average primary + secondary
  // component spines onto one line (that collapsed B08/V08 stages-off). Pin each axis by
  // its current members' mean, then push trunks apart if polish dragged them together.
  const spineAxes = [
    [...spineHere, ...endTerminus.filter((id) => placed.has(id))],
    ...extraSpines.map((path) => path.filter((id) => placed.has(id))),
  ].filter((ids) => ids.length > 0)
  for (const axis of spineAxes) pinSpineAxis(placed, axis, connections)
  separateSpineAxes(placed, spineAxes, connections, cellW)
  pushBranchesOffSpine(placed, spineColumn, connections, cellW)
  // Polish / pin can rewrite side links; put same-row decision branches and backs back to 0-bend.
  restoreSameRowLinks(placed, connections, diamonds)
  restoreInputMainStraight(placed, connections, spineIdSet)
  // Linked boxes prefer shared centres; every port sits on a face centre (polish must not leave a skew).
  preferCenteredLinks(placed, connections, diamonds, spineIdSet)
  // Labelled hops shorter than their text: after centres settle (same-row hang↔hang can be only
  // LANE_SEP wide), push so the chip still leaves a stub of ink on each side.
  lengthenLabeledHops(placed, connections, spineIdSet, diamonds, cellW, cellH)
  restoreSameRowLinks(placed, connections, diamonds)
  restoreInputMainStraight(placed, connections, spineIdSet)
  // Side-channel / outer-corridor backs: push the vertical run outward until an on-ink label fits.
  clearCorridorForLabels(placed, connections)
  // Final gate: repair foreign-box cuts, then reduce edge crossings without reintroducing hits.
  // Region/lane placement already ran; this only repairs residual ink, never drops edges.
  for (const c of connections) {
    if (c.kind === 'main') continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !c.points?.length) continue
    if (pathClear(c.points, placed, c.from, c.to)) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const reroute = routeCentered(a, b, diamonds.has(c.from), placed, c.from, c.to, spineIdSet, others)
    if (reroute && reroute.length >= 2 && pathClear(reroute, placed, c.from, c.to)) c.points = reroute
  }
  repairEdgeCrossings(placed, connections, diamonds, spineIdSet)
  restoreSameRowLinks(placed, connections, diamonds)
  restoreInputMainStraight(placed, connections, spineIdSet)
  // Crossing repair must be last geometry pass: restoreSameRowLinks can still rewrite ink
  // (even crossing-aware) and must not leave a higher-cross state than repair achieved.
  repairEdgeCrossings(placed, connections, diamonds, spineIdSet)
  restoreInputMainStraight(placed, connections, spineIdSet)
  // Iterate S2 → corridor-separate → cross-repair until port/rail/cross settle.
  const pills = new Set(
    [...ownIds].filter((id) => {
      const k = byId.get(id)?.kind
      return k === 'start' || k === 'end'
    }),
  )
  settleGeometryPasses(placed, connections, diamonds, spineIdSet, pills, vertical)
  restoreInputMainStraight(placed, connections, spineIdSet)
  separateBidirectionalSameRowLinks(placed, connections, diamonds)
  // Prefer on-line labels (opaque chip covers the stroke); re-place after geometry settles.
  ensureConnectionLabels(connections, [...placed.values()], [], [], { force: true, preferOnLine: true })
  separateBidirectionalLabels(placed, connections)

  // Normalise to 0,0 and measure
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
  for (const c of connections) {
    for (const [x, y] of c.points) grow(x, y)
  }
  if (!Number.isFinite(x0)) {
    x0 = 0
    y0 = 0
    x1 = 0
    y1 = 0
  }
  for (const [id, r] of placed) placed.set(id, { ...r, x: r.x - x0, y: r.y - y0 })
  for (const c of connections) {
    c.points = c.points.map(([x, y]) => [x - x0, y - y0])
    if (c.labelAt) c.labelAt = { x: c.labelAt.x - x0, y: c.labelAt.y - y0 }
  }
  return {
    placed,
    connections,
    spineIds: spineColumn,
    /** Independent trunks for pinSpineAxis — primary (+ terminus), then secondary components. */
    spineAxes,
    width: Math.max(spineW, x1 - x0),
    height: Math.max(spineH, y1 - y0),
    cellW,
    cellH,
  }
}

/**
 * After per-trunk pin, ensure independent component spines stay at least COLUMN_GAP apart
 * (centre-to-centre ≥ half-widths + gap). Keeps *declared* axis order (primary leftmost,
 * then extras) — sorting by current cx let a left-shifted primary land right of its
 * secondary and forced V08b branches to wrap over the sibling trunk. Translates each later
 * trunk *and its reachable hang/end boxes* as a rigid component, then rebuilds mains.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {string[][]} spineAxes
 * @param {object[]} [connections]
 * @param {number} [cellW]
 */
function separateSpineAxes(placed, spineAxes, connections = [], cellW = 0) {
  if (!spineAxes || spineAxes.length < 2) return
  /** @type {{ ids: string[], cx: number, half: number }[]} */
  const cols = []
  for (const ids of spineAxes) {
    const live = ids.filter((id) => placed.has(id))
    if (!live.length) continue
    let sum = 0
    let half = 0
    for (const id of live) {
      const r = placed.get(id)
      if (!r) continue
      sum += r.x + r.w / 2
      half = Math.max(half, r.w / 2)
    }
    // Preserve spineAxes order (primary first). Do not re-sort by cx.
    cols.push({ ids: live, cx: sum / live.length, half })
  }
  /** Reachable non-spine boxes for one trunk (disconnected-component hangs/ends). */
  const reachableOf = (axisIds) => {
    const set = new Set(axisIds)
    let grew = true
    while (grew) {
      grew = false
      for (const c of connections) {
        if (!c?.from || !c?.to) continue
        if (set.has(c.from) && placed.has(c.to) && !set.has(c.to)) {
          set.add(c.to)
          grew = true
        }
        if (set.has(c.to) && placed.has(c.from) && !set.has(c.from)) {
          set.add(c.from)
          grew = true
        }
      }
    }
    return set
  }
  /** Spine ids claimed by other trunks — never drag those with this column. */
  const foreignSpine = (except) => {
    const s = new Set()
    for (const col of cols) {
      if (col === except) continue
      for (const id of col.ids) s.add(id)
    }
    return s
  }
  for (let i = 1; i < cols.length; i += 1) {
    const prev = cols[i - 1]
    const cur = cols[i]
    // Use the right extent of the previous *component* (spine + hangs already placed).
    let prevRight = prev.cx + prev.half
    const prevReach = reachableOf(prev.ids)
    for (const id of prevReach) {
      const r = placed.get(id)
      if (r) prevRight = Math.max(prevRight, r.x + r.w)
    }
    const minCx = prevRight + COLUMN_GAP + LANE_GAP + cur.half
    let dx = minCx - cur.cx
    if (dx <= 0.5) continue
    if (cellW > 0) dx = Math.ceil(dx / cellW) * cellW
    const foreign = foreignSpine(cur)
    const reach = reachableOf(cur.ids)
    for (const id of reach) {
      if (foreign.has(id)) continue
      const r = placed.get(id)
      if (r) placed.set(id, { ...r, x: r.x + dx })
    }
    cur.cx += dx
    // Rebuild mains on this trunk; nudge incident non-main ends.
    pinSpineAxis(placed, cur.ids, connections)
  }
}

/**
 * Pin every spine node to one vertical axis (shared centre x). Rebuild main links as straight;
 * nudge other link ends that left a moved spine node. Branches must yield — never the trunk.
 * Call once per independent trunk — never average primary + secondary component spines together.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {string[]} spineIds
 * @param {object[]} [connections]
 */
function pinSpineAxis(placed, spineIds, connections = []) {
  const ids = spineIds.filter((id) => placed.has(id))
  if (ids.length === 0) return
  // Use the majority (mode) x-centre among spine members so a single outlier nudged by
  // polishLinks snaps back onto the cell column lattice rather than dragging the whole trunk.
  /** @type {Map<string, { count: number, sum: number }>} */
  const buckets = new Map()
  for (const id of ids) {
    const r = placed.get(id)
    if (!r) continue
    const cx = r.x + r.w / 2
    const key = String(Math.round(cx * 2) / 2)
    const entry = buckets.get(key)
    if (entry) {
      entry.count += 1
      entry.sum += cx
    } else {
      buckets.set(key, { count: 1, sum: cx })
    }
  }
  let axis = 0
  let bestCount = -1
  for (const entry of buckets.values()) {
    if (entry.count > bestCount) {
      bestCount = entry.count
      axis = entry.sum / entry.count
    }
  }
  /** @type {Map<string, number>} */
  const dxOf = new Map()
  for (const id of ids) {
    const r = placed.get(id)
    if (!r) continue
    const dx = axis - (r.x + r.w / 2)
    if (Math.abs(dx) < 0.01) continue
    dxOf.set(id, dx)
    placed.set(id, { ...r, x: r.x + dx })
  }
  const spineSet = new Set(ids)
  for (const c of connections) {
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !c.points?.length) continue
    if (c.kind === 'main' && spineSet.has(c.from) && spineSet.has(c.to)) {
      const x0 = a.x + a.w / 2
      const x1 = b.x + b.w / 2
      c.points =
        Math.abs(x0 - x1) < 0.5
          ? [
              [x0, a.y + a.h],
              [x1, b.y],
            ]
          : [
              [x0, a.y + a.h],
              [x0, (a.y + a.h + b.y) / 2],
              [x1, (a.y + a.h + b.y) / 2],
              [x1, b.y],
            ]
      continue
    }
    const da = dxOf.get(c.from) ?? 0
    const db = dxOf.get(c.to) ?? 0
    if (!da && !db) continue
    const pts = c.points.map((p) => [...p])
    if (da) {
      pts[0][0] += da
      if (pts.length > 1 && Math.abs(pts[1][0] - (pts[0][0] - da)) < 0.5) pts[1][0] += da
    }
    if (db) {
      const last = pts.length - 1
      pts[last][0] += db
      if (last > 0 && Math.abs(pts[last - 1][0] - (pts[last][0] - db)) < 0.5) pts[last - 1][0] += db
    }
    c.points = pts
  }
}

/**
 * If a non-spine node overlaps the pinned trunk, shove it into the nearer side lane.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {string[]} spineIds
 * @param {object[]} [connections] optional — inputMain same-row rejoins keep a readable hop gap
 * @param {number} [cellW]
 */
function pushBranchesOffSpine(placed, spineIds, connections = [], cellW = 0) {
  const spineSet = new Set(spineIds)
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const spines = []
  for (const id of spineIds) {
    const r = placed.get(id)
    if (r) spines.push(r)
  }
  if (!spines.length) return
  const axis = spines.reduce((s, r) => s + r.x + r.w / 2, 0) / spines.length
  /** 0-bend fork-row sibling ends (diamond→end same row) — do not shove off the spine bbox. */
  const forkRowEnds = new Set()
  for (const c of connections) {
    if (c.kind !== 'branch' && c.kind !== 'back') continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !sameRowLink(a, b) || spineSet.has(c.to) || spineSet.has(c.from)) continue
    const fromDiamond = Math.abs(a.w - a.h) < 24 && a.w < 200
    const toEnd = b.w > b.h * 1.35
    const revDiamond = Math.abs(b.w - b.h) < 24 && b.w < 200
    const revEnd = a.w > a.h * 1.35
    if (fromDiamond && toEnd) forkRowEnds.add(c.to)
    if (revDiamond && revEnd) forkRowEnds.add(c.from)
  }
  /** Hang ids that intentionally share a row with an input-main spine rejoin target. */
  const inputMainHang = new Set()
  for (const c of connections) {
    if (!c.inputMain || c.kind === 'main') continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !sameRowLink(a, b)) continue
    if (spineSet.has(c.from) && !spineSet.has(c.to)) inputMainHang.add(c.to)
    if (spineSet.has(c.to) && !spineSet.has(c.from)) inputMainHang.add(c.from)
  }
  const clearDefault = 10
  const clearMain = LANE_GAP
  for (const [id, r] of [...placed]) {
    if (spineSet.has(id)) continue
    if (forkRowEnds.has(id)) continue
    for (const s of spines) {
      if (!(r.x < s.x + s.w - 0.5 && s.x < r.x + r.w - 0.5 && r.y < s.y + s.h - 0.5 && s.y < r.y + r.h - 0.5)) continue
      const clear = inputMainHang.has(id) ? clearMain : clearDefault
      const away = r.x + r.w / 2 < axis ? -1 : 1
      let nx = away < 0 ? s.x - clear - r.w : s.x + s.w + clear
      if (cellW > 0) {
        const sCx = s.x + s.w / 2
        const dist = Math.abs(nx + r.w / 2 - sCx)
        const step = Math.max(1, Math.ceil(dist / cellW))
        nx = sCx + away * step * cellW - r.w / 2
      }
      placed.set(id, { ...r, x: nx })
      break
    }
  }
  // Same-row inputMain rejoin: even without bbox overlap, keep ≥ LANE_GAP so the 0-bend hop is readable.
  for (const c of connections) {
    if (!c.inputMain || c.kind === 'main') continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !sameRowLink(a, b)) continue
    const fromSpine = spineSet.has(c.from)
    const toSpine = spineSet.has(c.to)
    if (fromSpine === toSpine) continue
    const hangId = fromSpine ? c.to : c.from
    const spineId = fromSpine ? c.from : c.to
    const hang = placed.get(hangId)
    const spine = placed.get(spineId)
    if (!hang || !spine) continue
    const hangRight = hang.x >= spine.x + spine.w / 2
    const gap = hangRight ? hang.x - (spine.x + spine.w) : spine.x - (hang.x + hang.w)
    if (gap >= clearMain - 0.5) continue
    const need = clearMain - gap
    const shift = cellW > 0 ? Math.ceil(need / cellW) * cellW : need
    placed.set(hangId, { ...hang, x: hang.x + (hangRight ? shift : -shift) })
  }
}

/**
 * Rebuild every link that touches a moved node, attaching at face centres.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} moved
 * @param {Set<string>} diamonds
 * @param {Set<string> | undefined} [spineIds]
 */
function rebuildIncidentLinks(placed, connections, moved, diamonds, spineIds) {
  if (!moved.size) return
  for (const c of connections) {
    if (!moved.has(c.from) && !moved.has(c.to)) continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    const pts = routeCentered(a, b, diamonds.has(c.from), placed, c.from, c.to, spineIds)
    if (pts?.length) {
      c.points = pts
      c.routeExhausted = false
    } else if (!c.points?.length) {
      c.points = fallbackRoute(a, b)
      c.routeExhausted = true
    } else {
      // Keep prior ink; flag residual if it still hits so layout boundary can fall back.
      c.routeExhausted = !pathClear(c.points, placed, c.from, c.to)
    }
  }
}

/**
 * Prefer centred links: snap a decision's near hang back onto the fork row when that does
 * not overlap another box, then rebuild branch/back ports onto face centres. Main trunk
 * routes from polish stay put; backs that would cut through a same-column box keep a side channel.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string> | undefined} [spineIds]
 */
function preferCenteredLinks(placed, connections, diamonds, spineIds) {
  const overlaps = (a, b) =>
    a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
  for (const c of connections) {
    if (c.kind !== 'branch' && c.kind !== 'back') continue
    if (!diamonds.has(c.from) && !diamonds.has(c.to)) continue
    const fork = diamonds.has(c.from) ? placed.get(c.from) : placed.get(c.to)
    const hang = diamonds.has(c.from) ? placed.get(c.to) : placed.get(c.from)
    const hangId = diamonds.has(c.from) ? c.to : c.from
    if (!fork || !hang) continue
    // Spine nodes stay pinned to their layer spacing — a hang diamond rejoining a spine
    // box must never drag the spine box onto the hang's row (crushes spine gap).
    if (spineIds?.has(hangId)) continue
    const forkCy = fork.y + fork.h / 2
    const hangCy = hang.y + hang.h / 2
    // Already centred, or a deep stack — leave the stack alone.
    if (Math.abs(forkCy - hangCy) < 2 || Math.abs(forkCy - hangCy) > fork.h) continue
    // Input main:true rejoin (hang→spine) already sits on the rejoin row for a 0-bend.
    // Do not snap that hang back onto the fork row for leave centering (08 n-14→n-15).
    const holdsInputMainRow = connections.some((o) => {
      if (!o.inputMain || o.kind === 'main') return false
      if (o.from !== hangId && o.to !== hangId) return false
      const otherId = o.from === hangId ? o.to : o.from
      const other = placed.get(otherId)
      return !!(other && sameRowLink(hang, other))
    })
    if (holdsInputMainRow) continue
    const next = { ...hang, y: forkCy - hang.h / 2 }
    if ([...placed].some(([id, r]) => id !== hangId && overlaps(next, r))) continue
    placed.set(hangId, next)
  }
  for (const c of connections) {
    // Spine mains keep their polished routes; only re-centre branch / back ports.
    if (c.kind === 'main') continue
    if (c.biSeparated) continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const pts = routeCentered(a, b, diamonds.has(c.from), placed, c.from, c.to, spineIds, others)
    if (pts?.length) {
      c.points = pts
      c.routeExhausted = false
    } else if (!c.points?.length) {
      c.points = fallbackRoute(a, b)
      c.routeExhausted = true
    } else {
      c.routeExhausted = !pathClear(c.points, placed, c.from, c.to)
    }
  }
}

/**
 * If a labelled link's longest run is shorter than the label, stretch it so the chip still
 * leaves a stub of ink on each side (local floor; hang↔hang included). Spine↔hang: push the
 * hang away from the trunk. Hang↔hang: push the outer hang further out. Vertical: open the
 * gap by shifting everything below. Spine↔spine horizontal is left alone (trunk stays put).
 * After any move, rebuild every incident link so ports stay on face centres.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} spineIds
 * @param {Set<string>} diamonds
 * @param {number} [cellW]
 */
function lengthenLabeledHops(placed, connections, spineIds, diamonds = new Set(), cellW = 0, cellH = 0) {
  // On-line chips hide the stroke under the text; keep a short stub of ink on each side.
  // Horizontal needs more pad than vertical (wide chips); keep these in sync with
  // layoutStageMainline's maxVertNeed (lh + 14 >= 2*INK_PAD_V) and pairwise cellW (+28 >= 2*INK_PAD_H).
  const INK_PAD_H = 12
  const INK_PAD_V = 6
  /** @type {Set<string>} */
  const moved = new Set()
  let spineCx = 0
  let spineN = 0
  for (const id of spineIds) {
    const r = placed.get(id)
    if (!r) continue
    spineCx += r.x + r.w / 2
    spineN += 1
  }
  if (spineN) spineCx /= spineN
  /** Shift a hang and every non-spine peer sharing its column centre (keep hang chains aligned). */
  const shiftHangColumn = (hangId, dx) => {
    const r = placed.get(hangId)
    if (!r) return
    const cx = r.x + r.w / 2
    for (const [id, box] of placed) {
      if (spineIds.has(id)) continue
      if (Math.abs(box.x + box.w / 2 - cx) > 2) continue
      placed.set(id, { ...box, x: box.x + dx })
      moved.add(id)
    }
  }
  for (const c of connections) {
    if (!c.labelSize || !c.points?.length) continue
    const { width: lw, height: lh } = c.labelSize
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    // Longest axis-aligned run; also track whether any vertical run already fits the chip.
    let bestLen = 0
    let bestHoriz = true
    let vertFit = false
    for (let i = 0; i < c.points.length - 1; i += 1) {
      const [p, q] = [c.points[i], c.points[i + 1]]
      const horiz = Math.abs(p[1] - q[1]) < 0.5
      const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
      if (!horiz && len >= lh + 2 * INK_PAD_V) vertFit = true
      if (len > bestLen) {
        bestLen = len
        bestHoriz = horiz
      }
    }
    const need = bestHoriz ? lw + 2 * INK_PAD_H : lh + 2 * INK_PAD_V
    if (bestLen >= need) continue
    // Prefer an existing vertical corridor over shoving a hang column for a short stub.
    if (bestHoriz && vertFit) continue

    const deficit = need - bestLen
    if (bestHoriz) {
      // 4-point horizontal S-jog whose mid vertical already spans enough for the chip:
      // slide the jog near either end instead of shoving a whole hang column.
      const pts = c.points
      if (
        pts.length === 4 &&
        Math.abs(pts[0][1] - pts[1][1]) < 0.5 &&
        Math.abs(pts[2][1] - pts[3][1]) < 0.5 &&
        Math.abs(pts[1][0] - pts[2][0]) < 0.5
      ) {
        const totalSpan = Math.abs(pts[3][0] - pts[0][0])
        if (totalSpan >= need + 20) {
          const dir = Math.sign(pts[3][0] - pts[0][0]) || 1
          const y0 = pts[0][1]
          const y1 = pts[3][1]
          const x0 = pts[0][0]
          const x1 = pts[3][0]
          /** @type {number[][][]} */
          const cands = [
            [
              [x0, y0],
              [x0 + dir * 20, y0],
              [x0 + dir * 20, y1],
              [x1, y1],
            ],
            [
              [x0, y0],
              [x1 - dir * 20, y0],
              [x1 - dir * 20, y1],
              [x1, y1],
            ],
          ]
          const others = connections.filter((o) => o !== c).map((o) => o.points)
          /** @type {number[][] | null} */
          let best = null
          let bestCross = Infinity
          for (const cand of cands) {
            if (!pathClear(cand, placed, c.from, c.to)) continue
            const cross = pathCrossCount(cand, others)
            if (cross < bestCross) {
              bestCross = cross
              best = cand
            }
          }
          if (best) {
            c.points = best
            continue
          }
        }
      }
      const shiftX = cellW > 0 ? Math.ceil(deficit / cellW) * cellW : deficit
      const fromSpine = spineIds.has(c.from)
      const toSpine = spineIds.has(c.to)
      if (fromSpine !== toSpine) {
        // Spine ↔ hang: push the hang (and its column peers) away from the trunk.
        const hangId = fromSpine ? c.to : c.from
        const spineId = fromSpine ? c.from : c.to
        const r = placed.get(hangId)
        const s = placed.get(spineId)
        if (!r || !s) continue
        const away = r.x + r.w / 2 >= s.x + s.w / 2 ? 1 : -1
        shiftHangColumn(hangId, away * shiftX)
      } else if (!fromSpine && !toSpine) {
        // Hang ↔ hang: grow the gap by pushing the outer box further from the spine.
        const leftId = a.x <= b.x ? c.from : c.to
        const rightId = a.x <= b.x ? c.to : c.from
        const left = placed.get(leftId)
        const right = placed.get(rightId)
        if (!left || !right) continue
        const leftCx = left.x + left.w / 2
        const rightCx = right.x + right.w / 2
        if (Math.abs(rightCx - spineCx) >= Math.abs(leftCx - spineCx)) {
          shiftHangColumn(rightId, shiftX)
        } else {
          shiftHangColumn(leftId, -shiftX)
        }
      }
      // Both on the spine: never shove the trunk for a label.
    } else {
      // Vertical (incl. labelled spine hops like 「受理」): open the gap so the chip does not
      // cover the whole segment. Stretch when the two boxes nearly share an axis.
      const upper = a.y <= b.y ? a : b
      const lower = a.y <= b.y ? b : a
      if (Math.abs(upper.x + upper.w / 2 - (lower.x + lower.w / 2)) > Math.max(upper.w, lower.w)) continue
      const cut = upper.y + upper.h
      const dy = cellH > 0 ? Math.ceil(deficit / cellH) * cellH : deficit
      // Push every box at/below the gap — spine and hangs — so later same-row forks stay aligned.
      for (const [id, r] of placed) {
        if (r.y + 0.5 < cut) continue
        placed.set(id, { ...r, y: r.y + dy })
        moved.add(id)
      }
    }
  }
  rebuildIncidentLinks(placed, connections, moved, diamonds, spineIds)
}
/**
 * On-ink chip: prefer the longest clear run. Slide along each segment to avoid nodes; vertical
 * corridor runs outrank short stubs so a back like「否，下月继续」sits on the side channel.
 * @param {number[][]} points
 * @param {{ width: number, height: number }} size
 * @param {{ x: number, y: number, w: number, h: number }[]} [nodeRects]
 * @param {{ x: number, y: number, w: number, h: number }[]} [occupiedRects]
 * @returns {{ x: number, y: number } | null}
 */
function labelOnLongestSegment(points, size, nodeRects = [], occupiedRects = []) {
  const { width: w, height: h } = size
  const hit = (r, list) =>
    list.some((n) => r.x < n.x + n.w - 0.5 && n.x < r.x + r.w - 0.5 && r.y < n.y + n.h - 0.5 && n.y < r.y + r.h - 0.5)
  const overlaps = (r) => hit(r, nodeRects) || hit(r, occupiedRects)
  /** @type {{ x: number, y: number, len: number, vert: boolean, arrowTier: number, centerDist: number }[]} */
  const candidates = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p, q] = [points[i], points[i + 1]]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    // Dominant axis — a 1px jog must not flip a long run into the other orientation.
    const horiz = Math.abs(dx) >= Math.abs(dy)
    const len = Math.abs(horiz ? dx : dy)
    const need = horiz ? w : h
    if (len < need + 8) continue
    const room = len - need
    const isLastSeg = i === points.length - 2
    // Mid first, then fine scan + explicit arrowhead-clearing positions near target end.
    const step = Math.max(2, Math.floor(room / 12))
    const targetAlong = isLastSeg && room >= 7 ? Math.max(0, (room - 7) / 2) : room / 2
    const alongs = [room / 2]
    for (let t = 4; t <= room - 4; t += step) alongs.push(t)
    if (isLastSeg) {
      for (const back of [9, 8, 7, 6, 4]) {
        if (room >= back) alongs.push(room - back)
      }
    }
    alongs.push(0, Math.max(0, room))
    const seen = new Set()
    for (const along of alongs) {
      const a = Math.max(0, Math.min(room, along))
      const key = a.toFixed(1)
      if (seen.has(key)) continue
      seen.add(key)
      const r = horiz
        ? {
            x: (dx >= 0 ? p[0] + a : p[0] - a - w),
            y: (p[1] + q[1]) / 2 - h / 2,
            w,
            h,
          }
        : {
            x: (p[0] + q[0]) / 2 - w / 2,
            y: (dy >= 0 ? p[1] + a : p[1] - a - h),
            w,
            h,
          }
      if (overlaps(r)) continue
      const endGap = isLastSeg ? room - a : Infinity
      const arrowTier = endGap >= 7 ? 0 : endGap >= 5 ? 1 : endGap >= 3 ? 2 : 3
      candidates.push({
        x: r.x,
        y: r.y,
        len,
        vert: !horiz,
        arrowTier,
        centerDist: Math.abs(a - targetAlong),
      })
    }
  }
  if (!candidates.length) return null
  // Prefer clear arrowhead room first, then longer runs, then vertical corridors, then centred spots.
  candidates.sort(
    (a, b) =>
      a.arrowTier - b.arrowTier ||
      b.len - a.len ||
      Number(b.vert) - Number(a.vert) ||
      a.centerDist - b.centerDist,
  )
  return { x: candidates[0].x, y: candidates[0].y }
}

/**
 * For U-shaped side / outer corridors, push the vertical run outward until an on-ink label
 * fits on it (lengthens the horizontal stubs). No-op when a clear on-line spot already exists.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 */
function clearCorridorForLabels(placed, connections) {
  const nodeRects = [...placed.values()]
  for (const c of connections) {
    if (!c.labelSize || !c.points || c.points.length < 4) continue
    if (labelOnLongestSegment(c.points, c.labelSize, nodeRects)) continue
    const { width: lw, height: lh } = c.labelSize
    // Find the longest vertical run (the corridor) — dominant axis, not a 1px jog.
    let vi = -1
    let vLen = 0
    for (let i = 0; i < c.points.length - 1; i += 1) {
      const [p, q] = [c.points[i], c.points[i + 1]]
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      if (Math.abs(dy) < Math.abs(dx)) continue
      const len = Math.abs(dy)
      if (len > vLen) {
        vLen = len
        vi = i
      }
    }
    if (vi < 0 || vLen < lh + 8) continue
    const [p, q] = [c.points[vi], c.points[vi + 1]]
    const midY = (p[1] + q[1]) / 2
    // Which way is "outward": away from the other points' average x.
    let avgX = 0
    for (const [x] of c.points) avgX += x
    avgX /= c.points.length
    const curX = p[0]
    const outward = curX <= avgX ? -1 : 1
    const overlaps = (r) =>
      nodeRects.some((n) => r.x < n.x + n.w - 0.5 && n.x < r.x + r.w - 0.5 && r.y < n.y + n.h - 0.5 && n.y < r.y + r.h - 0.5)
    let x = curX
    let fitted = false
    for (let step = 0; step < 24; step += 1) {
      x = curX + outward * (OUTER_GAP / 2) * (step + 1)
      const chip = { x: x - lw / 2, y: midY - lh / 2, w: lw, h: lh }
      if (!overlaps(chip)) {
        fitted = true
        break
      }
    }
    if (!fitted) continue
    // Rewrite every point that sat on the old corridor x.
    for (const pt of c.points) {
      if (Math.abs(pt[0] - curX) < 0.5) pt[0] = x
    }
  }
}

/**
 * Every connection with a label must carry labelAt: the paint layer reads `.x` / `.y`.
 * With `force`, clear existing spots first so a later geometry pass (pin / same-row restore)
 * cannot leave a label sitting on a node.
 * @param {object[]} connections
 * @param {{ x: number, y: number, w: number, h: number }[]} nodeRects
 * @param {object[]} [blocks]
 * @param {object[]} [borders]
 * @param {{ force?: boolean, preferOnLine?: boolean }} [opts]
 */
export function ensureConnectionLabels(connections, nodeRects, blocks = [], borders = [], opts = {}) {
  if (opts.force) {
    for (const c of connections) {
      if (c.labelSize) c.labelAt = null
    }
  }
  /** Full padded bbox around each stage border segment [[x0,y0],[x1,y1]]. */
  const borderBlocks = (borders || []).flatMap((seg) => {
    if (!Array.isArray(seg) || seg.length < 2) return []
    const [p, q] = seg
    if (!Array.isArray(p) || !Array.isArray(q)) return []
    return [
      {
        x: Math.min(p[0], q[0]) - 3,
        y: Math.min(p[1], q[1]) - 3,
        w: Math.abs(q[0] - p[0]) + 6,
        h: Math.abs(q[1] - p[1]) + 6,
      },
    ]
  })
  /** Chip bbox overlaps a padded stage-border block → slide / reject. */
  const nearStageBorder = (at, size) => {
    if (!borderBlocks.length || !at) return false
    const r = { x: at.x, y: at.y, w: size.width, h: size.height }
    return borderBlocks.some(
      (n) => r.x < n.x + n.w - 0.5 && n.x < r.x + r.w - 0.5 && r.y < n.y + n.h - 0.5 && n.y < r.y + r.h - 0.5,
    )
  }
  const labelHits = (at, size, occupied) => {
    if (!at) return true
    const r = { x: at.x, y: at.y, w: size.width, h: size.height }
    return occupied.some(
      (n) => r.x < n.x + n.w - 0.5 && n.x < r.x + r.w - 0.5 && r.y < n.y + n.h - 0.5 && n.y < r.y + r.h - 0.5,
    )
  }
  for (const c of connections) {
    if (!c.labelSize || c.labelAt) continue
    const others = connections.filter((o) => o !== c)
    const labels = others
      .filter((o) => o.labelAt && o.labelSize)
      .map((o) => ({ x: o.labelAt.x, y: o.labelAt.y, w: o.labelSize.width, h: o.labelSize.height }))
    const occupied = [...blocks, ...labels]
    if (typeof c.pinLabelSeg === 'number' && c.points?.length > c.pinLabelSeg + 1) {
      const p = c.points[c.pinLabelSeg]
      const q = c.points[c.pinLabelSeg + 1]
      c.labelAt = {
        x: (p[0] + q[0]) / 2 - c.labelSize.width / 2,
        y: (p[1] + q[1]) / 2 - c.labelSize.height / 2,
      }
      if (!nearStageBorder(c.labelAt, c.labelSize) && !labelHits(c.labelAt, c.labelSize, occupied)) continue
      c.labelAt = null
    }
    // Long labelled edges (>3 cell-rows of ink): prefer a vertical corridor inside a node column.
    if (opts.preferOnLine && c.points?.length) {
      const ys = c.points.map((pt) => pt[1])
      const span = Math.max(...ys) - Math.min(...ys)
      const longEdge = span > 3 * 136
      if (longEdge) {
        const colXs = [...new Set(nodeRects.map((r) => r.x + r.w / 2))]
        /** Prefer vertical segments whose x is near a node column centre. */
        let bestOn = null
        let bestScore = -Infinity
        for (let i = 0; i < c.points.length - 1; i += 1) {
          const p = c.points[i]
          const q = c.points[i + 1]
          if (Math.abs(p[0] - q[0]) >= 0.5) continue
          const len = Math.abs(p[1] - q[1])
          if (len < c.labelSize.height + 8) continue
          const nearCol = colXs.some((cx) => Math.abs(cx - p[0]) < 40)
          const score = len + (nearCol ? 200 : 0)
          if (score <= bestScore) continue
          const at = {
            x: p[0] - c.labelSize.width / 2,
            y: (p[1] + q[1]) / 2 - c.labelSize.height / 2,
          }
          if (labelHits(at, c.labelSize, [...nodeRects, ...occupied, ...borderBlocks])) continue
          bestScore = score
          bestOn = at
        }
        if (bestOn) {
          c.labelAt = bestOn
          continue
        }
      }
    }
    // Prefer sitting ON the longest clear run (opaque chip hides the stroke under the text).
    // First try treats stage borders as occupied; if that yields nothing (narrow cross-stage
    // gap), fall back without borderBlocks before placeLabel.
    if (opts.preferOnLine) {
      const on = labelOnLongestSegment(c.points, c.labelSize, nodeRects, [...occupied, ...borderBlocks])
      if (on && !nearStageBorder(on, c.labelSize) && !labelHits(on, c.labelSize, occupied)) {
        c.labelAt = on
        continue
      }
      // Slide along segments when the first pick sits on a stage border.
      if (on && nearStageBorder(on, c.labelSize)) {
        const slid = labelOnLongestSegment(c.points, c.labelSize, nodeRects, [
          ...occupied,
          ...borderBlocks,
          { x: on.x - 4, y: on.y - 4, w: c.labelSize.width + 8, h: c.labelSize.height + 8 },
        ])
        if (slid && !nearStageBorder(slid, c.labelSize)) {
          c.labelAt = slid
          continue
        }
      }
      const fallback = labelOnLongestSegment(c.points, c.labelSize, nodeRects, occupied)
      if (fallback && !nearStageBorder(fallback, c.labelSize) && !labelHits(fallback, c.labelSize, occupied)) {
        c.labelAt = fallback
        continue
      }
    }
    c.labelAt = placeLabel(c.points, c.labelSize, nodeRects, occupied, others, borders, {
      onLine: true,
    })
    if (c.labelAt && nearStageBorder(c.labelAt, c.labelSize)) {
      const slid = labelOnLongestSegment(c.points, c.labelSize, nodeRects, occupied)
      if (slid && !nearStageBorder(slid, c.labelSize)) c.labelAt = slid
    }
  }
}

/** Two boxes share a row when their vertical centres align (decision branch / back). */
function sameRowLink(a, b) {
  return Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < 2
}

/** Two boxes share a column when their horizontal centres align. */
function sameColLink(a, b) {
  return Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 2
}

/**
 * After polish/straighten, put decision↔same-row neighbour links back to a clear side route.
 * Never force a 0-bend that cuts through a foreign box (L3/L4 nested ends, 07 same-row).
 * Crossing-aware: pass other polylines into clearSideHorizontal and never replace a path with
 * one that has more edge crossings (L4 H n-7→n-8: post-repair south U was overwritten by a
 * box-clear north U that reintroduced 3 settlement crossings).
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 */
function restoreSameRowLinks(placed, connections, diamonds) {
  for (const c of connections) {
    if (c.kind !== 'branch' && c.kind !== 'back') continue
    if (c.biSeparated) continue
    if (!diamonds.has(c.from) && !diamonds.has(c.to)) continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !sameRowLink(a, b)) continue
    // Do not collapse an already-separated reciprocal back onto the forward centerline.
    const partner = connections.find((o) => o !== c && o.from === c.to && o.to === c.from)
    if (partner?.biSeparated || partner?.points?.length) {
      const cy = (a.y + a.h / 2 + b.y + b.h / 2) / 2
      const trackY = (pts) => {
        if (!pts || pts.length < 2) return cy
        let best = cy
        let bestLen = 0
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [p, q] = [pts[i], pts[i + 1]]
          if (Math.abs(p[1] - q[1]) >= 0.5) continue
          const len = Math.abs(q[0] - p[0])
          if (len > bestLen) {
            bestLen = len
            best = (p[1] + q[1]) / 2
          }
        }
        return best
      }
      if (Math.abs(trackY(c.points) - trackY(partner.points)) >= 10) continue
    }
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const before = c.points?.length ? pathCrossCount(c.points, others) : Infinity
    const clear = clearSideHorizontal(a, b, placed, c.from, c.to, 16, others)
    if (!clear) continue
    const after = pathCrossCount(clear, others)
    // Keep existing when the restore candidate is strictly worse on crossings.
    if (after > before) continue
    c.points = clear
  }
}

/**
 * Diamond outline x at a given y on the east or west side (strictly on outline for |y-cy| < hh).
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {number} y
 * @param {'E' | 'W'} side
 */
function diamondXAtY(box, y, side) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const hw = box.w / 2
  const hh = box.h / 2
  const t = Math.min(1, Math.abs(y - cy) / Math.max(1e-6, hh))
  const dx = hw * (1 - t)
  return side === 'E' ? cx + dx : cx - dx
}

/**
 * Diamond outline y at a given x on the north or south side (strictly on outline for |x-cx| < hw).
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {number} x
 * @param {'N' | 'S'} side
 */
function diamondYAtX(box, x, side) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const hw = box.w / 2
  const hh = box.h / 2
  const t = Math.min(1, Math.abs(x - cx) / Math.max(1e-6, hw))
  const dy = hh * (1 - t)
  return side === 'S' ? cy + dy : cy - dy
}

/**
 * Separate same-row and same-column reciprocal pairs (A ⇄ B) onto parallel tracks so strokes
 * and labels do not stack on the shared centerline (issue #190 A.4 / #376).
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 */
function separateBidirectionalSameRowLinks(placed, connections, diamonds) {
  /** @type {Set<string>} */
  const seen = new Set()
  /**
   * @param {{ x: number, y: number, w: number, h: number }} from
   * @param {{ x: number, y: number, w: number, h: number }} to
   * @param {string} fromId
   * @param {string} toId
   * @param {number} y
   * @param {boolean} fromDiamond
   * @param {boolean} toDiamond
   */
  const horizAtY = (from, to, fromId, toId, y, fromDiamond, toDiamond) => {
    const fromRight = from.x + from.w / 2 <= to.x + to.w / 2
    const yClampedFrom = Math.max(from.y + 8, Math.min(from.y + from.h - 8, y))
    const yClampedTo = Math.max(to.y + 8, Math.min(to.y + to.h - 8, y))
    let x0
    let x1
    if (fromDiamond) {
      x0 = diamondXAtY(from, yClampedFrom, fromRight ? 'E' : 'W')
    } else {
      x0 = fromRight ? from.x + from.w : from.x
    }
    if (toDiamond) {
      x1 = diamondXAtY(to, yClampedTo, fromRight ? 'W' : 'E')
    } else {
      x1 = fromRight ? to.x : to.x + to.w
    }
    const pts = [
      [x0, yClampedFrom],
      [x1, yClampedTo],
    ]
    if (!pathClear(pts, placed, fromId, toId)) return null
    if (fromDiamond && !onDiamondOutline(from, pts[0])) return null
    if (toDiamond && !onDiamondOutline(to, pts[1])) return null
    return pts
  }
  /**
   * Vertical parallel track at x for a same-column reciprocal pair (A ⇄ B).
   * @param {{ x: number, y: number, w: number, h: number }} from
   * @param {{ x: number, y: number, w: number, h: number }} to
   * @param {string} fromId
   * @param {string} toId
   * @param {number} x
   * @param {boolean} fromDiamond
   * @param {boolean} toDiamond
   */
  const vertAtX = (from, to, fromId, toId, x, fromDiamond, toDiamond) => {
    const fromDown = from.y + from.h / 2 <= to.y + to.h / 2
    const xClampedFrom = Math.max(from.x + 12, Math.min(from.x + from.w - 12, x))
    const xClampedTo = Math.max(to.x + 12, Math.min(to.x + to.w - 12, x))
    let y0
    let y1
    if (fromDiamond) {
      y0 = diamondYAtX(from, xClampedFrom, fromDown ? 'S' : 'N')
    } else {
      y0 = fromDown ? from.y + from.h : from.y
    }
    if (toDiamond) {
      y1 = diamondYAtX(to, xClampedTo, fromDown ? 'N' : 'S')
    } else {
      y1 = fromDown ? to.y : to.y + to.h
    }
    const pts = [
      [xClampedFrom, y0],
      [xClampedTo, y1],
    ]
    if (!pathClear(pts, placed, fromId, toId)) return null
    if (fromDiamond && !onDiamondOutline(from, pts[0])) return null
    if (toDiamond && !onDiamondOutline(to, pts[1])) return null
    return pts
  }
  /** Max collinear overlap length between any segment pair of two polylines. */
  const maxCollinearOverlap = (pa, pb) => {
    let best = 0
    for (let i = 0; i < pa.length - 1; i += 1) {
      for (let j = 0; j < pb.length - 1; j += 1) {
        best = Math.max(best, collinearOverlapLen(pa[i], pa[i + 1], pb[j], pb[j + 1]))
      }
    }
    return best
  }

  for (const fwd of connections) {
    if (seen.has(fwd.id)) continue
    const ret = connections.find((o) => o !== fwd && o.from === fwd.to && o.to === fwd.from)
    if (!ret || seen.has(ret.id)) continue
    const a = placed.get(fwd.from)
    const b = placed.get(fwd.to)
    if (!a || !b) continue
    const isSameRow = sameRowLink(a, b)
    const isSameCol = !isSameRow && sameColLink(a, b)
    if (!isSameRow && !isSameCol) continue
    seen.add(fwd.id)
    seen.add(ret.id)

    // Prefer non-back as forward so diamond cardinal tip stays on the branch.
    let f = fwd
    let r = ret
    if (fwd.kind === 'back' && ret.kind !== 'back') {
      f = ret
      r = fwd
    }
    const fa = placed.get(f.from)
    const fb = placed.get(f.to)
    if (!fa || !fb) continue
    const fDiamond = diamonds.has(f.from)
    const fToDiamond = diamonds.has(f.to)
    const rDiamond = diamonds.has(r.from)
    const rToDiamond = diamonds.has(r.to)
    const othersF = connections.filter((o) => o !== f).map((o) => o.points)
    const othersR = connections.filter((o) => o !== r).map((o) => o.points)

    /** @type {number[][] | null} */
    let fPts = null
    /** @type {number[][] | null} */
    let rPts = null

    if (isSameRow) {
      const cy = (fa.y + fa.h / 2 + fb.y + fb.h / 2) / 2
      const minH = Math.min(fa.h, fb.h)
      const lh1 = f.labelSize?.height ?? 18
      const lh2 = r.labelSize?.height ?? 18
      const needSep = Math.max(18, Math.ceil((lh1 + lh2) / 2 + 4))
      const maxDy = Math.max(0, minH / 2 - 8)

      // Parallel offset tracks for all same-row reciprocal pairs (rect↔rect, diamond↔rect,
      // diamond↔diamond): 0-bend horizontals; diamond endpoints snap onto the outline.
      const trySymmetric = (dy) => {
        const aPts = horizAtY(fa, fb, f.from, f.to, cy - dy, fDiamond, fToDiamond)
        const bPts = horizAtY(fb, fa, r.from, r.to, cy + dy, rDiamond, rToDiamond)
        if (aPts && bPts && maxCollinearOverlap(aPts, bPts) <= COLLINEAR_ATTACH_TOL) {
          return { aPts, bPts }
        }
        return null
      }

      if (minH >= 56 && 30 >= needSep && 15 <= maxDy) {
        const got = trySymmetric(15)
        if (got) {
          fPts = got.aPts
          rPts = got.bPts
        }
      }

      if (!fPts || !rPts) {
        const dyCandidates = [14, 13, 15, 16, 18, 12, 20, 10]
          .filter((d) => d <= maxDy && 2 * d >= needSep)
          .sort((a, b) => b - a)
        for (const dy of dyCandidates) {
          const got = trySymmetric(dy)
          if (got) {
            fPts = got.aPts
            rPts = got.bPts
            break
          }
        }
      }

      if (!fPts || !rPts) {
        // Fallback: keep forward on the centerline (cardinal tip); offset return only.
        fPts = horizAtY(fa, fb, f.from, f.to, cy, fDiamond, fToDiamond)
        rPts = null
        const dyCandidates = [14, 13, 15, 16, 18, 12, 20, 10].filter((d) => d <= maxDy && 2 * d >= needSep)
        for (const dy of dyCandidates) {
          for (const sign of [1, -1]) {
            const cand = horizAtY(fb, fa, r.from, r.to, cy + sign * dy, rDiamond, rToDiamond)
            if (!cand) continue
            if (fPts && maxCollinearOverlap(fPts, cand) > COLLINEAR_ATTACH_TOL) continue
            rPts = cand
            break
          }
          if (rPts) break
        }
      }
    } else {
      // Same-column reciprocal pair (A ⇄ B stacked vertically): keep forward on centerline or
      // split symmetrically on cx ± dx when both fit inside the narrower box.
      const cx = (fa.x + fa.w / 2 + fb.x + fb.w / 2) / 2
      const minW = Math.min(fa.w, fb.w)
      const maxDx = Math.max(0, minW / 2 - 14)
      const trySymX = (dx) => {
        const aPts = vertAtX(fa, fb, f.from, f.to, cx - dx, fDiamond, fToDiamond)
        const bPts = vertAtX(fb, fa, r.from, r.to, cx + dx, rDiamond, rToDiamond)
        if (aPts && bPts && maxCollinearOverlap(aPts, bPts) <= COLLINEAR_ATTACH_TOL) {
          return { aPts, bPts }
        }
        return null
      }
      const dxCandidates = [24, 20, 18, 16, 14, 12].filter((d) => d <= maxDx)
      for (const dx of dxCandidates) {
        const got = trySymX(dx)
        if (got) {
          fPts = got.aPts
          rPts = got.bPts
          break
        }
      }
      if (!fPts || !rPts) {
        fPts = vertAtX(fa, fb, f.from, f.to, cx, fDiamond, fToDiamond)
        rPts = null
        for (const dx of dxCandidates) {
          for (const sign of [1, -1]) {
            const cand = vertAtX(fb, fa, r.from, r.to, cx + sign * dx, rDiamond, rToDiamond)
            if (!cand) continue
            if (fPts && maxCollinearOverlap(fPts, cand) > COLLINEAR_ATTACH_TOL) continue
            rPts = cand
            break
          }
          if (rPts) break
        }
      }
    }

    if (!fPts || !rPts) continue
    if (!pathClear(fPts, placed, f.from, f.to)) continue
    if (!pathClear(rPts, placed, r.from, r.to)) continue
    if (pathCrossCount(fPts, othersF) > pathCrossCount(f.points ?? fPts, othersF)) continue
    if (pathCrossCount(rPts, othersR) > pathCrossCount(r.points ?? rPts, othersR)) continue

    f.points = fPts
    r.points = rPts
    f.biSeparated = true
    r.biSeparated = true
  }
}

/**
 * After labels are placed: push overlapping reciprocal same-row or same-column chips apart.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 */
function separateBidirectionalLabels(placed, connections) {
  for (const c of connections) {
    if (!c.labelAt || !c.labelSize) continue
    const ret = connections.find((o) => o !== c && o.from === c.to && o.to === c.from)
    if (!ret?.labelAt || !ret.labelSize) continue
    if (String(c.id) > String(ret.id)) continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    const isRow = sameRowLink(a, b)
    const isCol = !isRow && sameColLink(a, b)
    if (!isRow && !isCol) continue
    const overlap =
      c.labelAt.x < ret.labelAt.x + ret.labelSize.width - 0.5 &&
      ret.labelAt.x < c.labelAt.x + c.labelSize.width - 0.5 &&
      c.labelAt.y < ret.labelAt.y + ret.labelSize.height - 0.5 &&
      ret.labelAt.y < c.labelAt.y + c.labelSize.height - 0.5
    if (!overlap) continue
    if (isRow) {
      const gap = Math.ceil((c.labelSize.height + ret.labelSize.height) / 2 + 4)
      c.labelAt = { ...c.labelAt, y: c.labelAt.y - gap / 2 }
      ret.labelAt = { ...ret.labelAt, y: ret.labelAt.y + gap / 2 }
    } else {
      const gap = Math.ceil((c.labelSize.width + ret.labelSize.width) / 2 + 6)
      c.labelAt = { ...c.labelAt, x: c.labelAt.x - gap / 2 }
      ret.labelAt = { ...ret.labelAt, x: ret.labelAt.x + gap / 2 }
    }
  }
}

/**
 * Re-pin hang boxes that carry an input main:true rejoin onto the rejoin node's row when
 * polish / lengthen / preferCentered drifted them. Only moves the non-spine end; spine stays.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string> | undefined} [spineIds]
 */
function alignInputMainRejoinRows(placed, connections, spineIds) {
  const overlaps = (a, b) =>
    a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5
  for (const c of connections) {
    if (!c.inputMain || c.kind === 'main') continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    if (sameRowLink(a, b)) continue
    const fromSpine = spineIds?.has(c.from)
    const toSpine = spineIds?.has(c.to)
    // Hang → spine rejoin: move the hang onto the spine node's row.
    if (fromSpine === toSpine) continue
    const hangId = fromSpine ? c.to : c.from
    const spineId = fromSpine ? c.from : c.to
    const hang = placed.get(hangId)
    const spine = placed.get(spineId)
    if (!hang || !spine) continue
    const next = { ...hang, y: spine.y + spine.h / 2 - hang.h / 2 }
    if ([...placed].some(([id, r]) => id !== hangId && overlaps(next, r))) continue
    placed.set(hangId, next)
  }
}

/**
 * Input main:true edges that are not spineNext still must stay 0-bend when place put the
 * ends on one row/column (hang→spine rejoin). Restore after polish / settle without raising
 * crossings or cutting boxes. May first re-align hang→rejoin rows when they drifted.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string> | undefined} [spineIds]
 */
function restoreInputMainStraight(placed, connections, spineIds) {
  if (spineIds) alignInputMainRejoinRows(placed, connections, spineIds)
  for (const c of connections) {
    if (!c.inputMain || c.kind === 'main') continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const beforeCross = c.points?.length ? pathCrossCount(c.points, others) : Infinity
    const beforeBends = c.points?.length ? pathBendCount(c.points) : Infinity
    /** @type {number[][] | null} */
    let cand = null
    if (sameRowLink(a, b)) {
      cand =
        clearSideHorizontal(a, b, placed, c.from, c.to, 16, others) ||
        acceptClear(sideHorizontal(a, b), placed, c.from, c.to)
    } else if (sameColLink(a, b) && !columnBlocked(a, b, placed, c.from, c.to)) {
      const x = (a.x + a.w / 2 + b.x + b.w / 2) / 2
      const y0 = a.y < b.y ? a.y + a.h : a.y
      const y1 = a.y < b.y ? b.y : b.y + b.h
      const pts = [
        [x, y0],
        [x, y1],
      ]
      if (pathClear(pts, placed, c.from, c.to)) cand = pts
    }
    if (!cand?.length) continue
    if (pathBendCount(cand) !== 0) continue
    const afterCross = pathCrossCount(cand, others)
    if (afterCross > beforeCross) continue
    // Prefer any 0-bend clear candidate over a bent path; allow equal crossings.
    if (beforeBends === 0 && afterCross > beforeCross) continue
    c.points = cand
  }
}

/**
 * Economy pass: when a non-main edge's ink is bent/longer than needed, try a short
 * orthogonal route (straight across a free gap, or one rail with two bends) and adopt it
 * only when it does not raise crossings. Fixes hang→spine rejoins that leave from N/S and
 * wrap the world (real 法条 samples: 行政处罚「不要求」、民事二审「不开行裁判」).
 */
export { spreadRectPorts, settleGeometryPasses, separateNearParallelCorridors }

/**
 * Method 1 (1-Bend Tree-Fork Distribution + Aligned Sibling Tier + 1-Bend Bus Merge):
 * When a spine decision fans out into ≥3 non-main sibling outcome steps (so total outgoing
 * edges ≥ 4 and total incident edges ≥ 5, exhausting the 4 cardinal diamond tips) and those
 * sibling steps all converge into a common downstream spine node:
 * 1. Align all sibling outcome boxes (left branches, main spine continuation, right branches)
 *    on one horizontal tier below the decision diamond.
 * 2. Route each side's branches from the diamond's E / W cardinal tip straight horizontally
 *    along `y = dcy` (shared trunk stub on the tip row), turning 90° down (1 bend) into each
 *    branch box's Top-Centre (N) port, with its condition label pinned to its dedicated
 *    vertical entry stem.
 * 3. Route each branch's rejoin from its Bottom-Centre (S) port straight down to the common
 *    spine target's centre row (`y = tcy`) and 90° horizontally (1 bend) into the target's
 *    W / E centre port.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} spineIds
 * @param {Set<string>} diamonds
 * @param {Array<{ stageId: string, x: number, y: number, w: number, h: number }>} [stageBoxes]
 * @param {boolean} [vertical]
 * @param {number} [cellW]
 * @param {number} [cellH] uniform along-cell; when >0 peers/shared sit on the lattice
 */
export function applyTreeForkBus(placed, connections, spineIds, diamonds, stageBoxes = [], vertical = true, cellW = 0, cellH = 0) {
  for (const dId of diamonds) {
    if (!spineIds.has(dId)) continue
    const d = placed.get(dId)
    if (!d) continue
    const dcx = d.x + d.w / 2
    const dcy = d.y + d.h / 2
    const outs = connections.filter((c) => c.from === dId && c.kind !== 'main' && !spineIds.has(c.to))
    if (outs.length < 2) continue

    const leftOuts = outs
      .filter((c) => {
        const b = placed.get(c.to)
        return b && b.x + b.w / 2 < dcx
      })
      .sort((a, b) => (placed.get(b.to)?.x ?? 0) - (placed.get(a.to)?.x ?? 0))
    const rightOuts = outs
      .filter((c) => {
        const b = placed.get(c.to)
        return b && b.x + b.w / 2 >= dcx
      })
      .sort((a, b) => (placed.get(a.to)?.x ?? 0) - (placed.get(b.to)?.x ?? 0))

    if (leftOuts.length < 2 && rightOuts.length < 2) continue

    // Case B: ≥2 same-side branches off a spine decision that converge into a shared off-spine
    // node (e.g. 实测2 n-3 → n-4, n-5 → n-6 本法院不作受理). Align the same-side siblings below
    // the diamond tip and route a 1-bend tree-fork rail + clean merge into the shared target.
    for (const sideOuts of [leftOuts, rightOuts]) {
      if (sideOuts.length < 2) continue
      const firstTargetOut = connections.filter((o) => o.from === sideOuts[0].to)
      if (firstTargetOut.length !== 1) continue
      const sharedTargetId = firstTargetOut[0].to
      if (!sharedTargetId || spineIds.has(sharedTargetId)) continue
      const allToShared = sideOuts.every((c) => {
        if (diamonds.has(c.to)) return false
        const bOuts = connections.filter((o) => o.from === c.to)
        return bOuts.length === 1 && bOuts[0].to === sharedTargetId
      })
      if (!allToShared) continue

      const maxLabelAlong = Math.max(
        0,
        ...sideOuts.map((c) =>
          vertical
            ? (c.labelSize?.height ?? 0)
            : Math.max(c.labelSize?.width ?? 0, c.labelSize?.height ?? 0),
        ),
      )
      const stemGap = Math.max(64, maxLabelAlong + 36)
      // Lattice: peer centres at dcy+cellH, shared at dcy+2*cellH; else free float.
      const peerCy = cellH > 0 ? dcy + cellH : dcy + stemGap
      let maxPeerH = 0
      for (const c of sideOuts) {
        const r = placed.get(c.to)
        if (!r) continue
        maxPeerH = Math.max(maxPeerH, r.h)
        placed.set(c.to, { ...r, y: peerCy - r.h / 2 })
      }
      const isRight = sideOuts === rightOuts
      // Compact horizontal x positions of same-side siblings right next to the spine
      // (undoes any over-wide stepAside push from polishLinks before tree-fork routing).
      if (cellW > 0) {
        for (let i = 0; i < sideOuts.length; i += 1) {
          const c = sideOuts[i]
          const r = placed.get(c.to)
          if (!r) continue
          const sibCx = dcx + (isRight ? 1 : -1) * (i + 1) * cellW
          placed.set(c.to, { ...r, x: sibCx - r.w / 2, y: peerCy - r.h / 2 })
        }
      } else {
        let curX = isRight ? d.x + d.w + LANE_GAP : d.x - LANE_GAP
        for (let i = 0; i < sideOuts.length; i += 1) {
          const c = sideOuts[i]
          const r = placed.get(c.to)
          if (!r) continue
          const nx = isRight ? curX : curX - r.w
          placed.set(c.to, { ...r, x: nx, y: peerCy - r.h / 2 })
          curX = isRight ? nx + r.w + LANE_SEP : nx - LANE_SEP
        }
      }
      const firstPeer = placed.get(sideOuts[0].to)
      const sharedRect = placed.get(sharedTargetId)
      if (sharedRect && firstPeer) {
        const targetCy = cellH > 0 ? dcy + 2 * cellH : peerCy + maxPeerH / 2 + 36 + sharedRect.h / 2
        const targetX =
          cellW > 0
            ? Math.round(firstPeer.x + firstPeer.w / 2 - sharedRect.w / 2)
            : Math.round(firstPeer.x + firstPeer.w / 2 - sharedRect.w / 2)
        const targetY = targetCy - sharedRect.h / 2
        placed.set(sharedTargetId, {
          ...sharedRect,
          x: targetX,
          y: targetY,
        })
        // Shift downstream spine/hang nodes below this branch block so vertical bands never overlap
        const mainOutEdge = connections.find((o) => o.from === dId && o.kind === 'main')
        const nextSpine = mainOutEdge ? placed.get(mainOutEdge.to) : null
        const minNextY = targetY + sharedRect.h + (cellH > 0 ? 0 : 36)
        if (nextSpine && nextSpine.y < minNextY) {
          let dy = minNextY - nextSpine.y
          if (cellH > 0) dy = Math.max(cellH, Math.ceil(dy / cellH) * cellH)
          const cutY = nextSpine.y - 2
          const branchIds = new Set([dId, sharedTargetId, ...sideOuts.map((o) => o.to)])
          for (const [id, r] of placed) {
            if (branchIds.has(id)) continue
            if (r.y >= cutY) placed.set(id, { ...r, y: r.y + dy })
          }
          for (const c of connections) {
            if (branchIds.has(c.from) || branchIds.has(c.to)) continue
            if (c.points?.length && c.points.every((p) => p[1] >= cutY)) {
              c.points = c.points.map(([x, y]) => [x, y + dy])
              if (c.labelAt) c.labelAt = { x: c.labelAt.x, y: c.labelAt.y + dy }
            }
          }
          for (const sb of stageBoxes) {
            if (sb.y + sb.h >= cutY) sb.h += dy
          }
        }
      }
      const tip = [isRight ? d.x + d.w : d.x, dcy]
      for (const c of sideOuts) {
        const b = placed.get(c.to)
        if (!b) continue
        const bx = b.x + b.w / 2
        c.points = [tip, [bx, dcy], [bx, b.y]]
        c.pinLabelSeg = 1
      }
      const t = placed.get(sharedTargetId)
      if (t) {
        const tcx = t.x + t.w / 2
        const tcy = t.y + t.h / 2
        for (const c of sideOuts) {
          const mergeEdge = connections.find((o) => o.from === c.to && o.to === sharedTargetId)
          const a = placed.get(c.to)
          if (!mergeEdge || !a) continue
          const ax = a.x + a.w / 2
          const ay = a.y + a.h
          if (Math.abs(ax - tcx) < 2) {
            mergeEdge.points = [
              [tcx, ay],
              [tcx, t.y],
            ]
          } else {
            const faceX = ax < tcx ? t.x : t.x + t.w
            mergeEdge.points = [
              [ax, ay],
              [ax, tcy],
              [faceX, tcy],
            ]
          }
        }
      }
      // Rebuild spine main links after shifting downstream spine boxes
      for (const c of connections) {
        if (c.kind !== 'main' || !spineIds.has(c.from) || !spineIds.has(c.to)) continue
        const a = placed.get(c.from)
        const b = placed.get(c.to)
        if (!a || !b) continue
        const x = a.x + a.w / 2
        c.points = [
          [x, a.y + a.h],
          [x, b.y],
        ]
      }
      // Trim surplus left margin if compacting left-side siblings pulled minX > PAD
      let minX = Infinity
      for (const r of placed.values()) minX = Math.min(minX, r.x)
      for (const c of connections) {
        for (const [x] of c.points ?? []) minX = Math.min(minX, x)
      }
      if (Number.isFinite(minX) && minX > PAD + 1) {
        const dx = minX - PAD
        for (const [id, r] of placed) placed.set(id, { ...r, x: r.x - dx })
        for (const c of connections) {
          c.points = (c.points ?? []).map(([x, y]) => [x - dx, y])
          if (c.labelAt) c.labelAt = { x: c.labelAt.x - dx, y: c.labelAt.y }
        }
      }
    }

    if (outs.length < 3) continue

    const mainOut = connections.find((c) => c.from === dId && c.kind === 'main')
    const mainStepId = mainOut?.to ?? null
    if (!mainStepId || !spineIds.has(mainStepId)) continue
    const mainRejoinEdge = connections.find((c) => c.from === mainStepId && c.kind === 'main')
    const rejoinTargetId = mainRejoinEdge?.to ?? null
    if (!rejoinTargetId || !spineIds.has(rejoinTargetId)) continue

    // Verify all non-main branches are single-step outcomes converging into rejoinTargetId
    const allConverge = outs.every((c) => {
      if (diamonds.has(c.to)) return false
      const bOuts = connections.filter((o) => o.from === c.to)
      return bOuts.length === 1 && bOuts[0].to === rejoinTargetId
    })
    if (!allConverge) continue

    const peerIds = new Set(outs.map((c) => c.to))
    peerIds.add(mainStepId)

    let minDownstreamY = Infinity
    for (const id of peerIds) {
      const r = placed.get(id)
      if (r) minDownstreamY = Math.min(minDownstreamY, r.y)
    }
    const allLeave = mainOut ? [mainOut, ...outs] : outs
    const maxLabelAlong = Math.max(
      0,
      ...allLeave.map((c) =>
        vertical
          ? (c.labelSize?.height ?? 0)
          : Math.max(c.labelSize?.width ?? 0, c.labelSize?.height ?? 0),
      ),
    )
    const peerGap = Math.max(56, maxLabelAlong + 32)
    const peerCyOrTop = cellH > 0 ? dcy + cellH : d.y + d.h + peerGap
    let maxPeerH = 0
    for (const id of peerIds) {
      const r = placed.get(id)
      if (!r) continue
      maxPeerH = Math.max(maxPeerH, r.h)
      placed.set(id, { ...r, y: cellH > 0 ? peerCyOrTop - r.h / 2 : peerCyOrTop })
    }
    const peerTop =
      cellH > 0 ? Math.min(...[...peerIds].map((id) => placed.get(id)?.y ?? Infinity)) : peerCyOrTop

    const rejoinRect = placed.get(rejoinTargetId)
    const minRejoinY =
      cellH > 0 && rejoinRect
        ? dcy + 2 * cellH - rejoinRect.h / 2
        : peerTop + maxPeerH + Math.max(56, LAYER_GAP)
    if (rejoinRect && rejoinRect.y < minRejoinY - 0.5) {
      if (cellH > 0) {
        placed.set(rejoinTargetId, { ...rejoinRect, y: minRejoinY })
        const newRejoin = /** @type {{ x: number, y: number, w: number, h: number }} */ (placed.get(rejoinTargetId))
        const belowNeed = newRejoin.y + newRejoin.h
        const cutY = rejoinRect.y - 2
        let commonDy = 0
        for (const [id, r] of placed) {
          if (id === dId || peerIds.has(id) || id === rejoinTargetId) continue
          if (r.y >= cutY && r.y < belowNeed) {
            commonDy = Math.max(commonDy, Math.max(cellH, Math.ceil((belowNeed - r.y) / cellH) * cellH))
          }
        }
        if (commonDy > 0) {
          for (const [id, r] of placed) {
            if (id === dId || peerIds.has(id) || id === rejoinTargetId) continue
            if (r.y >= cutY) placed.set(id, { ...r, y: r.y + commonDy })
          }
          for (const sb of stageBoxes) {
            if (sb.y + sb.h >= cutY) sb.h += commonDy
          }
        }
      } else {
        const dy = minRejoinY - rejoinRect.y
        const cutY = rejoinRect.y - 2
        for (const [id, r] of placed) {
          if (id === dId || peerIds.has(id)) continue
          if (r.y >= cutY) placed.set(id, { ...r, y: r.y + dy })
        }
        for (const sb of stageBoxes) {
          if (sb.y + sb.h >= cutY) sb.h += dy
        }
      }
    } else if (Number.isFinite(minDownstreamY)) {
      for (const sb of stageBoxes) {
        for (const r of placed.values()) {
          if (r.x >= sb.x && r.x + r.w <= sb.x + sb.w) {
            sb.h = Math.max(sb.h, r.y + r.h + STAGE_PAD - sb.y)
          }
        }
      }
    }

    // 1. Route 1-bend tree-fork distribution out of E / W cardinal tips
    if (rightOuts.length >= 1) {
      const tipE = [d.x + d.w, dcy]
      for (const c of rightOuts) {
        const b = placed.get(c.to)
        if (!b) continue
        const bx = b.x + b.w / 2
        c.points = [tipE, [bx, dcy], [bx, b.y]]
        c.pinLabelSeg = 1
      }
    }
    if (leftOuts.length >= 1) {
      const tipW = [d.x, dcy]
      for (const c of leftOuts) {
        const b = placed.get(c.to)
        if (!b) continue
        const bx = b.x + b.w / 2
        c.points = [tipW, [bx, dcy], [bx, b.y]]
        c.pinLabelSeg = 1
      }
    }

    // 2. Route 1-bend bus merge into rejoinTargetId's W / E centre ports
    const t = placed.get(rejoinTargetId)
    if (t) {
      const tcx = t.x + t.w / 2
      const tcy = t.y + t.h / 2
      for (const c of connections) {
        if (c.to !== rejoinTargetId || c.kind === 'main' || !peerIds.has(c.from)) continue
        const a = placed.get(c.from)
        if (!a) continue
        const ax = a.x + a.w / 2
        const ay = a.y + a.h
        const faceX = ax < tcx ? t.x : t.x + t.w
        c.points = [
          [ax, ay],
          [ax, tcy],
          [faceX, tcy],
        ]
      }
    }

    // 3. If an upstream hang box rejoins dId itself (whose E/W tips now carry the tree-fork
    //    distribution rail), route its rejoin from its S centre into dId's N tip merge point
    //    and restore its own same-row fork link (e.g. 二审不开庭审理 → 二审如何裁判).
    for (const c of connections) {
      if (c.to !== dId || c.kind === 'main' || spineIds.has(c.from)) continue
      const a = placed.get(c.from)
      if (!a || a.y + a.h >= d.y) continue
      const acx = a.x + a.w / 2
      const mainIn = connections.find((o) => o.to === dId && o.kind === 'main')
      const prevSpine = mainIn ? placed.get(mainIn.from) : null
      const mergeY = prevSpine ? Math.round((prevSpine.y + prevSpine.h + d.y) / 2) : d.y - 28
      const cand = [
        [acx, a.y + a.h],
        [acx, mergeY],
        [dcx, mergeY],
        [dcx, d.y],
      ]
      if (pathClear(cand, placed, c.from, dId)) {
        c.points = cand
        for (const cIn of connections) {
          if (cIn.to !== c.from || cIn.kind === 'main') continue
          const fBox = placed.get(cIn.from)
          if (fBox && sameRowLink(fBox, a)) {
            const straight = sideHorizontal(fBox, a)
            if (pathClear(straight, placed, cIn.from, cIn.to)) {
              cIn.points = straight
              cIn.pinLabelSeg = 0
            }
          }
        }
      }
    }

    // 4. Rebuild spine main links so shifted spine boxes stay straight 0-bend
    for (const c of connections) {
      if (c.kind !== 'main' || !spineIds.has(c.from) || !spineIds.has(c.to)) continue
      const a = placed.get(c.from)
      const b = placed.get(c.to)
      if (!a || !b) continue
      const x = a.x + a.w / 2
      c.points = [
        [x, a.y + a.h],
        [x, b.y],
      ]
    }
  }
}

export function economyRepath(placed, connections, spineIds, diamonds, _vertical = true) {
  const pad = 24
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  for (const c of connections) {
    if (c.kind === 'main' || c.inputMain) continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !c.points?.length) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const curB = pathBendCount(c.points)
    const curLen = pathLength(c.points)
    if (curB < 2) continue
    const curCross = pathCrossCount(c.points, others)
    const acy = a.y + a.h / 2
    const acx = a.x + a.w / 2
    const bcy = b.y + b.h / 2
    const bcx = b.x + b.w / 2
    /** @type {number[][][]} */
    const cands = []
    const push = (pts) => {
      if (!pts || pts.length < 2) return
      for (let i = 1; i < pts.length; i += 1) {
        const [p, q] = [pts[i - 1], pts[i]]
        if (Math.abs(p[0] - q[0]) > 0.5 && Math.abs(p[1] - q[1]) > 0.5) return
      }
      cands.push(pts)
    }
    // 1) Same-row straight between facing sides.
    const yOverlapLo = Math.max(a.y, b.y)
    const yOverlapHi = Math.min(a.y + a.h, b.y + b.h)
    if (yOverlapHi - yOverlapLo > 2) {
      const y = clamp(acy, yOverlapLo + 1, yOverlapHi - 1)
      if (a.x + a.w < b.x) push([[a.x + a.w, y], [b.x, y]])
      if (b.x + b.w < a.x) push([[a.x, y], [b.x + b.w, y]])
    }
    // 2) One rail with two bends: leave a facing side, run a clear vertical rail between
    //    the boxes, enter b's facing side.
    const aRightOfB = acx > bcx
    const leaveX = aRightOfB ? a.x : a.x + a.w
    const enterXRight = aRightOfB ? b.x + b.w : b.x
    const enterXLeft = aRightOfB ? b.x : b.x + b.w
    for (let rail = 0; rail <= 220; rail += 12) {
      const rx1 = aRightOfB ? enterXRight + pad + rail : enterXRight - pad - rail
      const rx2 = aRightOfB ? enterXLeft + pad + rail : enterXLeft - pad - rail
      // A decision's port must sit on its outline: E/W vertex, not any point on the bbox face.
      const y1 = diamonds?.has(c.to) ? bcy : clamp(acy, b.y + 1, b.y + b.h - 1)
      push([[leaveX, acy], [rx1, acy], [rx1, y1], [enterXRight, y1]])
      push([[leaveX, acy], [rx2, acy], [rx2, y1], [enterXLeft, y1]])
    }
    // 3) Same for a vertical rail: leave a's bottom/top, run a clear horizontal rail
    //    between the boxes, enter b's top/bottom.
    const aBelowB = acy > bcy
    const leaveY = aBelowB ? a.y : a.y + a.h
    const enterYTop = aBelowB ? b.y + b.h : b.y
    const enterYBot = aBelowB ? b.y : b.y + b.h
    for (let rail = 0; rail <= 220; rail += 12) {
      const ry1 = aBelowB ? enterYTop + pad + rail : enterYTop - pad - rail
      const ry2 = aBelowB ? enterYBot + pad + rail : enterYBot - pad - rail
      const x1 = diamonds?.has(c.to) ? bcx : clamp(acx, b.x + 1, b.x + b.w - 1)
      push([[acx, leaveY], [acx, ry1], [x1, ry1], [x1, enterYTop]])
      push([[acx, leaveY], [acx, ry2], [x1, ry2], [x1, enterYBot]])
    }
    const tierOf = (id, pt) => {
      const r = placed.get(id)
      if (!r) return 3
      let bestT = 3
      for (const p of legalPorts(r, !!diamonds?.has(id))) {
        const d = Math.abs(p.x - pt[0]) + Math.abs(p.y - pt[1])
        if (d <= 2) bestT = Math.min(bestT, p.tier)
      }
      return bestT
    }
    const oldStartTier = tierOf(c.from, c.points[0])
    const oldEndTier = tierOf(c.to, c.points[c.points.length - 1])
    const overlapsLong = (pts, others2) => {
      // Terminal segments are merges (two links feeding one port), not corridors: a shared last
      // segment is the legal merge, so only the interior run is checked for a long opposite-dir
      // rail.
      for (let i = 1; i < pts.length - 1; i += 1) {
        const [a, b] = [pts[i - 1], pts[i]]
        const horiz = Math.abs(a[1] - b[1]) < 0.5
        const lo = horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1])
        const hi = horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1])
        if (hi - lo < 40) continue
        for (const other of others2) {
          for (let j = 1; j < other.length; j += 1) {
            const [p, q] = [other[j - 1], other[j]]
            if ((Math.abs(p[1] - q[1]) < 0.5) !== horiz) continue
            if (horiz ? Math.abs(p[1] - a[1]) > 0.5 : Math.abs(p[0] - a[0]) > 0.5) continue
            const oLo = horiz ? Math.min(p[0], q[0]) : Math.min(p[1], q[1])
            const oHi = horiz ? Math.max(p[0], q[0]) : Math.max(p[1], q[1])
            const ov = Math.min(hi, oHi) - Math.max(lo, oLo)
            if (ov > 60) return true
          }
        }
      }
      return false
    }
    // A new *leave* point must not land on a port another link already leaves from (the
    // rect multi-leave contract). An *entry* may merge onto an occupied port: flow converging
    // into one arrow is normal and is what the merge rule allows.
    const sharesLeave = (pts) => {
      for (const other of others) {
        if (Math.hypot(pts[0][0] - other[0][0], pts[0][1] - other[0][1]) < 20) return true
      }
      return false
    }
    let best = null
    let bestCross = Infinity
    let bestB = Infinity
    let bestLen = Infinity
    for (const pts of cands) {
      if (!pathClear(pts, placed, c.from, c.to)) continue
      const cross = pathCrossCount(pts, others)
      const bends = pathBendCount(pts)
      const len = pathLength(pts)
      if (cross > curCross) continue
      // Contract guards: a short repair may not
      //  - drop the endpoint onto a lower-priority port than it already used (tips stay tips),
      //  - land on a port another link already occupies (rect multi-leave must not share),
      //  - ride another link's ink for a long stretch (no long opposite-dir corridor).
      if (tierOf(c.from, pts[0]) > oldStartTier) continue
      if (tierOf(c.to, pts[pts.length - 1]) > oldEndTier) continue
      if (sharesLeave(pts)) continue
      if (overlapsLong(pts, others)) continue
      if (
        cross < bestCross ||
        (cross === bestCross && bends < bestB) ||
        (cross === bestCross && bends === bestB && len < bestLen)
      ) {
        bestCross = cross
        bestB = bends
        bestLen = len
        best = pts
      }
    }
    if (!best) continue
    const better = bestCross < curCross || bestB < curB || (bestB === curB && bestLen < curLen * 0.8)
    if (better) c.points = best
  }
}

/**
 * Port bundling: two or more links that leave/enter a node on the same face share one
 * stub (port → junction, 32px out) and only split at the junction. A diamond has four
 * vertices, so this is what keeps a node with five or six links readable; the split is
 * outside the node instead of two lines diverging from one point.
 */
function spreadRectPorts(placed, connections, diamonds) {
  const NEAR = 20
  const ortho = (pts) => {
    for (let i = 1; i < pts.length; i += 1) {
      if (Math.abs(pts[i][0] - pts[i - 1][0]) > 0.5 && Math.abs(pts[i][1] - pts[i - 1][1]) > 0.5) return false
    }
    return true
  }
  const dedupe = (pts) => {
    const out = []
    for (const p of pts) {
      const q = out[out.length - 1]
      if (q && Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5) continue
      out.push(p)
    }
    return out
  }
  const bendsOf = (pts) => {
    let b = 0
    for (let i = 1; i < pts.length - 1; i += 1) {
      const [p, q, r] = [pts[i - 1], pts[i], pts[i + 1]]
      if (Math.abs(p[0] - q[0]) < 0.5 && Math.abs(q[1] - r[1]) < 0.5) b += 1
      if (Math.abs(p[1] - q[1]) < 0.5 && Math.abs(q[0] - r[0]) < 0.5) b += 1
    }
    return b
  }
  const lenOf = (pts) => {
    let l = 0
    for (let i = 1; i < pts.length; i += 1) l += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1])
    return l
  }
  const ends = new Map()
  for (const c of connections) {
    if (!c.points?.length) continue
    for (const end of ['from', 'to']) {
      const id = end === 'from' ? c.from : c.to
      if (diamonds?.has(id)) continue
      const r = placed.get(id)
      if (!r) continue
      const pt = end === 'from' ? c.points[0] : c.points[c.points.length - 1]
      if (!ends.has(id)) ends.set(id, [])
      ends.get(id).push({ c, end, pt, r })
    }
  }
  /** Try to move one link end of this node onto a spare port. */
  const tryMove = (mover, occupied) => {
    const r = mover.r
    const pts = mover.end === 'from' ? mover.c.points : mover.c.points
    const oldBends = bendsOf(pts)
    const totalLen = lenOf(pts)
    const cands = []
    for (const t of [0.5, 0.25, 0.75]) {
      cands.push({ face: 'N', x: r.x + r.w * t, y: r.y }, { face: 'S', x: r.x + r.w * t, y: r.y + r.h })
      cands.push({ face: 'W', x: r.x, y: r.y + r.h * t }, { face: 'E', x: r.x + r.w, y: r.y + r.h * t })
    }
    let best = null
    for (const p of cands) {
      if (occupied.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < NEAR)) continue
      const indices =
        mover.end === 'from'
          ? Array.from({ length: pts.length - 1 }, (_, idx) => idx + 1)
          : Array.from({ length: pts.length - 1 }, (_, idx) => pts.length - 2 - idx)
      for (const k of indices) {
        const wp = pts[k]
        const outside =
          (p.face === 'N' && wp[1] <= r.y - 1) ||
          (p.face === 'S' && wp[1] >= r.y + r.h + 1) ||
          (p.face === 'W' && wp[0] <= r.x - 1) ||
          (p.face === 'E' && wp[0] >= r.x + r.w + 1)
        if (!outside) continue
        const elbow = p.face === 'N' || p.face === 'S' ? [p.x, wp[1]] : [wp[0], p.y]
        const candidate =
          mover.end === 'from'
            ? dedupe([[p.x, p.y], elbow, ...pts.slice(k)])
            : dedupe([...pts.slice(0, k + 1), elbow, [p.x, p.y]])
        if (candidate.length < 2 || !ortho(candidate)) continue
        if (bendsOf(candidate) > oldBends + 2) continue
        if (lenOf(candidate) > totalLen * 1.4) continue
        if (!pathClear(candidate, placed, mover.c.from, mover.c.to)) continue
        const score = bendsOf(candidate) * 1000 + lenOf(candidate) + (p.face === 'N' || p.face === 'E' ? 0 : 1)
        if (!best || score < best.score) best = { candidate, score, pt: [p.x, p.y] }
        break
      }
    }
    if (!best) return false
    mover.c.points = best.candidate
    const idx = occupied.indexOf(mover.pt)
    if (idx >= 0) occupied.splice(idx, 1)
    occupied.push(best.pt)
    return true
  }
  for (const list of ends.values()) {
    const occupied = list.map((e) => e.pt)
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]
        const b = list[j]
        if (Math.hypot(a.pt[0] - b.pt[0], a.pt[1] - b.pt[1]) >= NEAR) continue
        // Bent edges move off the shared port first; keep 0-bend straights pinned.
        const movers = [a, b].sort((p, q) => bendsOf(q.c.points) - bendsOf(p.c.points))
        for (const mover of movers) {
          if (mover.c.kind === 'main') continue
          const other = mover === a ? b : a
          if (bendsOf(mover.c.points) === 0 && bendsOf(other.c.points) > 0) continue
          if (tryMove(mover, occupied)) return
        }
      }
    }
  }
}

/** True when another placed box sits between a and b on (near) the shared column. */
function columnBlocked(a, b, placed, fromId, toId) {
  if (!placed) return false
  const top = Math.min(a.y + a.h, b.y + b.h)
  const bot = Math.max(a.y, b.y)
  if (bot <= top + 0.5) return false
  const cx = (a.x + a.w / 2 + b.x + b.w / 2) / 2
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (Math.abs(r.x + r.w / 2 - cx) > Math.max(r.w, a.w, b.w) / 2 + 2) continue
    if (r.y + r.h > top + 0.5 && r.y < bot - 0.5) return true
  }
  return false
}

// Hang→spine / clear same-row helpers live in hangSpineRoute.js (production + tests).

/**
 * Candidate alternate polylines for one non-main edge (box-clear preferred, crossing-aware).
 * @returns {Array<number[][] | null | undefined>}
 */
function crossingRepairAlts(c, placed, diamonds, spineIds, others) {
  const a = placed.get(c.from)
  const b = placed.get(c.to)
  if (!a || !b) return []
  const acx = a.x + a.w / 2
  const bcx = b.x + b.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const hangOnRight = acx > bcx
  const fromDiamond = diamonds.has(c.from)
  const fromSpine = spineIds?.has(c.from)
  const toSpine = spineIds?.has(c.to)
  /** @type {Array<number[][] | null | undefined>} */
  const alts = []
  if (!fromSpine && toSpine) {
    alts.push(routeHangToSpine(a, b, hangOnRight, placed, c.from, c.to, fromDiamond, others))
    alts.push(diamondOuterSide(a, b, hangOnRight, placed, c.from, c.to, 32, others))
    alts.push(clearOuterCorridor(a, b, hangOnRight, placed, c.from, c.to, 32, others))
    alts.push(clearOuterCorridor(a, b, !hangOnRight, placed, c.from, c.to, 32, others))
    alts.push(diamondOuterSide(a, b, !hangOnRight, placed, c.from, c.to, 32, others))
    if (!(c.kind !== 'back' && !fromDiamond && b.y > a.y + a.h - 2)) {
      alts.push(clearWrapAround(a, b, hangOnRight, placed, c.from, c.to, 48, others))
    }
    if (!fromDiamond) {
      const leaveY = bcy >= acy ? a.y + a.h : a.y
      const dir = bcy >= acy ? 1 : -1
      const portX = hangOnRight ? a.x + a.w * 0.78 : a.x + a.w * 0.22
      const stepY = leaveY + dir * 10
      const faceX = hangOnRight ? b.x + b.w : b.x
      const yLo = Math.min(a.y, b.y)
      const yHi = Math.max(a.y + a.h, b.y + b.h)
      let nearestInner = hangOnRight ? Infinity : -Infinity
      let foundOuter = false
      for (const [id, r] of placed) {
        if (id === c.from || id === c.to) continue
        if (r.y + r.h < yLo - 0.5 || r.y > yHi + 0.5) continue
        const onOuter = hangOnRight ? r.x >= a.x + a.w - 1 : r.x + r.w <= a.x + 1
        if (!onOuter) continue
        foundOuter = true
        nearestInner = hangOnRight ? Math.min(nearestInner, r.x) : Math.max(nearestInner, r.x + r.w)
      }
      let pushedMid = false
      if (foundOuter) {
        const gap = hangOnRight ? nearestInner - (a.x + a.w) : a.x - nearestInner
        if (gap >= 48) {
          const outerX = hangOnRight ? a.x + a.w + gap / 2 : a.x - gap / 2
          const midPts = [
            [portX, leaveY],
            [portX, stepY],
            [outerX, stepY],
            [outerX, bcy],
            [faceX, bcy],
          ]
          if (pathClear(midPts, placed, c.from, c.to)) {
            alts.push(midPts)
            pushedMid = true
          }
        }
      }
      if (!pushedMid) {
        for (let d = 0; d <= 8; d += 1) {
          const outerX = hangOnRight ? a.x + a.w + OUTER_GAP + d * 16 : a.x - OUTER_GAP - d * 16
          alts.push([
            [portX, leaveY],
            [portX, stepY],
            [outerX, stepY],
            [outerX, bcy],
            [faceX, bcy],
          ])
        }
      }
    }
  } else if (fromSpine && !toSpine) {
    if (c.kind !== 'back') {
      const rev = routeHangToSpine(
        b,
        a,
        bcx > acx,
        placed,
        c.to,
        c.from,
        diamonds.has(c.to),
        others,
        { allowWrap: false },
      )
      const dSideRev = diamondOuterSide(b, a, bcx > acx, placed, c.to, c.from, 32, others)
      const outerRev = clearOuterCorridor(b, a, bcx > acx, placed, c.to, c.from, 32, others)
      const sideChan = clearSideChannel(a, b, acx > bcx, placed, c.from, c.to, 32, others)
      const inBounds = [
        rev ? rev.slice().reverse() : null,
        dSideRev ? dSideRev.slice().reverse() : null,
        outerRev ? outerRev.slice().reverse() : null,
        sideChan,
      ]
      for (const p of inBounds) {
        if (p) alts.push(p)
      }
      // Still offer wrap for crossing repair; applyBest prefers fewer crossings then length.
      const wrapRev = clearWrapAround(b, a, bcx > acx, placed, c.to, c.from, 48, others)
      if (wrapRev) alts.push(wrapRev.slice().reverse())
    } else {
      const rev = routeHangToSpine(b, a, bcx > acx, placed, c.to, c.from, diamonds.has(c.to), others)
      if (rev) alts.push(rev.slice().reverse())
      const outerRev = clearOuterCorridor(b, a, bcx > acx, placed, c.to, c.from, 32, others)
      if (outerRev) alts.push(outerRev.slice().reverse())
      alts.push(clearSideChannel(a, b, acx > bcx, placed, c.from, c.to, 32, others))
      const wrapRev = clearWrapAround(b, a, bcx > acx, placed, c.to, c.from, 48, others)
      if (wrapRev) alts.push(wrapRev.slice().reverse())
      const dSideRev = diamondOuterSide(b, a, bcx > acx, placed, c.to, c.from, 32, others)
      if (dSideRev) alts.push(dSideRev.slice().reverse())
    }
  } else {
    alts.push(clearSideChannel(a, b, acx > bcx, placed, c.from, c.to, 48, others))
    alts.push(clearSideHorizontal(a, b, placed, c.from, c.to, 48, others))
    alts.push(routeCentered(a, b, fromDiamond, placed, c.from, c.to, spineIds, others))
    alts.push(clearWrapAround(a, b, hangOnRight, placed, c.from, c.to, 48, others))
    // Far below/above U between any two boxes (helps horizontal dense hangs).
    // Cross-stage mains (L3 n-12→n-13): leave from a SIDE face first so the vertical
    // run to the outer rail does not climb through a same-column neighbour (n-11).
    {
      const acy = a.y + a.h / 2
      const bcy = b.y + b.h / 2
      let worldTop = Infinity
      let worldBot = -Infinity
      for (const r of placed.values()) {
        worldTop = Math.min(worldTop, r.y)
        worldBot = Math.max(worldBot, r.y + r.h)
      }
      for (const preferAbove of [false, true]) {
        for (let d = 0; d <= 24; d += 1) {
          const gap = 40 + d * 20
          const rail = preferAbove
            ? Math.min(worldTop, a.y, b.y) - gap
            : Math.max(worldBot, a.y + a.h, b.y + b.h) + gap
          alts.push([
            [a.x + a.w / 2, preferAbove ? a.y : a.y + a.h],
            [a.x + a.w / 2, rail],
            [b.x + b.w / 2, rail],
            [b.x + b.w / 2, preferAbove ? b.y : b.y + b.h],
          ])
          alts.push([
            [acx > bcx ? a.x : a.x + a.w, acy],
            [acx > bcx ? a.x : a.x + a.w, rail],
            [acx > bcx ? b.x + b.w : b.x, rail],
            [acx > bcx ? b.x + b.w : b.x, bcy],
          ])
          // Side-egress then outer rail (clear same-column blockers above/below).
          for (const outRight of [true, false]) {
            const leaveX = outRight ? a.x + a.w : a.x
            const enterX = bcx >= acx ? b.x : b.x + b.w
            const egress = outRight ? leaveX + gap : leaveX - gap
            alts.push([
              [leaveX, acy],
              [egress, acy],
              [egress, rail],
              [enterX, rail],
              [enterX, bcy],
            ])
            alts.push([
              [leaveX, acy],
              [egress, acy],
              [egress, rail],
              [b.x + b.w / 2, rail],
              [b.x + b.w / 2, preferAbove ? b.y : b.y + b.h],
            ])
          }
        }
      }
    }
  }
  return alts
}

/**
 * Final settle: alternate shared-leave resolve, collinear-corridor separation, and
 * crossing repair, then snap diamond endpoints and one last S2+separate. Avoids the
 * oscillation where each single pass undoes another constraint.
 */
function settleGeometryPasses(placed, connections, diamonds, spineIds, pills = new Set(), vertical = true) {
  for (let i = 0; i < 3; i += 1) {
    resolveSharedDiamondLeaves(placed, connections, diamonds, spineIds)
    resolveSharedDiamondEnters(placed, connections, diamonds, spineIds)
    resolveSharedRectLeaves(placed, connections, diamonds, spineIds)
    spreadRectPorts(placed, connections, diamonds)
    separateAmbiguousCorridors(placed, connections, diamonds, spineIds)
    repairRimFalseConnections(placed, connections, diamonds, spineIds)
    repairEdgeCrossings(placed, connections, diamonds, spineIds)
  }
  snapDiamondEndpoints(placed, connections, diamonds)
  // Stage packing / pin / prefer-centered can shift rect boxes without rewriting main
  // ink (B04 H stages-on: n-2 left by 11.5u while c:n-1→n-2 / c:n-2→n-3 stayed put).
  snapRectEndpoints(placed, connections, diamonds)
  // Capsule start/end only: last run must approach along the outward normal into the
  // stadium arc poles (V08b vertical face-ride meets the pill NE arc). Do not rewrite step rects.
  // Arc poles are E/W when vertical; after horizontal polish swap they are frame N/S.
  ensureRectOutwardApproach(placed, connections, diamonds, pills, vertical)
  separateBidirectionalSameRowLinks(placed, connections, diamonds)
  /** Refuse hit-repair alts that create new ≥48 coincidences (08 H-on 110u rail). */
  const hardAmbCount = (skipId, pts) => {
    const fake = connections.map((c) => (c.id === skipId ? { ...c, points: pts } : c))
    const a = findCollinearAmbiguities(fake)
    return (
      a.unrelatedOverlaps.length + a.branchSharedRails.length + a.sharedEndpointCorridors.length
    )
  }
  // Snap elbow insertion can clip a foreign box (V11 H n-2→n-10 through n-12).
  // Also repair cross-stage mains that route through the destination column (08/L2/L3
  // stages-on); within-stage spine that already clears is left alone.
  for (const c of connections) {
    if (!c.points?.length) continue
    if (pathClear(c.points, placed, c.from, c.to)) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const before = pathCrossCount(c.points, others)
    const beforeHard = hardAmbCount(c.id, c.points)
    let best = null
    let bestKey = /** @type {[number, number, number]} */ ([Infinity, Infinity, Infinity])
    for (const pts of crossingRepairAlts(c, placed, diamonds, spineIds, others)) {
      if (!pts || pts.length < 2) continue
      let ortho = true
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [p, q] = [pts[i], pts[i + 1]]
        if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) {
          ortho = false
          break
        }
      }
      if (!ortho) continue
      if (!pathClear(pts, placed, c.from, c.to)) continue
      const fromBox = placed.get(c.from)
      const toBox = placed.get(c.to)
      if (diamonds.has(c.from) && fromBox && !onDiamondOutline(fromBox, pts[0])) continue
      if (diamonds.has(c.to) && toBox && !onDiamondOutline(toBox, pts[pts.length - 1])) continue
      // Keep leave port if already distinct.
      if (diamonds.has(c.from) && c.points?.length) {
        const want = `${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`
        const got = `${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
        if (want !== got) {
          // Prefer alts that keep the current leave; still allow if nothing else clears.
          // Mark with a penalty via bends.
        }
      }
      const cross = pathCrossCount(pts, others)
      if (cross > before) continue
      if (hardAmbCount(c.id, pts) > beforeHard) continue
      const key = /** @type {[number, number, number]} */ ([
        cross,
        pathBendCount(pts),
        pathLength(pts),
      ])
      if (
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] + 1e-6 < bestKey[2])
      ) {
        bestKey = key
        best = pts
      }
    }
    // Also try orthoRoutesFromPort keeping the current leave port.
    if (diamonds.has(c.from) && c.points?.length) {
      const fromBox = placed.get(c.from)
      const toBox = placed.get(c.to)
      if (fromBox && toBox) {
        for (const gap of [20, 36, 56, 80]) {
          for (const cand of orthoRoutesFromPort(c.points[0], toBox, fromBox, gap)) {
            if (!cand || cand.length < 2) continue
            if (!pathClear(cand, placed, c.from, c.to)) continue
            if (diamonds.has(c.to) && !onDiamondOutline(toBox, cand[cand.length - 1])) continue
            const cross = pathCrossCount(cand, others)
            if (cross > before) continue
            if (hardAmbCount(c.id, cand) > beforeHard) continue
            const key = /** @type {[number, number, number]} */ ([
              cross,
              pathBendCount(cand),
              pathLength(cand),
            ])
            if (
              key[0] < bestKey[0] ||
              (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
              (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] + 1e-6 < bestKey[2])
            ) {
              bestKey = key
              best = cand
            }
          }
        }
      }
    }
    if (best) c.points = best
  }
  resolveSharedDiamondLeaves(placed, connections, diamonds, spineIds)
  separateAmbiguousCorridors(placed, connections, diamonds, spineIds)
  // Hit-repair on cross-stage mains can introduce new crosses with hang branches (L3).
  repairEdgeCrossings(placed, connections, diamonds, spineIds)
  // One more hit pass: crossing repair may reintroduce a box clip.
  for (const c of connections) {
    if (!c.points?.length) continue
    if (pathClear(c.points, placed, c.from, c.to)) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const before = pathCrossCount(c.points, others)
    const beforeHard = hardAmbCount(c.id, c.points)
    let best = null
    let bestKey = /** @type {[number, number, number]} */ ([Infinity, Infinity, Infinity])
    for (const pts of crossingRepairAlts(c, placed, diamonds, spineIds, others)) {
      if (!pts || pts.length < 2) continue
      let ortho = true
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [p, q] = [pts[i], pts[i + 1]]
        if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) {
          ortho = false
          break
        }
      }
      if (!ortho) continue
      if (!pathClear(pts, placed, c.from, c.to)) continue
      const fromBox = placed.get(c.from)
      const toBox = placed.get(c.to)
      if (diamonds.has(c.from) && fromBox && !onDiamondOutline(fromBox, pts[0])) continue
      if (diamonds.has(c.to) && toBox && !onDiamondOutline(toBox, pts[pts.length - 1])) continue
      const cross = pathCrossCount(pts, others)
      if (cross > before) continue
      if (hardAmbCount(c.id, pts) > beforeHard) continue
      const key = /** @type {[number, number, number]} */ ([
        cross,
        pathBendCount(pts),
        pathLength(pts),
      ])
      if (
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] + 1e-6 < bestKey[2])
      ) {
        bestKey = key
        best = pts
      }
    }
    if (best) c.points = best
  }
  // Corridor separation first; post-hit/cross repair can reintroduce ≥48 rails —
  // re-separate before the short-readability pass.
  separateAmbiguousCorridors(placed, connections, diamonds, spineIds)
  // Final readability pass: graph-non-incident short overlaps in [READABILITY, 48).
  // Conservative — refuse any move that creates a new ≥48 coincidence or raises crosses.
  separateShortUnrelatedReadability(placed, connections, diamonds, spineIds)
  // Crossing repair can re-pick a 0-cross rim graze after a clean W-bay enter (+1 cross).
  // Re-apply enter face/approach/rim rules last so browser ink matches tipFace.
  resolveSharedDiamondEnters(placed, connections, diamonds, spineIds)
  repairRimFalseConnections(placed, connections, diamonds, spineIds)
  ensureRectOutwardApproach(placed, connections, diamonds, pills, vertical)
  separateNearParallelCorridors(placed, connections, diamonds, spineIds)
}

/** Minimum gap between unrelated parallel corridor runs (px). */
const PARALLEL_CORRIDOR_GAP = 16

/**
 * Push unrelated near-parallel V/H corridor runs at least PARALLEL_CORRIDOR_GAP apart,
 * preferring lattice-friendly gutters (empty column centres / col boundary ±18).
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function separateNearParallelCorridors(placed, connections, diamonds, spineIds) {
  const shareEndpoint = (a, b) =>
    a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to
  const rank = (c) => (c.kind === 'main' ? 2 : spineIds.has(c.from) && spineIds.has(c.to) ? 2 : c.kind === 'back' ? 0 : 1)

  /** @type {Array<{ c: object, vert: boolean, x: number, lo: number, hi: number, i: number }>} */
  const segs = []
  for (const c of connections) {
    const pts = c.points
    if (!pts || pts.length < 2) continue
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p = pts[i]
      const q = pts[i + 1]
      const vert = Math.abs(p[0] - q[0]) < 0.5
      const horiz = Math.abs(p[1] - q[1]) < 0.5
      if (!vert && !horiz) continue
      const lo = vert ? Math.min(p[1], q[1]) : Math.min(p[0], q[0])
      const hi = vert ? Math.max(p[1], q[1]) : Math.max(p[0], q[0])
      if (hi - lo < 24) continue
      segs.push({ c, vert, x: vert ? p[0] : p[1], lo, hi, i })
    }
  }

  // Lattice lane candidates from placed centres and column gutters.
  /** @type {number[]} */
  const laneXs = []
  /** @type {number[]} */
  const laneYs = []
  const centres = [...placed.values()]
  for (const r of centres) {
    laneXs.push(r.x + r.w / 2, r.x - 18, r.x + r.w + 18)
    laneYs.push(r.y + r.h / 2, r.y - 18, r.y + r.h + 18)
  }

  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false
    for (let i = 0; i < segs.length; i += 1) {
      for (let j = i + 1; j < segs.length; j += 1) {
        const A = segs[i]
        const B = segs[j]
        if (A.vert !== B.vert) continue
        if (A.c === B.c || shareEndpoint(A.c, B.c)) continue
        const overlap = Math.min(A.hi, B.hi) - Math.max(A.lo, B.lo)
        if (overlap < 16) continue
        const gap = Math.abs(A.x - B.x)
        if (!(gap > 0.5 && gap < PARALLEL_CORRIDOR_GAP)) continue
        const mover = rank(A.c) <= rank(B.c) ? A : B
        const other = mover === A ? B : A
        const lanes = mover.vert ? laneXs : laneYs
        const dir = mover.x >= other.x ? 1 : -1
        /** @type {number[]} */
        const candidates = []
        for (const lane of lanes) {
          if ((lane - other.x) * dir > 0 && Math.abs(lane - other.x) >= PARALLEL_CORRIDOR_GAP) {
            candidates.push(lane)
          }
        }
        // Also try other.x ± 18/24/36.
        for (const d of [18, 24, 36, 48]) candidates.push(other.x + dir * d)
        candidates.sort((a, b) => Math.abs(a - mover.x) - Math.abs(b - mover.x))
        const pts = mover.c.points
        if (!pts) continue
        const axis = mover.vert ? 0 : 1
        const old = mover.x
        const fromBox = placed.get(mover.c.from)
        const toBox = placed.get(mover.c.to)
        // Never move source/target port endpoints; only nudge interior corridor segments.
        if (
          Math.abs(pts[0][axis] - old) < 0.5 ||
          Math.abs(pts[pts.length - 1][axis] - old) < 0.5
        ) {
          continue
        }
        if (!(mover.i >= 1 && mover.i <= pts.length - 3)) continue
        for (const lane of candidates) {
          const trial = pts.map((pt) => /** @type {number[]} */ ([pt[0], pt[1]]))
          for (let k = 0; k < trial.length; k += 1) {
            if (Math.abs(pts[k][axis] - old) < 0.5) trial[k][axis] = lane
          }
          if (!pathClear(trial, placed, mover.c.from, mover.c.to)) continue
          if (
            (fromBox &&
              !diamonds.has(mover.c.from) &&
              segRunsOnBoxEdge(trial[0], trial[1], fromBox)) ||
            (toBox &&
              !diamonds.has(mover.c.to) &&
              segRunsOnBoxEdge(trial[trial.length - 2], trial[trial.length - 1], toBox))
          ) {
            continue
          }
          const others = connections.filter((o) => o !== mover.c).map((o) => o.points)
          if (pathCrossCount(trial, others) > pathCrossCount(pts, others)) continue
          mover.c.points = trial
          mover.x = lane
          for (const s of segs) {
            if (s.c !== mover.c) continue
            const sp = mover.c.points[s.i]
            const sq = mover.c.points[s.i + 1]
            if (!sp || !sq) continue
            s.x = s.vert ? sp[0] : sp[1]
            s.lo = s.vert ? Math.min(sp[1], sq[1]) : Math.min(sp[0], sq[0])
            s.hi = s.vert ? Math.max(sp[1], sq[1]) : Math.max(sp[0], sq[0])
          }
          moved = true
          break
        }
      }
    }
    if (!moved) break
  }
}

/**
 * Conservative mid-rail jog for graph-unrelated overlaps below ambiguousMin.
 * Mirrors separateAmbiguousCorridors jogs at READABILITY_MIN, but only accepts a move
 * that strictly shrinks the partner pair overlap and does not create new ≥48 coincidences
 * or raise crossings. Does not raise the hard scanner threshold.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function separateShortUnrelatedReadability(placed, connections, diamonds, spineIds) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5
  const pairMax = (ca, cb) => {
    let best = 0
    if (!ca.points || !cb.points) return 0
    for (let u = 0; u < ca.points.length - 1; u += 1) {
      for (let v = 0; v < cb.points.length - 1; v += 1) {
        best = Math.max(
          best,
          collinearOverlapLen(ca.points[u], ca.points[u + 1], cb.points[v], cb.points[v + 1]),
        )
      }
    }
    return best
  }
  /** Count ≥48 coincidences that findCollinearAmbiguities would flag as hard. */
  const hardAmbCount = (skipId, pts) => {
    const fake = connections.map((c) => (c.id === skipId ? { ...c, points: pts } : c))
    const a = findCollinearAmbiguities(fake)
    return (
      a.unrelatedOverlaps.length + a.branchSharedRails.length + a.sharedEndpointCorridors.length
    )
  }
  const rank = (c) => (c.kind === 'main' ? 2 : c.kind === 'back' ? 0 : 1)

  for (let pass = 0; pass < 6; pass += 1) {
    const amb = findCollinearAmbiguities(connections, {
      ambiguousMin: COLLINEAR_UNRELATED_READABILITY_MIN,
    })
    /** @type {{ a: object, b: object, len: number }[]} */
    const pairs = []
    for (const tag of amb.unrelatedOverlaps) {
      const m = tag.match(/^(c:[^~]+)~(c:[^:]+):([\d.]+)/)
      if (!m) continue
      const len = Number(m[3])
      if (!(len >= COLLINEAR_UNRELATED_READABILITY_MIN && len < COLLINEAR_AMBIGUOUS_MIN)) continue
      const ca = connections.find((c) => c.id === m[1])
      const cb = connections.find((c) => c.id === m[2])
      if (!ca?.points || !cb?.points) continue
      // Geometric "unrelated" from finder; also require no shared graph endpoint.
      if (
        ca.from === cb.from ||
        ca.from === cb.to ||
        ca.to === cb.from ||
        ca.to === cb.to
      ) {
        continue
      }
      pairs.push({ a: ca, b: cb, len })
    }
    pairs.sort((x, y) => y.len - x.len)
    let moved = false
    for (const { a, b } of pairs) {
      const movers = [a, b]
        .filter((c) => c.kind !== 'main')
        .sort((x, y) => rank(x) - rank(y) || String(x.id).localeCompare(String(y.id)))
      for (const c of movers) {
        const partner = c === a ? b : a
        const beforePts = c.points
        const beforePair = pairMax(c, partner)
        if (beforePair < COLLINEAR_UNRELATED_READABILITY_MIN) continue
        const others = connections.filter((o) => o !== c).map((o) => o.points)
        const beforeCross = pathCrossCount(beforePts, others)
        const beforeHard = hardAmbCount(c.id, beforePts)
        /** @type {(number[][] | null | undefined)[]} */
        const alts = [...crossingRepairAlts(c, placed, diamonds, spineIds, others)]
        if (beforePts.length >= 3) {
          for (let i = 0; i <= beforePts.length - 2; i += 1) {
            const p0 = beforePts[i]
            const q0 = beforePts[i + 1]
            const isVert = Math.abs(p0[0] - q0[0]) < 0.5
            const isHoriz = Math.abs(p0[1] - q0[1]) < 0.5
            if (!isVert && !isHoriz) continue
            let hitsPartner = false
            for (let v = 0; v < partner.points.length - 1; v += 1) {
              if (
                collinearOverlapLen(p0, q0, partner.points[v], partner.points[v + 1]) >=
                COLLINEAR_UNRELATED_READABILITY_MIN
              ) {
                hitsPartner = true
                break
              }
            }
            if (!hitsPartner) continue
            const isEnterSeg = i === beforePts.length - 2
            if (i >= 1 && !isEnterSeg) {
              for (const delta of [24, 40, 56, 72, 96, -24, -40, -56, -72, -96]) {
                const trial = beforePts.map((p) => /** @type {number[]} */ ([p[0], p[1]]))
                if (isVert) {
                  trial[i][0] += delta
                  trial[i + 1][0] += delta
                } else {
                  trial[i][1] += delta
                  trial[i + 1][1] += delta
                }
                alts.push(trial)
              }
            }
            if (i === 0 || isEnterSeg) {
              for (const delta of [24, 40, 56, 72, 96, -24, -40, -56, -72, -96]) {
                /** @type {number[][]} */
                const trial = []
                for (let k = 0; k <= i; k += 1) trial.push([beforePts[k][0], beforePts[k][1]])
                if (isHoriz) {
                  trial.push([p0[0], p0[1] + delta])
                  trial.push([q0[0], p0[1] + delta])
                  trial.push([q0[0], q0[1]])
                } else {
                  trial.push([p0[0] + delta, p0[1]])
                  trial.push([p0[0] + delta, q0[1]])
                  trial.push([q0[0], q0[1]])
                }
                for (let k = i + 2; k < beforePts.length; k += 1) {
                  trial.push([beforePts[k][0], beforePts[k][1]])
                }
                alts.push(trial)
              }
            }
            const lo = isVert ? Math.min(p0[1], q0[1]) : Math.min(p0[0], q0[0])
            const hi = isVert ? Math.max(p0[1], q0[1]) : Math.max(p0[0], q0[0])
            const span = hi - lo
            if (span >= COLLINEAR_UNRELATED_READABILITY_MIN && i >= 1 && !isEnterSeg) {
              const fracs = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.85, 0.9]
              for (let v = 0; v < partner.points.length - 1; v += 1) {
                const r = partner.points[v]
                const s = partner.points[v + 1]
                if (
                  collinearOverlapLen(p0, q0, r, s) < COLLINEAR_UNRELATED_READABILITY_MIN
                ) {
                  continue
                }
                const flo = isVert ? Math.min(r[1], s[1]) : Math.min(r[0], s[0])
                const fhi = isVert ? Math.max(r[1], s[1]) : Math.max(r[0], s[0])
                const oLo = Math.max(lo, flo)
                const oHi = Math.min(hi, fhi)
                if (oHi - oLo < COLLINEAR_UNRELATED_READABILITY_MIN) continue
                const fromP0 = isVert ? p0[1] : p0[0]
                const towardQ = (isVert ? q0[1] : q0[0]) >= fromP0
                // Cut just past the foreign overlap so residual with partner drops below floor.
                const cut = towardQ ? Math.min(hi - 1, oHi + 1) : Math.max(lo + 1, oLo - 1)
                if (cut > lo + 0.5 && cut < hi - 0.5) fracs.push((cut - lo) / span)
                const cutEarly = towardQ
                  ? Math.min(oHi, oLo + COLLINEAR_UNRELATED_READABILITY_MIN - 1)
                  : Math.max(oLo, oHi - (COLLINEAR_UNRELATED_READABILITY_MIN - 1))
                if (cutEarly > lo + 0.5 && cutEarly < hi - 0.5) {
                  fracs.push((cutEarly - lo) / span)
                }
              }
              for (const frac of fracs) {
                const split = lo + span * frac
                for (const delta of [24, 40, 56, 72, 96, -24, -40, -56, -72, -96]) {
                  /** @type {number[][]} */
                  const trial = []
                  for (let k = 0; k <= i; k += 1) trial.push([beforePts[k][0], beforePts[k][1]])
                  if (isVert) {
                    trial.push([p0[0], split])
                    trial.push([p0[0] + delta, split])
                    trial.push([p0[0] + delta, q0[1]])
                  } else {
                    trial.push([split, p0[1]])
                    trial.push([split, p0[1] + delta])
                    trial.push([q0[0], p0[1] + delta])
                  }
                  for (let k = i + 2; k < beforePts.length; k += 1) {
                    trial.push([beforePts[k][0], beforePts[k][1]])
                  }
                  alts.push(trial)
                }
              }
            }
          }
        }
        /** @type {number[][] | null} */
        let best = null
        let bestPair = beforePair
        let bestKey = /** @type {[number, number, number]} */ ([
          beforePair,
          beforeCross,
          pathLength(beforePts),
        ])
        for (const pts of alts) {
          if (!pts || pts.length < 2) continue
          let ortho = true
          for (let i = 0; i < pts.length - 1; i += 1) {
            const [p, q] = [pts[i], pts[i + 1]]
            if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) {
              ortho = false
              break
            }
          }
          if (!ortho) continue
          if (!pathClear(pts, placed, c.from, c.to)) continue
          const fromBox = placed.get(c.from)
          const toBox = placed.get(c.to)
          // Reject leave/enter jogs that ride the rectangle border (diamonds use tip ports on the AABB).
          if (
            (fromBox && !diamonds.has(c.from) && segRunsOnBoxEdge(pts[0], pts[1], fromBox)) ||
            (toBox && !diamonds.has(c.to) && segRunsOnBoxEdge(pts[pts.length - 2], pts[pts.length - 1], toBox))
          ) {
            continue
          }
          if (diamonds.has(c.from) && fromBox && !onDiamondOutline(fromBox, pts[0])) continue
          if (diamonds.has(c.to) && toBox && !onDiamondOutline(toBox, pts[pts.length - 1])) continue
          // Keep leave/enter ports fixed on the original face.
          if (!near(pts[0], beforePts[0])) continue
          if (!near(pts[pts.length - 1], beforePts[beforePts.length - 1])) continue
          const cross = pathCrossCount(pts, others)
          if (cross > beforeCross) continue
          if (hardAmbCount(c.id, pts) > beforeHard) continue
          const rem = pairMax({ ...c, points: pts }, partner)
          if (rem >= beforePair) continue
          const key = /** @type {[number, number, number]} */ ([
            rem,
            cross,
            pathLength(pts),
          ])
          if (
            key[0] < bestKey[0] ||
            (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
            (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] + 1e-6 < bestKey[2])
          ) {
            bestKey = key
            bestPair = rem
            best = pts
          }
        }
        if (best && bestPair < beforePair) {
          c.points = best
          moved = true
          break
        }
      }
      if (moved) break
    }
    if (!moved) break
  }
}

/**
 * Re-route non-main edges that still cross others, preferring outer corridors that are
 * pathClear and strictly fewer crossings. Never drops edges; never accepts a box-hitting alt.
 * A second phase ignores one crossing partner at a time so mutual blockers can unlock.
 */
function repairEdgeCrossings(placed, connections, diamonds, spineIds) {
  const leaveKey = (pts) => `${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  const wouldShareLeave = (c, pts) => {
    if (!diamonds.has(c.from) || !pts?.length) return false
    const k = leaveKey(pts)
    for (const o of connections) {
      if (o === c || o.from !== c.from || !o.points?.length) continue
      if (leaveKey(o.points) === k) return true
    }
    return false
  }
  let worldMinY = Infinity
  let worldMaxY = -Infinity
  for (const r of placed.values()) {
    worldMinY = Math.min(worldMinY, r.y)
    worldMaxY = Math.max(worldMaxY, r.y + r.h)
  }
  const wrapsBeyondWorldY = (pts) =>
    pts.some((p) => p[1] < worldMinY - 24 || p[1] > worldMaxY + 24)
  const wouldShareRectStraightPort = (c, pts) => {
    if (diamonds.has(c.from) || !pts?.length) return false
    const k = leaveKey(pts)
    for (const o of connections) {
      if (o === c || !o.points || o.points.length !== 2 || pathBendCount(o.points) !== 0) continue
      if (o.from === c.from && leaveKey(o.points) === k) return true
      if (o.to === c.from && leaveKey([o.points[o.points.length - 1]]) === k) return true
    }
    return false
  }
  const applyBest = (c, others, before, { allowLengthImprove = false } = {}) => {
    const ridesBorder = (pts) => {
      const fromBox = placed.get(c.from)
      const toBox = placed.get(c.to)
      return Boolean(
        (fromBox && !diamonds.has(c.from) && segRunsOnBoxEdge(pts[0], pts[1], fromBox)) ||
          (toBox &&
            !diamonds.has(c.to) &&
            segRunsOnBoxEdge(pts[pts.length - 2], pts[pts.length - 1], toBox)),
      )
    }
    let best = null
    let bestCross = before
    const beforeBorder = c.points?.length && ridesBorder(c.points) ? 1 : 0
    let bestBorder = beforeBorder
    let bestBends = Infinity
    let bestLen = Infinity
    const beforeBends = c.points?.length ? pathBendCount(c.points) : Infinity
    const beforeLen = c.points?.length ? pathLength(c.points) : Infinity
    const allOthers = connections.filter((o) => o !== c).map((o) => o.points)
    const realBefore = c.points?.length ? pathCrossCount(c.points, allOthers) : before
    const isForwardSpineToHang = Boolean(
      spineIds?.has(c.from) && !spineIds?.has(c.to) && c.kind !== 'back',
    )
    const singleBranchSpine =
      connections.filter((o) => o.from === c.from && o.kind !== 'main').length === 1
    const keepInBounds = Boolean(
      isForwardSpineToHang &&
        c.points?.length >= 2 &&
        pathClear(c.points, placed, c.from, c.to) &&
        !wouldShareLeave(c, c.points) &&
        !wrapsBeyondWorldY(c.points) &&
        (realBefore === 0 || (singleBranchSpine && realBefore <= 1)) &&
        beforeBends <= 2,
    )
    for (const pts of crossingRepairAlts(c, placed, diamonds, spineIds, others)) {
      if (!pts || pts.length < 2) continue
      // Reject non-orthogonal polylines (diagonal false friends from sideHorizontal).
      let ortho = true
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [p, q] = [pts[i], pts[i + 1]]
        if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) {
          ortho = false
          break
        }
      }
      if (!ortho) continue
      if (!pathClear(pts, placed, c.from, c.to)) continue
      if (wouldShareLeave(c, pts)) continue
      if (keepInBounds && wrapsBeyondWorldY(pts)) continue
      const cross = pathCrossCount(pts, others)
      if (cross >= realBefore && wouldShareRectStraightPort(c, pts)) continue
      const border = ridesBorder(pts) ? 1 : 0
      // Allow border-riding only when it strictly beats the search threshold (crossing cut).
      if (border && cross >= before) continue
      const bends = pathBendCount(pts)
      const len = pathLength(pts)
      // Prefer fewer crossings; then clear border; then fewer bends; then shorter.
      if (
        cross < bestCross ||
        (cross === bestCross && border < bestBorder) ||
        (cross === bestCross && border === bestBorder && bends < bestBends) ||
        (cross === bestCross && border === bestBorder && bends === bestBends && len < bestLen)
      ) {
        bestCross = cross
        bestBorder = border
        bestBends = bends
        bestLen = len
        best = pts
      }
    }
    if (!best) return false
    const betterCross = bestCross < before
    const betterBorder = bestCross === before && bestBorder < beforeBorder
    const betterBend = bestCross === before && bestBorder === beforeBorder && bestBends < beforeBends
    const betterLen =
      allowLengthImprove &&
      bestCross === before &&
      bestBorder === beforeBorder &&
      bestBends <= beforeBends &&
      bestLen < beforeLen - 0.5
    if (betterCross || betterBorder || betterBend || betterLen) {
      c.points = best
      return true
    }
    return false
  }
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false
    for (const c of connections) {
      if (c.kind === 'main') continue
      if (!c.points?.length) continue
      const others = connections.filter((o) => o !== c).map((o) => o.points)
      const before = pathCrossCount(c.points, others)
      if (before === 0) continue
      if (applyBest(c, others, before)) changed = true
    }
    if (!changed) break
  }
  // Mutual unlock: ignore ALL current crossing partners so a clear corridor can land, then
  // re-route each partner against the new geometry (L4 horizontal n-7→n-8 vs settlement cluster).
  for (const c of connections) {
    if (c.kind === 'main' || !c.points?.length) continue
    const partners = connections.filter((o) => o !== c && pathCrossCount(c.points, [o.points]) > 0)
    if (!partners.length) continue
    const partnerIds = new Set(partners.map((p) => p.id))
    const othersSans = connections.filter((o) => o !== c && !partnerIds.has(o.id)).map((o) => o.points)
    const before = pathCrossCount(
      c.points,
      connections.filter((o) => o !== c).map((o) => o.points),
    )
    const snapshot = new Map(connections.map((e) => [e.id, e.points]))
    if (!applyBest(c, othersSans, before)) continue
    const totalCross = () =>
      connections.reduce(
        (n, e, i) =>
          n +
          pathCrossCount(
            e.points,
            connections.filter((_, j) => j > i).map((o) => o.points),
          ),
        0,
      )
    const preTotal = totalCross()
    for (const partner of partners) {
      const partnerOthers = connections.filter((o) => o !== partner).map((o) => o.points)
      // Force a search even when the partner currently looks fine against the unlocked edge.
      applyBest(partner, partnerOthers, pathCrossCount(partner.points, partnerOthers) + 1)
    }
    const postTotal = totalCross()
    const stillHitsPartners = partners.some((p) => pathCrossCount(c.points, [p.points]) > 0)
    if (postTotal > preTotal || stillHitsPartners) {
      for (const e of connections) {
        if (snapshot.has(e.id)) e.points = snapshot.get(e.id)
      }
    }
  }
  // Length shorten at equal crossings: firstClearPath / hangOnRight-first can lock a long
  // wrap when a shorter outer-face U also clears (L4 n-15→n-13). Never raise crossings.
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    for (const c of connections) {
      if (c.kind === 'main' || !c.points?.length) continue
      const others = connections.filter((o) => o !== c).map((o) => o.points)
      const before = pathCrossCount(c.points, others)
      if (applyBest(c, others, before, { allowLengthImprove: true })) changed = true
    }
    if (!changed) break
  }
}

/**
 * Orthogonal route between two boxes, ports on face centres. Prefer same-row / same-column
 * (0-bend) when clear; otherwise leave/enter facing sides. Every candidate is pathClear-checked
 * before accept; side/outer channels escalate when the preferred ink hits a foreign box.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} [fromDiamond]
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} [placed]
 * @param {string | null | undefined} [fromId]
 * @param {string | null | undefined} [toId]
 * @param {Set<string> | null | undefined} [spineIds]
 * @param {number[][][] | null | undefined} [others]
 */
/**
 * Accept a polyline only when clear (or when placement is unknown). Never return known-unsafe
 * ink as a routing success — caller stubs + routeExhausted → layout boundary fallback.
 * @param {number[][] | null | undefined} pts
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 */
function acceptClear(pts, placed, fromId, toId) {
  if (!pts?.length) return null
  if (!placed) return pts
  return pathClear(pts, placed, fromId, toId) ? pts : null
}

/**
 * Project endpoints that miss the painted diamond onto the nearest outline point.
 * Stage assembly / same-row rect helpers can leave main ports on the bbox mid-line
 * interior or short of the W/E vertices (B10 H stages-on).
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 */
function snapDiamondEndpoints(placed, connections, diamonds) {
  const snap = (box, p, toward) => {
    if (onDiamondOutline(box, p)) return p
    const v = diamondVertices(box)
    // Prefer cardinal vertex when nearly axis-aligned with centre (main trunk ports).
    /** @type {[number, number] | null} */
    let best = null
    let bestD = Infinity
    for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
      const pt = /** @type {[number, number]} */ (v[f])
      const d = Math.hypot(p[0] - pt[0], p[1] - pt[1])
      if (d < bestD) {
        bestD = d
        best = pt
      }
    }
    // Also try projection onto each outline edge toward the next polyline point.
    if (toward) {
      for (const [a, b] of [
        [v.N, v.E],
        [v.E, v.S],
        [v.S, v.W],
        [v.W, v.N],
      ]) {
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const len2 = dx * dx + dy * dy
        if (len2 < 1e-8) continue
        let t = ((toward[0] - a[0]) * dx + (toward[1] - a[1]) * dy) / len2
        t = Math.max(0, Math.min(1, t))
        const proj = /** @type {[number, number]} */ ([a[0] + t * dx, a[1] + t * dy])
        const d = Math.hypot(p[0] - proj[0], p[1] - proj[1])
        if (d < bestD) {
          bestD = d
          best = proj
        }
      }
    }
    // Only snap when reasonably close (avoid yanking a far mis-route).
    if (!best || bestD > Math.max(box.w, box.h)) return p
    return best
  }
  for (const c of connections) {
    if (!c.points || c.points.length < 2) continue
    // Already-separated bidirectional tracks sit off-centre on diamond E/W faces;
    // do not yank them back onto a cardinal tip.
    if (c.biSeparated) continue
    if (diamonds.has(c.from)) {
      const box = placed.get(c.from)
      if (box) c.points[0] = snap(box, c.points[0], c.points[1])
    }
    if (diamonds.has(c.to)) {
      const box = placed.get(c.to)
      if (box) {
        c.points[c.points.length - 1] = snap(
          box,
          c.points[c.points.length - 1],
          c.points[c.points.length - 2],
        )
      }
    }
    // Snapping a diamond vertex can break the adjacent ortho segment (V11 H stages-on
    // collapsed n-2→n-10 into a 2-point diagonal). Insert a bend to restore axis-alignment.
    // Prefer the elbow that stays pathClear; fall back to the other corner.
    const fixSeg = (i0, i1) => {
      const p = c.points[i0]
      const q = c.points[i1]
      if (Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5) return
      const mids = [
        /** @type {number[]} */ ([p[0], q[1]]),
        /** @type {number[]} */ ([q[0], p[1]]),
      ]
      for (const mid of mids) {
        const trial = c.points.map((pt) => /** @type {number[]} */ ([pt[0], pt[1]]))
        if (i0 < i1) trial.splice(i1, 0, mid)
        else trial.splice(i0, 0, mid)
        if (pathClear(trial, placed, c.from, c.to)) {
          c.points = trial
          return
        }
      }
      // Last resort: insert first elbow even if not clear — later repair may fix.
      const mid = mids[0]
      if (i0 < i1) c.points.splice(i1, 0, mid)
      else c.points.splice(i0, 0, mid)
    }
    if (c.points.length >= 2) fixSeg(0, 1)
    if (c.points.length >= 2) fixSeg(c.points.length - 2, c.points.length - 1)
  }
}

/**
 * Start/end stadium arc poles: a face-parallel ride into the arc mid meets the pill arc
 * in the browser (V08b). Rewrite those enters so the last run is outward into a cardinal
 * mid. When the current arc face has no 0-cross outward stub, try other face mids rather
 * than installing a crossing stub. Skips diamonds and ordinary step rects (B04/B09
 * regressions). Requires `pills` = start/end ids.
 * Arc faces: E/W when `vertical`; N/S when horizontal (frame axes before polish swap).
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} [pills]
 * @param {boolean} [vertical]
 */
function ensureRectOutwardApproach(placed, connections, diamonds, pills = new Set(), vertical = true) {
  const midOf = (box, face) => {
    if (face === 'E') return /** @type {number[]} */ ([box.x + box.w, box.y + box.h / 2])
    if (face === 'W') return /** @type {number[]} */ ([box.x, box.y + box.h / 2])
    if (face === 'N') return /** @type {number[]} */ ([box.x + box.w / 2, box.y])
    return /** @type {number[]} */ ([box.x + box.w / 2, box.y + box.h])
  }
  const faceOfMid = (box, p) => {
    for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
      const m = midOf(box, f)
      if (Math.hypot(p[0] - m[0], p[1] - m[1]) <= 2.5) return f
    }
    return null
  }
  const outwardOk = (face, a, b) =>
    (face === 'E' && Math.abs(a[1] - b[1]) < 0.5 && a[0] > b[0] + 0.5) ||
    (face === 'W' && Math.abs(a[1] - b[1]) < 0.5 && a[0] < b[0] - 0.5) ||
    (face === 'N' && Math.abs(a[0] - b[0]) < 0.5 && a[1] < b[1] - 0.5) ||
    (face === 'S' && Math.abs(a[0] - b[0]) < 0.5 && a[1] > b[1] + 0.5)
  const cleanPts = (trial) => {
    const clean = /** @type {number[][]} */ ([trial[0]])
    for (let i = 1; i < trial.length; i += 1) {
      const a = clean[clean.length - 1]
      const b = trial[i]
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) clean.push(b)
    }
    return clean
  }
  /** @param {'N'|'E'|'S'|'W'} face @param {number[]} mid @param {object} c @param {{ x: number, y: number, w: number, h: number }} _box */
  const candidatesForFace = (face, mid, c, _box) => {
    /** @type {number[][][]} */
    const trials = []
    const leave = /** @type {number[]} */ ([c.points[0][0], c.points[0][1]])
    const src = placed.get(c.from)
    if (!src) return trials
    const gaps = [8, 10, 14, 20, 28, 40]
    /** @type {number[]} */
    const rails = []
    for (const [oid, r] of placed) {
      if (oid === c.from || oid === c.to) continue
      rails.push(r.y - 14, r.y + r.h + 14, r.x - 14, r.x + r.w + 14)
    }
    // Bottom / top canvas wraps (0-cross when gutter spine blocks same-face stubs).
    let minY = Infinity
    let maxY = -Infinity
    for (const r of placed.values()) {
      minY = Math.min(minY, r.y)
      maxY = Math.max(maxY, r.y + r.h)
    }
    rails.push(minY - 40, maxY + 40)
    for (const gap of gaps) {
      const bay =
        face === 'E'
          ? /** @type {number[]} */ ([mid[0] + gap, mid[1]])
          : face === 'W'
            ? /** @type {number[]} */ ([mid[0] - gap, mid[1]])
            : face === 'N'
              ? /** @type {number[]} */ ([mid[0], mid[1] - gap])
              : /** @type {number[]} */ ([mid[0], mid[1] + gap])
      if (face === 'E' || face === 'W') {
        for (const railY of rails) {
          if (typeof railY !== 'number' || Number.isNaN(railY)) continue
          trials.push(
            cleanPts([leave, [leave[0], railY], [bay[0], railY], bay, mid]),
            cleanPts([leave, [bay[0], leave[1]], bay, mid]),
          )
        }
      } else {
        for (const railX of rails) {
          if (typeof railX !== 'number' || Number.isNaN(railX)) continue
          trials.push(
            cleanPts([leave, [railX, leave[1]], [railX, bay[1]], bay, mid]),
            cleanPts([leave, [leave[0], bay[1]], bay, mid]),
          )
        }
      }
    }
    return trials
  }
  for (const c of connections) {
    if (!c.points || c.points.length < 2) continue
    // Enter-side only: leave ports on diamonds stay tip-owned (V08b n-b2 W tip).
    const id = c.to
    if (diamonds.has(id)) continue
    // Only stadium start/end poles (arcs). Step rects keep face-mid geometry alone.
    if (!pills.has(id)) continue
    const box = placed.get(id)
    if (!box) continue
    const p = c.points[c.points.length - 1]
    const prev = c.points[c.points.length - 2]
    const face = faceOfMid(box, p)
    if (!face) continue
    // Pill arcs: E/W when vertical; N/S in horizontal frame (polish swaps them to painted E/W).
    const arcFaces = vertical ? ['E', 'W'] : ['N', 'S']
    if (!arcFaces.includes(face)) continue
    // Face-parallel = last run collinear with the arc face (vertical into E/W, horizontal into N/S).
    const alongFace = vertical ? Math.abs(prev[0] - p[0]) < 0.5 : Math.abs(prev[1] - p[1]) < 0.5
    if (!alongFace) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const beforeCross = pathCrossCount(c.points, others)
    const leave = c.points[0]
    /** @type {number[][] | null} */
    let best = null
    let bestCross = Infinity
    let bestBends = Infinity
    let bestLen = Infinity
    let bestFaceRank = Infinity
    // Prefer repairing the current face; fall back to other cardinal mids when the
    // gutter is blocked (V08b E flush vs A-spine → W mid wrap).
    const faces = /** @type {('N'|'E'|'S'|'W')[]} */ (
      [face, ...['W', 'E', 'N', 'S'].filter((f) => f !== face)]
    )
    for (let fi = 0; fi < faces.length; fi += 1) {
      const f = faces[fi]
      const mid = midOf(box, f)
      const srcBox = placed.get(c.from)
      for (const trial of candidatesForFace(f, mid, c, box)) {
        if (!trial || trial.length < 2) continue
        // Keep diamond/source leave port when already tip-aligned.
        if (Math.hypot(trial[0][0] - leave[0], trial[0][1] - leave[1]) > 0.5) continue
        // Reject first segment riding the source box edge, or any segment on a foreign edge.
        if (srcBox && segRunsOnBoxEdge(trial[0], trial[1], srcBox)) continue
        let ridesForeign = false
        for (let i = 0; i < trial.length - 1 && !ridesForeign; i += 1) {
          for (const [oid, r] of placed) {
            if (oid === c.from || oid === c.to) continue
            if (segRunsOnBoxEdge(trial[i], trial[i + 1], r)) {
              ridesForeign = true
              break
            }
          }
        }
        if (ridesForeign) continue
        if (!pathClear(trial, placed, c.from, c.to)) continue
        let ortho = true
        for (let i = 0; i < trial.length - 1; i += 1) {
          const u = trial[i]
          const v = trial[i + 1]
          if (Math.abs(u[0] - v[0]) >= 0.5 && Math.abs(u[1] - v[1]) >= 0.5) {
            ortho = false
            break
          }
        }
        if (!ortho) continue
        const a = trial[trial.length - 2]
        const b = trial[trial.length - 1]
        if (!outwardOk(f, a, b)) continue
        if (Math.hypot(b[0] - mid[0], b[1] - mid[1]) > 0.5) continue
        const cross = pathCrossCount(trial, others)
        if (cross > beforeCross) continue
        const bends = pathBendCount(trial)
        const len = pathLength(trial)
        if (
          cross < bestCross ||
          (cross === bestCross && fi < bestFaceRank) ||
          (cross === bestCross && fi === bestFaceRank && bends < bestBends) ||
          (cross === bestCross && fi === bestFaceRank && bends === bestBends && len + 1e-6 < bestLen)
        ) {
          bestCross = cross
          bestFaceRank = fi
          bestBends = bends
          bestLen = len
          best = trial
        }
      }
      // Stop early when current face already has a 0-cross outward repair.
      if (fi === 0 && best && bestCross <= beforeCross && bestCross === 0) break
    }
    if (best) c.points = best
  }
}

/**
 * Project leave/enter points that miss a rect face onto the nearest face.
 * Diamonds are handled by snapDiamondEndpoints; this covers step/start/end boxes
 * whose main routes were left stale after a later box shift.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 */
function snapRectEndpoints(placed, connections, diamonds) {
  const onFace = (box, p) => {
    const tol = 1.5
    const onL = Math.abs(p[0] - box.x) <= tol && p[1] >= box.y - tol && p[1] <= box.y + box.h + tol
    const onR =
      Math.abs(p[0] - (box.x + box.w)) <= tol && p[1] >= box.y - tol && p[1] <= box.y + box.h + tol
    const onT = Math.abs(p[1] - box.y) <= tol && p[0] >= box.x - tol && p[0] <= box.x + box.w + tol
    const onB =
      Math.abs(p[1] - (box.y + box.h)) <= tol && p[0] >= box.x - tol && p[0] <= box.x + box.w + tol
    return onL || onR || onT || onB
  }
  /** @param {{ x: number, y: number, w: number, h: number }} box @param {number[]} p @param {number[] | null} toward */
  const snap = (box, p, toward) => {
    if (onFace(box, p)) return /** @type {number[]} */ (p)
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    // Prefer the face implied by the outgoing/incoming ortho run.
    if (toward) {
      const horiz = Math.abs(toward[1] - p[1]) < 0.5
      const vert = Math.abs(toward[0] - p[0]) < 0.5
      if (horiz) {
        const y = Math.max(box.y, Math.min(box.y + box.h, p[1]))
        // `toward` is the adjacent polyline point: the face the segment uses is the one
        // between p and toward (or the near face when p already overshoots the box).
        const towardRight = toward[0] > p[0]
        if (towardRight && p[0] > box.x + box.w + 0.5) return [box.x + box.w, y]
        if (!towardRight && p[0] < box.x - 0.5) return [box.x, y]
        if (towardRight && p[0] < box.x - 0.5) return [box.x, y]
        if (!towardRight && p[0] > box.x + box.w + 0.5) return [box.x + box.w, y]
        return [towardRight ? box.x + box.w : box.x, y]
      }
      if (vert) {
        const x = Math.max(box.x, Math.min(box.x + box.w, p[0]))
        const leaveDown = toward[1] > p[1]
        if (leaveDown && p[1] > box.y + box.h + 0.5) return [x, box.y + box.h]
        if (!leaveDown && p[1] < box.y - 0.5) return [x, box.y]
        if (leaveDown && p[1] < box.y - 0.5) return [x, box.y]
        if (!leaveDown && p[1] > box.y + box.h + 0.5) return [x, box.y + box.h]
        const y = leaveDown ? box.y + box.h : box.y
        return [x, y]
      }
    }
    // Fallback: nearest point on the bbox outline.
    const x = Math.max(box.x, Math.min(box.x + box.w, p[0]))
    const y = Math.max(box.y, Math.min(box.y + box.h, p[1]))
    const candidates = [
      [box.x, y],
      [box.x + box.w, y],
      [x, box.y],
      [x, box.y + box.h],
    ]
    let best = candidates[0]
    let bestD = Infinity
    for (const c of candidates) {
      const d = Math.hypot(p[0] - c[0], p[1] - c[1])
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    if (bestD > Math.max(box.w, box.h) + Math.hypot(cx - p[0], cy - p[1])) return p
    return best
  }
  for (const c of connections) {
    if (!c.points || c.points.length < 2) continue
    if (!diamonds.has(c.from)) {
      const box = placed.get(c.from)
      if (box) c.points[0] = snap(box, c.points[0], c.points[1])
    }
      if (! diamonds.has(c.to)) {
        const box = placed.get(c.to)
        if (box) {
          c.points[c.points.length - 1] = snap(
            box,
            c.points[c.points.length - 1],
            c.points[c.points.length - 2],
          )
        }
      }
      const fixSeg = (i0, i1) => {
        const p = c.points[i0]
        const q = c.points[i1]
        if (Math.abs(p[0] - q[0]) < 0.5 || Math.abs(p[1] - q[1]) < 0.5) return
        const mids = [
          /** @type {number[]} */ ([p[0], q[1]]),
          /** @type {number[]} */ ([q[0], p[1]]),
        ]
        for (const mid of mids) {
          const trial = c.points.map((pt) => /** @type {number[]} */ ([pt[0], pt[1]]))
          if (i0 < i1) trial.splice(i1, 0, mid)
          else trial.splice(i0, 0, mid)
          if (pathClear(trial, placed, c.from, c.to)) {
            c.points = trial
            return
          }
        }
        const mid = mids[0]
        if (i0 < i1) c.points.splice(i1, 0, mid)
        else c.points.splice(i0, 0, mid)
      }
      if (c.points.length >= 2) fixSeg(0, 1)
      if (c.points.length >= 2) fixSeg(c.points.length - 2, c.points.length - 1)
    }
  }

/**
 * Separate long collinear coincidences that confuse edge ownership:
 * - unrelated edges sharing a rail with no common endpoint (B12H)
 * - same-source branches with distinct ports but a long shared rail (V08b)
 * - opposite-direction shared-endpoint corridors when a clearer alt exists (L4V return)
 * Prefers re-routing back/branch edges via crossingRepairAlts; never raises crossings or hits.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function separateAmbiguousCorridors(placed, connections, diamonds, spineIds) {
  /** Prefer moving back/branch over main; stable by id. */
  const rank = (c) => (c.kind === 'main' ? 2 : c.kind === 'back' ? 0 : 1)

  const overlapAgainst = (pts, skipId) => {
    let n = 0
    for (const o of connections) {
      if (o.id === skipId || !o.points?.length) continue
      for (let u = 0; u < pts.length - 1; u += 1) {
        for (let v = 0; v < o.points.length - 1; v += 1) {
          // Count soft shared-endpoint rails too (ATTACH_TOL, AMBIGUOUS_MIN) — L4V ~40u.
          if (
            collinearOverlapLen(pts[u], pts[u + 1], o.points[v], o.points[v + 1]) >
            COLLINEAR_ATTACH_TOL
          ) {
            n += 1
          }
        }
      }
    }
    return n
  }

  // Re-scan after each successful move: fixing one coincidence can expose another
  // (B10V stages-on: clearing n-2→n-5 rails left n-8→n-9 ~ n-6→n-2 at 132u).
  for (let pass = 0; pass < 6; pass += 1) {
    const amb = findCollinearAmbiguities(connections)
    const targets = new Set()
    for (const tag of [
      ...amb.unrelatedOverlaps,
      ...amb.branchSharedRails,
      ...amb.sharedEndpointCorridors,
    ]) {
      const m = tag.match(/^(c:[^~]+)~(c:[^:]+):/)
      if (!m) continue
      targets.add(m[1])
      targets.add(m[2])
    }
    // Long non-reciprocal "shortNecessary" rails (L4 return riding 是): still separate them
    // without reclassifying into sharedEndpointCorridors (that broke 08 H-on hardAmbCount).
    for (const tag of amb.shortAttachments) {
      const m = tag.match(/^(c:[^~]+)~(c:[^:]+):([\d.]+)/)
      if (!m) continue
      const len = Number(m[3])
      if (!(len > COLLINEAR_ATTACH_TOL)) continue
      const ca = connections.find((c) => c.id === m[1])
      const cb = connections.find((c) => c.id === m[2])
      if (!ca || !cb) continue
      if (ca.from === cb.to && ca.to === cb.from) continue // reciprocal face hop
      targets.add(m[1])
      targets.add(m[2])
    }
    // Dead zone (ATTACH_TOL, AMBIGUOUS_MIN): scanner skips these, but L4V return on the hang-side
    // tip can still ride n-13→n-14 for ~40u. Measure shared-endpoint pairs directly.
    for (let i = 0; i < connections.length; i += 1) {
      for (let j = i + 1; j < connections.length; j += 1) {
        const ca = connections[i]
        const cb = connections[j]
        if (!ca.points?.length || !cb.points?.length) continue
        const share =
          ca.from === cb.from || ca.from === cb.to || ca.to === cb.from || ca.to === cb.to
        if (!share) continue
        if (ca.from === cb.to && ca.to === cb.from) continue
        let maxOv = 0
        for (let u = 0; u < ca.points.length - 1; u += 1) {
          for (let v = 0; v < cb.points.length - 1; v += 1) {
            maxOv = Math.max(
              maxOv,
              collinearOverlapLen(ca.points[u], ca.points[u + 1], cb.points[v], cb.points[v + 1]),
            )
          }
        }
        if (maxOv > COLLINEAR_ATTACH_TOL && maxOv < COLLINEAR_AMBIGUOUS_MIN) {
          targets.add(ca.id)
          targets.add(cb.id)
        }
      }
    }
    if (targets.size === 0) return

    const movers = connections
      .filter((c) => targets.has(c.id) && c.kind !== 'main')
      .sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)))
    let moved = false
    for (const c of movers) {
      const beforePts = c.points
      if (!beforePts?.length) continue
      const others = connections.filter((o) => o !== c).map((o) => o.points)
      const beforeCross = pathCrossCount(beforePts, others)
      const beforeOverlap = overlapAgainst(beforePts, c.id)
      if (beforeOverlap === 0) continue
      let best = null
      let bestKey = /** @type {[number, number, number, number]} */ ([
        beforeOverlap,
        beforeCross,
        pathBendCount(beforePts),
        pathLength(beforePts),
      ])
      /** @type {(number[][] | null | undefined)[]} */
      const alts = [...crossingRepairAlts(c, placed, diamonds, spineIds, others)]
      // Nudge/jog overlapping rails. i=0 is the leave stub — keep the port fixed and jog
      // immediately after it (V04b stages-on shared S-face stem). Interior i>=1 may whole-rail nudge.
      if (beforePts.length >= 3) {
        // Include last segment (i = length-2): length-3 same-source rails share the
        // corner→enter span (V02b); keep enter fixed via parallel stub rejoin.
        for (let i = 0; i <= beforePts.length - 2; i += 1) {
          const p0 = beforePts[i]
          const q0 = beforePts[i + 1]
          const isVert = Math.abs(p0[0] - q0[0]) < 0.5
          const isHoriz = Math.abs(p0[1] - q0[1]) < 0.5
          if (!isVert && !isHoriz) continue
          // Only nudge rails that currently coincide with a foreign segment
          // (soft floor: ATTACH_TOL, so L4V ~40u E-tip rides are eligible).
          let hitsForeign = false
          for (const o of connections) {
            if (o.id === c.id || !o.points) continue
            for (let v = 0; v < o.points.length - 1; v += 1) {
              if (
                collinearOverlapLen(p0, q0, o.points[v], o.points[v + 1]) > COLLINEAR_ATTACH_TOL
              ) {
                hitsForeign = true
                break
              }
            }
            if (hitsForeign) break
          }
          if (!hitsForeign) continue
          const isEnterSeg = i === beforePts.length - 2
          // Whole-rail nudge: interior only (never move leave/enter endpoints).
          if (i >= 1 && !isEnterSeg) {
            for (const delta of [24, 40, 56, 72, 96, -24, -40, -56, -72, -96]) {
              const trial = beforePts.map((p) => /** @type {number[]} */ ([p[0], p[1]]))
              if (isVert) {
                trial[i][0] += delta
                trial[i + 1][0] += delta
              } else {
                trial[i][1] += delta
                trial[i + 1][1] += delta
              }
              alts.push(trial)
            }
          }
          // Leave-stub or enter-seg jog: keep port/enter fixed, run a parallel offset rail.
          if (i === 0 || isEnterSeg) {
            for (const delta of [24, 40, 56, 72, 96, -24, -40, -56, -72, -96]) {
              /** @type {number[][]} */
              const trial = []
              for (let k = 0; k <= i; k += 1) trial.push([beforePts[k][0], beforePts[k][1]])
              if (isHoriz) {
                trial.push([p0[0], p0[1] + delta])
                trial.push([q0[0], p0[1] + delta])
                trial.push([q0[0], q0[1]])
              } else {
                trial.push([p0[0] + delta, p0[1]])
                trial.push([p0[0] + delta, q0[1]])
                trial.push([q0[0], q0[1]])
              }
              for (let k = i + 2; k < beforePts.length; k += 1) {
                trial.push([beforePts[k][0], beforePts[k][1]])
              }
              alts.push(trial)
            }
          }
          // Mid-rail jog: keep the near end, offset only the overlapping span.
          const lo = isVert ? Math.min(p0[1], q0[1]) : Math.min(p0[0], q0[0])
          const hi = isVert ? Math.max(p0[1], q0[1]) : Math.max(p0[0], q0[0])
          const span = hi - lo
          if (span >= COLLINEAR_AMBIGUOUS_MIN && i >= 1 && !isEnterSeg) {
            // Include near-end splits: V10a H-on shared y=614 needs ~0.9 so the stub
            // past the foreign rail stays under ambiguousMin (0.75 left 49u residual).
            const fracs = [0.1, 0.15, 0.25, 0.4, 0.5, 0.6, 0.75, 0.85, 0.9]
            // Also pin splits that truncate foreign overlap to just under ambiguousMin.
            for (const o of connections) {
              if (o.id === c.id || !o.points) continue
              for (let v = 0; v < o.points.length - 1; v += 1) {
                if (
                  collinearOverlapLen(p0, q0, o.points[v], o.points[v + 1]) <
                  COLLINEAR_AMBIGUOUS_MIN
                ) {
                  continue
                }
                const [r, s] = [o.points[v], o.points[v + 1]]
                const flo = isVert ? Math.min(r[1], s[1]) : Math.min(r[0], s[0])
                const fhi = isVert ? Math.max(r[1], s[1]) : Math.max(r[0], s[0])
                const oLo = Math.max(lo, flo)
                const oHi = Math.min(hi, fhi)
                if (oHi - oLo < COLLINEAR_AMBIGUOUS_MIN) continue
                // From p0: cut after (ambiguousMin - 1) of overlap so residual < threshold.
                const fromP0 = isVert ? p0[1] : p0[0]
                const towardQ = (isVert ? q0[1] : q0[0]) >= fromP0
                const cut = towardQ
                  ? Math.min(oHi, oLo + COLLINEAR_AMBIGUOUS_MIN - 1)
                  : Math.max(oLo, oHi - (COLLINEAR_AMBIGUOUS_MIN - 1))
                if (cut > lo + 1 && cut < hi - 1) fracs.push((cut - lo) / span)
              }
            }
            for (const frac of fracs) {
              const split = lo + span * frac
              for (const delta of [24, 40, 56, 72, 96, -24, -40, -56, -72, -96]) {
                /** @type {number[][]} */
                const trial = []
                for (let k = 0; k <= i; k += 1) trial.push([beforePts[k][0], beforePts[k][1]])
                if (isVert) {
                  const x = p0[0]
                  trial.push([x, split])
                  trial.push([x + delta, split])
                  trial.push([x + delta, q0[1]])
                } else {
                  const y = p0[1]
                  trial.push([split, y])
                  trial.push([split, y + delta])
                  trial.push([q0[0], y + delta])
                }
                for (let k = i + 2; k < beforePts.length; k += 1) {
                  trial.push([beforePts[k][0], beforePts[k][1]])
                }
                alts.push(trial)
              }
            }
          }
        }
      }
      for (const pts of alts) {
        if (!pts || pts.length < 2) continue
        // Reject diagonals from crossingRepairAlts (sideHorizontal false friends).
        let ortho = true
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [p, q] = [pts[i], pts[i + 1]]
          if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) {
            ortho = false
            break
          }
        }
        if (!ortho) continue
        if (!pathClear(pts, placed, c.from, c.to)) continue
        // Keep diamond leave/enter on outline when applicable.
        const fromBox = placed.get(c.from)
        const toBox = placed.get(c.to)
        // Reject leave/enter jogs that ride the rectangle border (diamonds use tip ports on the AABB).
        if (
          (fromBox && !diamonds.has(c.from) && segRunsOnBoxEdge(pts[0], pts[1], fromBox)) ||
          (toBox && !diamonds.has(c.to) && segRunsOnBoxEdge(pts[pts.length - 2], pts[pts.length - 1], toBox))
        ) {
          continue
        }
        if (diamonds.has(c.from) && fromBox && !onDiamondOutline(fromBox, pts[0])) continue
        if (diamonds.has(c.to) && toBox && !onDiamondOutline(toBox, pts[pts.length - 1])) continue
        // Do not re-collapse distinct decision leave ports onto one vertex.
        if (diamonds.has(c.from)) {
          const leaveKey = `${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
          let sharedLeave = false
          for (const o of connections) {
            if (o === c || o.from !== c.from || !o.points?.length) continue
            const ok = `${o.points[0][0].toFixed(1)},${o.points[0][1].toFixed(1)}`
            if (ok === leaveKey) {
              sharedLeave = true
              break
            }
          }
          if (sharedLeave) continue
        }
        const cross = pathCrossCount(pts, others)
        if (cross > beforeCross) continue
        const overlap = overlapAgainst(pts, c.id)
        const bends = pathBendCount(pts)
        const len = pathLength(pts)
        const key = /** @type {[number, number, number, number]} */ ([overlap, cross, bends, len])
        if (
          key[0] < bestKey[0] ||
          (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
          (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2]) ||
          (key[0] === bestKey[0] &&
            key[1] === bestKey[1] &&
            key[2] === bestKey[2] &&
            key[3] + 1e-6 < bestKey[3])
        ) {
          bestKey = key
          best = pts
        }
      }
      if (best && bestKey[0] < beforeOverlap) {
        c.points = best
        moved = true
        break // re-scan; a move can introduce a new coincidence elsewhere
      }
    }
    // Joint opposite half-nudge when single-edge moves all raise a cross (V10a H-on).
    if (!moved) {
      for (const tag of [...amb.unrelatedOverlaps, ...amb.branchSharedRails]) {
        const m = tag.match(/^(c:[^~]+)~(c:[^:]+):/)
        if (!m) continue
        const ca = connections.find((c) => c.id === m[1])
        const cb = connections.find((c) => c.id === m[2])
        if (!ca?.points || !cb?.points) continue
        if (ca.kind === 'main' && cb.kind === 'main') continue
        // Find a shared overlapping interior rail pair (same orientation).
        let pair = null
        for (let i = 1; i < ca.points.length - 2 && !pair; i += 1) {
          for (let j = 1; j < cb.points.length - 2; j += 1) {
            const len = collinearOverlapLen(
              ca.points[i],
              ca.points[i + 1],
              cb.points[j],
              cb.points[j + 1],
            )
            if (len < COLLINEAR_AMBIGUOUS_MIN) continue
            const aVert = Math.abs(ca.points[i][0] - ca.points[i + 1][0]) < 0.5
            pair = { i, j, aVert }
            break
          }
        }
        if (!pair) continue
        const beforeCross =
          pathCrossCount(
            ca.points,
            connections.filter((o) => o !== ca).map((o) => o.points),
          ) +
          pathCrossCount(
            cb.points,
            connections.filter((o) => o !== cb).map((o) => o.points),
          )
        for (const half of [12, 16, 20, 24, 32, 40]) {
          const ta = ca.points.map((p) => /** @type {number[]} */ ([p[0], p[1]]))
          const tb = cb.points.map((p) => /** @type {number[]} */ ([p[0], p[1]]))
          if (pair.aVert) {
            ta[pair.i][0] += half
            ta[pair.i + 1][0] += half
            tb[pair.j][0] -= half
            tb[pair.j + 1][0] -= half
          } else {
            ta[pair.i][1] += half
            ta[pair.i + 1][1] += half
            tb[pair.j][1] -= half
            tb[pair.j + 1][1] -= half
          }
          if (!pathClear(ta, placed, ca.from, ca.to)) continue
          if (!pathClear(tb, placed, cb.from, cb.to)) continue
          const aFrom = placed.get(ca.from)
          const bFrom = placed.get(cb.from)
          const aTo = placed.get(ca.to)
          const bTo = placed.get(cb.to)
          if (diamonds.has(ca.from) && aFrom && !onDiamondOutline(aFrom, ta[0])) continue
          if (diamonds.has(cb.from) && bFrom && !onDiamondOutline(bFrom, tb[0])) continue
          if (diamonds.has(ca.to) && aTo && !onDiamondOutline(aTo, ta[ta.length - 1])) continue
          if (diamonds.has(cb.to) && bTo && !onDiamondOutline(bTo, tb[tb.length - 1])) continue
          const crossSum =
            pathCrossCount(
              ta,
              connections.filter((o) => o !== ca).map((o) => (o === cb ? tb : o.points)),
            ) +
            pathCrossCount(
              tb,
              connections.filter((o) => o !== cb).map((o) => (o === ca ? ta : o.points)),
            )
          if (crossSum > beforeCross) continue
          let ov = 0
          for (let u = 0; u < ta.length - 1; u += 1) {
            for (let v = 0; v < tb.length - 1; v += 1) {
              if (collinearOverlapLen(ta[u], ta[u + 1], tb[v], tb[v + 1]) >= COLLINEAR_AMBIGUOUS_MIN) {
                ov += 1
              }
            }
          }
          if (ov > 0) continue
          ca.points = ta
          cb.points = tb
          moved = true
          break
        }
        if (moved) break
      }
    }
    if (!moved) return
  }
}

/**
 * Rim false connection: a non-main rail rides a foreign box edge and another edge's
 * port sits on that same rim inside the span (L4 return on n-17 top ∩ 否 tip).
 * Re-route the rider without raising crossings or losing pathClear.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function repairRimFalseConnections(placed, connections, diamonds, spineIds) {
  /** @type {Map<string, number[][]>} */
  const portsOn = new Map()
  for (const c of connections) {
    if (!c.points?.length) continue
    for (const end of [c.points[0], c.points[c.points.length - 1]]) {
      for (const [id, box] of placed) {
        const onRim =
          (Math.abs(end[1] - box.y) <= 0.5 || Math.abs(end[1] - (box.y + box.h)) <= 0.5) &&
          end[0] >= box.x - 0.5 &&
          end[0] <= box.x + box.w + 0.5
        const onSide =
          (Math.abs(end[0] - box.x) <= 0.5 || Math.abs(end[0] - (box.x + box.w)) <= 0.5) &&
          end[1] >= box.y - 0.5 &&
          end[1] <= box.y + box.h + 0.5
        if (!onRim && !onSide) continue
        const list = portsOn.get(id)
        if (list) list.push(end)
        else portsOn.set(id, [end])
      }
    }
  }
  for (const c of connections) {
    if (c.kind === 'main' || !c.points?.length) continue
    let guilty = false
    for (let i = 0; i < c.points.length - 1 && !guilty; i += 1) {
      for (const [id, box] of placed) {
        if (id === c.from || id === c.to) continue
        if (!segRunsOnBoxEdge(c.points[i], c.points[i + 1], box)) continue
        for (const port of portsOn.get(id) || []) {
          if (segFalseConnectsPortOnBoxEdge(c.points[i], c.points[i + 1], box, port)) {
            guilty = true
            break
          }
        }
        if (guilty) break
      }
    }
    if (!guilty) continue
    const others = connections.filter((o) => o !== c).map((o) => o.points)
    const beforeCross = pathCrossCount(c.points, others)
    let best = /** @type {number[][] | null} */ (null)
    let bestCross = Infinity
    let bestBends = Infinity
    let bestLen = Infinity
    const consider = (pts) => {
      if (!pts || pts.length < 2) return
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [p, q] = [pts[i], pts[i + 1]]
        if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) return
      }
      if (!pathClear(pts, placed, c.from, c.to)) return
      const toBox = placed.get(c.to)
      if (toBox) {
        for (let k = 0; k < pts.length - 1; k += 1) {
          if (segHitsBox(pts[k], pts[k + 1], toBox, 0.5)) return
        }
      }
      // Must not recreate a rim∩port false connection.
      for (let i = 0; i < pts.length - 1; i += 1) {
        for (const [id, box] of placed) {
          if (id === c.from || id === c.to) continue
          if (!segRunsOnBoxEdge(pts[i], pts[i + 1], box)) continue
          for (const port of portsOn.get(id) || []) {
            if (segFalseConnectsPortOnBoxEdge(pts[i], pts[i + 1], box, port)) return
          }
        }
      }
      const cross = pathCrossCount(pts, others)
      if (cross > beforeCross) return
      const bends = pathBendCount(pts)
      const len = pathLength(pts)
      if (
        cross < bestCross ||
        (cross === bestCross && bends < bestBends) ||
        (cross === bestCross && bends === bestBends && len < bestLen)
      ) {
        bestCross = cross
        bestBends = bends
        bestLen = len
        best = pts
      }
    }
    for (const pts of crossingRepairAlts(c, placed, diamonds, spineIds, others)) consider(pts)
    // Nudge the guilty horizontal/vertical rail off the rim.
    if (c.points.length >= 3) {
      for (let i = 0; i < c.points.length - 1; i += 1) {
        const p0 = c.points[i]
        const q0 = c.points[i + 1]
        const isH = Math.abs(p0[1] - q0[1]) < 0.5
        const isV = Math.abs(p0[0] - q0[0]) < 0.5
        if (!isH && !isV) continue
        for (const delta of [-16, 16, -28, 28, -40, 40, -56, 56, -72, 72]) {
          const trial = c.points.map((p) => /** @type {number[]} */ ([p[0], p[1]]))
          if (i === 0) {
            // keep leave port; jog after leave
            if (trial.length < 3) continue
            if (isH) trial[1][1] += delta
            else trial[1][0] += delta
          } else if (i === c.points.length - 2) {
            const toBox = !diamonds.has(c.to) ? placed.get(c.to) : null
            if (isH) {
              trial[i][1] += delta
              const endPt = trial[i + 1]
              if (toBox) {
                if (trial[i][1] < toBox.y) endPt[1] = toBox.y
                else if (trial[i][1] > toBox.y + toBox.h) endPt[1] = toBox.y + toBox.h
              }
              trial.splice(i + 1, 0, [endPt[0], trial[i][1]])
            } else {
              trial[i][0] += delta
              const endPt = trial[i + 1]
              if (toBox) {
                if (trial[i][0] < toBox.x) endPt[0] = toBox.x
                else if (trial[i][0] > toBox.x + toBox.w) endPt[0] = toBox.x + toBox.w
              }
              trial.splice(i + 1, 0, [trial[i][0], endPt[1]])
            }
          } else {
            if (isH) {
              trial[i][1] += delta
              trial[i + 1][1] += delta
            } else {
              trial[i][0] += delta
              trial[i + 1][0] += delta
            }
          }
          consider(trial)
        }
      }
    }
    if (best) c.points = best
  }
}

/**
 * Non-main enters that share a diamond outline port with another incident edge
 * (leave or enter) create false connections — e.g. L4 回并 landing on the same E
 * vertex as 是 after corridor separation. Re-route those enters onto a free outline
 * slot (stagger / free face) with pathClear + no new crossings when possible.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function resolveSharedDiamondEnters(placed, connections, diamonds, spineIds) {
  const keyPt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  for (const id of diamonds) {
    const box = placed.get(id)
    if (!box) continue
    const node = { x: box.x, y: box.y, w: box.w, h: box.h }
    const v = diamondVertices(node)
    /** Nearest tip — tight for tip ports; loose for staggered outline attaches on a side. */
    const nearestFace = (p) => {
      let best = /** @type {'N'|'E'|'S'|'W'} */ ('E')
      let bestD = Infinity
      for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
        const pt = /** @type {[number, number]} */ (v[f])
        const d = Math.hypot(p[0] - pt[0], p[1] - pt[1])
        if (d < bestD) {
          bestD = d
          best = f
        }
      }
      return { face: best, d: bestD }
    }
    const faceOf = (p) => {
      const { face, d } = nearestFace(p)
      return d <= 2.5 ? face : null
    }
    /** Outline attach → cardinal side (staggered E ports still classify as E). */
    const faceOfOutline = (p) => {
      if (!onDiamondOutline(node, p, 2.5) && !onDiamondOutline(node, p, 4)) return null
      return nearestFace(p).face
    }
    /** @type {{ c: object, kind: 'leave'|'enter', pt: number[] }[]} */
    const incidents = []
    for (const c of connections) {
      if (!c.points?.length) continue
      if (c.from === id) incidents.push({ c, kind: 'leave', pt: c.points[0] })
      if (c.to === id) incidents.push({ c, kind: 'enter', pt: c.points[c.points.length - 1] })
    }
    if (incidents.length < 2) continue
    /** @type {Map<string, typeof incidents>} */
    const byPort = new Map()
    for (const inc of incidents) {
      const k = keyPt(inc.pt)
      const list = byPort.get(k)
      if (list) list.push(inc)
      else byPort.set(k, [inc])
    }
    const reserved = new Set()
    for (const inc of incidents) {
      if (inc.c.kind === 'main' || inc.kind === 'leave') reserved.add(keyPt(inc.pt))
    }
    // Trunk faces stay reserved for main enter/leave, and for vertical 2-point
    // same-column links that already occupy the N/S tip.
    const trunk = new Set()
    for (const inc of incidents) {
      const pts = inc.c.points
      const sameColVert =
        pts?.length === 2 &&
        Math.abs(pts[0][0] - pts[1][0]) < 0.5 &&
        Math.abs(pts[0][1] - pts[1][1]) >= 0.5
      if (inc.c.kind !== 'main' && !sameColVert) continue
      const f = faceOfOutline(inc.pt) ?? faceOf(inc.pt)
      if (f === 'N' || f === 'S' || inc.c.kind === 'main') {
        if (f) trunk.add(f)
      }
    }
    // Faces that already host a leave (e.g. 是 on E) — non-main enters must not share them
    // even when staggered to a different outline point (L4 回并 vs 是).
    const leaveFaces = new Set()
    for (const inc of incidents) {
      if (inc.kind !== 'leave') continue
      const f = faceOfOutline(inc.pt) ?? faceOf(inc.pt)
      if (f) leaveFaces.add(f)
    }
    const freeFaces = /** @type {('N'|'E'|'S'|'W')[]} */ (
      ['W', 'E', 'N', 'S'].filter((f) => !trunk.has(f) && !leaveFaces.has(f))
    )
    const fallbackFaces = /** @type {('N'|'E'|'S'|'W')[]} */ (
      ['W', 'E', 'N', 'S'].filter((f) => !trunk.has(f))
    )
    /** Movers: identical port cluster, or non-main enter on a face that already has a leave. */
    /** @type {typeof incidents} */
    const movers = []
    const seen = new Set()
    const addMover = (inc) => {
      if (seen.has(inc)) return
      seen.add(inc)
      movers.push(inc)
    }
    for (const [, group] of byPort) {
      if (group.length < 2) continue
      for (const inc of group) {
        if (inc.kind === 'enter' && inc.c.kind !== 'main') addMover(inc)
      }
    }
    for (const inc of incidents) {
      if (inc.kind !== 'enter' || inc.c.kind === 'main') continue
      const f = faceOfOutline(inc.pt) ?? faceOf(inc.pt)
      // Bidirectional same-row hop (leave A→B + back B→A) may share one side — do not
      // treat the twin leave as a blocked face (01 不合格 E leave + back enter).
      const twinLeaveEdge = incidents.find(
        (o) => o.kind === 'leave' && o.c.from === inc.c.to && o.c.to === inc.c.from,
      )
      const twinLeaveFace = twinLeaveEdge
        ? faceOfOutline(twinLeaveEdge.pt) ?? faceOf(twinLeaveEdge.pt)
        : null
      const leavesOnFace = incidents.filter((o) => {
        if (o.kind !== 'leave') return false
        const lf = faceOfOutline(o.pt) ?? faceOf(o.pt)
        return lf === f
      })
      const onlyTwinLeave =
        !!twinLeaveEdge &&
        leavesOnFace.every(
          (o) => o.c.from === inc.c.to && o.c.to === inc.c.from,
        )
      if (f && leaveFaces.has(f) && !onlyTwinLeave) addMover(inc)
      // Already on a free face can still be wrong: chord-through-diamond or foreign
      // rim graze (L4 回并 W tip with east→west ink / n-17 top ride).
      const pts = inc.c.points
      if (!pts || pts.length < 2) continue
      const prev = pts[pts.length - 2]
      const enter = pts[pts.length - 1]
      const badApproach =
        (f === 'W' && prev[0] >= enter[0] - 0.5) ||
        (f === 'E' && prev[0] <= enter[0] + 0.5) ||
        (f === 'N' && prev[1] >= enter[1] - 0.5) ||
        (f === 'S' && prev[1] <= enter[1] + 0.5)
      let grazeOrChord = false
      for (let i = 0; i < pts.length - 1; i += 1) {
        for (const [oid, r] of placed) {
          if (oid === inc.c.from || oid === inc.c.to) continue
          if (segRunsOnBoxEdge(pts[i], pts[i + 1], r)) grazeOrChord = true
        }
        if (i < pts.length - 2) {
          const p = pts[i]
          const q = pts[i + 1]
          const pad = 0.5
          const minx = Math.min(p[0], q[0])
          const maxx = Math.max(p[0], q[0])
          const miny = Math.min(p[1], q[1])
          const maxy = Math.max(p[1], q[1])
          const crosses =
            maxx >= box.x + pad &&
            minx <= box.x + box.w - pad &&
            maxy >= box.y + pad &&
            miny <= box.y + box.h - pad &&
            ((Math.abs(p[1] - q[1]) < 0.5 &&
              p[1] > box.y + pad &&
              p[1] < box.y + box.h - pad &&
              maxx > box.x + pad &&
              minx < box.x + box.w - pad) ||
              (Math.abs(p[0] - q[0]) < 0.5 &&
                p[0] > box.x + pad &&
                p[0] < box.x + box.w - pad &&
                maxy > box.y + pad &&
                miny < box.y + box.h - pad))
          if (crosses) grazeOrChord = true
        }
      }
      if ((badApproach || grazeOrChord) && !twinLeaveEdge) addMover(inc)
      // Twin back wrongly sent the long way around after a prior W-prefer pass — restore.
      if (
        twinLeaveEdge &&
        (pathBendCount(pts) > 1 || (twinLeaveFace && f !== twinLeaveFace))
      )
        addMover(inc)
      // Four-point priority: slant/outline attach while a cardinal tip is free must re-resolve
      // (S1 NW-slant enter with empty N tip). Tips-full fifth edges stay non-movers only when
      // every tip is already taken — then slant is the legitimate exception (07 leave).
      if (!twinLeaveEdge && !isCardinalDiamondTip(node, enter)) {
        const tipTaken = (face) => {
          const tip = /** @type {[number, number]} */ (v[face])
          return incidents.some(
            (o) =>
              o.c !== inc.c &&
              Math.hypot(o.pt[0] - tip[0], o.pt[1] - tip[1]) <= 2.5,
          )
        }
        const faceTipFree = f ? !tipTaken(f) && !trunk.has(f) : false
        const anyFreeTip = /** @type {const} */ (['N', 'E', 'S', 'W']).some(
          (face) => !tipTaken(face) && !trunk.has(face),
        )
        if (faceTipFree || anyFreeTip) addMover(inc)
      }
    }
    for (const inc of movers) {
      const c = inc.c
      const a = placed.get(c.from)
      if (!a) continue
      const others = connections.filter((o) => o !== c).map((o) => o.points)
      const beforeCross = pathCrossCount(c.points, others)
      const twinLeave = incidents.find(
        (o) =>
          o.kind === 'leave' && o.c.from === c.to && o.c.to === c.from,
      )
      const twinFace = twinLeave
        ? faceOfOutline(twinLeave.pt) ?? faceOf(twinLeave.pt)
        : null
      // Graze/chord / leave-face repairs. Far-west wrap keeps 0 crosses on L4; do not
      // allow a +1 cross bump — multi-backedge fixtures (B10/V10) would share a rim rail.
      const curPts = c.points
      let curingDefect = false
      if (curPts?.length >= 2) {
        const prev0 = curPts[curPts.length - 2]
        const enter0 = curPts[curPts.length - 1]
        const f0 = faceOfOutline(enter0) ?? faceOf(enter0)
        if (
          (f0 === 'W' && prev0[0] >= enter0[0] - 0.5) ||
          (f0 === 'E' && prev0[0] <= enter0[0] + 0.5) ||
          (f0 === 'N' && prev0[1] >= enter0[1] - 0.5) ||
          (f0 === 'S' && prev0[1] <= enter0[1] + 0.5)
        )
          curingDefect = true
        for (let i = 0; i < curPts.length - 1; i += 1) {
          for (const [oid, r] of placed) {
            if (oid === c.from || oid === c.to) continue
            if (segRunsOnBoxEdge(curPts[i], curPts[i + 1], r)) curingDefect = true
          }
        }
      }
      const crossBudget = beforeCross
      let bestPts = /** @type {number[][] | null} */ (null)
      let bestCross = Infinity
      let bestBends = Infinity
      let bestLen = Infinity
      /** @param {number[][] | null | undefined} pts */
      const tryPts = (pts) => {
        if (!pts || pts.length < 2) return
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [p, q] = [pts[i], pts[i + 1]]
          if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) return
        }
        if (!pathClear(pts, placed, c.from, c.to)) return
      const toBox = placed.get(c.to)
      if (toBox) {
        for (let k = 0; k < pts.length - 1; k += 1) {
          if (segHitsBox(pts[k], pts[k + 1], toBox, 0.5)) return
        }
      }
        // Reject rim∩edge rides on foreign boxes (pathClear interior pad misses exact rims).
        for (let i = 0; i < pts.length - 1; i += 1) {
          for (const [oid, r] of placed) {
            if (oid === c.from || oid === c.to) continue
            if (segRunsOnBoxEdge(pts[i], pts[i + 1], r)) return
          }
        }
        const enter = pts[pts.length - 1]
        if (!onDiamondOutline(node, enter)) return
        const enterFace = faceOfOutline(enter) ?? faceOf(enter)
        // Never land on a face that still hosts a leave (false merge with 是),
        // except the twin leave of a bidirectional same-row hop.
        if (enterFace && leaveFaces.has(enterFace) && enterFace !== twinFace) return
        if (enterFace && trunk.has(enterFace)) return
        // Last approach must come from outside the enter face. Otherwise a short
        // horizontal from the east hang chords through the diamond and lands on W
        // tip while ink first hits SE (L4 回并 visual E-enter vs tipFace W).
        const prev = pts[pts.length - 2]
        if (enterFace === 'W' && prev[0] >= enter[0] - 0.5) return
        if (enterFace === 'E' && prev[0] <= enter[0] + 0.5) return
        if (enterFace === 'N' && prev[1] >= enter[1] - 0.5) return
        if (enterFace === 'S' && prev[1] <= enter[1] + 0.5) return
        // Non-final segments must not cut the target diamond (pathClear skips toId).
        // Otherwise bayX can still be reached via a chord across SE→SW before the
        // final outside stub (browser first-outline-hit stays E).
        const diamHit = (p, q) => {
          const pad = 0.5
          const minx = Math.min(p[0], q[0])
          const maxx = Math.max(p[0], q[0])
          const miny = Math.min(p[1], q[1])
          const maxy = Math.max(p[1], q[1])
          if (maxx < box.x + pad || minx > box.x + box.w - pad || maxy < box.y + pad || miny > box.y + box.h - pad)
            return false
          // Ortho segment through bbox: treat as hit if it crosses interior (not merely
          // touching a tip from outside on the final attach — those are last-seg only).
          if (Math.abs(p[1] - q[1]) < 0.5) {
            const y = p[1]
            return y > box.y + pad && y < box.y + box.h - pad && maxx > box.x + pad && minx < box.x + box.w - pad
          }
          if (Math.abs(p[0] - q[0]) < 0.5) {
            const x = p[0]
            return x > box.x + pad && x < box.x + box.w - pad && maxy > box.y + pad && miny < box.y + box.h - pad
          }
          return true
        }
        for (let i = 0; i < pts.length - 2; i += 1) {
          if (diamHit(pts[i], pts[i + 1])) return
        }
        const k = keyPt(enter)
        const twinPort =
          twinLeave && keyPt(twinLeave.pt) === k
        // Twin bidirectional hop may share the leave port; other reserved ports stay blocked.
        if (reserved.has(k) && !twinPort) return
        if (incidents.some((o) => o.c !== c && keyPt(o.pt) === k) && !twinPort) return
        const cross = pathCrossCount(pts, others)
        if (cross > crossBudget) return
        // Refuse alts that create new ≥48 unrelated collinear rails (H1/S3 H-off y=64).
        const beforeAmb = findCollinearAmbiguities(
          connections.map((o) => (o === c ? { ...o, points: c.points } : o)),
        ).unrelatedOverlaps.length
        const afterAmb = findCollinearAmbiguities(
          connections.map((o) => (o === c ? { ...o, points: pts } : o)),
        ).unrelatedOverlaps.length
        if (afterAmb > beforeAmb) return
        const bends = pathBendCount(pts)
        const len = pathLength(pts)
        // Four-point class-first (see betterDiamondEnterCandidate): tip class beats slant
        // at equal cross even with more bends; hard filters above already refuse illegal alts.
        const tipRank = isCardinalDiamondTip(node, enter) ? 0 : 1
        const cand = { cross, tipRank, bends, len }
        const best = bestPts
          ? {
              cross: bestCross,
              tipRank: isCardinalDiamondTip(node, bestPts[bestPts.length - 1]) ? 0 : 1,
              bends: bestBends,
              len: bestLen,
            }
          : null
        if (!best || betterDiamondEnterCandidate(cand, best)) {
          bestCross = cross
          bestBends = bends
          bestLen = len
          bestPts = pts
        }
      }
      // Prefer faces free of trunk + leaves; fall back to non-trunk if needed.
      // Twin bidirectional hop: try the shared leave face first (straight same-row).
      const faces = /** @type {('N'|'E'|'S'|'W')[]} */ (
        [
          ...(twinFace ? [twinFace] : []),
          ...(freeFaces.length ? freeFaces : fallbackFaces.length ? fallbackFaces : ['W', 'E', 'N', 'S']),
        ].filter((f, i, arr) => arr.indexOf(f) === i)
      )
      for (const face of faces) {
        // Exact twin leave port first (0-bend same-row share).
        if (twinFace && face === twinFace && twinLeave?.pt) {
          const port = twinLeave.pt
          const acx0 = a.x + a.w / 2
          const acy0 = a.y + a.h / 2
          const leave0 =
            Math.abs(acx0 - port[0]) >= Math.abs(acy0 - port[1])
              ? /** @type {number[]} */ ([acx0 > port[0] ? a.x : a.x + a.w, acy0])
              : /** @type {number[]} */ ([acx0, acy0 > port[1] ? a.y : a.y + a.h])
          tryPts([leave0, port])
          tryPts([leave0, [leave0[0], port[1]], port])
          tryPts([leave0, [port[0], leave0[1]], port])
        }
        // Tip-first then slant stagger. Free cardinal tips must beat slant ports when clear
        // (S1 N-enter / L4 W-enter). Slants remain for multi-share and tips-full exceptions (07).
        const portCands = diamondSidePortCandidates(node, face, { includeTip: true, staggerSlots: 4 })
        const seenPort = new Set()
        for (const port of portCands) {
          if (!onDiamondOutline(node, port)) continue
          const pk = keyPt(port)
          if (seenPort.has(pk)) continue
          seenPort.add(pk)
          if (reserved.has(pk) && !(twinLeave && keyPt(twinLeave.pt) === pk)) continue
          // Orthogonal approach: last bend at port's outward axis then into port.
          const acx = a.x + a.w / 2
          const acy = a.y + a.h / 2
          const leave =
            Math.abs(acx - port[0]) >= Math.abs(acy - port[1])
              ? /** @type {number[]} */ ([acx > port[0] ? a.x : a.x + a.w, acy])
              : /** @type {number[]} */ ([acx, acy > port[1] ? a.y : a.y + a.h])
          // Hang-lane bay first: approach from outside the free face (avoids chord-through-diamond).
          const bayX =
            face === 'W' || port[0] <= box.x + 1
              ? box.x - 28
              : face === 'E' || port[0] >= box.x + box.w - 1
                ? box.x + box.w + 28
                : leave[0]
          const bayY =
            face === 'N' || port[1] <= box.y + 1
              ? box.y - 28
              : face === 'S' || port[1] >= box.y + box.h - 1
                ? box.y + box.h + 28
                : leave[1]
          tryPts([leave, [bayX, leave[1]], [bayX, port[1]], port])
          tryPts([leave, [leave[0], port[1]], [bayX, port[1]], port])
          tryPts([leave, [leave[0], bayY], [port[0], bayY], port])
          tryPts([leave, [port[0], leave[1]], [port[0], bayY], port])
          // Leave from source top/bottom then west/east bay — avoids riding neighbour rims
          // at the source row (L4 n-17 top when leaveY == plan.y).
          const leaveTop = /** @type {number[]} */ ([acx, a.y])
          const leaveBot = /** @type {number[]} */ ([acx, a.y + a.h])
          tryPts([leaveTop, [bayX, leaveTop[1]], [bayX, port[1]], port])
          tryPts([leaveBot, [bayX, leaveBot[1]], [bayX, port[1]], port])
          tryPts([leaveTop, [leaveTop[0], port[1]], [bayX, port[1]], port])
          // Mid-gap rail between diamond bottom and lower hang neighbours.
          const gapY = box.y + box.h + 28
          tryPts([leave, [leave[0], gapY], [bayX, gapY], [bayX, port[1]], port])
          tryPts([leaveTop, [leaveTop[0], gapY], [bayX, gapY], [bayX, port[1]], port])
          // Far bottom→west wrap: only while curing a non-twin defect. Keeps 0 crosses when
          // mid-gap would cut the 否 trunk (L4). Do not offer on ordinary hops — the wrap
          // rail at the canvas rim creates ≥48 unrelated overlaps (H1/S3 H-off).
          if (curingDefect && !twinFace) {
            let bottomY = a.y + a.h + 40
            for (const [, r] of placed) bottomY = Math.max(bottomY, r.y + r.h + 40)
            const rightX = a.x + a.w + 80
            for (const farBay of [bayX, box.x - 62, box.x - 100, box.x - 140]) {
              tryPts([
                [a.x + a.w, acy],
                [rightX, acy],
                [rightX, bottomY],
                [farBay, bottomY],
                [farBay, port[1]],
                port,
              ])
              tryPts([
                leaveBot,
                [leaveBot[0], bottomY],
                [farBay, bottomY],
                [farBay, port[1]],
                port,
              ])
            }
          }
          // Via mid corner toward port (rejected by tryPts if approach is from inside).
          tryPts([leave, [leave[0], port[1]], port])
          tryPts([leave, [port[0], leave[1]], port])
        }
      }
      // Also consider generic repair alts filtered by free enter port.
      for (const pts of crossingRepairAlts(c, placed, diamonds, spineIds, others)) {
        tryPts(pts)
      }
      if (bestPts) {
        c.points = bestPts
        reserved.add(keyPt(bestPts[bestPts.length - 1]))
        // Refresh incident pt for subsequent movers on this diamond.
        inc.pt = bestPts[bestPts.length - 1]
      }
    }
  }
}


/**
 * issue 190 S2 — joint multi-attach on free diamond outline sides when sibling branch leaves
 * share one vertex (or share a source-stem prefix). Trunk faces (main enter/leave) stay reserved.
 * Per-edge first-point mutation is insufficient: 2-point same-row siblings raise crosses and can
 * rewrite the target endpoint. Instead assign distinct outline ports jointly, rebuild orthogonal
 * routes from each port to a recomputed target enter, and accept only a whole-group improvement
 * (lexico: shared leave anchors → crossings → bends → length).
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function resolveSharedDiamondLeaves(placed, connections, diamonds, spineIds) {
  /** @type {Map<string, object[]>} */
  const byDiamond = new Map()
  // ALL outgoing edges (main/branch/back) — shared leave with trunk or back is the defect.
  for (const c of connections) {
    if (!diamonds.has(c.from) || !c.points?.length) continue
    const list = byDiamond.get(c.from)
    if (list) list.push(c)
    else byDiamond.set(c.from, [c])
  }
  const keyPt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`

  /** Count near-coincident ortho segment pairs (shared rail / ambiguous overlap). */
  const sharedSegCount = (group) => {
    let n = 0
    const segs = (pts) => pts.slice(1).map((q, i) => [pts[i], q])
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        for (const [p, q] of segs(group[i].points)) {
          for (const [r, s] of segs(group[j].points)) {
            const v1 = Math.abs(p[0] - q[0]) < 0.5
            const v2 = Math.abs(r[0] - s[0]) < 0.5
            if (v1 !== v2) continue
            if (v1) {
              if (Math.abs(p[0] - r[0]) > 1) continue
              const a0 = Math.min(p[1], q[1])
              const a1 = Math.max(p[1], q[1])
              const b0 = Math.min(r[1], s[1])
              const b1 = Math.max(r[1], s[1])
              if (Math.min(a1, b1) - Math.max(a0, b0) > 8) n += 1
            } else {
              if (Math.abs(p[1] - r[1]) > 1) continue
              const a0 = Math.min(p[0], q[0])
              const a1 = Math.max(p[0], q[0])
              const b0 = Math.min(r[0], s[0])
              const b1 = Math.max(r[0], s[0])
              if (Math.min(a1, b1) - Math.max(a0, b0) > 8) n += 1
            }
          }
        }
      }
    }
    return n
  }

  /**
   * @typedef {{ shared: number, overlapSegs: number, crosses: number, bends: number, len: number }} S2Score
   * @param {object[]} group
   * @returns {S2Score}
   */
  const scoreGroup = (group) => {
    const ids = new Set(group.map((c) => c.id))
    let shared = 0
    const leave = new Map()
    for (const c of group) {
      const k = keyPt(c.points[0])
      leave.set(k, (leave.get(k) || 0) + 1)
    }
    for (const n of leave.values()) if (n > 1) shared += n - 1
    let crosses = 0
    let bends = 0
    let len = 0
    for (let i = 0; i < group.length; i += 1) {
      const pts = group[i].points
      bends += pathBendCount(pts)
      len += pathLength(pts)
      const others = [
        ...group.filter((_, j) => j !== i).map((c) => c.points),
        // Exclude by connection id — trial clones are not === the live objects in `connections`.
        ...connections.filter((o) => !ids.has(o.id)).map((o) => o.points),
      ]
      crosses += pathCrossCount(pts, others)
    }
    return { shared, overlapSegs: sharedSegCount(group), crosses: crosses / 2, bends, len }
  }

  /** Lexico: shared leave → crossings → co-linear rail overlap → bends → length. */
  /** @param {S2Score} a @param {S2Score} b */
  const better = (a, b) => {
    if (a.shared !== b.shared) return a.shared < b.shared
    if (a.crosses !== b.crosses) return a.crosses < b.crosses
    if (a.overlapSegs !== b.overlapSegs) return a.overlapSegs < b.overlapSegs
    if (a.bends !== b.bends) return a.bends < b.bends
    return a.len + 1e-6 < b.len
  }

  /**
   * Ranked clear orthogonal routes from outline port → target. Never mutates a 2-point path's
   * second vertex in place (that vertex is the target enter).
   * @param {number[]} port
   * @param {object} c
   * @param {number[][][]} [extraOthers] already-accepted sibling trials (joint)
   * @param {Set<string>} [skipIds]
   * @param {number} [limit]
   * @returns {number[][][]}
   */
  const routesFromPort = (port, c, extraOthers = [], skipIds = new Set(), limit = 8) => {
    const b = placed.get(c.to)
    const fromBox = placed.get(c.from)
    if (!b || !fromBox) return []
    const others = [
      ...extraOthers,
      ...connections.filter((o) => o !== c && !skipIds.has(o.id)).map((o) => o.points),
    ]
    /** @type {{ pts: number[][], key: [number, number, number] }[]} */
    const ranked = []
    const seen = new Set()
    for (const gap of [20, 36, 56, 80]) {
      for (const cand of orthoRoutesFromPort(port, b, fromBox, gap)) {
        if (!cand || cand.length < 2) continue
        if (!onDiamondOutline(fromBox, cand[0])) continue
        if (!pathClear(cand, placed, c.from, c.to)) continue
        const sig = cand.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('>')
        if (seen.has(sig)) continue
        seen.add(sig)
        const cross = pathCrossCount(cand, others)
        const bends = pathBendCount(cand)
        const len = pathLength(cand)
        ranked.push({ pts: cand, key: [cross, bends, len] })
      }
    }
    ranked.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2])
    return ranked.slice(0, limit).map((r) => r.pts)
  }

  for (const [id, leaves] of byDiamond) {
    if (leaves.length < 2) continue
    const box = placed.get(id)
    if (!box) continue
    const node = { x: box.x, y: box.y, w: box.w, h: box.h }
    const v = diamondVertices(node)
    const faceOf = (p) => {
      let best = /** @type {'N'|'E'|'S'|'W'|null} */ (null)
      let bestD = Infinity
      for (const f of /** @type {const} */ (['N', 'E', 'S', 'W'])) {
        const pt = /** @type {[number, number]} */ (v[f])
        const d = Math.hypot(p[0] - pt[0], p[1] - pt[1])
        if (d < bestD) {
          bestD = d
          best = f
        }
      }
      return bestD <= 2 ? best : null
    }
    // Main edges and vertical 2-point same-column links reserve N/S (and main any face).
    const trunk = new Set()
    for (const c of connections) {
      if (!c.points?.length) continue
      const pts = c.points
      const sameColVert =
        pts.length === 2 &&
        Math.abs(pts[0][0] - pts[1][0]) < 0.5 &&
        Math.abs(pts[0][1] - pts[1][1]) >= 0.5
      if (c.kind !== 'main' && !sameColVert) continue
      if (c.from === id) {
        const f = faceOf(c.points[0])
        if (f && (c.kind === 'main' || f === 'N' || f === 'S')) trunk.add(f)
      }
      if (c.to === id) {
        const f = faceOf(c.points[c.points.length - 1])
        if (f && (c.kind === 'main' || f === 'N' || f === 'S')) trunk.add(f)
      }
    }
    /** @type {Map<string, object[]>} */
    const byFace = new Map()
    for (const c of leaves) {
      // Never stagger the main leave itself — only branch/back siblings on free faces.
      if (c.kind === 'main') continue
      const f = faceOf(c.points[0])
      if (!f || trunk.has(f)) continue
      const list = byFace.get(f)
      if (list) list.push(c)
      else byFace.set(f, [c])
    }
    for (const [face, group] of byFace) {
      if (group.length < 2) continue
      group.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      const baseline = scoreGroup(group)
      if (baseline.shared === 0) {
        // Still repair: co-linear first-leg direction OR long shared rail after distinct ports.
        const stems = group.filter((c) => c.points.length >= 2)
        const stemKey = (c) => {
          const a = c.points[0]
          const b = c.points[1]
          const dx = Math.sign(b[0] - a[0])
          const dy = Math.sign(b[1] - a[1])
          return `${dx},${dy}`
        }
        const byStem = new Map()
        for (const c of stems) {
          const k = stemKey(c)
          if (!byStem.has(k)) byStem.set(k, [])
          byStem.get(k).push(c)
        }
        const sharedStem = [...byStem.values()].some((g) => g.length > 1)
        if (!sharedStem && (baseline.overlapSegs || 0) === 0) continue
      }

      // Route shorter / same-row first so outer U siblings see them in `extraOthers`.
      const order = [...group].sort(
        (a, b) =>
          (a.points?.length || 0) - (b.points?.length || 0) ||
          String(a.id).localeCompare(String(b.id)),
      )
      const indexOf = new Map(group.map((c, i) => [c, i]))
      const groupIds = new Set(group.map((c) => c.id))
      /** @type {Map<object, number[]>} */
      const portsByConn = new Map()
      let portsOk = true
      for (const c of order) {
        const i = /** @type {number} */ (indexOf.get(c))
        const port = staggerOnDiamondSide(node, /** @type {'E'|'W'|'N'|'S'} */ (face), i, group.length)
        if (!onDiamondOutline(node, port)) {
          portsOk = false
          break
        }
        portsByConn.set(c, port)
      }
      if (!portsOk) continue
      const portKeys = [...portsByConn.values()].map((p) => keyPt(p))
      if (new Set(portKeys).size !== portKeys.length) continue

      // Bounded joint search: try top-K routes per edge (DFS) for shared-first lexico win.
      /** @type {{ map: Map<object, number[][]>, score: { shared: number, crosses: number, bends: number, len: number } }[]} */
      /** @type {{ map: Map<object, number[][]>, score: S2Score }[]} */
      const jointWins = []
      const dfs = (idx, proposed) => {
        if (idx >= order.length) {
          const trialGroup = group.map((c) => ({ ...c, points: proposed.get(c) }))
          const nextScore = scoreGroup(trialGroup)
          if (nextScore.shared > 0) return
          if (!jointWins.length || better(nextScore, jointWins[0].score)) {
            jointWins.unshift({ map: new Map(proposed), score: nextScore })
            if (jointWins.length > 1) jointWins.length = 1
          }
          return
        }
        // Prune only when we already have a clean shared/cross/rail-overlap win.
        if (
          jointWins[0] &&
          jointWins[0].score.shared === 0 &&
          jointWins[0].score.crosses === 0 &&
          jointWins[0].score.overlapSegs === 0
        ) {
          return
        }
        const c = order[idx]
        const port = /** @type {number[]} */ (portsByConn.get(c))
        const cands = routesFromPort(port, c, [...proposed.values()], groupIds, 8)
        for (const route of cands) {
          proposed.set(c, route)
          dfs(idx + 1, proposed)
          proposed.delete(c)
        }
      }
      dfs(0, new Map())
      const win = jointWins[0]
      if (!win || !better(win.score, baseline)) continue

      for (const c of group) {
        c.points = /** @type {number[][]} */ (win.map.get(c))
      }
    }

    // Branch leaves parked on a reserved trunk face (sharing the main enter/leave vertex)
    // cannot steal that face — relocate them onto free sides instead.
    const freeFaces = /** @type {('N'|'E'|'S'|'W')[]} */ (
      ['N', 'E', 'S', 'W'].filter((f) => !trunk.has(f))
    )
    if (freeFaces.length === 0) continue
    /** @type {object[]} */
    const trunkParked = []
    for (const c of leaves) {
      if (c.kind === 'main' || !c.points?.length) continue
      const f = faceOf(c.points[0])
      if (f && trunk.has(f)) trunkParked.push(c)
    }
    if (trunkParked.length === 0) continue
    trunkParked.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    // Occupancy on free faces from leaves already resolved there.
    /** @type {Map<string, object[]>} */
    const freeOcc = new Map(freeFaces.map((f) => [f, []]))
    for (const c of leaves) {
      if (trunkParked.includes(c) || !c.points?.length) continue
      const f = faceOf(c.points[0])
      if (f && freeOcc.has(f)) {
        const occ = freeOcc.get(f)
        if (occ) occ.push(c)
      }
    }
    const groupIds = new Set(trunkParked.map((c) => c.id))
    // Count sharing against the live main leave port (not in trunkParked) as baseline debt.
    const mainLeave = leaves.find((c) => c.kind === 'main')
    const mainKey = mainLeave?.points?.[0] ? keyPt(mainLeave.points[0]) : null
    const baselineParked = scoreGroup(trunkParked)
    if (mainKey) {
      for (const c of trunkParked) {
        if (keyPt(c.points[0]) === mainKey) baselineParked.shared += 1
      }
    }
    // Existing leave anchors (main + free-face branches) — parked ports must not collide.
    const reservedPorts = new Set()
    for (const c of leaves) {
      if (trunkParked.includes(c) || !c.points?.length) continue
      reservedPorts.add(keyPt(c.points[0]))
    }
    // Assign each parked branch onto the least-occupied free face with a fresh outline slot.
    const occCount = new Map(freeFaces.map((f) => [f, (freeOcc.get(f) || []).length]))
    /** @type {{ c: object, face: 'N'|'E'|'S'|'W', port: number[] }[]} */
    const assign = []
    for (const c of trunkParked) {
      const face = /** @type {'N'|'E'|'S'|'W'} */ (
        [...freeFaces].sort(
          (a, b) => (occCount.get(a) || 0) - (occCount.get(b) || 0) || a.localeCompare(b),
        )[0]
      )
      let placedPort = /** @type {number[] | null} */ (null)
      // Free face with no occupants: use the cardinal tip before slant stagger.
      const tip = /** @type {number[]} */ (diamondVertices(node)[face])
      const tipKey = keyPt(tip)
      if (
        (occCount.get(face) || 0) === 0 &&
        !reservedPorts.has(tipKey) &&
        !assign.some((a) => keyPt(a.port) === tipKey)
      ) {
        placedPort = tip
      }
      if (!placedPort) {
        for (let slot = occCount.get(face) || 0; slot < (occCount.get(face) || 0) + 8; slot += 1) {
          const count = Math.max(slot + 1, 2)
          const port = staggerOnDiamondSide(node, face, slot, count)
          if (!onDiamondOutline(node, port)) continue
          const k = keyPt(port)
          if (reservedPorts.has(k)) continue
          if (assign.some((a) => keyPt(a.port) === k)) continue
          placedPort = port
          break
        }
      }
      if (!placedPort) {
        assign.length = 0
        break
      }
      assign.push({ c, face, port: placedPort })
      reservedPorts.add(keyPt(placedPort))
      occCount.set(face, (occCount.get(face) || 0) + 1)
    }
    if (assign.length !== trunkParked.length) continue
    const order = [...assign].sort(
      (a, b) =>
        (a.c.points?.length || 0) - (b.c.points?.length || 0) ||
        String(a.c.id).localeCompare(String(b.c.id)),
    )
    /** @type {{ map: Map<object, number[][]>, score: { shared: number, crosses: number, bends: number, len: number } }[]} */
    /** @type {{ map: Map<object, number[][]>, score: S2Score }[]} */
    const parkedWins = []
    const dfsPark = (idx, proposed) => {
      if (idx >= order.length) {
        const trial = trunkParked.map((c) => ({ ...c, points: proposed.get(c) }))
        const sc = scoreGroup(trial)
        if (sc.shared > 0) return
        if (mainKey && [...proposed.values()].some((pts) => keyPt(pts[0]) === mainKey)) return
        if (!parkedWins.length || better(sc, parkedWins[0].score)) {
          parkedWins.unshift({ map: new Map(proposed), score: sc })
          if (parkedWins.length > 1) parkedWins.length = 1
        }
        return
      }
      if (
        parkedWins[0] &&
        parkedWins[0].score.shared === 0 &&
        parkedWins[0].score.crosses === 0 &&
        parkedWins[0].score.overlapSegs === 0
      ) {
        return
      }
      const { c, port } = order[idx]
      const cands = routesFromPort(port, c, [...proposed.values()], groupIds, 8)
      for (const route of cands) {
        proposed.set(c, route)
        dfsPark(idx + 1, proposed)
        proposed.delete(c)
      }
    }
    dfsPark(0, new Map())
    // Accept any shared-clear relocation off the trunk face (ownership > tiny bend/len delta).
    const parkedWin = parkedWins[0]
    if (
      parkedWin &&
      (better(parkedWin.score, baselineParked) ||
        (baselineParked.shared > 0 && parkedWin.score.shared === 0))
    ) {
      for (const c of trunkParked) {
        c.points = /** @type {number[][]} */ (parkedWin.map.get(c))
      }
    }
  }
  void spineIds
}

/**
 * Stagger leave points along a rect face. index/count are 0-based among siblings.
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {'N'|'E'|'S'|'W'} face
 * @param {number} index
 * @param {number} count
 * @returns {number[]}
 */
function staggerOnRectSide(box, face, index, count) {
  if (count <= 1) {
    if (face === 'E') return [box.x + box.w, box.y + box.h / 2]
    if (face === 'W') return [box.x, box.y + box.h / 2]
    if (face === 'N') return [box.x + box.w / 2, box.y]
    return [box.x + box.w / 2, box.y + box.h]
  }
  const pad = 10
  if (face === 'N' || face === 'S') {
    const y = face === 'N' ? box.y : box.y + box.h
    const span = Math.max(0, box.w - 2 * pad)
    const x = box.x + pad + ((index + 0.5) / count) * span
    return [x, y]
  }
  const x = face === 'W' ? box.x : box.x + box.w
  const span = Math.max(0, box.h - 2 * pad)
  const y = box.y + pad + ((index + 0.5) / count) * span
  return [x, y]
}

/**
 * Non-decision multi-leave: stages packing / face-centre restore can collapse two branch
 * outs onto one rect face centre (B02 V-on n-8; B09 V-off n-11). Stagger along that face
 * and rebuild from the new ports without raising hits/crosses.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Set<string>} diamonds
 * @param {Set<string>} spineIds
 */
function resolveSharedRectLeaves(placed, connections, diamonds, spineIds) {
  /** @type {Map<string, object[]>} */
  const byRect = new Map()
  for (const c of connections) {
    if (diamonds.has(c.from) || !c.points?.length) continue
    // Main trunk keep face centres; only branch/back multi-outs need distinct ports.
    if (c.kind === 'main') continue
    const list = byRect.get(c.from)
    if (list) list.push(c)
    else byRect.set(c.from, [c])
  }
  const keyPt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  const faceOf = (box, p) => {
    const tol = 1.5
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    if (Math.abs(p[0] - box.x) <= tol && p[1] >= box.y - tol && p[1] <= box.y + box.h + tol) return 'W'
    if (
      Math.abs(p[0] - (box.x + box.w)) <= tol &&
      p[1] >= box.y - tol &&
      p[1] <= box.y + box.h + tol
    ) {
      return 'E'
    }
    if (Math.abs(p[1] - box.y) <= tol && p[0] >= box.x - tol && p[0] <= box.x + box.w + tol) return 'N'
    if (
      Math.abs(p[1] - (box.y + box.h)) <= tol &&
      p[0] >= box.x - tol &&
      p[0] <= box.x + box.w + tol
    ) {
      return 'S'
    }
    // Near face-centre fallback (sharedPorts report uses centres).
    if (Math.abs(p[0] - box.x) < tol && Math.abs(p[1] - cy) < 2) return 'W'
    if (Math.abs(p[0] - (box.x + box.w)) < tol && Math.abs(p[1] - cy) < 2) return 'E'
    if (Math.abs(p[1] - box.y) < tol && Math.abs(p[0] - cx) < 2) return 'N'
    if (Math.abs(p[1] - (box.y + box.h)) < tol && Math.abs(p[0] - cx) < 2) return 'S'
    return null
  }

  for (const [id, leaves] of byRect) {
    if (leaves.length < 2) continue
    const box = placed.get(id)
    if (!box) continue
    /** @type {Map<string, object[]>} */
    const byKey = new Map()
    for (const c of leaves) {
      const k = keyPt(c.points[0])
      const list = byKey.get(k)
      if (list) list.push(c)
      else byKey.set(k, [c])
    }
    for (const group of byKey.values()) {
      if (group.length < 2) continue
      const hasStraight = group.some((c) => c.points.length === 2 && pathBendCount(c.points) === 0)
      const hasBent = group.some((c) => c.points.length > 2 || pathBendCount(c.points) > 0)
      if (hasStraight && hasBent) continue
      const face = faceOf(box, group[0].points[0])
      if (!face) continue
      group.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      const beforeShared = group.length
      const beforeCross = group.reduce(
        (n, c) =>
          n +
          pathCrossCount(
            c.points,
            connections.filter((o) => o !== c).map((o) => o.points),
          ),
        0,
      )
      /** @type {Map<object, number[][]>} */
      const best = new Map()
      let bestCross = beforeCross
      let bestBends = Infinity
      let bestLen = Infinity
      // Try stagger orderings: natural + reversed.
      const orders = [group, [...group].reverse()]
      for (const order of orders) {
        /** @type {Map<object, number[][]>} */
        const proposed = new Map()
        let ok = true
        for (let i = 0; i < order.length; i += 1) {
          const c = order[i]
          const port = staggerOnRectSide(box, face, i, order.length)
          const toBox = placed.get(c.to)
          if (!toBox) {
            ok = false
            break
          }
          const others = [
            ...connections.filter((o) => o !== c && !order.includes(o)).map((o) => o.points),
            ...[...proposed.values()],
          ]
          let chosen = null
          let chosenKey = /** @type {[number, number, number]} */ ([Infinity, Infinity, Infinity])
          for (const gap of [20, 36, 56, 80]) {
            for (const cand of orthoRoutesFromPort(port, toBox, box, gap)) {
              if (!cand || cand.length < 2) continue
              if (!pathClear(cand, placed, c.from, c.to)) continue
              if (diamonds.has(c.to) && !onDiamondOutline(toBox, cand[cand.length - 1])) continue
              const cross = pathCrossCount(cand, others)
              const key = /** @type {[number, number, number]} */ ([
                cross,
                pathBendCount(cand),
                pathLength(cand),
              ])
              if (
                key[0] < chosenKey[0] ||
                (key[0] === chosenKey[0] && key[1] < chosenKey[1]) ||
                (key[0] === chosenKey[0] && key[1] === chosenKey[1] && key[2] + 1e-6 < chosenKey[2])
              ) {
                chosenKey = key
                chosen = cand
              }
            }
          }
          if (!chosen) {
            ok = false
            break
          }
          proposed.set(c, chosen)
        }
        if (!ok || proposed.size !== order.length) continue
        // Distinct ports required.
        const ports = [...proposed.values()].map((pts) => keyPt(pts[0]))
        if (new Set(ports).size !== ports.length) continue
        const cross = order.reduce(
          (n, c) =>
            n +
            pathCrossCount(
              /** @type {number[][]} */ (proposed.get(c)),
              [
                ...connections.filter((o) => o !== c && !order.includes(o)).map((o) => o.points),
                ...order.filter((o) => o !== c).map((o) => /** @type {number[][]} */ (proposed.get(o))),
              ],
            ),
          0,
        )
        if (cross > beforeCross) continue
        const bends = order.reduce(
          (n, c) => n + pathBendCount(/** @type {number[][]} */ (proposed.get(c))),
          0,
        )
        const len = order.reduce(
          (n, c) => n + pathLength(/** @type {number[][]} */ (proposed.get(c))),
          0,
        )
        if (
          cross < bestCross ||
          (cross === bestCross && bends < bestBends) ||
          (cross === bestCross && bends === bestBends && len < bestLen)
        ) {
          bestCross = cross
          bestBends = bends
          bestLen = len
          best.clear()
          for (const [c, pts] of proposed) best.set(c, pts)
        }
      }
      if (best.size === group.length) {
        for (const c of group) c.points = /** @type {number[][]} */ (best.get(c))
      } else {
        void beforeShared
        void spineIds
      }
    }
  }
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} [fromDiamond]
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} [placed]
 * @param {string | null | undefined} [fromId]
 * @param {string | null | undefined} [toId]
 * @param {Set<string> | null | undefined} [spineIds]
 * @param {number[][][] | null | undefined} [others]
 * @returns {number[][] | null}
 */
function routeCentered(a, b, fromDiamond = false, placed = null, fromId = null, toId = null, spineIds = null, others = null) {
  if (sameRowLink(a, b)) {
    return (
      clearSideHorizontal(a, b, placed, fromId, toId) ||
      acceptClear(sideHorizontal(a, b), placed, fromId, toId)
    )
  }
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcx = b.x + b.w / 2
  const bcy = b.y + b.h / 2
  const blocked = columnBlocked(a, b, placed, fromId, toId)
  const fromSpine = Boolean(spineIds && fromId && spineIds.has(fromId))
  const toSpine = Boolean(spineIds && toId && spineIds.has(toId))
  /** @type {Array<number[][] | null | undefined>} */
  const candidates = []

  // Same column: straight vertical when clear; otherwise side channel.
  if (Math.abs(acx - bcx) < 0.5) {
    if (!blocked) {
      const down = bcy >= acy
      candidates.push([
        [acx, down ? a.y + a.h : a.y],
        [bcx, down ? b.y : b.y + b.h],
      ])
    }
    candidates.push(clearSideChannel(a, b, acx > 40, placed, fromId, toId))
    const hit = firstClearPath(candidates, placed, fromId, toId, others)
    if (hit) return hit
    return (
      clearSideChannel(a, b, acx > 40, placed, fromId, toId) ||
      acceptClear(
        candidates.find((p) => p && p.length >= 2 && pathClear(p, placed, fromId, toId)) || null,
        placed,
        fromId,
        toId,
      ) ||
      acceptClear(sideHorizontal(a, b), placed, fromId, toId)
    )
  }
  // Hang → spine
  if (!fromSpine && toSpine) {
    return routeHangToSpine(a, b, acx > bcx, placed, fromId, toId, fromDiamond, others)
  }
  // Spine → hang (not same-row): reverse of hang→spine when far / blocked.
  if (fromSpine && !toSpine && !sameRowLink(a, b)) {
    const hangOnRight = bcx > acx
    const hang = b
    const spine = a
    const hcy = hang.y + hang.h / 2
    const scy = spine.y + spine.h / 2
    const leaveY = scy >= hcy ? hang.y + hang.h : hang.y
    if (Math.abs(scy - hcy) >= DISTANT_DY || hangLaneBlocked(hang, leaveY, scy, placed, toId, fromId)) {
      const fwd =
        routeHangToSpine(hang, spine, hangOnRight, placed, toId, fromId, false, others, {
          allowWrap: false,
        }) ||
        routeHangToSpine(hang, spine, hangOnRight, placed, toId, fromId, false, others, {
          allowWrap: true,
        })
      return fwd?.length ? fwd.slice().reverse() : null
    }
  }
  // Source above target
  if (a.y + a.h <= b.y + 0.5) {
    if (!blocked) {
      const mid = (a.y + a.h + b.y) / 2
      candidates.push([
        [acx, a.y + a.h],
        [acx, mid],
        [bcx, mid],
        [bcx, b.y],
      ])
    }
    candidates.push(clearSideChannel(a, b, acx > bcx, placed, fromId, toId))
    const hit = firstClearPath(candidates, placed, fromId, toId, others)
    if (hit) return hit
  }
  // Spine source below a hang target (near)
  if (fromSpine && !toSpine && b.y + b.h <= a.y + 0.5) {
    const toRight = bcx > acx
    candidates.push([
      [toRight ? a.x + a.w : a.x, acy],
      [bcx, acy],
      [bcx, b.y + b.h],
    ])
  }
  // Source below target
  if (b.y + b.h <= a.y + 0.5) {
    // Diamond leaving to an off-column target below: prefer 1-bend from the side tip
    // before a 2-bend that leaves the N tip (keeps N reserved for same-column trunk).
    if (fromDiamond && Math.abs(acx - bcx) >= 0.5) {
      candidates.push([
        [acx > bcx ? a.x : a.x + a.w, acy],
        [bcx, acy],
        [bcx, b.y + b.h],
      ])
    }
    if (!blocked) {
      const mid = (b.y + b.h + a.y) / 2
      candidates.push([
        [acx, a.y],
        [acx, mid],
        [bcx, mid],
        [bcx, b.y + b.h],
      ])
    }
    candidates.push(clearSideChannel(a, b, acx > bcx, placed, fromId, toId))
    // Also try hang→spine style outer when leaving a hang column upward through siblings.
    candidates.push(routeHangToSpine(a, b, acx > bcx, placed, fromId, toId, fromDiamond, others))
    const hit = firstClearPath(candidates, placed, fromId, toId, others)
    if (hit) return hit
  }
  // Side-by-side but not same-row
  {
    const aRight = acx <= bcx
    const ax = aRight ? a.x + a.w : a.x
    const bx = aRight ? b.x : b.x + b.w
    const mid = (ax + bx) / 2
    candidates.push([
      [ax, acy],
      [mid, acy],
      [mid, bcy],
      [bx, bcy],
    ])
    candidates.push(clearSideChannel(a, b, !aRight, placed, fromId, toId))
  }
  const clear = firstClearPath(candidates, placed, fromId, toId, others)
  if (clear) return clear
  // Exhausted: only accept a pathClear side channel — never an unchecked mid-column cut.
  const side = clearSideChannel(a, b, acx > bcx, placed, fromId, toId, 64)
  if (side) return side
  const anyClear = candidates.find((p) => p && p.length >= 2 && pathClear(p, placed, fromId, toId))
  if (anyClear) return anyClear
  // Last resort: sideHorizontal only if clear when placed is known; else null → routeExhausted.
  return acceptClear(sideHorizontal(a, b), placed, fromId, toId)
}

function fallbackRoute(a, b) {
  if (!a || !b) return [
    [0, 0],
    [0, 0],
  ]
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

/**
 * Shift interior corridor segments that cross a stage band's corner title text onto
 * a box-clear lane inside the stage perimeter (typically the margin left of the title)
 * without introducing crossings, collinear overlaps, or border rides.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {object[]} connections
 * @param {Array<{ stageId?: string, label?: string, x: number, y: number, w: number, h: number }>} stageBoxes
 * @param {Set<string>} [diamonds]
 * @param {boolean} [vertical]
 */
export function clearStageTitleStrokes(placed, connections, stageBoxes, diamonds = new Set(), vertical = true) {
  void vertical
  const visible = (stageBoxes || []).filter((b) => b.stageId !== '__implicit__')
  if (!visible.length || !connections?.length) return
  // StageBoxNode renders Scheme C bookmarks flush in the top-left corner regardless of orientation.
  const titleRects = visible.map((b) => {
    const tb = bookmarkBoxOf(b, b.label ?? '')
    return {
      raw: tb,
      pad: { x: tb.x - 4, y: tb.y - 2, w: tb.w + 8, h: tb.h + 4 },
    }
  })
  const hitTitlesOf = (pts) => {
    const hits = new Set()
    for (let i = 0; i < pts.length - 1; i += 1) {
      for (const tr of titleRects) {
        if (segHitsBox(pts[i], pts[i + 1], tr.pad, 0)) hits.add(tr)
      }
    }
    return [...hits]
  }
  const parallelGapOk = (candPts, segIdx, horiz, otherPts) => {
    const [p, q] = [candPts[segIdx], candPts[segIdx + 1]]
    const pMin = horiz ? Math.min(p[0], q[0]) : Math.min(p[1], q[1])
    const pMax = horiz ? Math.max(p[0], q[0]) : Math.max(p[1], q[1])
    const pTrans = horiz ? p[1] : p[0]
    for (const o of otherPts) {
      if (!o?.length) continue
      for (let j = 0; j < o.length - 1; j += 1) {
        const [r, s] = [o[j], o[j + 1]]
        const sameAxis = horiz ? Math.abs(r[1] - s[1]) < 0.5 : Math.abs(r[0] - s[0]) < 0.5
        if (!sameAxis) continue
        const oMin = horiz ? Math.min(r[0], s[0]) : Math.min(r[1], s[1])
        const oMax = horiz ? Math.max(r[0], s[0]) : Math.max(r[1], s[1])
        if (Math.min(pMax, oMax) - Math.max(pMin, oMin) <= 0.5) continue
        const oTrans = horiz ? r[1] : r[0]
        if (Math.abs(pTrans - oTrans) < 6) return false
      }
    }
    return true
  }
  const stageMinX = Math.min(...visible.map((b) => b.x))
  const stageMaxX = Math.max(...visible.map((b) => b.x + b.w))
  const stageMinY = Math.min(...visible.map((b) => b.y))
  const stageMaxY = Math.max(...visible.map((b) => b.y + b.h))

  for (const c of connections) {
    if (!c.points || c.points.length < 4) continue
    if (!hitTitlesOf(c.points).length) continue
    const otherPts = connections.filter((o) => o !== c).map((o) => o.points)
    const aBox = placed.get(c.from)
    const bBox = placed.get(c.to)
    const fromD = diamonds.has(c.from)
    const toD = diamonds.has(c.to)

    for (let i = 1; i <= c.points.length - 3; i += 1) {
      const pts = c.points
      const p = pts[i]
      const q = pts[i + 1]
      const vert = Math.abs(p[0] - q[0]) < 0.5
      const horiz = Math.abs(p[1] - q[1]) < 0.5
      if (!vert && !horiz) continue
      const segHits = titleRects.filter((tr) => segHitsBox(p, q, tr.pad, 0))
      if (!segHits.length) continue

      const curHits = hitTitlesOf(pts).length
      const baseCross = pathCrossCount(pts, otherPts)
      const baseColl = pathCollinearOverlapCount(pts, otherPts)
      const coord = horiz ? 1 : 0
      const candidates = horiz
        ? (() => {
            const minTop = Math.min(...segHits.map((tr) => tr.raw.y))
            const maxBot = Math.max(...segHits.map((tr) => tr.raw.y + tr.raw.h))
            return [maxBot + 6, maxBot + 10, minTop - 4].filter(
              (y) => y >= stageMinY + 6 && y <= stageMaxY - 6,
            )
          })()
        : (() => {
            const maxRight = Math.max(...segHits.map((tr) => tr.raw.x + tr.raw.w))
            return [
              ...[stageMinX - 14, stageMinX - 18].filter((x) => x >= 14),
              maxRight + 10,
              maxRight + 14,
              maxRight + 18,
            ].filter((x) => x >= 14 && x <= stageMaxX - 6)
          })()

      let bestPts = null
      let bestHits = curHits
      for (const candVal of candidates) {
        const trial = pts.map((pt) => [...pt])
        trial[i][coord] = candVal
        trial[i + 1][coord] = candVal
        if (Math.abs(candVal - trial[i - 1][coord]) < 0.5 || Math.abs(candVal - trial[i + 2][coord]) < 0.5) continue
        if (aBox && !fromD && segRunsOnBoxEdge(trial[0], trial[1], aBox)) continue
        if (bBox && !toD && segRunsOnBoxEdge(trial[trial.length - 2], trial[trial.length - 1], bBox)) continue
        if (!pathClear(trial, placed, c.from, c.to)) continue
        if (pathCrossCount(trial, otherPts) > baseCross) continue
        if (pathCollinearOverlapCount(trial, otherPts) > baseColl) continue
        if (!parallelGapOk(trial, i, horiz, otherPts)) continue
        const hitsAfter = hitTitlesOf(trial).length
        if (hitsAfter < bestHits) {
          bestHits = hitsAfter
          bestPts = trial
          if (hitsAfter === 0) break
        }
      }
      if (bestPts) c.points = bestPts
    }
  }
}
