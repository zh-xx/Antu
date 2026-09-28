// ============================================================
//  src/renderers/procedure/flow/route.js — routing the links of the flowchart (pure computation)
//
//  Input: the placed nodes and the layer rows from layout.js. Output: one orthogonal polyline
//  per link, plus where its condition label goes. The one rule everything here serves:
//
//      **no link runs behind a node it does not belong to.**
//
//  A line that disappears under one box and reappears past another cannot be followed; the
//  first rendering had 10 of 37 links in contract 01 doing that. The rule is pinned by
//  test/procedure-layout.test.mjs for every real contract in both orientations.
//
//  Where lines are allowed to run (all node-free by construction):
//    gaps      the strip between two layers (layerGap deep). Runs across the flow live here
//    channels  vertical corridors: every column centre, and the middle of every gutter
//              between two columns, including one outside each edge. A gutter is always free,
//              because no node is wider than the column pitch minus GAP_X; a column centre is
//              free only where that column has no node, which is checked
//  Several lines in one gap or channel are spread onto tracks TRACK apart, so two different
//  links never lie on top of each other. Lines that *should* coincide share a key and a track:
//  the branches leaving one source share their fork, the back edges into one target share
//  their lane.
//
//  Three kinds of link:
//    adjacent layers  down into the gap below the source, across, down into the target
//    longer forward   down into the gap below the source, across to a free channel, down the
//                     channel to the gap above the target, across, down into the target
//    back edge        out of the source's side, along the nearest channel on that side that
//                     reaches the target without crossing a node, into the target's side.
//                     Edges into one target share that channel. Only when no side route
//                     exists does it leave the bottom and enter the top through the gaps.
//
//  Everything is computed in (along, across) coordinates — along = the direction the layers
//  run, across = within a layer — and mapped to (x, y) at the end, so the vertical and the
//  horizontal diagram are one algorithm.
// ============================================================

import { TRACK } from './metrics.js'

/** Track offsets tried in order: centre first, then alternating outwards */
const OFFSETS = [0, TRACK, -TRACK, 2 * TRACK, -2 * TRACK, 3 * TRACK, -3 * TRACK]

/**
 * In a gap, a fork (the runs leaving one source) keeps to the source's half and a merge (the
 * runs arriving at one target) to the target's half. If they interleaved, a merge arriving above
 * a fork would join the fork's drop and read as one line carrying on into the wrong branch.
 */
const FORK_OFFSETS = [0, -TRACK, -2 * TRACK, -3 * TRACK, TRACK, 2 * TRACK, 3 * TRACK]
const MERGE_OFFSETS = [2 * TRACK, 3 * TRACK, 4 * TRACK, TRACK, 0, -TRACK, -2 * TRACK]

/** How far a link may land beside its node's centre, when the centre is taken */
const PORT_SHIFTS = [0, TRACK, -TRACK, 2 * TRACK, -2 * TRACK]

/** Two tracks closer than this count as the same line */
const SAME_LINE = TRACK / 2 + 0.5

/** Where a label on a lane or channel sits: this far from the corner it turns at */
const BACK_LABEL_OFFSET = 16

const overlaps = (lo1, hi1, lo2, hi2, pad = 0) => hi1 > lo2 - pad && lo1 < hi2 + pad

/** Drop repeated points and middle points of straight stretches */
function simplify(points) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - p[0]) < 0.01 && Math.abs(last[1] - p[1]) < 0.01) continue
    out.push(p)
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]]
    const sameX = Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01
    const sameY = Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01
    if (sameX || sameY) out.splice(i, 1)
  }
  return out
}

/**
 * Route every link.
 *
 * @param groups     [{ from, to, isBack, isMain, label, merged }] one per link (edges between the
 *                   same pair already merged)
 * @param boxes      Map id -> { a0, a1, c0, c1, am, cm, row } in along/across coordinates
 * @param rows       [{ along, extent }] in layer order
 * @param channels   across positions of the column centres and the gutters between columns
 * @param vertical   the orientation, only used to map to x/y at the end
 * @param gap        the depth of the gap between two layers (layerGap in metrics.js)
 * @returns [{ from, to, points, labelAt, labelAnchor }] in the order of groups
 */
