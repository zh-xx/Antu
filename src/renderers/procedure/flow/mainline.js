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

/** Gap between the spine column and the first branch lane (room for a condition label on the hop) */
const LANE_GAP = 112
/** Extra room between two branch lanes */
const LANE_SEP = 28
/** Clearance outside the hang box for a distant rejoin corridor (fallback when hang lane blocked) */
const OUTER_GAP = 28
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
 * @returns {{ placed: Map, stageBoxes: object[], connections: object[], size: {width:number,height:number}, frame: object }}
 */
export function layoutMainline(args) {
  return finishMainline(layoutMainlineGen(args))
}

/**
 * Mainline-first column layout as a generator (yields between heavy routing steps).
 * @returns {Generator<void, { placed: Map, stageBoxes: object[], connections: object[], size: {width:number,height:number}, frame: object }, unknown>}
 */
export function* layoutMainlineGen({ nodes, groups, stages, labelBox, vertical, spine, fields }) {
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
  const spineAt = new Map(spineList.map((id, i) => [id, i]))
  const outG = new Map(nodes.map((n) => [n.id, []]))
  for (const g of groups) outG.get(g.from)?.push(g)

  /** @type {Array<{ st: object, ids: Set<string>, spineIds: string[], placed: Map, connections: object[], width: number, height: number }>} */
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
      spineAt,
      spineList,
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
  const spineByStage = new Map()
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
    const spineIds = []
    for (const seg of segs) {
      for (const [id, r] of seg.placed) placed.set(id, { ...r, x: r.x + ox, y: r.y + oy })
      for (const c of seg.connections) {
        connections.push({
          ...c,
          points: c.points.map(([x, y]) => [x + ox, y + oy]),
          labelAt: c.labelAt ? { x: c.labelAt.x + ox, y: c.labelAt.y + oy } : null,
        })
      }
      spineIds.push(...seg.spineIds)
      ox += seg.width + COLUMN_GAP
    }
    spineByStage.set(st.id, spineIds)
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
  // Polish may shove trunk nodes aside to clear a branch: put the axis back, branches yield.
  for (const ids of spineByStage.values()) {
    pinSpineAxis(placed, ids, connections)
    pushBranchesOffSpine(placed, ids)
  }
  // straighten/polish prefer diamond-point routes; same-row forks stay side-horizontal.
  restoreSameRowLinks(placed, connections, diamonds)
  // Final: linked boxes share centres; every port on a face centre (after polish skew).
  const allSpine = new Set([...spineByStage.values()].flat())
  preferCenteredLinks(placed, connections, diamonds, allSpine)
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
  return { frame, ...toReal(frame, vertical) }
}

/**
 * Lay out one stage: spine first, then branch lanes, then pockets.
 */
