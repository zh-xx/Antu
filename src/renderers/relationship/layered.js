// ============================================================
//  src/renderers/relationship/layered.js — boxes in levels, lines between levels (shared)
//
//  The equity tree, the authority chart and the relation path all put boxes in levels
//  (a holder above what it holds, a controller above the controlled, the start of a chain before its
//  end, the creditor's camp before the debtor's) and draw a line for each relation between them. This is
//  that one drawing, so the four cannot come to differ.
//
//    levels     the longest path from a box nothing points to, over the lines that do not close a cycle
//               (a line that closes a cycle is a "back" line: drawn dashed, round the side, left out of the
//               levels); a group that only points at itself has its first box on top
//    order      inside a level, boxes are ordered by the mean place of their neighbours (a few sweeps)
//    place      each level is packed, then every box is pulled toward the middle of its neighbours
//    skipping   a line that skips levels has a waypoint in each, placed like a thin empty box, so the line
//               goes around the real boxes of that level instead of behind them
//    gathers    lines coming into one box from the level above share a bar and one line into the middle of the box
//    turns      lines leave a box straight on and turn across at a height of their own in the gap (no curves)
//    ports      lines meeting in one box arrive side by side along its near side, in the order they
//               come from, so their labels do not sit on one another
//
//  `horizontal: false` puts levels top to bottom, `true` left to right (the same picture turned: sizes
//  across the levels are the boxes' heights then). Pure JS: no React, so Node computes the same
//  geometry for antu_layout and the tests check it.
// ============================================================

/** The width a line's waypoint takes across a level, so boxes keep clear of the line */
const WAYPOINT = 16
/** How far a back line runs out beside the boxes, and between two of them */
export const BULGE = 36
export const BULGE_STEP = 26

/**
 * Boxes of one level made as wide as the widest of them, so the centres of a level's boxes are equally apart and
 * lines that gather from (or fan out to) a level come out symmetric about the box they meet.
 * @param level  Map id -> level
 * @param size   id -> { w, h, textW }
 * @returns id -> { w, h, textW }
 */
export function equalWidths(ids, level, size) {
  const widest = new Map()
  for (const id of ids) widest.set(level.get(id), Math.max(widest.get(level.get(id)) ?? 0, size(id).w))
  return (id) => {
    const own = size(id)
    const w = widest.get(level.get(id))
    return w > own.w ? { ...own, w, textW: w - 28 } : own
  }
}

/**
 * Which lines close a cycle, and the level of every box.
 * @param ids    box ids in written order
 * @param edges  [{ key, from, to }] (from -> to is the way the level grows)
 * @returns { back: Set(key), level: Map id -> level, roots: ids that nothing points to }
 */
export function classifyLayers(ids, edges) {
  const out = new Map(ids.map((id) => [id, []]))
  for (const e of edges) out.get(e.from).push(e)
  const hasIn = new Set(edges.map((e) => e.to))
  const back = new Set()
  const state = new Map() // 1 = on the stack, 2 = done
  // Depth first without recursion (a long chain must not overflow the stack): a line to a box still on the stack closes a cycle
  const walk = (start) => {
    const stack = [{ id: start, i: 0 }]
    state.set(start, 1)
    while (stack.length) {
      const top = stack.at(-1)
      const outs = out.get(top.id)
      if (top.i < outs.length) {
        const e = outs[top.i++]
        if (state.get(e.to) === 1) back.add(e.key)
        else if (!state.has(e.to)) {
          state.set(e.to, 1)
          stack.push({ id: e.to, i: 0 })
        }
      } else {
        state.set(top.id, 2)
        stack.pop()
      }
    }
  }
  for (const id of ids) if (!hasIn.has(id) && !state.has(id)) walk(id)
  for (const id of ids) if (!state.has(id)) walk(id)
  // The level of a box: one more than its highest parent, over the lines that do not close a cycle
  const kids = new Map(ids.map((id) => [id, []]))
  const waiting = new Map(ids.map((id) => [id, 0]))
  for (const e of edges) {
    if (back.has(e.key)) continue
    kids.get(e.from).push(e.to)
    waiting.set(e.to, waiting.get(e.to) + 1)
  }
  const depth = new Map(ids.map((id) => [id, 0]))
  const queue = ids.filter((id) => waiting.get(id) === 0)
  for (let i = 0; i < queue.length; i++) {
    for (const v of kids.get(queue[i])) {
      depth.set(v, Math.max(depth.get(v), depth.get(queue[i]) + 1))
      waiting.set(v, waiting.get(v) - 1)
      if (waiting.get(v) === 0) queue.push(v)
    }
  }
  const level = new Map(ids.map((id) => [id, depth.get(id)]))
  return { back, level, roots: ids.filter((id) => !hasIn.has(id)) }
}

