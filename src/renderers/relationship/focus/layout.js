// ============================================================
//  src/renderers/relationship/focus/layout.js — the focus view (issue #87): one party in the middle
//
//  The second way of drawing a relationship diagram, from the same JSON as the graph. A case with
//  many parties is hard to read as one graph, so this answers "who is this party tied to, and how"
//  for one party at a time:
//
//    centre     one party. By default the one with most relations (ties: the first written); the
//               reader picks another and the whole picture is laid out again around it
//    ring 1     every party directly related to the centre, around it, with a camp's parties kept
//               together: the first group on the left, the second on the right, the rest on top
//    ring 2..   the parties reached through them (two steps, three...), each ring outside the last
//    islands    parties no relation path reaches from the centre are not dropped: each connected
//               group of them is laid out the same way around its own busiest party, and the
//               islands are set in rows under the picture
//
//  Relations touching the centre are drawn in full; the rest are drawn lighter (`faint`), so a
//  guarantee between two outer parties is still there but does not compete.
//
//  Pure JS, so Node computes the same geometry for antu_layout and the tests check every example:
//  boxes never overlap, and a line never runs through a box that is not one of its ends.
//
//  Entity boxes, label boxes and relation paint are the graph's (graph/metrics.js, palette.js), so
//  the two kinds cannot disagree on how big a party is.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { labelOf } from '../graph/layout.js'
import { sizeOf, labelBox, PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

/** The rings are ellipses, wider than tall (a screen is) */
export const ASPECT = 1.5
/** Clear space kept between two boxes, and around a box for a line to pass */
const BOX_GAP = 14
const LINE_CLEAR = 4
/** Between two rings, over the boxes' own sizes: room for the arcs that go round the inner ring */
const RING_GAP = 100
/** The first ring's distance from the centre, over the boxes' own sizes */
const FIRST_GAP = 90
/** A camp's name over its parties' boxes */
export const CAMP_TAG_H = 18
/** Islands: the gap between two, and the gap between the picture and the islands' caption */
const ISLAND_GAP = 56
const ISLAND_ROW_GAP = 64
export const NOTE_H = 24
/** Parallel relations between one pair of parties are drawn this far apart */
const PARALLEL_STEP = 14

const rectOf = (p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })
const centreOf = (r) => [r.x + r.w / 2, r.y + r.h / 2]
const overlaps = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m

/** Does the segment p-q touch the rectangle r, grown by m on every side (slab method)? */
export function segmentHitsRect(p, q, r, m = 0) {
  let t0 = 0
  let t1 = 1
  const d = [q[0] - p[0], q[1] - p[1]]
  const lo = [r.x - m, r.y - m]
  const hi = [r.x + r.w + m, r.y + r.h + m]
  for (let a = 0; a < 2; a += 1) {
    if (Math.abs(d[a]) < 1e-9) {
      if (p[a] < lo[a] || p[a] > hi[a]) return false
    } else {
      let ta = (lo[a] - p[a]) / d[a]
      let tb = (hi[a] - p[a]) / d[a]
      if (ta > tb) [ta, tb] = [tb, ta]
      t0 = Math.max(t0, ta)
      t1 = Math.min(t1, tb)
      if (t0 > t1) return false
    }
  }
  return true
}

/** Where the ray from the middle of a box toward `to` leaves the box (a little outside it) */
export function clipToBox(r, to, outset = 2) {
  const [cx, cy] = centreOf(r)
  const dx = to[0] - cx
  const dy = to[1] - cy
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [cx, cy - r.h / 2 - outset]
  const k = Math.min((r.w / 2 + outset) / (Math.abs(dx) || 1e-9), (r.h / 2 + outset) / (Math.abs(dy) || 1e-9))
  return [cx + dx * k, cy + dy * k]
}

/** Parties by number of relations: the default centre is the busiest, the first written on a tie */
export function defaultCentre(spec) {
  const degree = new Map((spec?.entities ?? []).map((e) => [e.id, 0]))
  for (const r of spec?.relations ?? []) {
    if (degree.has(r.from)) degree.set(r.from, degree.get(r.from) + 1)
    if (degree.has(r.to)) degree.set(r.to, degree.get(r.to) + 1)
  }
  let best = null
  for (const e of spec?.entities ?? []) if (best === null || degree.get(e.id) > degree.get(best)) best = e.id
  return best
}

