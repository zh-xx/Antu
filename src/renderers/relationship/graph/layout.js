// ============================================================
//  src/renderers/relationship/graph/layout.js — laying out the relationship graph (pure computation)
//
//  Input: a relationship spec. Output, in the same shape as procedure's layout:
//    nodes        React Flow nodes (position, size, the text to show)
//    connections  the geometry of the links (the polyline points, and where the label goes)
//    groupBoxes   the boxes around each group's entities
//    size         how large the content is
//
//  **edges is always an empty array**, as in the other two types: the links are drawn by a
//  self-drawn layer, from the points computed here.
//
//  The camps. A group is a camp, and camps stand side by side: the two sides of a dispute face
//  each other across a channel, and the parties that belong to neither (no `groupId`) stand in the
//  middle, unboxed, when there are two camps (otherwise after the last one). ELK cannot do this in
//  one pass: a box around entities that sit in different layers is not something its layered
//  algorithm can lay out (it scatters the camp across the picture, measured on the spec's example).
//  So, as the procedure's stage columns do:
//    1. each camp is laid out by ELK on its own, holders above what they hold (relations run from
//       `from` to `to`); with no groups the whole diagram is one unboxed camp;
//    2. the camps are set side by side, tops aligned, each as tall as its own content;
//    3. every relation is routed by the orthogonal router (procedure/flow/router.js): fewest bends,
//       then shortest, clear of every entity, group title and label, few crossings;
//    4. every label gets a spot beside its line, clear of everything else.
//
//  Everything is computed in one frame, the vertical one (layers down, camps across). The horizontal
//  orientation is that picture transposed: sizes go in with width and height swapped, and every
//  coordinate comes out with x and y swapped. One code path, two orientations.
//
//  Kept out of this file on purpose (see spec/relationship/schema-draft.md §6): filtering by
//  relation kind. Hiding a family of relations is paint only, so the geometry is worked out for
//  every relation and never moves when the reader switches a kind off.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from './rules.js'
import { elkLayoutSync } from '../../procedure/flow/elk.js'
import { toPathD, toCurveD } from '../../procedure/flow/layout.js'
import { straightenJog } from '../../../core/links.js'
import { routeLink } from '../../procedure/flow/router.js'
import { toReal } from '../../procedure/flow/columns.js'
import { textEm } from '../../fact/cardGeometry.js'
import { tEn } from '../../../core/i18n.js'
import {
  PAD,
  LAYER_GAP,
  NODE_GAP,
  CAMP_GAP,
  LABEL_MARGIN,
  GROUP_PAD_TOP,
  GROUP_PAD,
  GROUP_TITLE_FONT,
  SCALE_HINT_ENTITIES,
  CROSS_COST,
  sizeOf,
  labelBox,
} from './metrics.js'

/** Two links running side by side keep at least this far apart; the side ports of a box spread to allow it */
const PARALLEL_MIN = 15
const SIDE_SPREAD = 16

/** Every order of a short list */
export function permutations(list) {
  if (list.length <= 1) return [list]
  return list.flatMap((x, k) => permutations([...list.slice(0, k), ...list.slice(k + 1)]).map((rest) => [x, ...rest]))
}
/** A small seeded generator: the same JSON always gives the same picture */
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffled(list, rand) {
  const out = [...list]
  for (let k = out.length - 1; k > 0; k -= 1) {
    const m = Math.floor(rand() * (k + 1))
    ;[out[k], out[m]] = [out[m], out[k]]
  }
  return out
}

const emptyStats = () => ({ entities: 0, relations: 0, groups: 0, layers: 0, widest: 0, kinds: {} })

/**
 * The text a relation shows on its line: the one the author wrote, otherwise a default from its
 * kind and dedicated fields, in the interface language (`t`).
 */
export function labelOf(relation, t = tEn) {
  if (typeof relation.label === 'string' && relation.label.trim()) return relation.label
  return t(`rel.auto.${relation.kind}`, { share: relation.share, amount: relation.amount })
}

/**
 * The box of a group's title, in the frame: where a link must not run. The title strip runs along
 * the real top of the box: the frame's top when vertical, its left when the picture is transposed.
 */
export const titleBoxOf = (box, label, vertical) => {
  const w = Math.min((vertical ? box.w : box.h) - GROUP_PAD * 2, textEm(label) * GROUP_TITLE_FONT + 4)
  return vertical
    ? { x: box.x + GROUP_PAD - 2, y: box.y + 7, w, h: 18 }
    : { x: box.x + 7, y: box.y + GROUP_PAD - 2, w: 18, h: w }
}

/** The four edges of a box, as [[x0,y0],[x1,y1]]: a route may cross them but not run along them */
export const edgesOfBox = (b) => [
  [[b.x, b.y], [b.x + b.w, b.y]],
  [[b.x, b.y + b.h], [b.x + b.w, b.y + b.h]],
  [[b.x, b.y], [b.x, b.y + b.h]],
  [[b.x + b.w, b.y], [b.x + b.w, b.y + b.h]],
]

