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
//    6. set stage boxes side by side; route cross-stage links with router.js;
//    7. light polish, then re-pin the spine axis (polish must not leave the trunk bent).
//
//  Does not cut branches (unlike route). Does not call ELK on the main path.
//  Enabled with fields.engine === 'mainline' (About-panel switch + preset; not a schema field).
//  Stages only fold the spine into columns; with no usable stage data the caller passes one
//  implicit stage (`__implicit__`) so the whole graph is a single straight trunk.
// ============================================================

import { straighten } from './straighten.js'
import { edgesOf } from './router.js'
import { ownPart } from './merge.js'
import { polishLinks, linkRouting, placeLabel } from './polish.js'
import { titleBoxOf, toReal } from './columns.js'
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
  orthoRoutesFromPort,
} from './diamondPorts.js'

/** Gap between the spine column and the first branch lane (room for a condition label on the hop) */
const LANE_GAP = 112
/** Extra room between two branch lanes */
const LANE_SEP = 28
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
 * @returns {{ placed: Map, stageBoxes: object[], connections: object[], size: {width:number,height:number}, frame: object, spineIds?: string[] }}
 */
export function layoutMainline(args) {
  return finishMainline(layoutMainlineGen(args))
}

/**
 * Mainline-first column layout as a generator (yields between heavy routing steps).
 * @returns {Generator<void, { placed: Map, stageBoxes: object[], connections: object[], size: {width:number,height:number}, frame: object, spineIds?: string[] }, unknown>}
 */