/** The connected groups of parties (relations read both ways), each in written order, first-written group first */
export function componentsOf(spec) {
  const ids = (spec?.entities ?? []).map((e) => e.id)
  const next = new Map(ids.map((id) => [id, []]))
  for (const r of spec?.relations ?? []) {
    if (next.has(r.from) && next.has(r.to)) {
      next.get(r.from).push(r.to)
      next.get(r.to).push(r.from)
    }
  }
  const seen = new Set()
  const out = []
  for (const id of ids) {
    if (seen.has(id)) continue
    const comp = []
    const queue = [id]
    seen.add(id)
    while (queue.length) {
      const x = queue.shift()
      comp.push(x)
      for (const y of next.get(x)) {
        if (seen.has(y)) continue
        seen.add(y)
        queue.push(y)
      }
    }
    out.push(ids.filter((i) => comp.includes(i)))
  }
  return out
}

/**
 * Push apart angles that would put two boxes closer than they may stand on a circle of radius R.
 * Each box is taken as the disc round it, so the angle two neighbours need is exact for a circle (and
 * enough for an ellipse stretched sideways, which only widens distances). The order is kept; the
 * angles move as little as they can. Returns null when the ring cannot hold them at this radius.
 */
export function spreadAngles(desired, halves, R, gap = BOX_GAP) {
  const n = desired.length
  if (n <= 1) return [...desired]
  const TAU = Math.PI * 2
  const norm = (a) => ((a % TAU) + TAU) % TAU
  const order = desired.map((a, i) => i).sort((x, y) => norm(desired[x]) - norm(desired[y]))
  const a = order.map((i) => norm(desired[i]))
  const need = order.map((i, k) => 2 * Math.asin(Math.min(1, (halves[i] + halves[order[(k + 1) % n]] + gap) / (2 * R))))
  if (need.reduce((s, x) => s + x, 0) > TAU) return null
  let settled = false
  for (let iter = 0; iter < 400 && !settled; iter += 1) {
    settled = true
    for (let k = 0; k < n; k += 1) {
      const j = (k + 1) % n
      const space = a[j] + (j === 0 ? TAU : 0) - a[k]
      if (space < need[k] - 1e-9) {
        const push = (need[k] - space) / 2
        a[k] -= push
        a[j] += push
        settled = false
      }
    }
  }
  if (!settled) return null
  const out = new Array(n)
  order.forEach((i, k) => (out[i] = a[k]))
  return out
}

/**
 * Lay out one connected group around `centre`, in a frame whose origin is the centre's middle.
 * @returns { boxes: Map id -> {x,y,w,h,ring,angle}, rings: id[][], radii: number[], halves: number[] }
 */