/**
 * What each side of an entity costs a link, by where the other end lies. The router's default
 * assumes the flow runs down (out of the bottom, into the top); a relation to something above, or
 * beside, wants the other sides.
 */
export function portCostFor(a, b) {
  const above = b.y + b.h < a.y
  const below = b.y > a.y + a.h
  if (below) return undefined
  if (above) return { out: { bottom: 700, top: 0 }, in: { top: 700, bottom: 0 } }
  return { out: { bottom: 200, top: 200, left: 0, right: 0 }, in: { top: 200, bottom: 200, left: 0, right: 0 } }
}

/** A step sideways up to this wide between two boxes that overlap becomes one straight line (the review of PR 171: two of rel1's five lines) */
const STRAIGHT_JOG = 60
export const segsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q])
const overlaps = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
const segHits = ([p, q], r, m) =>
  Math.max(p[0], q[0]) > r.x - m && Math.min(p[0], q[0]) < r.x + r.w + m && Math.max(p[1], q[1]) > r.y - m && Math.min(p[1], q[1]) < r.y + r.h + m

/**
 * Where a relation's label stands: ON its own line, the label's background hiding the line under it,
 * as in most diagrams. Beside the line (what the flowchart does) is ambiguous in a picture where
 * several relations run through one corridor, and it kept landing on some other relation's line; on
 * its own line a label can only be read as that line's. Every long enough segment is tried at a few
 * places along it, and the spot that covers least of anything else wins: entities worst, then other
 * labels and titles, then other lines; the middle of the longest segment on a tie. Where the line
 * itself is hemmed in by another relation of the pair, the label may stand touching it instead, on
 * the side away from the neighbour, which beats covering the neighbour's line too.
 */
// Places tried along a segment, the middle first: a crowded corridor needs more than a few to find a free one
const FRACTIONS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9, 0.02, 0.98]
export function placeOnLine(points, size, nodeRects, blocks, links, borders) {
  const spots = spotsOnLine(points, size, nodeRects, blocks, links, borders)
  if (spots.length) {
    let best = spots[0]
    for (const sp of spots) if (sp.bad < best.bad - 1e-9 || (Math.abs(sp.bad - best.bad) < 1e-9 && sp.len > best.len)) best = sp
    return { x: best.x, y: best.y, bad: best.bad }
  }
  // No segment long enough: the middle of the longest one
  const { width: w, height: h } = size
  const [p, q] = segsOf(points).sort((a, b) => Math.abs(b[1][0] - b[0][0]) + Math.abs(b[1][1] - b[0][1]) - (Math.abs(a[1][0] - a[0][0]) + Math.abs(a[1][1] - a[0][1])))[0]
  return { x: Math.max(PAD / 2, (p[0] + q[0]) / 2 - w / 2), y: Math.max(PAD / 2, (p[1] + q[1]) / 2 - h / 2), bad: Infinity }
}

/** Every spot placeOnLine weighs, with what it covers (`bad`) and the length of its segment */
export function spotsOnLine(points, size, nodeRects, blocks, links, borders) {
  const { width: w, height: h } = size
  const badness = (r) =>
    // Off the canvas only: a route over the top of the picture runs in the margin, and its label with it
    // (held to PAD / 2, the label of a loan over the top went down onto a camp's title instead)
    (r.x < 0 || r.y < 0 ? 100 : 0) +
    nodeRects.filter((n) => overlaps(r, n, 2)).length * 50 +
    blocks.filter((b) => overlaps(r, b, 2)).length * 20 +
    links.filter((c) => segsOf(c.points).some((s) => segHits(s, r, 2))).length * 10 +
    borders.filter((s) => segHits(s, r, 2)).length * 3
  const spots = []
  for (const [p, q] of segsOf(points)) {
    const horizontal = Math.abs(p[1] - q[1]) < 0.5
    const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
    const need = horizontal ? w : h
    if (len < need + 8) continue
    // Away from the ends of the segment, where a curved corner would run under the label
    const margin = Math.min(22, (len - need) / 2)
    const span = len - need - margin * 2
    for (const f of FRACTIONS) {
      const t = margin + need / 2 + span * f
      const dir = horizontal ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1])
      const cx = horizontal ? p[0] + dir * t : p[0]
      const cy = horizontal ? p[1] : p[1] + dir * t
      const r = { x: cx - w / 2, y: cy - h / 2, w, h }
      spots.push({ bad: badness(r) + Math.abs(f - 0.5) * 2, len, x: r.x, y: r.y })
      // Just beside its own line, touching it, on either side. Two relations of one pair run 15 px apart, and a
      // label on one of them covers the other whatever the spot along it; beside its own line it covers neither.
      // It costs a little, so a label that covers nothing else stays on its line.
      for (const side of [1, -1]) {
        const b = horizontal ? { x: r.x, y: r.y + side * (h / 2 + 2), w, h } : { x: r.x + side * (w / 2 + 2), y: r.y, w, h }
        spots.push({ bad: badness(b) + Math.abs(f - 0.5) * 2 + 4, len, x: b.x, y: b.y })
      }
    }
  }
  return spots
}