export function* layoutMainlineGen({ nodes, groups, stages, labelBox, vertical, spine, spines, fields }) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const PAD_A0 = vertical ? STAGE_PAD_TOP : STAGE_PAD
  const PAD_C0 = vertical ? STAGE_PAD : STAGE_PAD_TOP
  const diamonds = new Set(nodes.filter((n) => n.kind === 'decision').map((n) => n.id))
  const frameSize = (n) => {
    const { w, h } = sizeOf(n)
    return vertical ? { w, h } : { w: h, h: w }
  }
  const frameLabel = (text) => {
    const b = labelBox(text)
    return vertical ? b : { width: b.height, height: b.width }
  }

  const spineList = spine ?? []
  /** All component spines (primary first). Falls back to a single list when older callers omit it. */
  const spinesList = Array.isArray(spines) && spines.length ? spines : spineList.length ? [spineList] : []
  const spineAt = new Map(spineList.map((id, i) => [id, i]))
  // Secondary component spines get their own index maps so hang [leave, rejoin] works per trunk.
  const spineAtAll = new Map()
  for (const path of spinesList) {
    path.forEach((id, i) => {
      if (!spineAtAll.has(id)) spineAtAll.set(id, i)
    })
  }
  const outG = new Map(nodes.map((n) => [n.id, []]))
  for (const g of groups) outG.get(g.from)?.push(g)

  /** @type {Array<{ st: object, ids: Set<string>, spineIds: string[], spineAxes?: string[][], placed: Map, connections: object[], width: number, height: number }>} */
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
      diamonds,
      branchSign,
      byId,
      forceHangSide: fields?.mainlineHangSide ?? null,
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
  // Polish may shove trunk nodes aside to clear a branch: put each trunk axis back
  // independently (multi-component spines must not share one averaged axis), then
  // re-separate columns if polish dragged whole trunks together.
  for (const axes of spineAxesByStage.values()) {
    for (const ids of axes) pinSpineAxis(placed, ids, connections)
    separateSpineAxes(placed, axes, connections)
    pushBranchesOffSpine(placed, axes.flat(), connections)
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
  settleGeometryPasses(placed, connections, diamonds, allSpine)
  restoreInputMainStraight(placed, connections, allSpine)
  // Routes moved after the per-stage label pass: drop stale spots and place again.
  ensureConnectionLabels(connections, [...placed.values()], titles, borders, { force: true, preferOnLine: true })
  yield

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
  return { frame, ...toReal(frame, vertical), spineIds: [...allSpine] }
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
  diamonds,
  branchSign,
  byId,
  forceHangSide = null,
}) {
  const placed = new Map()
  const drawn = new Set()

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

  let y = 0
  let spineW = 0
  for (const id of spineHere) {
    const { w, h } = frameSize(byId.get(id))
    placed.set(id, { x: 0, y, w, h })
    drawn.add(id)
    spineW = Math.max(spineW, w)
    y += h + LAYER_GAP
  }
  // Centre spine boxes on a shared axis
  for (const id of spineHere) {
    const r = placed.get(id)
    placed.set(id, { ...r, x: (spineW - r.w) / 2 })
  }
  const spineH = y > 0 ? y - LAYER_GAP : 0

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
      let ey = 0
      let colW = 0
      for (const id of path) {
        if (drawn.has(id)) continue
        const { w, h } = frameSize(byId.get(id))
        colW = Math.max(colW, w)
        placed.set(id, { x: colX, y: ey, w, h })
        drawn.add(id)
        extraSpineIds.push(id)
        if (!spineAt.has(id)) spineAt.set(id, path.indexOf(id))
        ey += h + LAYER_GAP
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
          hangs.push({ from: cur, rootOnSpine: false, leave: o, boxes: [], rejoin: null, parent: true })
        }
        cur = next.to
      }
      hangs.push({ from: u, rootOnSpine: true, leave: g, boxes, rejoin, parent: false })
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

  const regionOverlaps = (p, q) => !(p.b < q.a || q.b < p.a)
  const regionContains = (outer, inner) =>
    outer.a <= inner.a && outer.b >= inner.b && (outer.a < inner.a || outer.b > inner.b)

  const isLoopHang = (h) => {
    const to = h.leave?.to
    if (!to) return false
    return (outG.get(to) ?? []).some((e) => e.isBack && e.to === h.from)
  }
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

  // Pack lanes per side: shorter / contained intervals claim inner lanes first.
  // Child hangs are packed with their parent (same column), not as extra competing regions.
  /** @type {Map<object, number>} */
  const laneOf = new Map()
  /** @type {Map<number, number[]>} sign → lane end spine-index */
  const laneEndsBySign = new Map([
    [1, []],
    [-1, []],
  ])
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
    const ends = /** @type {number[]} */ (laneEndsBySign.get(sign))
    let lane = 0
    while (ends[lane] !== undefined && ends[lane] > it.a) lane += 1
    ends[lane] = Math.max(ends[lane] ?? it.b, it.b)
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
    if (byId.get(it.h.from)?.kind !== 'decision') return false
    const id = it.h.boxes[0]
    if (byId.get(id)?.kind !== 'end') return false
    // Shared terminus already owned by the parent hang chain stays in-lane.
    return !intervals.some((o) => o.h.rootOnSpine && o.h.boxes.includes(id))
  }
  let sideEndInner = 0
  for (const it of intervals) {
    if (!isSideEndHang(it)) continue
    const need = frameSize(byId.get(it.h.boxes[0])).w + LANE_SEP
    const sign = /** @type {number} */ (signOf.get(it.h))
    // Absolute-right of the diamond: left hang → into the spine gutter (widen hopGap).
    // Right hang → past the lane (final bbox grows from the placed end).
    if (sign < 0) sideEndInner = Math.max(sideEndInner, need)
  }

  // Room on the leave hop for a condition label sitting ON the segment (not beside it).
  let hopGap = LANE_GAP
  for (const it of intervals) {
    const leave = it.h.leave
    if (!leave?.label || !it.h.rootOnSpine) continue
    const need = Math.min(120, textEm(leave.label) * 12 + 12) + 24
    hopGap = Math.max(hopGap, need)
  }
  if (sideEndInner) hopGap = Math.max(hopGap, sideEndInner + 24)

  const spineX0 = leftW ? leftW + hopGap : 0
  for (const id of spineHere) {
    const r = placed.get(id)
    placed.set(id, { ...r, x: spineX0 + (spineW - r.w) / 2 })
  }

  // Decision branches sit on the fork's row (centres aligned → 0-bend side link).
  // Lane keys are scoped by side so opposite-face siblings do not stack on one cursor.
  //
  // Place spine-rooted hangs before child hangs. Hang discovery records a sibling leave as a
  // child hang *before* the parent hang object, so a naive intervals walk drew the child first
  // while `from` (a box still inside the parent) was unplaced → `by = 0` parked branch-exit
  // ends at the canvas top and forced cross-spine routes (L1 litigation / issue 190).
  /** @type {Map<string, number>} */
  const laneCursorY = new Map()
  const laneKey = (sign, lane) => `${sign}:${lane}`
  const laneOffset = (sign, lane) => {
    const widths = /** @type {number[]} */ (laneWBySign.get(sign))
    let acc = 0
    for (let i = 0; i < lane; i += 1) acc += (widths[i] ?? 0) + LANE_SEP
    return acc
  }
  /** Input main:true pairs (incl. hang→spine rejoins that are not spineNext). */
  const inputMainAt = new Set(groups.filter((g) => g.inputMain).map((g) => `${g.from}|${g.to}`))
  const placeHang = (it) => {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const lane = /** @type {number} */ (laneOf.get(it.h))
    const widths = /** @type {number[]} */ (laneWBySign.get(sign))
    const leave = placed.get(it.h.from)
    const fork = byId.get(it.h.from)
    // Sibling end off a hang decision: same row, prefer absolute-right of the diamond (0-bend).
    // If that slot overlaps an already-placed box (e.g. left-hang end crossing into a right hang),
    // nudge further right, then fall back to outward (away from spine) until clear.
    if (isSideEndHang(it) && leave) {
      const id = it.h.boxes[0]
      if (drawn.has(id)) return
      const { w, h } = frameSize(byId.get(id))
      const y = leave.y + leave.h / 2 - h / 2
      const overlaps = (x0) => {
        for (const [oid, r] of placed) {
          if (oid === id) continue
          if (x0 + 0.5 < r.x + r.w && r.x + 0.5 < x0 + w && y + 0.5 < r.y + r.h && r.y + 0.5 < y + h) return true
        }
        return false
      }
      // Prefer the free same-row slot nearest the diamond. Interleave right/left. Never jump
      // past a foreign same-row box to the far side — that packs an end beyond another hang
      // column and forces rejoins to cross leave edges (L4 n-16 past n-10).
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
      let x = leave.x + leave.w + LANE_SEP
      let found = false
      for (let i = 0; i < 12; i += 1) {
        const right = leave.x + leave.w + LANE_SEP + i * (w + LANE_SEP)
        const left = leave.x - LANE_SEP - w - i * (w + LANE_SEP)
        if (!overlaps(right) && !jumpsPastForeign(right)) {
          x = right
          found = true
          break
        }
        if (!overlaps(left) && !jumpsPastForeign(left)) {
          x = left
          found = true
          break
        }
      }
      if (!found) {
        // No same-row gap without jumping a foreign hang: stack below the fork, preferring the
        // inward (spine-facing) column so the outer rejoin corridor stays open.
        let yStack = leave.y + leave.h + LAYER_GAP
        const inward = sign > 0 ? leave.x - LANE_SEP - w : leave.x + leave.w + LANE_SEP
        const under = leave.x + (leave.w - w) / 2
        const overlapsAt = (x0, y0) => {
          for (const [oid, r] of placed) {
            if (oid === id) continue
            if (x0 + 0.5 < r.x + r.w && r.x + 0.5 < x0 + w && y0 + 0.5 < r.y + r.h && r.y + 0.5 < y0 + h)
              return true
          }
          return false
        }
        x = inward
        if (overlapsAt(x, yStack)) x = under
        for (let i = 0; i < 12 && overlapsAt(x, yStack); i += 1) yStack += h + LAYER_GAP
        placed.set(id, { x, y: yStack, w, h })
        drawn.add(id)
        return
      }
      placed.set(id, { x, y, w, h })
      drawn.add(id)
      return
    }
    const sameRow = Boolean(it.h.rootOnSpine && fork?.kind === 'decision' && leave && it.h.boxes.length)
    const key = laneKey(sign, lane)
    const lx =
      sign < 0
        ? spineX0 - hopGap - laneOffset(sign, lane) - (widths[lane] ?? 0)
        : spineX0 + spineW + hopGap + laneOffset(sign, lane)
    // Hang→spine rejoin marked main:true in input must stay 0-bend. Align the last hang box
    // with the rejoin spine node (same row) so the rejoin is a side-horizontal; unmarked leave
    // from the fork may bend ≤1. Fork same-row is the default only when the rejoin is not input-main.
    const lastHangId = it.h.boxes.length ? it.h.boxes[it.h.boxes.length - 1] : null
    const rejoinBox = it.h.rejoin ? placed.get(it.h.rejoin) : null
    const preferRejoinRow = Boolean(
      lastHangId &&
        rejoinBox &&
        inputMainAt.has(`${lastHangId}|${it.h.rejoin}`),
    )
    if (preferRejoinRow) {
      const sizes = it.h.boxes.map((id) => frameSize(byId.get(id)))
      const last = sizes[sizes.length - 1]
      const ys = new Array(it.h.boxes.length)
      ys[ys.length - 1] = rejoinBox.y + rejoinBox.h / 2 - last.h / 2
      for (let i = ys.length - 2; i >= 0; i -= 1) {
        ys[i] = ys[i + 1] - LAYER_GAP - sizes[i].h
      }
      // Keep clear of earlier lane content: if the stack collides, shift the whole chain down.
      const overlapsAt = (id, x0, y0, w0, h0) => {
        for (const [oid, r] of placed) {
          if (oid === id) continue
          if (x0 + 0.5 < r.x + r.w && r.x + 0.5 < x0 + w0 && y0 + 0.5 < r.y + r.h && r.y + 0.5 < y0 + h0)
            return true
        }
        return false
      }
      for (let shift = 0; shift < 24; shift += 1) {
        const dy = shift * (LAYER_GAP / 2)
        let hit = false
        for (let i = 0; i < it.h.boxes.length; i += 1) {
          const id = it.h.boxes[i]
          if (drawn.has(id)) continue
          const { w, h } = sizes[i]
          const x = lx + ((widths[lane] ?? w) - w) / 2
          if (overlapsAt(id, x, ys[i] + dy, w, h)) {
            hit = true
            break
          }
        }
        if (!hit) {
          for (let i = 0; i < it.h.boxes.length; i += 1) ys[i] += dy
          break
        }
      }
      let bottom = laneCursorY.get(key) ?? -Infinity
      for (let i = 0; i < it.h.boxes.length; i += 1) {
        const id = it.h.boxes[i]
        if (drawn.has(id)) continue
        const { w, h } = sizes[i]
        placed.set(id, { x: lx + ((widths[lane] ?? w) - w) / 2, y: ys[i], w, h })
        drawn.add(id)
        bottom = Math.max(bottom, ys[i] + h + LAYER_GAP)
      }
      laneCursorY.set(key, bottom)
      return
    }
    let by
    if (sameRow) {
      const h0 = frameSize(byId.get(it.h.boxes[0])).h
      const forkY = leave.y + leave.h / 2 - h0 / 2
      by = Math.max(laneCursorY.get(key) ?? -Infinity, forkY)
    } else if (laneCursorY.has(key)) by = /** @type {number} */ (laneCursorY.get(key))
    else by = leave ? leave.y + leave.h + LAYER_GAP : 0
    for (const id of it.h.boxes) {
      if (drawn.has(id)) continue
      const { w, h } = frameSize(byId.get(id))
      placed.set(id, { x: lx + ((widths[lane] ?? w) - w) / 2, y: by, w, h })
      drawn.add(id)
      by += h + LAYER_GAP
    }
    laneCursorY.set(key, by)
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
  let endY =
    spineHere.length > 0
      ? (() => {
          const last = placed.get(spineHere[spineHere.length - 1])
          return last ? last.y + last.h + LAYER_GAP : 0
        })()
      : 0
  for (const id of endTerminus) {
    if (drawn.has(id)) continue
    const { w, h } = frameSize(byId.get(id))
    placed.set(id, { x: spineX0 + (spineW - w) / 2, y: endY, w, h })
    drawn.add(id)
    endY += h + LAYER_GAP
  }
  const spineColumn = [...spineHere, ...extraSpineIds, ...endTerminus.filter((id) => placed.has(id))]
  const spineIdSet = new Set(spineColumn)

  // Pockets: remaining own nodes not drawn (branch ends already sit in hang boxes)
  const leftover = own.filter((n) => !drawn.has(n.id))
  if (leftover.length) {
    const pocketSign = rightW || !leftW ? 1 : -1
    const pocketX =
      pocketSign < 0
        ? spineX0 - hopGap - leftW - hopGap
        : spineX0 + spineW + hopGap + rightW + (rightW ? hopGap : 0)
    let py = 0
    for (const n of leftover) {
      const { w, h } = frameSize(n)
      placed.set(n.id, { x: pocketSign < 0 ? pocketX - w : pocketX, y: py, w, h })
      drawn.add(n.id)
      py += h + LAYER_GAP
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
      labelSize: g.label ? { width: Math.min(120, textEm(g.label) * 12 + 12), height: 16 } : null,
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
  separateSpineAxes(placed, spineAxes, connections)
  pushBranchesOffSpine(placed, spineColumn, connections)
  // Polish / pin can rewrite side links; put same-row decision branches and backs back to 0-bend.
  restoreSameRowLinks(placed, connections, diamonds)
  restoreInputMainStraight(placed, connections, spineIdSet)
  // Linked boxes prefer shared centres; every port sits on a face centre (polish must not leave a skew).
  preferCenteredLinks(placed, connections, diamonds, spineIdSet)
  // Labelled hops shorter than their text: after centres settle (same-row hang↔hang can be only
  // LANE_SEP wide), push so the chip still leaves a stub of ink on each side.
  lengthenLabeledHops(placed, connections, spineIdSet, diamonds)
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
  settleGeometryPasses(placed, connections, diamonds, spineIdSet)
  restoreInputMainStraight(placed, connections, spineIdSet)
  // Prefer on-line labels (opaque chip covers the stroke); re-place after geometry settles.
  ensureConnectionLabels(connections, [...placed.values()], [], [], { force: true, preferOnLine: true })

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
 */
function separateSpineAxes(placed, spineAxes, connections = []) {
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
    const dx = minCx - cur.cx
    if (dx <= 0.5) continue
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
  let axisSum = 0
  let axisN = 0
  for (const id of ids) {
    const r = placed.get(id)
    if (!r) continue
    axisSum += r.x + r.w / 2
    axisN += 1
  }
  const axis = axisN ? axisSum / axisN : 0
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
 */
function pushBranchesOffSpine(placed, spineIds, connections = []) {
  const spineSet = new Set(spineIds)
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const spines = []
  for (const id of spineIds) {
    const r = placed.get(id)
    if (r) spines.push(r)
  }
  if (!spines.length) return
  const axis = spines.reduce((s, r) => s + r.x + r.w / 2, 0) / spines.length
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
    for (const s of spines) {
      if (!(r.x < s.x + s.w - 0.5 && s.x < r.x + r.w - 0.5 && r.y < s.y + s.h - 0.5 && s.y < r.y + r.h - 0.5)) continue
      const clear = inputMainHang.has(id) ? clearMain : clearDefault
      const next = r.x + r.w / 2 < axis ? { ...r, x: s.x - clear - r.w } : { ...r, x: s.x + s.w + clear }
      placed.set(id, next)
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
    placed.set(hangId, { ...hang, x: hang.x + (hangRight ? need : -need) })
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
 */
function lengthenLabeledHops(placed, connections, spineIds, diamonds = new Set()) {
  // On-line chips hide the stroke under the text; keep a short stub of ink on each side.
  const INK_PAD = 20
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
  for (const c of connections) {
    if (!c.labelSize || !c.points?.length) continue
    const { width: lw, height: lh } = c.labelSize
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b) continue
    // Longest axis-aligned run
    let bestLen = 0
    let bestHoriz = true
    for (let i = 0; i < c.points.length - 1; i += 1) {
      const [p, q] = [c.points[i], c.points[i + 1]]
      const horiz = Math.abs(p[1] - q[1]) < 0.5
      const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
      if (len > bestLen) {
        bestLen = len
        bestHoriz = horiz
      }
    }
    const need = (bestHoriz ? lw : lh) + 2 * INK_PAD
    if (bestLen >= need) continue

    const deficit = need - bestLen
    if (bestHoriz) {
      const fromSpine = spineIds.has(c.from)
      const toSpine = spineIds.has(c.to)
      if (fromSpine !== toSpine) {
        // Spine ↔ hang: push the hang away from the trunk so the side hop grows.
        const hangId = fromSpine ? c.to : c.from
        const spineId = fromSpine ? c.from : c.to
        const r = placed.get(hangId)
        const s = placed.get(spineId)
        if (!r || !s) continue
        const away = r.x + r.w / 2 >= s.x + s.w / 2 ? 1 : -1
        placed.set(hangId, { ...r, x: r.x + away * deficit })
        moved.add(hangId)
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
          placed.set(rightId, { ...right, x: right.x + deficit })
          moved.add(rightId)
        } else {
          placed.set(leftId, { ...left, x: left.x - deficit })
          moved.add(leftId)
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
      const dy = deficit
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
 * @returns {{ x: number, y: number } | null}
 */
function labelOnLongestSegment(points, size, nodeRects = []) {
  const { width: w, height: h } = size
  const overlaps = (r) =>
    nodeRects.some((n) => r.x < n.x + n.w - 0.5 && n.x < r.x + r.w - 0.5 && r.y < n.y + n.h - 0.5 && n.y < r.y + r.h - 0.5)
  /** @type {{ x: number, y: number, len: number, vert: boolean }[]} */
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
    // Mid first, then slide toward either end in steps.
    const alongs = [room / 2]
    for (let t = 4; t <= room - 4; t += Math.max(4, Math.floor(room / 6))) alongs.push(t)
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
      candidates.push({ x: r.x, y: r.y, len, vert: !horiz })
    }
  }
  if (!candidates.length) return null
  // Prefer longer runs; on a tie, prefer a vertical corridor over a short stub.
  candidates.sort((a, b) => b.len - a.len || Number(b.vert) - Number(a.vert))
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
function ensureConnectionLabels(connections, nodeRects, blocks = [], borders = [], opts = {}) {
  if (opts.force) {
    for (const c of connections) {
      if (c.labelSize) c.labelAt = null
    }
  }
  for (const c of connections) {
    if (!c.labelSize || c.labelAt) continue
    const others = connections.filter((o) => o !== c)
    const labels = others
      .filter((o) => o.labelAt && o.labelSize)
      .map((o) => ({ x: o.labelAt.x, y: o.labelAt.y, w: o.labelSize.width, h: o.labelSize.height }))
    // Prefer sitting ON the longest clear run (opaque chip hides the stroke under the text).
    if (opts.preferOnLine) {
      const on = labelOnLongestSegment(c.points, c.labelSize, nodeRects)
      if (on) {
        c.labelAt = on
        continue
      }
    }
    c.labelAt = placeLabel(c.points, c.labelSize, nodeRects, [...blocks, ...labels], others, borders, {
      onLine: true,
    })
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
    if (!diamonds.has(c.from) && !diamonds.has(c.to)) continue
    const a = placed.get(c.from)
    const b = placed.get(c.to)
    if (!a || !b || !sameRowLink(a, b)) continue
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
    alts.push(clearWrapAround(a, b, hangOnRight, placed, c.from, c.to, 48, others))
  } else if (fromSpine && !toSpine) {
    const rev = routeHangToSpine(b, a, bcx > acx, placed, c.to, c.from, diamonds.has(c.to), others)
    if (rev) alts.push(rev.slice().reverse())
    const outerRev = clearOuterCorridor(b, a, bcx > acx, placed, c.to, c.from, 32, others)
    if (outerRev) alts.push(outerRev.slice().reverse())
    alts.push(clearSideChannel(a, b, acx > bcx, placed, c.from, c.to, 32, others))
    const wrapRev = clearWrapAround(b, a, bcx > acx, placed, c.to, c.from, 48, others)
    if (wrapRev) alts.push(wrapRev.slice().reverse())
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
function settleGeometryPasses(placed, connections, diamonds, spineIds) {
  for (let i = 0; i < 3; i += 1) {
    resolveSharedDiamondLeaves(placed, connections, diamonds, spineIds)
    resolveSharedDiamondEnters(placed, connections, diamonds, spineIds)
    resolveSharedRectLeaves(placed, connections, diamonds, spineIds)
    separateAmbiguousCorridors(placed, connections, diamonds, spineIds)
    repairRimFalseConnections(placed, connections, diamonds, spineIds)
    repairEdgeCrossings(placed, connections, diamonds, spineIds)
  }
  snapDiamondEndpoints(placed, connections, diamonds)
  // Stage packing / pin / prefer-centered can shift rect boxes without rewriting main
  // ink (B04 H stages-on: n-2 left by 11.5u while c:n-1→n-2 / c:n-2→n-3 stayed put).
  snapRectEndpoints(placed, connections, diamonds)
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
  const applyBest = (c, others, before, { allowLengthImprove = false } = {}) => {
    let best = null
    let bestCross = before
    let bestBends = Infinity
    let bestLen = Infinity
    const beforeBends = c.points?.length ? pathBendCount(c.points) : Infinity
    const beforeLen = c.points?.length ? pathLength(c.points) : Infinity
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
      const cross = pathCrossCount(pts, others)
      const bends = pathBendCount(pts)
      const len = pathLength(pts)
      // Prefer fewer crossings; then fewer bends; then shorter length (no gratuitous wrap).
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
    if (!best) return false
    const betterCross = bestCross < before
    const betterBend = bestCross === before && bestBends < beforeBends
    const betterLen = allowLengthImprove && bestCross === before && bestBends <= beforeBends && bestLen < beforeLen - 0.5
    if (betterCross || betterBend || betterLen) {
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
    if (!diamonds.has(c.to)) {
      const box = placed.get(c.to)
      if (box) {
        c.points[c.points.length - 1] = snap(
          box,
          c.points[c.points.length - 1],
          c.points[c.points.length - 2],
        )
      }
    }
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
          if (
            collinearOverlapLen(pts[u], pts[u + 1], o.points[v], o.points[v + 1]) >=
            COLLINEAR_AMBIGUOUS_MIN
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
          // Only nudge rails that currently coincide with a foreign segment.
          let hitsForeign = false
          for (const o of connections) {
            if (o.id === c.id || !o.points) continue
            for (let v = 0; v < o.points.length - 1; v += 1) {
              if (
                collinearOverlapLen(p0, q0, o.points[v], o.points[v + 1]) >= COLLINEAR_AMBIGUOUS_MIN
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
      if (!pathClear(pts, placed, c.from, c.to)) return
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
            if (isH) trial[i][1] += delta
            else trial[i][0] += delta
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
    // Trunk faces stay reserved for main enter/leave.
    const trunk = new Set()
    for (const inc of incidents) {
      if (inc.c.kind !== 'main') continue
      const f = faceOfOutline(inc.pt) ?? faceOf(inc.pt)
      if (f) trunk.add(f)
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
      if (f && leaveFaces.has(f)) addMover(inc)
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
      if (badApproach || grazeOrChord) addMover(inc)
    }
    for (const inc of movers) {
      const c = inc.c
      const a = placed.get(c.from)
      if (!a) continue
      const others = connections.filter((o) => o !== c).map((o) => o.points)
      const beforeCross = pathCrossCount(c.points, others)
      // Graze/chord repairs often must cross the 否 trunk once to reach the west bay;
      // allow a +1 bump only while curing those defects (never for face-only movers).
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
      const crossBudget = beforeCross + (curingDefect ? 1 : 0)
      let bestPts = /** @type {number[][] | null} */ (null)
      let bestCross = Infinity
      let bestBends = Infinity
      let bestLen = Infinity
      /** @param {number[][] | null | undefined} pts */
      const tryPts = (pts) => {
        if (!pts || pts.length < 2) return
        if (!pathClear(pts, placed, c.from, c.to)) return
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
        // Never land on a face that still hosts a leave (false merge with 是).
        if (enterFace && leaveFaces.has(enterFace)) return
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
        if (reserved.has(k)) return
        if (incidents.some((o) => o.c !== c && keyPt(o.pt) === k)) return
        const cross = pathCrossCount(pts, others)
        if (cross > crossBudget) return
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
          bestPts = pts
        }
      }
      // Prefer faces free of trunk + leaves; fall back to non-trunk if needed.
      const faces = freeFaces.length
        ? freeFaces
        : fallbackFaces.length
          ? fallbackFaces
          : /** @type {('N'|'E'|'S'|'W')[]} */ (['W', 'E', 'N', 'S'])
      for (const face of faces) {
        for (let slot = 0; slot < 4; slot += 1) {
          const port = staggerOnDiamondSide(node, face, slot, Math.max(slot + 1, 2))
          if (!onDiamondOutline(node, port)) continue
          if (reserved.has(keyPt(port))) continue
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
          // Far bottom→west wrap: keeps 0 crosses when mid-gap would cut the 否 trunk
          // (L4 n-15 east of spine; horizontal in the diamond↔plan gap crosses n-13→n-17).
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
    // All incident main edges reserve trunk faces — never stagger onto them.
    const trunk = new Set()
    for (const c of connections) {
      if (c.kind !== 'main' || !c.points?.length) continue
      if (c.from === id) {
        const f = faceOf(c.points[0])
        if (f) trunk.add(f)
      }
      if (c.to === id) {
        const f = faceOf(c.points[c.points.length - 1])
        if (f) trunk.add(f)
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
      const fwd = routeHangToSpine(hang, spine, hangOnRight, placed, toId, fromId, false, others)
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