export function placeRings(entities, relations, centre, sizes, campOf, labelWOf = () => 0) {
  const ids = new Set(entities.map((e) => e.id))
  const order = new Map(entities.map((e, i) => [e.id, i]))
  const next = new Map(entities.map((e) => [e.id, []]))
  for (const r of relations) {
    if (ids.has(r.from) && ids.has(r.to)) {
      next.get(r.from).push(r.to)
      next.get(r.to).push(r.from)
    }
  }
  // Rings by the number of steps from the centre
  const ring = new Map([[centre, 0]])
  const rings = [[centre]]
  for (let k = 0; rings[k]?.length; k += 1) {
    const layer = []
    for (const x of rings[k]) {
      for (const y of next.get(x)) {
        if (ring.has(y)) continue
        ring.set(y, k + 1)
        layer.push(y)
      }
    }
    if (layer.length) rings.push([...new Set(layer)].sort((a, b) => order.get(a) - order.get(b)))
    else break
  }

  const box = (id) => ({ w: sizes.get(id).w, h: sizes.get(id).h })
  const half = (id) => Math.hypot(box(id).w, box(id).h) / 2
  const boxes = new Map()
  boxes.set(centre, { x: -box(centre).w / 2, y: -box(centre).h / 2, ...box(centre), ring: 0, angle: 0 })
  const radii = [0]
  const halves = [half(centre)]
  const at = (angle, R) => [Math.cos(angle) * R * ASPECT, Math.sin(angle) * R]

  for (let k = 1; k < rings.length; k += 1) {
    const members = rings[k]
    const hk = Math.max(...members.map(half))
    // Desired angles. Ring 1: a camp's parties together, the first group on the left (the clockwise
    // order left, top, right is a, neutral, b). Further rings: where their parents stand.
    let angles
    if (k === 1) {
      // Blocks, each centred where its camp stands: the first group on the left, the second on the
      // right, the rest split between the top and the bottom. Within a block, written order runs
      // top to bottom (the sides) or left to right (top and bottom).
      const s = (Math.PI * 2) / members.length
      const a = members.filter((id) => campOf(id) === 'a')
      const b = members.filter((id) => campOf(id) === 'b')
      const n = members.filter((id) => campOf(id) === 'n')
      const top = n.slice(0, Math.ceil(n.length / 2))
      const bottom = n.slice(Math.ceil(n.length / 2))
      const byId = new Map()
      a.forEach((id, i) => byId.set(id, Math.PI + ((a.length - 1) / 2 - i) * s))
      b.forEach((id, i) => byId.set(id, (i - (b.length - 1) / 2) * s))
      top.forEach((id, i) => byId.set(id, (3 * Math.PI) / 2 + (i - (top.length - 1) / 2) * s))
      bottom.forEach((id, i) => byId.set(id, Math.PI / 2 - (i - (bottom.length - 1) / 2) * s))
      angles = members.map((id) => byId.get(id))
    } else {
      angles = members.map((id) => {
        const parents = next.get(id).filter((p) => ring.get(p) === k - 1).map((p) => boxes.get(p).angle)
        // circular mean of the parents' angles
        const s = parents.reduce((n, a) => n + Math.sin(a), 0)
        const c = parents.reduce((n, a) => n + Math.cos(a), 0)
        return Math.atan2(s, c)
      })
      // Children of one parent share an angle: spread them
      const groups = new Map()
      members.forEach((id, i) => {
        const key = angles[i].toFixed(4)
        groups.set(key, [...(groups.get(key) ?? []), i])
      })
      for (const idx of groups.values()) idx.forEach((i, j) => (angles[i] += (j - (idx.length - 1) / 2) * 0.16))
    }
    // The radius: at least clear of the ring inside, then grown until nothing in this ring touches anything
    // A line between two rings carries its label, so the room between them grows with the widest label
    const labelRoom = 0.4 * Math.max(0, ...relations.filter((r) => (ring.get(r.from) === k - 1 && ring.get(r.to) === k) || (ring.get(r.to) === k - 1 && ring.get(r.from) === k)).map(labelWOf))
    let R = (k === 1 ? halves[0] + hk + FIRST_GAP : radii[k - 1] + halves[k - 1] + hk + RING_GAP) + labelRoom
    const place = (final) => {
      members.forEach((id, i) => {
        const [x, y] = at(final[i], R)
        boxes.set(id, { x: x - box(id).w / 2, y: y - box(id).h / 2, ...box(id), ring: k, angle: final[i] })
      })
    }
    const halvesOfMembers = members.map(half)
    for (let tries = 0; tries < 200; tries += 1) {
      // Angles that keep neighbours apart at this radius; if the ring cannot hold them, widen it
      const final = spreadAngles(angles, halvesOfMembers, R)
      if (!final) {
        R *= 1.06
        continue
      }
      place(final)
      // Exact check against everything inside and the rest of this ring (the discs were conservative; this is a guard)
      const clash = members.some((a, i) =>
        [...boxes.entries()].some(([other, b]) => other !== a && (ring.get(other) < k || members.indexOf(other) > i) && overlaps(rectOf(boxes.get(a)), rectOf(b), BOX_GAP)),
      )
      if (!clash) break
      R *= 1.03
    }
    radii.push(R)
    halves.push(hk)
  }
  return { boxes, rings, radii, halves, ring, at }
}

/** Every box a line may not cross, except the two it joins */
const othersOf = (boxes, a, b) => [...boxes.entries()].filter(([id]) => id !== a && id !== b).map(([, r]) => rectOf(r))