/** Only if the router finds nothing (it should not): out of the side, across, into the side */
export function fallbackRoute(a, b) {
  const y0 = a.y + a.h / 2
  const y1 = b.y + b.h / 2
  const right = b.x >= a.x
  const x0 = right ? a.x + a.w : a.x
  const x1 = right ? b.x : b.x + b.w
  const mx = (x0 + x1) / 2
  return [
    [x0, y0],
    [mx, y0],
    [mx, y1],
    [x1, y1],
  ]
}

/**
 * Lay out one relationship spec.
 *
 * The signature matches the other types' (spec, fields, view, orientation), because the registry
 * calls them all with the same four parameters. relationship has no views (schema-draft §0);
 * view is accepted and unused. `fields.t` is the interface language's translate function, used
 * only for the default text on a relation with no label of its own.
 */
export function buildRelationshipGraph(spec, fields = {}, view, orientation = 'vertical') {
  const errors = validateRelationship(spec)
  const hints = hintsOfRelationship(spec)
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
      groupBoxes: [],
      size: { width: 0, height: 0 },
      stats: emptyStats(),
    }
  }

  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const entities = spec.entities
  const relations = spec.relations
  const groupById = new Map((spec.groups ?? []).map((g) => [g.id, g]))
  const presentGroups = (spec.groups ?? []).filter((g) => entities.some((e) => e.groupId === g.id))
  const showGroups = fields?.groups !== false && presentGroups.length > 0

  if (entities.length > SCALE_HINT_ENTITIES) {
    hints.push(tEn('rhint.tooLarge', { n: entities.length, limit: SCALE_HINT_ENTITIES }))
  }

  // ── the camps, in the order they stand ──
  // Boxed camps are the groups in the order written. Whoever belongs to none stands unboxed: in the
  // middle when there are two camps (a neutral party between the sides), otherwise after the last.
  const boxedCamps = showGroups ? presentGroups.map((g) => ({ group: g, members: entities.filter((e) => e.groupId === g.id) })) : []
  const loose = showGroups ? entities.filter((e) => !presentGroups.some((g) => g.id === e.groupId)) : entities
  const camps = [...boxedCamps]
  if (loose.length) camps.splice(camps.length === 2 ? 1 : camps.length, 0, { group: null, members: loose })

  // ── sizes and label boxes, in the frame (transposed when the picture runs left to right) ──
  const frameSize = (e) => {
    const { w, h } = sizeOf(e)
    return vertical ? { w, h } : { w: h, h: w }
  }
  const labels = relations.map((r) => {
    const text = labelOf(r, t)
    const b = labelBox(text)
    return { text, frame: vertical ? b : { width: b.height, height: b.width } }
  })

  // ── ① each camp by ELK, on its own, compact ──
  // A camp is laid out from the relations inside it only: a holder above what it holds, a creditor above
  // the debtor, within the camp. Its box is as tall as its own content. (Shared rows across the whole
  // picture were tried: they kept the up-and-down order across camps too, but left most of a small camp's
  // box empty and pushed the links between camps round each other; the reader did not gain enough.)
  const spacing = {
    'elk.spacing.nodeNode': String(NODE_GAP),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
    'elk.spacing.edgeNode': '16',
    'elk.spacing.edgeEdge': '12',
    'elk.spacing.edgeLabel': '4',
    'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  }
  const baseOptions = {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    'elk.edgeRouting': 'ORTHOGONAL',
    ...spacing,
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.edgeLabels.inline': 'false',
    'elk.separateConnectedComponents': 'false',
  }
  // How hard an entity is pulled toward another camp: the sum of its links' directions (-1 to a camp on
  // the left, +1 to the right, 0 inside its own) over all its links. An entity whose only link goes left
  // (a guarantor of the creditor) is pulled harder than one that also has links inside (the debtor).
  const campIndexOf = new Map()
  camps.forEach((c, ci) => c.members.forEach((e) => campIndexOf.set(e.id, ci)))
  const pullOf = (e, ci) => {
    const sides = relations
      .filter((r) => r.from === e.id || r.to === e.id)
      .map((r) => Math.sign(campIndexOf.get(r.from === e.id ? r.to : r.from) - ci))
    return sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : 0
  }
  const layCamp = (members, ci) => {
    const inside = new Set(members.map((e) => e.id))
    // Written order decides ties in ELK (considerModelOrder), so an entity whose links go to the camp on
    // the left is handed over first and stands on the left: the guarantor of a creditor on the left no
    // longer stood on the far side of its camp, its guarantee going over everything
    const ordered = members.map((e, i) => ({ e, i, pull: pullOf(e, ci) })).sort((a, b) => a.pull - b.pull || a.i - b.i).map((x) => x.e)
    // A camp whose parties have no relation among themselves (three regulators, each acting on the same
    // company) is one row to ELK, and the parties at the ends of a row have the others in the way of a
    // straight line across. Stacked one above another, each has its own line out of the camp.
    const isolated = members.length > 1 && !relations.some((r) => inside.has(r.from) && inside.has(r.to))
    const facing = isolated && ordered.every((e) => pullOf(e, ci) !== 0)
    if (facing) {
      const sizes = ordered.map(frameSize)
      const wide = Math.max(...sizes.map((z) => z.w))
      let y = 0
      const at = new Map(
        ordered.map((e, k) => {
          const r = { x: (wide - sizes[k].w) / 2, y, w: sizes[k].w, h: sizes[k].h }
          y += sizes[k].h + NODE_GAP
          return [e.id, r]
        }),
      )
      return { at, width: wide, height: y - NODE_GAP, level: new Map(ordered.map((e) => [e.id, 0])), levels: 1 }
    }
    const inEdges = relations.map((r, i) => ({ r, i })).filter(({ r }) => inside.has(r.from) && inside.has(r.to))
    const runElk = (order) =>
      elkLayoutSync({
        id: `camp${ci}`,
        layoutOptions: baseOptions,
        children: order.map((e) => ({ id: e.id, width: frameSize(e).w, height: frameSize(e).h })),
        // An undirected relation (a marriage, a contract) sets no level: handed to ELK it put a spouse a row
        // below. Left out, both stand on one level where nothing else holds them apart; it is routed after.
        edges: inEdges
          .filter(({ r }) => isDirected(r))
          .map(({ r, i }) => ({
            id: `r${i}`,
            sources: [r.from],
            targets: [r.to],
            labels: [{ id: `l${i}`, text: labels[i].text, width: labels[i].frame.width, height: labels[i].frame.height }],
          })),
      })

    // ELK cannot see the links that leave the camp, so it does not know that a party with a link to the
    // camp on the right should not have its own family lined up on that side: they crossed (issue #32).
    // The order of the parties is what ELK keeps, so a few orders are tried and the one whose picture
    // crosses fewest lines wins. Judged on straight lines between centres, and on a level line from a
    // party out to the side it faces: rough, but it is only compared between orders of the same camp.
    const crossings = (laidOne) => {
      const c = new Map(laidOne.children.map((n) => [n.id, [n.x + n.width / 2, n.y + n.height / 2]]))
      const lines = inEdges.map(({ r }) => ({ ends: [r.from, r.to], p: c.get(r.from), q: c.get(r.to) }))
      const far = laidOne.width + 1e4
      for (const e of members) {
        const pull = pullOf(e, ci)
        if (pull === 0) continue
        const [x, y] = c.get(e.id)
        lines.push({ ends: [e.id], p: [x, y], q: [pull > 0 ? x + far : x - far, y] })
      }
      const side = (a, b, d) => Math.sign((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]))
      // A party standing in the way of another's links out of the camp: the husband level with the borrower,
      // between her and the lenders, sent both loans round him. Each link out that is blocked counts once.
      // Only when the picture runs down: transposed, the parties are wide across the links' way and the
      // links pass beside the one in between (counted there, the horizontal picture of that case got worse).
      let n = 0
      const boxOf = new Map(laidOne.children.map((m) => [m.id, m]))
      for (const e of vertical ? members : []) {
        const pull = pullOf(e, ci)
        if (pull === 0) continue
        const out = relations.filter((r) => (r.from === e.id || r.to === e.id) && campIndexOf.get(r.from === e.id ? r.to : r.from) !== ci).length
        const [x, y] = c.get(e.id)
        const blocked = members.some((o) => {
          if (o.id === e.id) return false
          const b = boxOf.get(o.id)
          return y > b.y && y < b.y + b.height && (pull > 0 ? b.x > x : b.x + b.width < x)
        })
        if (blocked) n += out
      }
      lines.forEach((u, k) =>
        lines.slice(k + 1).forEach((v) => {
          if (u.ends.some((id) => v.ends.includes(id))) return
          if (side(u.p, u.q, v.p) * side(u.p, u.q, v.q) < 0 && side(v.p, v.q, u.p) * side(v.p, v.q, u.q) < 0) n += 1
        }),
      )
      return n
    }
    const tries = [ordered]
    if (members.length > 2 && inEdges.length && members.some((e) => pullOf(e, ci) !== 0)) {
      const seed = mulberry32(ci + members.length * 7919)
      const want = members.length <= 5 ? permutations(ordered) : Array.from({ length: 40 }, () => shuffled(ordered, seed))
      tries.push(...want)
    }
    let laid = null
    let fewest = Infinity
    for (const order of tries) {
      const one = runElk(order)
      const n = crossings(one)
      if (n < fewest) {
        laid = one
        fewest = n
      }
      if (fewest === 0) break
    }
    const at = new Map(laid.children.map((c) => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]))
    // Left out of ELK, an undirected relation got no room for its label: two spouses side by side were
    // NODE_GAP apart and "Spouse" was cut to "pouse". Where two such parties stand level, everything from
    // the right one on moves over until the label fits between them.
    let width = laid.width
    relations
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => inside.has(r.from) && inside.has(r.to) && !isDirected(r))
      .map(({ r, i }) => ({ i, pair: [at.get(r.from), at.get(r.to)].sort((m, n) => m.x - n.x) }))
      .filter(({ pair: [m, n] }) => m.y < n.y + n.h && n.y < m.y + m.h)
      .sort((u, v) => u.pair[1].x - v.pair[1].x)
      .forEach(({ i, pair: [m, n] }) => {
        const short = labels[i].frame.width + 2 * LABEL_MARGIN - (n.x - m.x - m.w)
        if (short <= 0) return
        const from = n.x
        for (const r of at.values()) if (r.x >= from) r.x += short
        width += short
      })
    // The camp's own levels (for the stats and for which way an overlay opens)
    const tops = [...new Set([...at.values()].map((r) => Math.round(r.y)))].sort((m, n) => m - n)
    const level = new Map([...at].map(([id, r]) => [id, tops.indexOf(Math.round(r.y))]))
    return { at, width, height: laid.height, level, levels: tops.length }
  }

  // The title strip takes GROUP_PAD_TOP along the real top of a box: the frame's top when vertical, its left when transposed
  const PAD_A0 = vertical ? GROUP_PAD_TOP : GROUP_PAD
  const PAD_C0 = vertical ? GROUP_PAD : GROUP_PAD_TOP
  const median = (xs) => {
    const s = [...xs].sort((m, n) => m - n)
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
  }

  // Which camp is the middle column of neutral parties (none when every entity is boxed, or with no groups)
  const middle = camps.findIndex((c) => !c.group && camps.some((o) => o.group))
  const laidCamps = camps.map((camp, ci) => (ci === middle ? null : layCamp(camp.members, ci)))

  // ── ② the camps side by side; each moved up or down so the links between camps run level ──
  // The first boxed camp stands at the top. Every next one is moved so the links between it and the camps
  // already set run as level as they can: by the median of the heights those links would climb. A shift of
  // the whole camp, never a change inside it.
  const centreY = new Map() // entity id -> centre height in the frame, for entities in a placed boxed camp
  const campTop = []
  camps.forEach((camp, ci) => {
    if (ci === middle) return
    const lay = laidCamps[ci]
    const top = (camp.group ? PAD_A0 : 0)
    const diffs = []
    for (const r of relations) {
      for (const [mine, other] of [[r.from, r.to], [r.to, r.from]]) {
        if (!lay.at.has(mine) || !centreY.has(other)) continue
        const m = lay.at.get(mine)
        diffs.push(centreY.get(other) - (top + m.y + m.h / 2))
      }
    }
    campTop[ci] = diffs.length ? median(diffs) : 0
    for (const [id, r] of lay.at) centreY.set(id, campTop[ci] + top + r.y + r.h / 2)
  })

  // ── ③ the neutral parties: a column between the camps, each at the height of what it relates to ──
  // A party in no group used to stand wherever the whole graph's levels put it, often across the path of
  // the links between the camps. Now each stands at the median height of the entities it is related to,
  // so its own links run level; the column keeps them apart, in that order.
  let middleCol = null
  if (middle >= 0) {
    const members = camps[middle].members
    const want = members.map((e) => {
      const ys = relations
        .filter((r) => r.from === e.id || r.to === e.id)
        .map((r) => centreY.get(r.from === e.id ? r.to : r.from))
        .filter((y) => y !== undefined)
      return { e, want: ys.length ? median(ys) : null, size: frameSize(e) }
    })
    // A straight line between two parties of different camps that stand level runs across this column.
    // A party here that covers the whole of it sends the line round (three regulators' links into one
    // company went over the top of the picture: issue #32), so it stands clear of such a line instead,
    // on whichever side is nearer to where it wanted to be.
    const bandOf = (id) => {
      const e = entities.find((x) => x.id === id)
      const h = frameSize(e).h
      return [centreY.get(id) - h / 2, centreY.get(id) + h / 2]
    }
    const lines = []
    for (const r of relations) {
      if (!centreY.has(r.from) || !centreY.has(r.to) || campIndexOf.get(r.from) === campIndexOf.get(r.to)) continue
      const [a0, a1] = bandOf(r.from)
      const [b0, b1] = bandOf(r.to)
      if (Math.min(a1, b1) > Math.max(a0, b0)) lines.push([Math.max(a0, b0), Math.min(a1, b1)])
    }
    const ROOM = 14
    for (const w of want) {
      if (w.want === null) continue
      const half = w.size.h / 2
      const hits = (c) => lines.some(([lo, hi]) => c + half + ROOM > lo && c - half - ROOM < hi)
      if (!hits(w.want)) continue
      const options = lines.flatMap(([lo, hi]) => [lo - ROOM - half, hi + ROOM + half]).filter((c) => !hits(c))
      if (options.length) w.want = options.sort((m, n) => Math.abs(m - w.want) - Math.abs(n - w.want))[0]
    }
    // Those with nothing to go by come last, in the order written
    const lastY = Math.max(0, ...centreY.values())
    want.forEach((w, i) => {
      if (w.want === null) w.want = lastY + (i + 1) * (w.size.h + NODE_GAP)
    })
    want.sort((m, n) => m.want - n.want)
    const at = new Map()
    let floor = -Infinity
    const colW = Math.max(...want.map((w) => w.size.w))
    for (const w of want) {
      const y = Math.max(w.want - w.size.h / 2, floor)
      at.set(w.e.id, { x: (colW - w.size.w) / 2, y, w: w.size.w, h: w.size.h })
      floor = y + w.size.h + LAYER_GAP
    }
    middleCol = { at, width: colW }
    for (const [id, r] of at) centreY.set(id, r.y + r.h / 2)
  }

  // ── the channel after each camp: wide enough for the widest label of a link across it ──
  // A label stands on its own line, and a link between neighbouring camps has only the channel to stand
  // in: a fixed channel let a long English label run over the entity at its end ("Passed on CNY 40,000").
  // Two relations on one pair (two loans) run side by side, closer than a label is tall: their labels
  // must stand one after the other, so the channel holds them all.
  const gapAfter = camps.map((_, ci) => {
    const byPair = new Map()
    relations.forEach((r, i) => {
      const [m, n] = [campIndexOf.get(r.from), campIndexOf.get(r.to)].sort((u, v) => u - v)
      if (!(m <= ci && n > ci)) return
      const pair = [r.from, r.to].sort().join('\u0000')
      const was = byPair.get(pair) ?? { w: 0, k: 0 }
      byPair.set(pair, { w: was.w + labels[i].frame.width + LABEL_MARGIN, k: was.k + 1 })
    })
    // A label keeps clear of the ends of its line (placeOnLine), so labels side by side want a margin more
    return Math.max(CAMP_GAP, ...[...byPair.values()].map(({ w, k }) => w + LABEL_MARGIN * (k > 1 ? 3 : 1)))
  })

  // ── set everything down: camps left to right, the whole picture moved so its top is at PAD ──
  const tops = []
  camps.forEach((camp, ci) => {
    if (ci === middle) tops.push(Math.min(...[...middleCol.at.values()].map((r) => r.y)))
    else tops.push(campTop[ci])
  })
  const lift = PAD - Math.min(...tops)
  const placed = new Map()
  const boxes = []
  const levelOf = new Map()
  let levelCount = 1
  let cursor = PAD
  let lowest = PAD
  camps.forEach((camp, ci) => {
    if (ci === middle) {
      for (const [id, r] of middleCol.at) {
        placed.set(id, { x: cursor + r.x, y: lift + r.y, w: r.w, h: r.h })
        lowest = Math.max(lowest, lift + r.y + r.h)
        levelOf.set(id, 0)
      }
      cursor += middleCol.width + gapAfter[ci]
      return
    }
    const lay = laidCamps[ci]
    const padX = camp.group ? PAD_C0 : 0
    const padTop = camp.group ? PAD_A0 : 0
    const y0 = lift + campTop[ci]
    for (const [id, r] of lay.at) {
      placed.set(id, { x: cursor + padX + r.x, y: y0 + padTop + r.y, w: r.w, h: r.h })
      levelOf.set(id, lay.level.get(id))
    }
    levelCount = Math.max(levelCount, lay.levels)
    const w = lay.width + padX + (camp.group ? GROUP_PAD : 0)
    const h = padTop + lay.height + (camp.group ? GROUP_PAD : 0)
    if (camp.group) boxes.push({ groupId: camp.group.id, label: camp.group.label, x: cursor, y: y0, w, h })
    lowest = Math.max(lowest, y0 + h)
    cursor += w + gapAfter[ci]
  })
  const frameWidth = cursor - gapAfter[camps.length - 1] + PAD
  const frameHeight = lowest + PAD

  // ── ③ every relation routed, then ④ every label placed ──
  // Lines first, labels after: a label is small and can stand in another spot, while a line held off by
  // a label already set down went right round the picture (the first horizontal screenshot). So the
  // routes see only the entities and the titles; each label then finds its place on its own line.
  const nodeRects = [...placed.values()]
  const titles = boxes.map((b) => titleBoxOf(b, b.label, vertical))
  const borders = boxes.flatMap(edgesOfBox)
  const labelRect = (c) => ({ x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height })

  // Short ones first, so the long ones go round them and not the other way about
  const dist = (r) => {
    const a = placed.get(r.from)
    const b = placed.get(r.to)
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }
  // Before that, two or more relations of one kind on one pair, the same way (two loans): they used to be
  // drawn as one line, and now each takes a port of its own first, side by side, and a link that would
  // cut between them goes out of another side instead
  const pairOf = (r) => [r.kind, r.from, r.to].join('\u0000')
  const onPair = new Map()
  for (const r of relations) onPair.set(pairOf(r), (onPair.get(pairOf(r)) ?? 0) + 1)
  // Then the ones that can run straight (the two ends level, or one above the other), so a straight line
  // is not pushed off its port by one that bends anyway
  const straight = (r) => {
    const a = placed.get(r.from)
    const b = placed.get(r.to)
    const meet = (p, q, m, n) => Math.min(p + q, m + n) - Math.max(p, m) > 0
    return meet(a.y, a.h, b.y, b.h) || meet(a.x, a.w, b.x, b.w)
  }
  const level = (r) => (onPair.get(pairOf(r)) > 1 ? 0 : straight(r) ? 1 : 2)
  const order = relations
    .map((r, i) => i)
    .sort((a, b) => level(relations[a]) - level(relations[b]) || dist(relations[a]) - dist(relations[b]) || a - b)
  const drawn = new Array(relations.length)
  const done = []
  for (const i of order) {
    const a = placed.get(relations[i].from)
    const b = placed.get(relations[i].to)
    // A link between two parties of one camp on different levels keeps to top and bottom where it can. It
    // used to take the side ports too, and the links coming across from the other camp (three regulators
    // into one company) then found none free and went round the whole picture (issue #32).
    const sameCamp = campIndexOf.get(relations[i].from) === campIndexOf.get(relations[i].to) && camps[campIndexOf.get(relations[i].from)].group
    const stacked = sameCamp && (a.y + a.h <= b.y || b.y + b.h <= a.y)
    const route = (sides) =>
      routeLink({
        from: a,
        to: b,
        nodes: nodeRects,
        blocks: titles,
        outSides: sides,
        inSides: sides,
        // No two links share a stretch: a label on a shared trunk could be read as either line's, and two
        // relations on one pair drawn on one route showed as one line
        routes: done.map((c) => ({ points: c.points, share: false })),
        borders,
        portCost: portCostFor(a, b),
        crossCost: CROSS_COST,
        sidePorts: true,
        // Links side by side at least this far apart (the review on PR 171: 11 px read as one line); the side ports of a low
        // box spread to match
        sideSpread: SIDE_SPREAD,
        parallelGap: PARALLEL_MIN,
      })
    const points = (stacked ? route(['top', 'bottom']) : null) ?? route(undefined) ?? fallbackRoute(a, b)
    const c = { index: i, points, labelAt: null, labelSize: { width: labels[i].frame.width, height: labels[i].frame.height } }
    drawn[i] = c
    done.push(c)
  }
  // a link that steps sideways by a few px between two boxes of different sizes becomes one straight line
  drawn.forEach((c) => {
    c.points = straightenJog(c.points, placed.get(relations[c.index].from), placed.get(relations[c.index].to), STRAIGHT_JOG)
  })
  // A label in about `k` lines (1: as wide as it needs), in the frame
  const sizeIn = (c, k) => {
    const b = labelBox(labels[c.index].text, k)
    return vertical ? b : { width: b.height, height: b.width }
  }
  const place = (c, k, blocks) => {
    const size = sizeIn(c, k)
    const at = placeOnLine(c.points, size, nodeRects, blocks, drawn.filter((o) => o !== c), borders)
    // Each line more is a little worse: a label wraps only to find room
    return { at: { x: at.x, y: at.y }, size, bad: at.bad + (k - 1) }
  }
  const placedLabels = []
  for (const i of order) {
    const c = drawn[i]
    // Every other line is in the way of this label; the lines of the relations it belongs to are not special
    const p = place(c, 1, [...titles, ...placedLabels.map(labelRect)])
    c.labelAt = p.at
    c.labelBad = p.bad
    placedLabels.push(c)
  }
  // A label that still covers another relation's line (two lines side by side with a long label between) is tried
  // in two and three lines: narrower, it can stand clear of the neighbour (beside its own line, or on it)
  for (const c of placedLabels) {
    if (c.labelBad < 10) continue
    const rest = [...titles, ...placedLabels.filter((o) => o !== c).map(labelRect)]
    let best = null
    for (const k of [2, 3]) {
      const p = place(c, k, rest)
      if (!best || p.bad < best.bad) best = p
    }
    if (best && best.bad < c.labelBad - 3) {
      c.labelAt = best.at
      c.labelSize = best.size
      c.labelBad = best.bad
    }
  }
  // Two labels on each other: two lines side by side, closer than a label is long, each with a long label.
  // The two are placed again together, each in one, two or three lines, and the pair that covers least wins.
  const onEach = (a, b) => overlaps(labelRect(a), labelRect(b), 0)
  for (const a of placedLabels) {
    for (const b of placedLabels) {
      if (a === b || !onEach(a, b)) continue
      const rest = [...titles, ...placedLabels.filter((o) => o !== a && o !== b).map(labelRect)]
      // a at each of its spots (not only its best: alone it takes the middle, where b needs to be), b at its best
      let best = null
      for (const ka of [1, 2, 3]) {
        const size = sizeIn(a, ka)
        for (const sp of spotsOnLine(a.points, size, nodeRects, rest, drawn.filter((o) => o !== a), borders)) {
          const pa = { at: { x: sp.x, y: sp.y }, size, bad: sp.bad + (ka - 1) }
          const ra = { x: sp.x, y: sp.y, w: size.width, h: size.height }
          for (const kb of [1, 2, 3]) {
            const pb = place(b, kb, [...rest, ra])
            if (!best || pa.bad + pb.bad < best.bad - 1e-9) best = { bad: pa.bad + pb.bad, pa, pb }
          }
        }
      }
      if (!best) continue
      a.labelAt = best.pa.at
      a.labelSize = best.pa.size
      b.labelAt = best.pb.at
      b.labelSize = best.pb.size
    }
  }

  // ── out of the frame, transposed when the picture runs left to right ──
  const real = toReal({ placed, boxes, connections: drawn, width: frameWidth, height: frameHeight }, vertical)
  const size = { ...real.size }
  const connections = real.connections.map((c) => {
    const r = relations[c.index]
    return {
      id: `r:${r.id}`,
      relationId: r.id,
      from: r.from,
      to: r.to,
      kind: r.kind,
      directed: isDirected(r),
      // Only set for a guarantee that names the claim it secures; the renderer joins the two lines
      secures: r.secures ?? null,
      label: labels[c.index].text,
      points: c.points,
      d: toPathD(c.points),
      dCurve: toCurveD(c.points),
      labelAt: c.labelAt,
      labelSize: c.labelSize,
    }
  })
  // A route can reach past the boxes, and a label past the last camp: the content grows to hold them
  for (const c of connections) {
    for (const [x, y] of c.points) {
      size.width = Math.max(size.width, x + PAD)
      size.height = Math.max(size.height, y + PAD)
    }
    size.width = Math.max(size.width, c.labelAt.x + c.labelSize.width + PAD)
    size.height = Math.max(size.height, c.labelAt.y + c.labelSize.height + PAD)
  }

  // Layers are the shared rows: a level is a level, whichever camp its entities are in
  const perLayer = Array.from({ length: levelCount }, (_, i) => entities.filter((e) => levelOf.get(e.id) === i).length)

  const sourceById = new Map((spec.sources ?? []).map((s) => [s.id, s]))
  const degree = new Map(entities.map((e) => [e.id, 0]))
  for (const r of relations) {
    degree.set(r.from, degree.get(r.from) + 1)
    degree.set(r.to, degree.get(r.to) + 1)
  }
  // What each party is related to, for its overlay: the other end and the text on the line
  const nameOf = new Map(entities.map((e) => [e.id, e.label]))
  const relationsOf = (id) =>
    relations
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.from === id || r.to === id)
      .map(({ r, i }) => ({
        id: r.id,
        kind: r.kind,
        directed: isDirected(r),
        out: r.from === id,
        other: nameOf.get(r.from === id ? r.to : r.from),
        text: labels[i].text,
      }))
  const rfNodes = entities.map((e) => {
    const p = real.placed.get(e.id)
    return {
      id: e.id,
      type: 'rnode',
      position: { x: p.x, y: p.y },
      data: {
        entity: e,
        w: p.w,
        h: p.h,
        // the width of the text column the size was computed for; the entity draws its text in it
        textW: sizeOf(e).textW,
        groupLabel: groupById.get(e.groupId)?.label ?? '',
        sources: (e.sourceIds ?? []).map((id) => sourceById.get(id)).filter(Boolean),
        sourceCount: (e.sourceIds ?? []).filter((id) => sourceById.has(id)).length,
        relationCount: degree.get(e.id),
        relations: relationsOf(e.id),
        layer: levelOf.get(e.id),
        vertical,
      },
    }
  })

  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1

  return {
    errors,
    hints,
    orientation: dir,
    nodes: rfNodes,
    edges: [],
    connections,
    groupBoxes: real.stageBoxes.map((b, i) => ({ groupId: boxes[i].groupId, label: boxes[i].label, x: b.x, y: b.y, w: b.w, h: b.h })),
    // Whole pixels: ELK places on fractions, and the canvas and the exported image want integers
    size: { width: Math.ceil(size.width), height: Math.ceil(size.height) },
    stats: {
      entities: entities.length,
      relations: relations.length,
      groups: presentGroups.length,
      layers: levelCount,
      widest: Math.max(...perLayer),
      kinds,
    },
  }
}
