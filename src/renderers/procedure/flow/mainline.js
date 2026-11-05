// @ts-check
// ============================================================
//  src/renderers/procedure/flow/mainline.js — Mainline-first flowchart layout (#190)
//
//  Prototype beside the current ELK + polish column layout. Same JSON, same output
//  shape as layoutColumnsGen. Order:
//    1. fix the main line in each stage as a straight vertical column;
//    2. hang branches in lanes on the side away from the next stage;
//    3. stack leftover "pocket" nodes (off-line sub-graphs) beside the hangs;
//    4. set stage boxes side by side; route cross-stage links with router.js;
//    5. light polish.
//
//  Does not cut branches (unlike route). Does not call ELK on the main path.
//  Enabled with fields.engine === 'mainline' (internal switch; not a schema field).
// ============================================================

import { straighten } from './straighten.js'
import { edgesOf } from './router.js'
import { ownPart } from './merge.js'
import { polishLinks, linkRouting, placeLabel } from './polish.js'
import { titleBoxOf, toReal } from './columns.js'
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

/** Gap between the spine column and the first branch lane */
const LANE_GAP = 36
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
 * @param {object} p same args as layoutColumns
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

  /** @type {Array<{ st: object, ids: Set<string>, placed: Map, connections: object[], width: number, height: number }>} */
  const segments = []

  for (let si = 0; si < stages.length; si += 1) {
    const st = stages[si]
    const own = nodes.filter((n) => n.stageId === st.id)
    const ownIds = new Set(own.map((n) => n.id))
    // Branch side: away from the next column (next is to the right → hang left = -1)
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
  let cx = PAD
  for (const st of stages) {
    const segs = segments.filter((seg) => seg.st === st)
    const content = segs.reduce((s, seg) => s + seg.width, 0) + COLUMN_GAP * Math.max(0, segs.length - 1)
    const titleW = textEm(st.label) * STAGE_TITLE_FONT + STAGE_PAD * 2
    const w = Math.max(content + PAD_C0 + STAGE_PAD, vertical ? titleW : 0, vertical ? COLUMN_MIN_W : 0)
    const h = Math.max(Math.max(...segs.map((seg) => seg.height)) + PAD_A0 + STAGE_PAD, vertical ? 0 : titleW)
    boxes.push({ stageId: st.id, label: st.label, x: cx, y: PAD, w, h })
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
  const tallest = Math.max(...boxes.map((b) => b.h), 0)

  const borders = boxes.flatMap(edgesOf)
  const boxOfStage = new Map(boxes.map((b) => [b.stageId, b]))
  const within = (c) => {
    const a = byId.get(c.from)?.stageId
    return a && a === byId.get(c.to)?.stageId ? boxOfStage.get(a) : null
  }
  const titles = boxes.map((b) => titleBoxOf(b, b.label, vertical))
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

  // Interval lanes along the spine index
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
  for (const it of intervals) {
    let lane = 0
    while (laneEnds[lane] !== undefined && laneEnds[lane] > it.a) lane += 1
    laneEnds[lane] = it.b
    laneOf.set(it.h, lane)
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

  for (const it of intervals) {
    const lane = laneOf.get(it.h)
    const leave = placed.get(it.h.from)
    let by = leave ? leave.y + leave.h + LAYER_GAP : 0
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
  }

  // Pockets: remaining own nodes not drawn
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

  // Inner connections: main straight; others elbow then polish
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
  return { placed, connections, width: Math.max(spineW, x1 - x0), height: Math.max(spineH, y1 - y0) }
}

function elbow(a, b, _fromDiamond) {
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