/**
 * A smooth curve through the points (Catmull-Rom as cubic Béziers), and the polyline it is sampled
 * as for the hit tests and the label.
 */
function smoothThrough(pts) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  const sampled = [pts[0]]
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const u = 1 - t
      sampled.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ])
    }
  }
  return { points: sampled, d }
}

const polyHits = (pts, rects, m) => pts.slice(1).some((q, i) => rects.some((r) => segmentHitsRect(pts[i], q, r, m)))

/** The label's rectangle, centred at a spot along the line, tried at a few places: least overlap wins */
function placeLabel(points, size, boxes, labels, lines) {
  const segs = points.slice(1).map((q, i) => [points[i], q])
  const lens = segs.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]))
  const total = lens.reduce((n, l) => n + l, 0)
  const pointAt = (f) => {
    let left = total * f
    for (let i = 0; i < segs.length; i += 1) {
      if (left <= lens[i] || i === segs.length - 1) {
        const t = lens[i] ? Math.min(1, left / lens[i]) : 0
        return [segs[i][0][0] + (segs[i][1][0] - segs[i][0][0]) * t, segs[i][0][1] + (segs[i][1][1] - segs[i][0][1]) * t]
      }
      left -= lens[i]
    }
    return points[0]
  }
  let best = null
  for (const f of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
    const [cx, cy] = pointAt(f)
    const r = { x: cx - size.width / 2, y: cy - size.height / 2, w: size.width, h: size.height }
    const bad =
      boxes.filter((b) => overlaps(r, b, 2)).length * 50 +
      labels.filter((l) => overlaps(r, l, 2)).length * 20 +
      lines.filter((pts) => polyHits(pts, [r], 0)).length * 4 +
      Math.abs(f - 0.5)
    if (!best || bad < best.bad) best = { bad, x: r.x, y: r.y }
  }
  return { x: best.x, y: best.y }
}

/**
 * Lay out one relationship spec in the focus view.
 *
 * The signature matches the other kinds' (spec, fields, view, orientation) because the registry calls
 * them all alike; the focus view has no views or orientation. `fields.t` is the interface language's
 * translate function (the default text on a relation with no label), `fields.centre` the id of the
 * party in the middle (default: the busiest; an unknown id means the default).
 */
