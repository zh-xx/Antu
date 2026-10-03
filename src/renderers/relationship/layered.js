// ============================================================
//  src/renderers/relationship/layered.js — boxes in levels, lines between levels (shared)
//
//  The equity tree, the authority chart, the relation path and the camp summary all put boxes in levels
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
  const walk = (id) => {
    state.set(id, 1)
    for (const e of out.get(id)) {
      if (state.get(e.to) === 1) back.add(e.key)
      else if (!state.has(e.to)) walk(e.to)
    }
    state.set(id, 2)
  }
  for (const id of ids) if (!hasIn.has(id) && !state.has(id)) walk(id)
  for (const id of ids) if (!state.has(id)) walk(id)
  const parents = new Map(ids.map((id) => [id, []]))
  for (const e of edges) if (!back.has(e.key)) parents.get(e.to).push(e.from)
  const level = new Map()
  const depth = (id) => {
    if (level.has(id)) return level.get(id)
    const ps = parents.get(id)
    const d = ps.length ? 1 + Math.max(...ps.map(depth)) : 0
    level.set(id, d)
    return d
  }
  for (const id of ids) depth(id)
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
 *   links:   Map key -> { back, segs: [[p0, c1, c2, p3], ...], via: [[x, y], ...] },
 *   size:    { width, height } of boxes, waypoints and back lines,
 *   level:   Map id -> level, back: Set(key), roots
 * }
 */
export function layeredGraph(ids, edges, size, { horizontal = false, gapAcross = 40, gapAlong = 96 } = {}) {
  const { back, level, roots } = classifyLayers(ids, edges)
  // Across / along the levels: the box's extent in each
  const across = (id) => (id.startsWith('~') ? WAYPOINT : horizontal ? size(id).h : size(id).w)
  const along = (id) => (id.startsWith('~') ? 0 : horizontal ? size(id).w : size(id).h)
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
      const id = `~${e.key}~${l}`
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
      if (id.startsWith('~')) {
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
  const entry = new Map()
  for (const id of ids) {
    const into = edges.filter((e) => !back.has(e.key) && e.to === id).sort((p, q) => startOf(p) - startOf(q))
    const b = boxes.get(id)
    const span = horizontal ? b.h : b.w
    const origin = horizontal ? b.y : b.x
    into.forEach((e, i) => entry.set(e.key, origin + (span * (i + 1)) / (into.length + 1)))
  }
  const links = new Map()
  let backIndex = 0
  let farthest = 0
  for (const e of edges) {
    const a = boxes.get(e.from)
    const b = boxes.get(e.to)
    if (!back.has(e.key)) {
      const via = (waypointsOf.get(e.key) ?? []).map((id) => waypoint.get(id))
      const end = withAcross(b, entry.get(e.key))
      const pts = [farSide(a), ...via, end]
      const segs = []
      for (let i = 0; i + 1 < pts.length; i++) {
        const [p, q] = [pts[i], pts[i + 1]]
        const mid = horizontal ? (p[0] + q[0]) / 2 : (p[1] + q[1]) / 2
        segs.push(horizontal ? [p, [mid, p[1]], [mid, q[1]], q] : [p, [p[0], mid], [q[0], mid], q])
      }
      links.set(e.key, { back: false, segs, via })
    } else {
      // Round the far side across the levels, out of the later box's side and into the earlier one's
      const lo2 = level.get(e.to)
      const hi2 = level.get(e.from)
      let edge = 0
      for (let l = lo2; l <= hi2; l++) for (const id of levels[l]) if (boxes.has(id)) edge = Math.max(edge, horizontal ? boxes.get(id).y + boxes.get(id).h : boxes.get(id).x + boxes.get(id).w)
      const bulge = edge + BULGE + BULGE_STEP * backIndex++
      farthest = Math.max(farthest, bulge)
      const p0 = horizontal ? [a.x + a.w / 2, a.y + a.h] : [a.x + a.w, a.y + a.h / 2]
      const p3 = horizontal ? [b.x + b.w / 2, b.y + b.h] : [b.x + b.w, b.y + b.h / 2]
      const c1 = horizontal ? [p0[0], bulge] : [bulge, p0[1]]
      const c2 = horizontal ? [p3[0], bulge] : [bulge, p3[1]]
      links.set(e.key, { back: true, segs: [[p0, c1, c2, p3]], via: [] })
    }
  }
  const acrossExtent = Math.max(hi - lo, farthest)
  const alongExtent = cursor
  return { levels, boxes, links, level, back, roots, size: horizontal ? { width: alongExtent, height: acrossExtent } : { width: acrossExtent, height: alongExtent } }
}

/** A cubic's point at t (the place of a label on a line) */
export function bezierAt([p0, p1, p2, p3], tt) {
  const u = 1 - tt
  return [u * u * u * p0[0] + 3 * u * u * tt * p1[0] + 3 * u * tt * tt * p2[0] + tt * tt * tt * p3[0], u * u * u * p0[1] + 3 * u * u * tt * p1[1] + 3 * u * tt * tt * p2[1] + tt * tt * tt * p3[1]]
}

/** The SVG path of a link's segments */
export function pathOf(segs, dx = 0, dy = 0) {
  const f = ([x, y]) => `${x + dx} ${y + dy}`
  return `M ${f(segs[0][0])}` + segs.map(([, c1, c2, p3]) => ` C ${f(c1)} ${f(c2)} ${f(p3)}`).join('')
}
