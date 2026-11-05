// @ts-check
// ============================================================
//  src/renderers/procedure/flow/mainline.js — Mainline-first flowchart layout (issue 190)
//
//  Prototype beside the current ELK + polish column layout. Same JSON, same output
//  shape as layoutColumnsGen. Order:
//    1. fix the main line in each stage as a straight vertical column (axis pinned);
//    2. hang branches in lanes on the side away from the next stage (or to the right
//       when there is only one column); a decision's first hop sits on the fork's row
//       (0-bend side link / back); siblings share one vertical track; branches yield —
//       the spine never moves for them;
//    3. branch-exit ends stay in their hang lane (so the leave→…→end chain stays one path);
//       main-line ends already on the spine stay there. Rule-only ends (no flow edges) are
//       omitted upstream — they belong in the rules table, not as islands on the canvas;
//    4. stack leftover "pocket" nodes beside the hangs;
//    5. set stage boxes side by side; route cross-stage links with router.js;
//    6. light polish, then re-pin the spine axis (polish must not leave the trunk bent).
//
//  Does not cut branches (unlike route). Does not call ELK on the main path.
//  Enabled with fields.engine === 'mainline' (dock switch + preset; not a schema field).
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
export function* layoutMainlineGen({ nodes, groups, stages, labelBox, vertical, spine }) {
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
  // Routes moved after the per-stage label pass: drop stale spots and place again.
  ensureConnectionLabels(connections, [...placed.values()], titles, borders, { force: true })
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
function layoutStageMainline({ own, ownIds, groups, outG, spineAt, spineList, frameSize, diamonds, branchSign, byId }) {
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

  // Interval lanes along the spine index. Sibling branches from the same decision share one track.
  const intervals = hangs
    .filter((h) => h.boxes.length)
    .map((h) => {
      const a = spineAt.has(h.from) ? spineAt.get(h.from) : spineAt.get(hangs.find((p) => p.boxes.includes(h.from))?.from) ?? 0
      const b = h.rejoin && spineAt.has(h.rejoin) ? spineAt.get(h.rejoin) : a + Math.max(1, h.boxes.length)
      return { h, a: Math.min(a, b), b: Math.max(a, b) }
    })
  intervals.sort((p, q) => p.a - q.a || p.b - q.b)
  const laneOf = new Map()
  const laneEnds = []
  /** @type {Map<string, number>} decision-from → shared lane */
  const decisionLane = new Map()
  for (const it of intervals) {
    const fromDec = it.h.rootOnSpine && byId.get(it.h.from)?.kind === 'decision'
    if (fromDec && decisionLane.has(it.h.from)) {
      const lane = /** @type {number} */ (decisionLane.get(it.h.from))
      laneOf.set(it.h, lane)
      laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, it.b)
      continue
    }
    let lane = 0
    while (laneEnds[lane] !== undefined && laneEnds[lane] > it.a) lane += 1
    laneEnds[lane] = it.b
    laneOf.set(it.h, lane)
    if (fromDec) decisionLane.set(it.h.from, lane)
  }

  // Measure lane widths and place hang boxes
  const laneW = []
  for (const it of intervals) {
    const lane = laneOf.get(it.h)
    let w = 0
    for (const id of it.h.boxes) {
      const s = frameSize(byId.get(id))
      w = Math.max(w, s.w)
    }
    laneW[lane] = Math.max(laneW[lane] ?? 0, w)
  }
  const laneLeft = []
  {
    let acc = 0
    for (let i = 0; i < laneW.length; i += 1) {
      laneLeft[i] = acc
      acc += (laneW[i] ?? 0) + LANE_SEP
    }
  }
  const hangsW = laneW.length ? laneW.reduce((s, w) => s + w, 0) + LANE_SEP * (laneW.length - 1) : 0

  // Spine column starts after hangs when hanging to the left
  const spineX0 = branchSign < 0 ? hangsW + (hangsW ? LANE_GAP : 0) : 0
  for (const id of spineHere) {
    const r = placed.get(id)
    placed.set(id, { ...r, x: spineX0 + (spineW - r.w) / 2 })
  }

  // Decision branches sit on the fork's row (centres aligned → 0-bend side link);
  // siblings share the lane and stack one per row. A later decision on a free stretch of
  // the same track still aligns to its own fork (max with the lane cursor), not the prior hang.
  /** @type {Map<number, number>} */
  const laneCursorY = new Map()
  for (const it of intervals) {
    const lane = laneOf.get(it.h)
    const leave = placed.get(it.h.from)
    const fork = byId.get(it.h.from)
    const sameRow = Boolean(it.h.rootOnSpine && fork?.kind === 'decision' && leave && it.h.boxes.length)
    let by
    if (sameRow) {
      const h0 = frameSize(byId.get(it.h.boxes[0])).h
      const forkY = leave.y + leave.h / 2 - h0 / 2
      by = Math.max(laneCursorY.get(lane) ?? -Infinity, forkY)
    } else if (laneCursorY.has(lane)) by = /** @type {number} */ (laneCursorY.get(lane))
    else by = leave ? leave.y + leave.h + LAYER_GAP : 0
    const lx =
      branchSign < 0
        ? spineX0 - LANE_GAP - laneLeft[lane] - (laneW[lane] ?? 0)
        : spineX0 + spineW + LANE_GAP + laneLeft[lane]
    for (const id of it.h.boxes) {
      if (drawn.has(id)) continue
      const { w, h } = frameSize(byId.get(id))
      placed.set(id, { x: lx + ((laneW[lane] ?? w) - w) / 2, y: by, w, h })
      drawn.add(id)
      by += h + LAYER_GAP
    }
    laneCursorY.set(lane, by)
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

  // Pockets: remaining own nodes not drawn (branch ends already sit in hang boxes)
  const leftover = own.filter((n) => !drawn.has(n.id))
  if (leftover.length) {
    const pocketX =
      branchSign < 0 ? Math.min(0, ...[...placed.values()].map((r) => r.x)) - LANE_GAP : spineX0 + spineW + LANE_GAP + hangsW + (hangsW ? LANE_GAP : 0)
    let py = 0
    let pw = 0
    for (const n of leftover) {
      const { w, h } = frameSize(n)
      pw = Math.max(pw, w)
      placed.set(n.id, { x: branchSign < 0 ? pocketX - w : pocketX, y: py, w, h })
      drawn.add(n.id)
      py += h + LAYER_GAP
    }
    // Shift everything if pocket went negative
    if (branchSign < 0) {
      const minX = Math.min(...[...placed.values()].map((r) => r.x))
      if (minX < 0) {
        const dx = -minX
        for (const [id, r] of placed) placed.set(id, { ...r, x: r.x + dx })
      }
    }
  }

  // Inner connections: main straight; same-row branch/back horizontal; others elbow then polish
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
    } else if (g.isBack) {
      const side = branchSign < 0 ? Math.min(a.x, b.x) - 24 : Math.max(a.x + a.w, b.x + b.w) + 24
      points = [
        [branchSign < 0 ? a.x : a.x + a.w, a.y + a.h / 2],
        [side, a.y + a.h / 2],
        [side, b.y + b.h / 2],
        [branchSign < 0 ? b.x : b.x + b.w, b.y + b.h / 2],
      ]
    } else {
      points = elbow(a, b, diamonds.has(g.from))
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
  // Fill / refresh every labelled link after the last geometry change (stale labelAt hides under nodes).
  ensureConnectionLabels(connections, [...placed.values()], [], [], { force: true })

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
 * Every connection with a label must carry labelAt: the paint layer reads `.x` / `.y`.
 * With `force`, clear existing spots first so a later geometry pass (pin / same-row restore)
 * cannot leave a label sitting on a node.
 * @param {object[]} connections
 * @param {{ x: number, y: number, w: number, h: number }[]} nodeRects
 * @param {object[]} [blocks]
 * @param {object[]} [borders]
 * @param {{ force?: boolean }} [opts]
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

function elbow(a, b, _fromDiamond) {
  if (sameRowLink(a, b)) return sideHorizontal(a, b)
  const ax = a.x + a.w / 2
  const ay = a.y + a.h
  const bx = b.x + b.w / 2
  const by = b.y
  if (Math.abs(ax - bx) < 0.5) return [
    [ax, ay],
    [bx, by],
  ]
  const mid = (ay + by) / 2
  return [
    [ax, ay],
    [ax, mid],
    [bx, mid],
    [bx, by],
  ]
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