export function buildFocusGraph(spec, fields = {}) {
  const errors = validateRelationship(spec)
  const hints = hintsOfRelationship(spec)
  if (errors.length) {
    return { errors, hints, nodes: [], edges: [], connections: [], size: { width: 0, height: 0 }, stats: { entities: 0, relations: 0, groups: 0, kinds: {} } }
  }
  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const entities = spec.entities
  const relations = spec.relations
  if (entities.length > SCALE_HINT_ENTITIES) hints.push(tEn('rhint.tooLarge', { n: entities.length, limit: SCALE_HINT_ENTITIES }))

  const groups = spec.groups ?? []
  const groupIndex = (e) => groups.findIndex((g) => g.id === e.groupId)
  const entityById = new Map(entities.map((e) => [e.id, e]))
  // Which side of the ring a party stands on: the first group left (a), the second right (b), the rest on top (n)
  const campOf = (id) => {
    const i = groupIndex(entityById.get(id))
    return i === 0 ? 'a' : i === 1 ? 'b' : 'n'
  }
  const sizes = new Map(entities.map((e) => [e.id, sizeOf(e)]))
  const labelTexts = relations.map((r) => labelOf(r, t))
  const labelSizes = labelTexts.map((text) => labelBox(text))
  const mainCentre = entityById.has(fields?.centre) ? fields.centre : defaultCentre(spec)

  // ── each connected group around its own centre; the one holding the main centre first ──
  const comps = componentsOf(spec)
  comps.sort((a, b) => Number(b.includes(mainCentre)) - Number(a.includes(mainCentre)))
  const islands = comps.map((ids, ci) => {
    const members = entities.filter((e) => ids.includes(e.id))
    const rels = relations.filter((r) => ids.includes(r.from) && ids.includes(r.to))
    const centre = ci === 0 ? mainCentre : defaultCentre({ entities: members, relations: rels })
    const laid = placeRings(members, rels, centre, sizes, campOf, (r) => labelSizes[relations.indexOf(r)].width)
    // Connections of this island
    const pairKey = (r) => [r.from, r.to].sort().join('|')
    const byPair = new Map()
    rels.forEach((r) => byPair.set(pairKey(r), [...(byPair.get(pairKey(r)) ?? []), r]))
    const rects = new Map([...laid.boxes.entries()].map(([id, b]) => [id, rectOf(b)]))
    const conns = []
    for (const r of rels) {
      const a = rects.get(r.from)
      const b = rects.get(r.to)
      const sib = byPair.get(pairKey(r))
      const k = sib.indexOf(r)
      const ca = centreOf(a)
      const cb = centreOf(b)
      const len = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) || 1
      const normal = [-(cb[1] - ca[1]) / len, (cb[0] - ca[0]) / len]
      const off = (k - (sib.length - 1) / 2) * Math.min(PARALLEL_STEP, (Math.min(a.h, b.h) / 2 - 5) / Math.max(1, (sib.length - 1) / 2))
      const sa = [ca[0] + normal[0] * off, ca[1] + normal[1] * off]
      const sb = [cb[0] + normal[0] * off, cb[1] + normal[1] * off]
      const p1 = clipToBox(a, sb)
      const p2 = clipToBox(b, sa)
      p1[0] += normal[0] * off
      p1[1] += normal[1] * off
      let points = [p1, p2]
      let d = `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`
      const others = othersOf(laid.boxes, r.from, r.to)
      if (polyHits(points, others, LINE_CLEAR)) {
        // Round the outside of the rings: through a point beyond the outer end's ring, at the middle angle
        const ra = laid.boxes.get(r.from)
        const rb = laid.boxes.get(r.to)
        // Out of the first box along its radius, along an ellipse outside the outer ring by the shorter
        // way round, in along the second box's radius: it passes outside every party in between
        let delta = rb.angle - ra.angle
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        const outer = Math.max(ra.ring, rb.ring)
        const n = Math.max(4, Math.ceil(Math.abs(delta) / 0.2))
        for (let extra = 0; extra < 6; extra += 1) {
          const R = laid.radii[outer] + laid.halves[outer] + 26 + extra * 36
          const ring = Array.from({ length: n + 1 }, (_, i) => laid.at(ra.angle + (delta * i) / n, R))
          const q1 = clipToBox(a, ring[0])
          const q2 = clipToBox(b, ring[n])
          const arc = smoothThrough([q1, ...ring, q2])
          points = arc.points
          d = arc.d
          if (!polyHits(points, others, LINE_CLEAR)) break
        }
      }
      conns.push({ r, points, d, faint: r.from !== centre && r.to !== centre })
    }
    // Labels, shortest lines first so a long line's label finds what is free
    const placedLabels = []
    const order = conns.map((c, i) => i).sort((x, y) => conns[x].points.length - conns[y].points.length)
    for (const i of order) {
      const c = conns[i]
      const size = labelSizes[relations.indexOf(c.r)]
      c.labelSize = { width: size.width, height: size.height }
      c.labelAt = placeLabel(c.points, c.labelSize, [...rects.values()], placedLabels, conns.filter((o) => o !== c).map((o) => o.points))
      placedLabels.push({ x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height })
    }
    // The island's own bounding box (boxes with their camp tag, lines, labels), origin at the centre
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const grow = (x, y, w = 0, h = 0) => {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + w)
      y1 = Math.max(y1, y + h)
    }
    for (const b of laid.boxes.values()) grow(b.x, b.y - CAMP_TAG_H, b.w, b.h + CAMP_TAG_H)
    for (const c of conns) {
      for (const [x, y] of c.points) grow(x, y)
      grow(c.labelAt.x, c.labelAt.y, c.labelSize.width, c.labelSize.height)
    }
    return { centre, laid, conns, bounds: { x0, y0, x1, y1 }, ids }
  })

  // ── the islands in the frame: the main picture on top, the others in rows under it ──
  const main = islands[0]
  const mainW = main.bounds.x1 - main.bounds.x0
  const rowMax = Math.max(mainW, 900)
  const offsets = new Map()
  offsets.set(0, [PAD - main.bounds.x0, PAD - main.bounds.y0])
  let cursorX = PAD
  let rowTop = PAD + (main.bounds.y1 - main.bounds.y0) + ISLAND_ROW_GAP + (islands.length > 1 ? NOTE_H + 12 : 0)
  let rowH = 0
  const noteAt = islands.length > 1 ? { x: PAD, y: PAD + (main.bounds.y1 - main.bounds.y0) + ISLAND_ROW_GAP - 6 } : null
  for (let i = 1; i < islands.length; i += 1) {
    const b = islands[i].bounds
    const w = b.x1 - b.x0
    const h = b.y1 - b.y0
    if (cursorX > PAD && cursorX + w > PAD + rowMax) {
      cursorX = PAD
      rowTop += rowH + ISLAND_ROW_GAP
      rowH = 0
    }
    offsets.set(i, [cursorX - b.x0, rowTop - b.y0])
    cursorX += w + ISLAND_GAP
    rowH = Math.max(rowH, h)
  }

  // ── out to React Flow nodes and connections ──
  const party = makePartyData(spec, t)
  const groupLabelOf = (e) => groups.find((g) => g.id === e.groupId)?.label ?? ''

  const nodes = []
  const connections = []
  const centreY = (i) => offsets.get(i)[1]
  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  let width = 0
  let height = 0
  islands.forEach((isl, i) => {
    const [ox, oy] = offsets.get(i)
    for (const [id, b] of isl.laid.boxes) {
      const e = entityById.get(id)
      const gi = groupIndex(e)
      nodes.push({
        id,
        type: 'rnode',
        position: { x: b.x + ox, y: b.y + oy },
        data: party.dataOf(e, {
          // The overlay pops towards the room: boxes in the top half open downwards
          layer: b.y + oy + b.h / 2 < centreY(i) ? 0 : 1,
          centre: id === isl.centre,
          ring: b.ring,
          // The camp's name over the box, in the colour of its place (first group blue, second red, the rest grey)
          camp: groupLabelOf(e) ? { label: groupLabelOf(e), tone: gi === 0 ? 0 : gi === 1 ? 1 : 2 } : null,
        }),
      })
    }
    for (const c of isl.conns) {
      const idx = relations.indexOf(c.r)
      connections.push({
        id: `r:${c.r.id}`,
        relationId: c.r.id,
        from: c.r.from,
        to: c.r.to,
        kind: c.r.kind,
        directed: isDirected(c.r),
        secures: c.r.secures ?? null,
        label: labelTexts[idx],
        points: c.points.map(([x, y]) => [x + ox, y + oy]),
        d: shiftPath(c.d, ox, oy),
        dCurve: shiftPath(c.d, ox, oy),
        labelAt: { x: c.labelAt.x + ox, y: c.labelAt.y + oy },
        labelSize: c.labelSize,
        faint: c.faint,
      })
    }
    width = Math.max(width, isl.bounds.x1 + ox)
    height = Math.max(height, isl.bounds.y1 + oy)
  })

  const centreNode = nodes.find((n) => n.data.centre && islands[0].laid.boxes.has(n.id))
  return {
    errors,
    hints,
    nodes,
    edges: [],
    connections,
    centre: mainCentre,
    defaultCentre: defaultCentre(spec),
    islands: islands.map((isl) => ({ centre: isl.centre, ids: isl.ids })),
    note: noteAt,
    rings: islands[0].laid.rings.map((r) => r.length),
    size: { width: Math.ceil(width + PAD), height: Math.ceil(height + PAD) },
    centreAt: centreNode?.position,
    stats: { entities: entities.length, relations: relations.length, groups: groups.length, kinds },
  }
}

/** Move every coordinate of a path made of M, L and Q commands */
function shiftPath(d, dx, dy) {
  const nums = d.match(/-?\d+(\.\d+)?(e-?\d+)?/g).map(Number)
  let k = 0
  return d.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, () => {
    const v = nums[k] + (k % 2 === 0 ? dx : dy)
    k += 1
    return String(v)
  })
}