/**
 * Place the boxes and route the lines.
 * @param ids         box ids in written order
 * @param edges       [{ key, from, to }]
 * @param size        id -> { w, h }
 * @param opts        { horizontal, gapAcross, gapAlong }
 * @returns {
 *   levels:  ids per level, in the order they stand,
 *   boxes:   Map id -> { x, y, w, h } with the content's top-left at (0, 0),
 *   links:   Map key -> { back, segs: [[p0, c1, c2, p3], ...] (the start, the two corners of the turn, the end: a polyline),
 *            via: [[x, y], ...], gathered },
 *   size:    { width, height } of boxes, waypoints and back lines,
 *   level:   Map id -> level, back: Set(key), roots
 * }
 */
export function layeredGraph(ids, edges, size, { horizontal = false, gapAcross = 40, gapAlong = 96 } = {}) {
  const { back, level, roots } = classifyLayers(ids, edges)
  // A waypoint is a thin empty box with an id of its own (never one a party could have: it starts with a NUL)
  const waypointIds = new Set()
  const isWaypoint = (id) => waypointIds.has(id)
  // Across / along the levels: the box's extent in each
  const across = (id) => (isWaypoint(id) ? WAYPOINT : horizontal ? size(id).h : size(id).w)
  const along = (id) => (isWaypoint(id) ? 0 : horizontal ? size(id).w : size(id).h)
  const pt = (a, l) => (horizontal ? [l, a] : [a, l])

  const levels = []
  for (const id of ids) (levels[level.get(id)] ??= []).push(id)
  const above = new Map(ids.map((id) => [id, []]))
  const below = new Map(ids.map((id) => [id, []]))
  const waypointsOf = new Map()
  for (const e of edges) {
    if (back.has(e.key)) continue
    const chain = [e.from]
    for (let l = level.get(e.from) + 1; l < level.get(e.to); l++) {
      const id = `\u0000wp${waypointIds.size}`
      waypointIds.add(id)
      levels[l].push(id)
      above.set(id, [])
      below.set(id, [])
      chain.push(id)
    }
    waypointsOf.set(e.key, chain.slice(1))
    chain.push(e.to)
    for (let i = 0; i + 1 < chain.length; i++) {
      above.get(chain[i + 1]).push(chain[i])
      below.get(chain[i]).push(chain[i + 1])
    }
  }

  // ── the order inside each level ──
  const sweep = (lvl, neighbours, pos) => {
    const key = new Map(
      lvl.map((id, i) => {
        const ns = neighbours.get(id).map((n) => pos.get(n)).filter((p) => p !== undefined)
        return [id, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i]
      }),
    )
    return [...lvl].sort((a, b) => key.get(a) - key.get(b)) // stable: ties keep the written order
  }
  const posOf = (lvl) => new Map(lvl.map((id, i) => [id, i]))
  for (let pass = 0; pass < 4; pass++) {
    for (let l = 1; l < levels.length; l++) levels[l] = sweep(levels[l], above, posOf(levels[l - 1]))
    for (let l = levels.length - 2; l >= 0; l--) levels[l] = sweep(levels[l], below, posOf(levels[l + 1]))
  }

  // ── across: pack each level, then pull every box toward the middle of its neighbours ──
  const centre = new Map()
  const widthOf = (lvl) => lvl.reduce((s, id) => s + across(id), 0) + gapAcross * (lvl.length - 1)
  const total = levels.length ? Math.max(...levels.map(widthOf)) : 0
  for (const lvl of levels) {
    let x = (total - widthOf(lvl)) / 2
    for (const id of lvl) {
      centre.set(id, x + across(id) / 2)
      x += across(id) + gapAcross
    }
  }
  const settle = (lvl, neighbours) => {
    const want = lvl.map((id) => {
      const ns = neighbours.get(id)
      return ns.length ? ns.reduce((s, n) => s + centre.get(n), 0) / ns.length : centre.get(id)
    })
    const pos = want.slice()
    for (let i = 1; i < lvl.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + across(lvl[i - 1]) / 2 + gapAcross + across(lvl[i]) / 2)
    // The push can only drift one way: move the whole level back by the mean of what it was pushed
    const drift = pos.reduce((s, p, i) => s + (p - want[i]), 0) / (lvl.length || 1)
    lvl.forEach((id, i) => centre.set(id, pos[i] - drift))
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let l = 1; l < levels.length; l++) settle(levels[l], above)
    for (let l = levels.length - 2; l >= 0; l--) settle(levels[l], below)
  }
  let lo = Infinity
  let hi = -Infinity
  for (const lvl of levels) {
    for (const id of lvl) {
      lo = Math.min(lo, centre.get(id) - across(id) / 2)
      hi = Math.max(hi, centre.get(id) + across(id) / 2)
    }
  }
  if (!levels.length) lo = hi = 0

  // ── along: each level a band as thick as its thickest box ──
  const boxes = new Map()
  const waypoint = new Map()
  const bandMid = []
  let cursor = 0
  levels.forEach((lvl, l) => {
    const thick = Math.max(...lvl.map(along))
    bandMid[l] = cursor + thick / 2
    for (const id of lvl) {
      const a = centre.get(id) - lo
      if (isWaypoint(id)) {
        waypoint.set(id, pt(a, cursor + thick / 2))
        continue
      }
      const [x, y] = pt(a - across(id) / 2, cursor + (thick - along(id)) / 2)
      boxes.set(id, { x, y, w: size(id).w, h: size(id).h })
    }
    cursor += thick + (l < levels.length - 1 ? gapAlong : 0)
  })

  // ── the lines ──
  // The far side of a box along the levels, and where a line enters the near side
  const farSide = (b) => (horizontal ? [b.x + b.w, b.y + b.h / 2] : [b.x + b.w / 2, b.y + b.h])
  const acrossOf = (p) => (horizontal ? p[1] : p[0])
  const withAcross = (b, a) => (horizontal ? [b.x, a] : [a, b.y])
  const startOf = (e) => {
    const wp = waypointsOf.get(e.key) ?? []
    return wp.length ? acrossOf(waypoint.get(wp.at(-1))) : acrossOf(farSide(boxes.get(e.from)))
  }
  // Lines that gather into one box from the level above (two parties or more) share one trunk: each comes
  // straight down from its party to a common bar, and one line goes from the middle of the box straight up to it
  const gathers = new Map()
  for (const id of ids) {
    const into = edges.filter((e) => !back.has(e.key) && e.to === id && !(waypointsOf.get(e.key) ?? []).length)
    if (new Set(into.map((e) => e.from)).size >= 2) gathers.set(id, into)
  }
  const gathered = new Set([...gathers.values()].flat().map((e) => e.key))
  const entry = new Map()
  for (const id of ids) {
    const b = boxes.get(id)
    const span = horizontal ? b.h : b.w
    const origin = horizontal ? b.y : b.x
    for (const e of gathers.get(id) ?? []) entry.set(e.key, origin + span / 2)
    // The other lines come in side by side across the box, in the order they come from; one line comes in at the middle
    const into = edges.filter((e) => !back.has(e.key) && e.to === id && !gathered.has(e.key)).sort((p, q) => startOf(p) - startOf(q))
    into.forEach((e, i) => entry.set(e.key, origin + (span * (i + 1)) / (into.length + 1)))
  }
  // A line between two levels leaves its box straight on, turns across at a height of its own in the gap,
  // and comes straight into the next box: squared, like a tree. Lines of one gap whose turns would run along
  // each other take different heights (the greedy tracks below).
  const route = new Map()
  const turns = new Map()
  // Parallel relations (one pair, the same way) leave their party side by side, so no two share the stretch down
  // from it; the bar and the line into the box are theirs in common, and so is nothing before that
  const LANE = 12
  const lanes = new Map()
  for (const e of edges) {
    if (back.has(e.key)) continue
    const k = `${e.from}\u0000${e.to}`
    lanes.set(k, [...(lanes.get(k) ?? []), e.key])
  }
  const leaveAt = (e) => {
    const p = farSide(boxes.get(e.from))
    const mates = lanes.get(`${e.from}\u0000${e.to}`)
    if (mates.length < 2) return p
    const b = boxes.get(e.from)
    const room = (horizontal ? b.h : b.w) / 2 - 8
    const d = Math.max(-room, Math.min(room, (mates.indexOf(e.key) - (mates.length - 1) / 2) * LANE))
    return horizontal ? [p[0], p[1] + d] : [p[0] + d, p[1]]
  }
  for (const e of edges) {
    if (back.has(e.key)) continue
    const via = (waypointsOf.get(e.key) ?? []).map((id) => waypoint.get(id))
    const pts = [leaveAt(e), ...via, withAcross(boxes.get(e.to), entry.get(e.key))]
    route.set(e.key, pts)
    for (let i = 0; i + 1 < pts.length; i++) {
      const lo = Math.min(acrossOf(pts[i]), acrossOf(pts[i + 1]))
      const hi = Math.max(acrossOf(pts[i]), acrossOf(pts[i + 1]))
      const gapKey = level.get(e.from) + i
      if (!turns.has(gapKey)) turns.set(gapKey, [])
      const list = turns.get(gapKey)
      if (gathered.has(e.key)) {
        // One bar for every line gathering into the same box
        const bar = list.find((t) => t.bar === e.to)
        if (bar) {
          bar.lo = Math.min(bar.lo, lo)
          bar.hi = Math.max(bar.hi, hi)
          bar.members.push(`${e.key}#${i}`)
        } else list.push({ bar: e.to, members: [`${e.key}#${i}`], lo, hi, track: 0 })
        continue
      }
      if (hi - lo < 0.5) continue
      list.push({ members: [`${e.key}#${i}`], lo, hi, track: 0 })
    }
  }
  const trackOf = new Map()
  for (const list of turns.values()) {
    if (!list.length) continue
    const placed = []
    list.sort((u, v) => u.lo - v.lo || u.hi - v.hi)
    for (const t of list) {
      while (placed.some((o) => o.track === t.track && Math.min(o.hi, t.hi) - Math.max(o.lo, t.lo) > 0.5)) t.track += 1
      placed.push(t)
    }
    const n = Math.max(...list.map((t) => t.track)) + 1
    for (const t of list) for (const m of t.members) trackOf.set(m, n === 1 ? 0.45 : 0.25 + (0.35 * t.track) / (n - 1))
  }
  const links = new Map()
  let backIndex = 0
  let farthest = 0
  const outOf = new Map()
  const into = new Map()
  for (const e of edges) {
    const a = boxes.get(e.from)
    const b = boxes.get(e.to)
    if (!back.has(e.key)) {
      const pts = route.get(e.key)
      const via = pts.slice(1, -1)
      const segs = []
      for (let i = 0; i + 1 < pts.length; i++) {
        const [p, q] = [pts[i], pts[i + 1]]
        const f = trackOf.get(`${e.key}#${i}`) ?? 0.45
        const mid = horizontal ? p[0] + (q[0] - p[0]) * f : p[1] + (q[1] - p[1]) * f
        segs.push(horizontal ? [p, [mid, p[1]], [mid, q[1]], q] : [p, [p[0], mid], [q[0], mid], q])
      }
      links.set(e.key, { back: false, segs, via, gathered: gathered.has(e.key) })
    } else {
      // Round the far side across the levels, out of the later box's side and into the earlier one's
      const lo2 = level.get(e.to)
      const hi2 = level.get(e.from)
      let edge = 0
      for (let l = lo2; l <= hi2; l++) for (const id of levels[l]) if (boxes.has(id)) edge = Math.max(edge, horizontal ? boxes.get(id).y + boxes.get(id).h : boxes.get(id).x + boxes.get(id).w)
      const bulge = edge + BULGE + BULGE_STEP * backIndex++
      farthest = Math.max(farthest, bulge)
      // Back lines out of one box (or into one) leave side by side, so they do not share the first stretch
      const nOut = (outOf.get(e.from) ?? 0) + 1
      const nIn = (into.get(e.to) ?? 0) + 1
      outOf.set(e.from, nOut)
      into.set(e.to, nIn)
      const spread = (n, box) => Math.min((n - 1) * 10, (horizontal ? box.w : box.h) / 2 - 6)
      const p0 = horizontal ? [a.x + a.w / 2 + spread(nOut, a), a.y + a.h] : [a.x + a.w, a.y + a.h / 2 + spread(nOut, a)]
      const p3 = horizontal ? [b.x + b.w / 2 + spread(nIn, b), b.y + b.h] : [b.x + b.w, b.y + b.h / 2 + spread(nIn, b)]
      const c1 = horizontal ? [p0[0], bulge] : [bulge, p0[1]]
      const c2 = horizontal ? [p3[0], bulge] : [bulge, p3[1]]
      links.set(e.key, { back: true, segs: [[p0, c1, c2, p3]], via: [] })
    }
  }
  const acrossExtent = Math.max(hi - lo, farthest)
  const alongExtent = cursor
  return { levels, boxes, links, level, back, roots, size: horizontal ? { width: alongExtent, height: acrossExtent } : { width: acrossExtent, height: alongExtent } }
}