export function routeLinks({ groups, boxes, rows, channels, vertical, gap }) {
  const all = [...boxes.entries()]
  const P = (a, c) => (vertical ? [c, a] : [a, c])

  // ── obstacles: node boxes ─────────────────────────────────
  /** a run along the flow at across c, from along lo to hi: does it touch a node other than `skip`? */
  const blockedA = (c, lo, hi, skip = []) =>
    all.some(
      ([id, b]) =>
        !skip.includes(id) && c > b.c0 - 3 && c < b.c1 + 3 && overlaps(Math.min(lo, hi), Math.max(lo, hi), b.a0 + 1, b.a1 - 1),
    )
  /** a run across the flow at along a, from across lo to hi */
  const blockedC = (a, lo, hi, skip = []) =>
    all.some(
      ([id, b]) =>
        !skip.includes(id) && a > b.a0 - 3 && a < b.a1 + 3 && overlaps(Math.min(lo, hi), Math.max(lo, hi), b.c0 + 1, b.c1 - 1),
    )

  // ── occupancy: lines already laid ─────────────────────────
  // A run carries one or more keys; a new run may lie on it only if it shares one. A straight
  // link carries two: it is its source's fork (siblings leave along it) and its target's merge
  // (other links arrive along it).
  const occA = [] // { c, lo, hi, keys }
  const occC = [] // { a, lo, hi, keys }
  const keysOf = (key) => (Array.isArray(key) ? key : [key])
  const clash = (o, key, lo, hi) =>
    !keysOf(key).some((k) => o.keys.includes(k)) && overlaps(Math.min(lo, hi), Math.max(lo, hi), o.lo, o.hi, 4)
  const freeA = (c, lo, hi, key) => !occA.some((o) => Math.abs(o.c - c) < SAME_LINE && clash(o, key, lo, hi))
  const freeC = (a, lo, hi, key) => !occC.some((o) => Math.abs(o.a - a) < SAME_LINE && clash(o, key, lo, hi))
  const takeA = (c, lo, hi, key) => occA.push({ c, lo: Math.min(lo, hi), hi: Math.max(lo, hi), keys: keysOf(key) })
  const takeC = (a, lo, hi, key) => occC.push({ a, lo: Math.min(lo, hi), hi: Math.max(lo, hi), keys: keysOf(key) })

  // ── gaps ──────────────────────────────────────────────────
  const gapAfter = (i) => rows[i].along + rows[i].extent + gap / 2
  const gapBefore = (i) => (i === 0 ? rows[0].along - gap / 2 : gapAfter(i - 1))

  /**
   * Claim a track in the gap centred at `centre`, for a run across the gap.
   * `drops` are the short runs along that join the track to a box: [{ c, end, key, fixed }], a
   * run at across c between the track and along `end`. The run across spans the drops and
   * `also` (a channel position, when the run leads to one). Drops are checked and claimed with
   * the track: a free track whose drop lands on another link's drop is still two lines as one.
   *
   * A drop may leave its node's centre by a track or two when the centre is taken (a box's edge
   * is flat, so any point on it is on the boundary; a diamond has only its tip, so `fixed`).
   * This is what lets two links cross in one gap: whichever way their runs are stacked, with
   * both drops on the centres one of them lies on the other.
   *
   * Returns { a, cs }: the track, and where each drop ended up across.
   */
  const claimGap = (centre, key, drops, also) => {
    const offsets = key.startsWith('in:') ? MERGE_OFFSETS : FORK_OFFSETS
    const shiftSets = drops
      .reduce((sets, d) => sets.flatMap((set) => (d.fixed ? [0] : PORT_SHIFTS).map((sh) => [...set, sh])), [[]])
      .sort((p, q) => p.reduce((n, v) => n + Math.abs(v), 0) - q.reduce((n, v) => n + Math.abs(v), 0))
    const spanOf = (cs) => {
      const xs = also === undefined ? cs : [...cs, also]
      return [Math.min(...xs), Math.max(...xs)]
    }
    for (const off of offsets) {
      const a = centre + off
      for (const shifts of shiftSets) {
        const cs = drops.map((d, i) => d.c + shifts[i])
        const [lo, hi] = spanOf(cs)
        if (!freeC(a, lo, hi, key)) continue
        if (!drops.every((d, i) => freeA(cs[i], d.end, a, d.key))) continue
        takeC(a, lo, hi, key)
        drops.forEach((d, i) => takeA(cs[i], d.end, a, d.key))
        return { a, cs }
      }
    }
    // Nothing is free: take the centre and accept the overlap rather than fail
    const cs = drops.map((d) => d.c)
    takeC(centre, ...spanOf(cs), key)
    drops.forEach((d) => takeA(d.c, d.end, centre, d.key))
    return { a: centre, cs }
  }

  /**
   * The cheapest free channel track for a run along from lo to hi. `accept(x)` narrows the
   * candidates (a back edge wants one side only); `cost(x)` ranks them.
   */
  const pickChannel = (lo, hi, key, cost, accept = () => true) => {
    let best = null
    for (const ch of channels) {
      for (const off of OFFSETS) {
        const x = ch + off
        if (!accept(x)) continue
        if (blockedA(x, lo, hi)) continue
        if (!freeA(x, lo, hi, key)) continue
        const cst = cost(x) + Math.abs(off) * 0.25
        if (!best || cst < best.cost) best = { x, cost: cst }
      }
    }
    return best?.x
  }

  /** Label on the last approach into the target, never inside it */
  //   rise  vertical: starts right of the line, grows upwards from just above the target
  //   lead  horizontal: ends just before the target, sits above the line
  const approachLabel = (t) =>
    vertical
      ? { labelAt: { x: t.cm + 6, y: t.a0 - 3 }, labelAnchor: 'rise' }
      : { labelAt: { x: t.a0 - 3, y: t.cm - 4 }, labelAnchor: 'lead' }

  // Order matters for who gets the centre track: the main line, then adjacent-layer links (the
  // skeleton of the diagram), then longer forward links, then back edges.
  const order = groups
    .map((g, i) => ({ g, i }))
    .sort((p, q) => rank(p.g, boxes) - rank(q.g, boxes) || p.i - q.i)

  const result = new Array(groups.length)
  const backLane = new Map() // target -> across position of its shared lane

  for (const { g, i } of order) {
    const s = boxes.get(g.from)
    const t = boxes.get(g.to)
    let pts
    let label = null

    if (!g.isBack) {
      const span = t.row - s.row
      const out = `out:${g.from}`
      if (span === 1) {
        if (Math.abs(s.cm - t.cm) < 0.5) {
          pts = [[s.a1, s.cm], [t.a0, t.cm]]
          takeA(s.cm, s.a1, t.a0, [out, `in:${g.to}`])
        } else {
          const { a, cs } = claimGap(gapAfter(s.row), out, [
            { c: s.cm, end: s.a1, key: out, fixed: s.tip },
            { c: t.cm, end: t.a0, key: `in:${g.to}`, fixed: t.tip },
          ])
          pts = [[s.a1, cs[0]], [a, cs[0]], [a, cs[1]], [t.a0, cs[1]]]
        }
      } else if (
        Math.abs(s.cm - t.cm) < 0.5 &&
        !blockedA(s.cm, s.a1, t.a0, [g.from, g.to]) &&
        freeA(s.cm, s.a1, t.a0, [out, `in:${g.to}`])
      ) {
        // Same column and nothing in between: straight down
        pts = [[s.a1, s.cm], [t.a0, t.cm]]
        takeA(s.cm, s.a1, t.a0, [out, `in:${g.to}`])
      } else {
        const gs = gapAfter(s.row)
        const gt = gapBefore(t.row)
        const key = `e:${g.from}->${g.to}`
        const x = pickChannel(gs, gt, key, (x) => Math.abs(x - s.cm) + Math.abs(x - t.cm)) ?? s.cm
        const { a: a1, cs: [sc] } = claimGap(gs, out, [{ c: s.cm, end: s.a1, key: out, fixed: s.tip }], x)
        const { a: a2, cs: [tc] } = claimGap(gt, `in:${g.to}`, [{ c: t.cm, end: t.a0, key: `in:${g.to}`, fixed: t.tip }], x)
        takeA(x, a1, a2, key)
        pts = [[s.a1, sc], [a1, sc], [a1, x], [a2, x], [a2, tc], [t.a0, tc]]
        // On its own channel just after the fork: the target's approach may be shared with a
        // merge, the channel never is
        const at = P(a1 + BACK_LABEL_OFFSET, x)
        label = { labelAt: { x: at[0], y: at[1] }, labelAnchor: 'center' }
      }
      label ??= approachLabel(t)
    } else {
      const key = `back:${g.to}`
      // Side route: out of one side of the source, along a channel, into one side of the target.
      // All four pairings are tried: both on the right or both on the left (the loop goes round
      // the outside of both), or each on the side facing the other (the loop runs between them,
      // usually the shortest when they sit in neighbouring columns).
      let best = null
      for (const sSide of [1, -1]) {
        for (const tSide of [1, -1]) {
          const sEdge = sSide > 0 ? s.c1 : s.c0
          const tEdge = tSide > 0 ? t.c1 : t.c0
          const cost = (x) => Math.abs(x - sEdge) + Math.abs(x - tEdge) - (backLane.get(g.to) === x ? 1000 : 0)
          const x = pickChannel(
            t.am,
            s.am,
            key,
            cost,
            (x) =>
              (sSide > 0 ? x > s.c1 + 2 : x < s.c0 - 2) &&
              (tSide > 0 ? x > t.c1 + 2 : x < t.c0 - 2) &&
              !blockedC(s.am, sEdge, x, [g.from]) &&
              !blockedC(t.am, x, tEdge, [g.to]) &&
              freeC(s.am, sEdge, x, key) &&
              freeC(t.am, x, tEdge, key),
          )
          if (x === undefined) continue
          if (!best || cost(x) < best.cost) best = { x, sEdge, tEdge, cost: cost(x) }
        }
      }
      if (best) {
        const { x, sEdge, tEdge } = best
        backLane.set(g.to, x)
        takeC(s.am, sEdge, x, key)
        takeC(t.am, x, tEdge, key)
        takeA(x, t.am, s.am, key)
        pts = [[s.am, sEdge], [s.am, x], [t.am, x], [t.am, tEdge]]
        const at = P(s.am - BACK_LABEL_OFFSET, x)
        label = { labelAt: { x: at[0], y: at[1] }, labelAnchor: 'center' }
      } else {
        // No clear side: leave the bottom, climb a channel through the gaps, enter the top
        const gs = gapAfter(s.row)
        const gt = gapBefore(t.row)
        // Back edges into one target share this lane too, whenever it is free for them
        const x =
          pickChannel(gt, gs, key, (x) => Math.abs(x - s.cm) + Math.abs(x - t.cm) - (backLane.get(g.to) === x ? 1000 : 0)) ??
          s.cm
        backLane.set(g.to, x)
        const { a: a1, cs: [sc] } = claimGap(gs, `out:${g.from}`, [{ c: s.cm, end: s.a1, key: `out:${g.from}`, fixed: s.tip }], x)
        const { a: a2, cs: [tc] } = claimGap(gt, `in:${g.to}`, [{ c: t.cm, end: t.a0, key: `in:${g.to}`, fixed: t.tip }], x)
        takeA(x, a2, a1, key)
        pts = [[s.a1, sc], [a1, sc], [a1, x], [a2, x], [a2, tc], [t.a0, tc]]
        const at = P(a1 - BACK_LABEL_OFFSET, x)
        label = { labelAt: { x: at[0], y: at[1] }, labelAnchor: 'center' }
      }
    }

    result[i] = {
      from: g.from,
      to: g.to,
      points: simplify(pts.map(([a, c]) => P(a, c))),
      labelAt: label.labelAt,
      labelAnchor: label.labelAnchor,
    }
  }
  return result
}

/**
 * Routing order: the main line first (it should be the straightest thing on the page), then
 * adjacent-layer forward links, then longer forward links, then back edges
 */
function rank(g, boxes) {
  if (g.isMain) return -1
  if (g.isBack) return 2
  return boxes.get(g.to).row - boxes.get(g.from).row === 1 ? 0 : 1
}