function layoutStageMainline({
  own,
  ownIds,
  groups,
  outG,
  spineAt,
  spineList,
  frameSize,
  diamonds,
  branchSign,
  byId,
  forceHangSide = null,
}) {
  const placed = new Map()
  const drawn = new Set()

  const spineHere = spineList.filter((id) => ownIds.has(id))
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

  // Hangs: leave the spine, follow until spine / end / already drawn (no cut)
  const hangs = []
  for (const u of spineHere) {
    for (const g of outG.get(u) ?? []) {
      if (!ownIds.has(g.to) && !g.isBack) continue // cross-stage later
      if (g.isMain || g.isBack) continue
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
        const outs = (outG.get(cur) ?? []).filter((e) => !e.isBack && ownIds.has(e.to))
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
    const claimed = new Set([...spineHere, ...hangs.flatMap((h) => h.boxes)])
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
      const a = spineAt.has(h.from) ? spineAt.get(h.from) : spineAt.get(hangs.find((p) => p.boxes.includes(h.from))?.from) ?? 0
      const b = h.rejoin && spineAt.has(h.rejoin) ? spineAt.get(h.rejoin) : a + Math.max(1, h.boxes.length)
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
    const ordered = [...its].sort((p, q) => Number(isLoopHang(q.h)) - Number(isLoopHang(p.h)))
    ordered.forEach((it, i) => {
      signOf.set(it.h, i % 2 === 0 ? branchSign : -branchSign)
    })
  }

  // Overlapping regions on the same side: flip onto a free opposite face when possible.
  // Nested → only the contained hang moves; non-nested → the later leave moves.
  // Interval containment can invert for child hangs (estimated span); never flip a spine-rooted
  // hang because a child hang's interval appears to contain it. Loop+back keeps preferred.
  const byLeave = [...intervals].sort((p, q) => p.a - q.a || p.b - q.b)
  for (const it of byLeave) {
    if (isLoopHang(it.h)) continue
    const sign = /** @type {number} */ (signOf.get(it.h))
    for (const other of byLeave) {
      if (other === it || other.a > it.a) continue
      if (signOf.get(other.h) !== sign) continue
      if (!regionOverlaps(it, other)) continue
      // Interval-container stays on this face.
      if (regionContains(it, other)) continue
      // Child-span artifact: spine-rooted hang looks "inside" a child hang — skip.
      if (regionContains(other, it) && it.h.rootOnSpine && !other.h.rootOnSpine) continue
      const opp = -sign
      const oppBusy = intervals.some(
        (o) =>
          o !== it &&
          signOf.get(o.h) === opp &&
          regionOverlaps(it, o) &&
          !regionContains(it, o) &&
          !regionContains(o, it),
      )
      if (!oppBusy) signOf.set(it.h, opp)
      break
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
  /** @type {Map<object, number>} */
  const laneOf = new Map()
  /** @type {Map<number, number[]>} sign → lane end spine-index */
  const laneEndsBySign = new Map([
    [1, []],
    [-1, []],
  ])
  /** @type {Array<{ region: object, reason: string }>} */
  const spineOpenRequests = []
  const bySpan = [...intervals].sort((p, q) => p.b - p.a - (q.b - q.a) || p.a - q.a || p.b - q.b)
  for (const it of bySpan) {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const ends = /** @type {number[]} */ (laneEndsBySign.get(sign))
    let lane = 0
    while (ends[lane] !== undefined && ends[lane] > it.a) lane += 1
    ends[lane] = Math.max(ends[lane] ?? it.b, it.b)
    laneOf.set(it.h, lane)
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

  // Room on the leave hop for a condition label sitting ON the segment (not beside it).
  let hopGap = LANE_GAP
  for (const it of intervals) {
    const leave = it.h.leave
    if (!leave?.label || !it.h.rootOnSpine) continue
    const need = Math.min(120, textEm(leave.label) * 12 + 12) + 24
    hopGap = Math.max(hopGap, need)
  }

  const spineX0 = leftW ? leftW + hopGap : 0
  for (const id of spineHere) {
    const r = placed.get(id)
    placed.set(id, { ...r, x: spineX0 + (spineW - r.w) / 2 })
  }

  // Decision branches sit on the fork's row (centres aligned → 0-bend side link).
  // Lane keys are scoped by side so opposite-face siblings do not stack on one cursor.
  /** @type {Map<string, number>} */
  const laneCursorY = new Map()
  const laneKey = (sign, lane) => `${sign}:${lane}`
  const laneOffset = (sign, lane) => {
    const widths = /** @type {number[]} */ (laneWBySign.get(sign))
    let acc = 0
    for (let i = 0; i < lane; i += 1) acc += (widths[i] ?? 0) + LANE_SEP
    return acc
  }
  for (const it of intervals) {
    const sign = /** @type {number} */ (signOf.get(it.h))
    const lane = /** @type {number} */ (laneOf.get(it.h))
    const widths = /** @type {number[]} */ (laneWBySign.get(sign))
    const leave = placed.get(it.h.from)
    const fork = byId.get(it.h.from)
    const sameRow = Boolean(it.h.rootOnSpine && fork?.kind === 'decision' && leave && it.h.boxes.length)
    const key = laneKey(sign, lane)
    let by
    if (sameRow) {
      const h0 = frameSize(byId.get(it.h.boxes[0])).h
      const forkY = leave.y + leave.h / 2 - h0 / 2
      by = Math.max(laneCursorY.get(key) ?? -Infinity, forkY)
    } else if (laneCursorY.has(key)) by = /** @type {number} */ (laneCursorY.get(key))
    else by = leave ? leave.y + leave.h + LAYER_GAP : 0
    const lx =
      sign < 0
        ? spineX0 - hopGap - laneOffset(sign, lane) - (widths[lane] ?? 0)
        : spineX0 + spineW + hopGap + laneOffset(sign, lane)
    for (const id of it.h.boxes) {
      if (drawn.has(id)) continue
      const { w, h } = frameSize(byId.get(id))
      placed.set(id, { x: lx + ((widths[lane] ?? w) - w) / 2, y: by, w, h })
      drawn.add(id)
      by += h + LAYER_GAP
    }
    laneCursorY.set(key, by)
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
  const spineColumn = [...spineHere, ...endTerminus.filter((id) => placed.has(id))]
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
  const inner = groups.filter((g) => ownIds.has(g.from) && ownIds.has(g.to))
  const connections = []
  for (const g of inner) {
    const a = placed.get(g.from)
    const b = placed.get(g.to)
    if (!a || !b) continue
    let points
    if (g.isMain) {
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
      points = sideHorizontal(a, b)
    } else {
      points = routeCentered(a, b, diamonds.has(g.from), placed, g.from, g.to, spineIdSet)
    }
    connections.push({
      id: `c:${g.from}->${g.to}`,
      from: g.from,
      to: g.to,
      kind: g.isBack ? 'back' : g.isMain ? 'main' : 'branch',
      merged: g.merged,
      points,
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
  // Hard constraint: the trunk axis stays fixed; polish may have shoved spine nodes for a branch.
  pinSpineAxis(placed, spineColumn, connections)
  pushBranchesOffSpine(placed, spineColumn)
  // Polish / pin can rewrite side links; put same-row decision branches and backs back to 0-bend.
  restoreSameRowLinks(placed, connections, diamonds)
  // Linked boxes prefer shared centres; every port sits on a face centre (polish must not leave a skew).
  preferCenteredLinks(placed, connections, diamonds, spineIdSet)
  // Labelled hops shorter than their text: after centres settle (same-row hang↔hang can be only
  // LANE_SEP wide), push so the chip still leaves a stub of ink on each side.
  lengthenLabeledHops(placed, connections, spineIdSet, diamonds)
  restoreSameRowLinks(placed, connections, diamonds)
  // Side-channel / outer-corridor backs: push the vertical run outward until an on-ink label fits.
  clearCorridorForLabels(placed, connections)
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
    width: Math.max(spineW, x1 - x0),
    height: Math.max(spineH, y1 - y0),
  }
}

/**
 * Pin every spine node to one vertical axis (shared centre x). Rebuild main links as straight;
 * nudge other link ends that left a moved spine node. Branches must yield — never the trunk.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {string[]} spineIds
 * @param {object[]} [connections]
 */
function pinSpineAxis(placed, spineIds, connections = []) {
  const ids = spineIds.filter((id) => placed.has(id))
  if (ids.length === 0) return
  let axisSum = 0
  for (const id of ids) {
    const r = placed.get(id)
    if (!r) continue
    axisSum += r.x + r.w / 2
  }
  const axis = axisSum / ids.length
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
 */
function pushBranchesOffSpine(placed, spineIds) {
  const spineSet = new Set(spineIds)
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const spines = []
  for (const id of spineIds) {
    const r = placed.get(id)
    if (r) spines.push(r)
  }
  if (!spines.length) return
  const axis = spines.reduce((s, r) => s + r.x + r.w / 2, 0) / spines.length
  const clear = 10
  for (const [id, r] of [...placed]) {
    if (spineSet.has(id)) continue
    for (const s of spines) {
      if (!(r.x < s.x + s.w - 0.5 && s.x < r.x + r.w - 0.5 && r.y < s.y + s.h - 0.5 && s.y < r.y + r.h - 0.5)) continue
      const next = r.x + r.w / 2 < axis ? { ...r, x: s.x - clear - r.w } : { ...r, x: s.x + s.w + clear }
      placed.set(id, next)
      break
    }
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
    c.points = routeCentered(a, b, diamonds.has(c.from), placed, c.from, c.to, spineIds)
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
    c.points = routeCentered(a, b, diamonds.has(c.from), placed, c.from, c.to, spineIds)
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
    // DEBUG
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
  const overlapsNode = (r) =>
    nodeRects.some((n) => r.x < n.x + n.w - 0.5 && n.x < r.x + r.w - 0.5 && r.y < n.y + n.h - 0.5 && n.y < r.y + r.h - 0.5)
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

/** Straight side-to-side link between same-row boxes (0 bends). */
function sideHorizontal(a, b) {
  const ay = a.y + a.h / 2
  const by = b.y + b.h / 2
  if (a.x + a.w / 2 <= b.x + b.w / 2) {
    return [
      [a.x + a.w, ay],
      [b.x, by],
    ]
  }
  return [
    [a.x, ay],
    [b.x + b.w, by],
  ]
}

/**
 * After polish/straighten, put decision↔same-row neighbour links back to a side horizontal.
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
    c.points = sideHorizontal(a, b)
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

/** Side-channel U-turn: leave/enter face centres, run beside both boxes (avoids same-column blockers). */
function sideChannel(a, b, preferLeft = false) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const side = preferLeft ? Math.min(a.x, b.x) - 24 : Math.max(a.x + a.w, b.x + b.w) + 24
  return [
    [preferLeft ? a.x : a.x + a.w, acy],
    [side, acy],
    [side, bcy],
    [preferLeft ? b.x : b.x + b.w, bcy],
  ]
}

/**
 * Preferred hang → spine rejoin: hang may use N/S. Leave the travel face, run in the hang
 * lane to the spine mid-height, enter the spine's hang-side face (1 bend). Never touches trunk N/S.
 * @param {{ x: number, y: number, w: number, h: number }} a hang
 * @param {{ x: number, y: number, w: number, h: number }} b spine
 * @param {boolean} hangOnRight
 */
function hangLaneRejoin(a, b, hangOnRight) {
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const goingDown = bcy >= acy
  return [
    [acx, goingDown ? a.y + a.h : a.y],
    [acx, bcy],
    [hangOnRight ? b.x + b.w : b.x, bcy],
  ]
}

/**
 * Inward gutter when the hang lane is blocked: leave the face toward the spine, run between
 * hang and trunk, enter the spine side. Avoids a far outer U with a tiny vertical jog
 * (e.g. purchase-contract「协商是否成功」→「甲方付款」).
 * @param {{ x: number, y: number, w: number, h: number }} a hang
 * @param {{ x: number, y: number, w: number, h: number }} b spine
 * @param {boolean} hangOnRight
 */
function gutterRejoin(a, b, hangOnRight) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const ax = hangOnRight ? a.x : a.x + a.w
  const bx = hangOnRight ? b.x + b.w : b.x
  if (Math.abs(acy - bcy) < 2) {
    return [
      [ax, acy],
      [bx, bcy],
    ]
  }
  const gutterX = (ax + bx) / 2
  return [
    [ax, acy],
    [gutterX, acy],
    [gutterX, bcy],
    [bx, bcy],
  ]
}

/**
 * Outer corridor last resort: leave travel face, run outside the hang column, enter spine side.
 * @param {{ x: number, y: number, w: number, h: number }} a hang box
 * @param {{ x: number, y: number, w: number, h: number }} b spine box
 * @param {boolean} hangOnRight hang sits to the right of the spine
 * @param {number} [depth] extra outward offset when several corridors stack
 */
function outerCorridor(a, b, hangOnRight, depth = 0) {
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const goingDown = bcy >= acy
  const leaveY = goingDown ? a.y + a.h : a.y
  const outer = hangOnRight
    ? Math.max(a.x + a.w, b.x + b.w) + OUTER_GAP + depth
    : Math.min(a.x, b.x) - OUTER_GAP - depth
  return [
    [acx, leaveY],
    [outer, leaveY],
    [outer, bcy],
    [hangOnRight ? b.x + b.w : b.x, bcy],
  ]
}

/**
 * Outward corridor: leave the hang face *away* from the spine, run vertical, enter spine side.
 * Channel x is the gap before the next outer hang column when one exists; otherwise just
 * outside this hang (`OUTER_GAP`) when that return stays clear. Covers S3 right (inter-lane)
 * and S3 left-leave (hang alone on the left → 回并左出).
 * @returns {number[][] | null}
 */
function interLaneCorridor(a, b, hangOnRight, placed, fromId, toId) {
  if (!placed) return null
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const hangOuter = hangOnRight ? a.x + a.w : a.x
  const lo = Math.min(acy, bcy)
  const hi = Math.max(acy, bcy)
  let nearestInner = hangOnRight ? Infinity : -Infinity
  let found = false
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    // Must sit further out than this hang and overlap the vertical run (or the leave row).
    const further = hangOnRight ? r.x >= hangOuter - 1 : r.x + r.w <= hangOuter + 1
    if (!further) continue
    if (r.y + r.h <= lo + 0.5 || r.y >= hi - 0.5) {
      // Still count a neighbour that overlaps the hang box row (blocks the leave stub).
      if (r.y + r.h <= a.y + 0.5 || r.y >= a.y + a.h - 0.5) continue
    }
    found = true
    if (hangOnRight) nearestInner = Math.min(nearestInner, r.x)
    else nearestInner = Math.max(nearestInner, r.x + r.w)
  }
  let mid
  if (found) {
    const gap = hangOnRight ? nearestInner - hangOuter : hangOuter - nearestInner
    if (gap < 8) return null
    mid = hangOnRight ? hangOuter + gap / 2 : hangOuter - gap / 2
  } else {
    // Alone on this side: still prefer leaving away from the spine when the U clears.
    mid = hangOnRight ? hangOuter + OUTER_GAP : hangOuter - OUTER_GAP
  }
  // Vertical / return must stay clear of every foreign box.
  const spineFace = hangOnRight ? b.x + b.w : b.x
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (mid > r.x + 0.5 && mid < r.x + r.w - 0.5 && r.y + r.h > lo + 0.5 && r.y < hi - 0.5) return null
    // Horizontal at bcy from mid toward spine: must not enter a box.
    const hLo = Math.min(mid, spineFace)
    const hHi = Math.max(mid, spineFace)
    if (bcy > r.y + 0.5 && bcy < r.y + r.h - 0.5 && hHi > r.x + 0.5 && hLo < r.x + r.w - 0.5) return null
  }
  return [
    [hangOuter, acy],
    [mid, acy],
    [mid, bcy],
    [spineFace, bcy],
  ]
}

/** True when another box sits on the hang's vertical lane between leaveY and targetY. */
function hangLaneBlocked(a, leaveY, targetY, placed, fromId, toId) {
  if (!placed) return false
  const acx = a.x + a.w / 2
  const lo = Math.min(leaveY, targetY)
  const hi = Math.max(leaveY, targetY)
  if (hi <= lo + 0.5) return false
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (Math.abs(r.x + r.w / 2 - acx) > r.w / 2 + 2) continue
    if (r.y + r.h > lo + 0.5 && r.y < hi - 0.5) return true
  }
  return false
}

/** True when a box sits on the inward gutter x between hang and spine over the y span. */
function gutterBlocked(a, b, hangOnRight, placed, fromId, toId) {
  if (!placed) return false
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const ax = hangOnRight ? a.x : a.x + a.w
  const bx = hangOnRight ? b.x + b.w : b.x
  const gutterX = (ax + bx) / 2
  const lo = Math.min(acy, bcy)
  const hi = Math.max(acy, bcy)
  for (const [id, r] of placed) {
    if (id === fromId || id === toId) continue
    if (r.x > gutterX + 2 || r.x + r.w < gutterX - 2) continue
    if (hi <= lo + 0.5) continue
    if (r.y + r.h > lo + 0.5 && r.y < hi - 0.5) return true
  }
  return false
}

/**
 * Hang → spine: hang-lane (1 bend) → between-lane corridor (leave away from spine) →
 * inward gutter → outer corridor (last resort).
 * @param {{ x: number, y: number, w: number, h: number }} a hang
 * @param {{ x: number, y: number, w: number, h: number }} b spine
 * @param {boolean} hangOnRight
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} placed
 * @param {string | null | undefined} fromId
 * @param {string | null | undefined} toId
 */
function routeHangToSpine(a, b, hangOnRight, placed, fromId, toId) {
  const acy = a.y + a.h / 2
  const bcy = b.y + b.h / 2
  const leaveY = bcy >= acy ? a.y + a.h : a.y
  if (!hangLaneBlocked(a, leaveY, bcy, placed, fromId, toId)) {
    return hangLaneRejoin(a, b, hangOnRight)
  }
  // Prefer the gap before the next outer hang column when clear — avoids far-outer cutting
  // through that column on the return row (S3). Falls through when no outer neighbour.
  const between = interLaneCorridor(a, b, hangOnRight, placed, fromId, toId)
  if (between) return between
  if (!gutterBlocked(a, b, hangOnRight, placed, fromId, toId)) {
    return gutterRejoin(a, b, hangOnRight)
  }
  return outerCorridor(a, b, hangOnRight)
}

/**
 * Orthogonal route between two boxes, ports on face centres. Prefer same-row / same-column
 * (0-bend); otherwise leave the facing side of the source and enter the facing side of the target.
 * When a same-column hop would cut through another box, take a side channel instead.
 * Hang → spine rejoins enter a free side face so they do not share the trunk's top/bottom port.
 * Distant / upward hang↔spine hops use an outer corridor on the hang side.
 * @param {{ x: number, y: number, w: number, h: number }} a
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} [fromDiamond]
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null | undefined} [placed]
 * @param {string | null | undefined} [fromId]
 * @param {string | null | undefined} [toId]
 * @param {Set<string> | null | undefined} [spineIds]
 */
function routeCentered(a, b, fromDiamond = false, placed = null, fromId = null, toId = null, spineIds = null) {
  if (sameRowLink(a, b)) return sideHorizontal(a, b)
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcx = b.x + b.w / 2
  const bcy = b.y + b.h / 2
  const blocked = columnBlocked(a, b, placed, fromId, toId)
  const fromSpine = Boolean(spineIds && fromId && spineIds.has(fromId))
  const toSpine = Boolean(spineIds && toId && spineIds.has(toId))
  // Same column: straight vertical when clear; otherwise side channel so labels stay off the blocker.
  if (Math.abs(acx - bcx) < 0.5) {
    if (blocked) return sideChannel(a, b, acx > 40)
    const down = bcy >= acy
    return [
      [acx, down ? a.y + a.h : a.y],
      [bcx, down ? b.y : b.y + b.h],
    ]
  }
  // Hang → spine: trunk owns N/S on the spine; hang may leave N/S. Prefer hang-lane (1 bend).
  if (!fromSpine && toSpine) {
    return routeHangToSpine(a, b, acx > bcx, placed, fromId, toId)
  }
  // Spine → hang (not same-row): reverse of hang→spine when the hop is off the fork row.
  if (fromSpine && !toSpine && !sameRowLink(a, b)) {
    const hangOnRight = bcx > acx
    // Near: leave spine side, enter hang top/bottom facing the spine (existing short path below).
    const hang = b
    const spine = a
    const hcy = hang.y + hang.h / 2
    const scy = spine.y + spine.h / 2
    const leaveY = scy >= hcy ? hang.y + hang.h : hang.y
    // Far / blocked hang-lane: use the hang→spine helper reversed.
    if (Math.abs(scy - hcy) >= DISTANT_DY || hangLaneBlocked(hang, leaveY, scy, placed, toId, fromId)) {
      return routeHangToSpine(hang, spine, hangOnRight, placed, toId, fromId).slice().reverse()
    }
  }
  // Source above target: leave bottom centre, enter top centre.
  if (a.y + a.h <= b.y + 0.5) {
    if (blocked) return sideChannel(a, b, acx > bcx)
    const mid = (a.y + a.h + b.y) / 2
    return [
      [acx, a.y + a.h],
      [acx, mid],
      [bcx, mid],
      [bcx, b.y],
    ]
  }
  // Spine source below a hang target (near): leave free side face, enter top of hang.
  if (fromSpine && !toSpine && b.y + b.h <= a.y + 0.5) {
    const toRight = bcx > acx
    return [
      [toRight ? a.x + a.w : a.x, acy],
      [bcx, acy],
      [bcx, b.y + b.h],
    ]
  }
  // Source below target: leave top centre, enter bottom centre.
  if (b.y + b.h <= a.y + 0.5) {
    if (blocked) return sideChannel(a, b, acx > bcx)
    const mid = (b.y + b.h + a.y) / 2
    return [
      [acx, a.y],
      [acx, mid],
      [bcx, mid],
      [bcx, b.y + b.h],
    ]
  }
  // Side-by-side but not same-row: leave nearer side centre → enter nearer side centre.
  const aRight = acx <= bcx
  const ax = aRight ? a.x + a.w : a.x
  const bx = aRight ? b.x : b.x + b.w
  const mid = (ax + bx) / 2
  return [
    [ax, acy],
    [mid, acy],
    [mid, bcy],
    [bx, bcy],
  ]
}

function elbow(a, b, fromDiamond) {
  return routeCentered(a, b, fromDiamond)
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