/**
 * Where the labels go. A label sits on the stretch that comes into the box; lines whose labels would sit on one
 * another take other heights along it (candidates from a little past the middle towards the turn). A line whose
 * last stretch is too short has its label on the turn; a back line's label is the middle of its long stretch.
 * @param items  [{ seg: the line's last segment [p, corner1, corner2, q], w: the label's width, h: its height (a label
 *               that wraps is taller), back, gathered }]
 *               (a line that gathers into a shared bar has its label on the stretch down from its party)
 * @returns [x, y][] in the order of items
 */
export function placePills(items) {
  const rects = []
  const clash = (r) => rects.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h)
  const out = items.map(() => null)
  const rect = ([x, y], w, h = 22) => ({ x: x - w / 2 - 1, y: y - h / 2 - 1, w: w + 2, h: h + 2 })
  items.forEach((it, i) => {
    if (!it.back) return
    const [, c1, c2] = it.seg
    out[i] = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2]
    rects.push(rect(out[i], it.w, it.h))
  })
  items.forEach((it, i) => {
    if (it.back) return
    const [p, c1, c2, q] = it.seg
    if (it.gathered && Math.hypot(c1[0] - p[0], c1[1] - p[1]) >= 28) {
      // On the line coming down from its party to the bar, at one of three heights; failing that slid to one side of
      // it (a wide label may hang beside its line, which still runs through it)
      const slide = it.w / 2 - 14
      const spots = (slide > 8 ? [0, slide, -slide] : [0]).flatMap((dx) => [0.3, 0.75, 0.52].map((f) => [p[0] + (c1[0] - p[0]) * f + dx, p[1] + (c1[1] - p[1]) * f]))
      out[i] = spots.find((c) => !clash(rect(c, it.w, it.h))) ?? spots[0]
      rects.push(rect(out[i], it.w, it.h))
      return
    }
    const last = Math.hypot(q[0] - c2[0], q[1] - c2[1])
    const slide = it.w / 2 - 14
    const cands =
      last >= 30
        ? (slide > 8 ? [0, slide, -slide] : [0]).flatMap((dx) => [0.55, 0.2, 0.38, 0.72].map((f) => [c2[0] + (q[0] - c2[0]) * f + dx, c2[1] + (q[1] - c2[1]) * f]))
        : [Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) > 0.5 ? [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2] : [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]]
    const pick = cands.find((c) => !clash(rect(c, it.w, it.h))) ?? cands[0]
    out[i] = pick
    rects.push(rect(pick, it.w, it.h))
  })
  return out
}

/** The SVG path of a link's segments: straight stretches and right-angle turns, no curves */
export function pathOf(segs, dx = 0, dy = 0) {
  const f = ([x, y]) => `${x + dx} ${y + dy}`
  return `M ${f(segs[0][0])}` + segs.map(([, c1, c2, p3]) => ` L ${f(c1)} L ${f(c2)} L ${f(p3)}`).join('')
}
