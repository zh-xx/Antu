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
import { routeLink } from '../../procedure/flow/router.js'
import { toReal } from '../../procedure/flow/columns.js'
import { textEm } from '../../fact/cardGeometry.js'
import { tEn } from '../../../core/i18n.js'
import {
  PAD,
  LAYER_GAP,
  NODE_GAP,
  CAMP_GAP,
  GROUP_PAD_TOP,
  GROUP_PAD,
  GROUP_TITLE_FONT,
  SCALE_HINT_ENTITIES,
  CROSS_COST,
  sizeOf,
  labelBox,
} from './metrics.js'

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
const titleBoxOf = (box, label, vertical) => {
  const w = Math.min((vertical ? box.w : box.h) - GROUP_PAD * 2, textEm(label) * GROUP_TITLE_FONT + 4)
  return vertical
    ? { x: box.x + GROUP_PAD - 2, y: box.y + 7, w, h: 18 }
    : { x: box.x + 7, y: box.y + GROUP_PAD - 2, w: 18, h: w }
}

/** The four edges of a box, as [[x0,y0],[x1,y1]]: a route may cross them but not run along them */
const edgesOfBox = (b) => [
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
function portCostFor(a, b) {
  const above = b.y + b.h < a.y
  const below = b.y > a.y + a.h
  if (below) return undefined
  if (above) return { out: { bottom: 700, top: 0 }, in: { top: 700, bottom: 0 } }
  return { out: { bottom: 200, top: 200, left: 0, right: 0 }, in: { top: 200, bottom: 200, left: 0, right: 0 } }
}

const segsOf = (pts) => pts.slice(1).map((q, i) => [pts[i], q])
const overlaps = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m
const segHits = ([p, q], r, m) =>
  Math.max(p[0], q[0]) > r.x - m && Math.min(p[0], q[0]) < r.x + r.w + m && Math.max(p[1], q[1]) > r.y - m && Math.min(p[1], q[1]) < r.y + r.h + m

/**
 * Where a relation's label stands: ON its own line, the label's background hiding the line under it,
 * as in most diagrams. Beside the line (what the flowchart does) is ambiguous in a picture where
 * several relations run through one corridor, and it kept landing on some other relation's line; on
 * its own line a label can only be read as that line's. Every long enough segment is tried at a few
 * places along it, and the spot that covers least of anything else wins: entities worst, then other
 * labels and titles, then other lines; the middle of the longest segment on a tie.
 */
function placeOnLine(points, size, nodeRects, blocks, links, borders) {
  const { width: w, height: h } = size
  const badness = (r) =>
    (r.x < PAD / 2 || r.y < PAD / 2 ? 100 : 0) +
    nodeRects.filter((n) => overlaps(r, n, 2)).length * 50 +
    blocks.filter((b) => overlaps(r, b, 2)).length * 20 +
    links.filter((c) => segsOf(c.points).some((s) => segHits(s, r, 2))).length * 10 +
    borders.filter((s) => segHits(s, r, 2)).length * 3
  let best = null
  for (const [p, q] of segsOf(points)) {
    const horizontal = Math.abs(p[1] - q[1]) < 0.5
    const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1])
    const need = horizontal ? w : h
    if (len < need + 8) continue
    // Away from the ends of the segment, where a curved corner would run under the label
    const margin = Math.min(22, (len - need) / 2)
    const span = len - need - margin * 2
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.05, 0.95]) {
      const t = margin + need / 2 + span * f
      const dir = horizontal ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1])
      const cx = horizontal ? p[0] + dir * t : p[0]
      const cy = horizontal ? p[1] : p[1] + dir * t
      const r = { x: cx - w / 2, y: cy - h / 2, w, h }
      const bad = badness(r) + Math.abs(f - 0.5) * 2
      if (!best || bad < best.bad - 1e-9 || (Math.abs(bad - best.bad) < 1e-9 && len > best.len)) best = { bad, len, x: r.x, y: r.y }
    }
  }
  if (best) return { x: best.x, y: best.y }
  // No segment long enough: the middle of the longest one
  const [p, q] = segsOf(points).sort((a, b) => Math.abs(b[1][0] - b[0][0]) + Math.abs(b[1][1] - b[0][1]) - (Math.abs(a[1][0] - a[0][0]) + Math.abs(a[1][1] - a[0][1])))[0]
  return { x: Math.max(PAD / 2, (p[0] + q[0]) / 2 - w / 2), y: Math.max(PAD / 2, (p[1] + q[1]) / 2 - h / 2) }
}

/** Only if the router finds nothing (it should not): out of the side, across, into the side */
function fallbackRoute(a, b) {
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
    const laid = elkLayoutSync({
      id: `camp${ci}`,
      layoutOptions: baseOptions,
      children: ordered.map((e) => ({ id: e.id, width: frameSize(e).w, height: frameSize(e).h })),
      // An undirected relation (a marriage, a contract) sets no level: handed to ELK it put a spouse a row
      // below. Left out, both stand on one level where nothing else holds them apart; it is routed after.
      edges: relations
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => inside.has(r.from) && inside.has(r.to) && isDirected(r))
        .map(({ r, i }) => ({
          id: `r${i}`,
          sources: [r.from],
          targets: [r.to],
          labels: [{ id: `l${i}`, text: labels[i].text, width: labels[i].frame.width, height: labels[i].frame.height }],
        })),
    })
    const at = new Map(laid.children.map((c) => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]))
    // The camp's own levels (for the stats and for which way an overlay opens)
    const tops = [...new Set([...at.values()].map((r) => Math.round(r.y)))].sort((m, n) => m - n)
    const level = new Map([...at].map(([id, r]) => [id, tops.indexOf(Math.round(r.y))]))
    return { at, width: laid.width, height: laid.height, level, levels: tops.length }
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
      cursor += middleCol.width + CAMP_GAP
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
    cursor += w + CAMP_GAP
  })
  const frameWidth = cursor - CAMP_GAP + PAD
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
  const order = relations.map((r, i) => i).sort((a, b) => dist(relations[a]) - dist(relations[b]) || a - b)
  const drawn = new Array(relations.length)
  const done = []
  for (const i of order) {
    const a = placed.get(relations[i].from)
    const b = placed.get(relations[i].to)
    const points =
      routeLink({
        from: a,
        to: b,
        nodes: nodeRects,
        blocks: titles,
        routes: done.map((c) => ({ points: c.points })),
        borders,
        portCost: portCostFor(a, b),
        crossCost: CROSS_COST,
        sidePorts: true,
      }) ?? fallbackRoute(a, b)
    const c = { index: i, points, labelAt: null, labelSize: { width: labels[i].frame.width, height: labels[i].frame.height } }
    drawn[i] = c
    done.push(c)
  }
  const placedLabels = []
  for (const i of order) {
    const c = drawn[i]
    // Every other line is in the way of this label; the lines of the relations it belongs to are not special
    const others = drawn.filter((o) => o !== c)
    c.labelAt = placeOnLine(c.points, c.labelSize, nodeRects, [...titles, ...placedLabels.map(labelRect)], others, borders)
    placedLabels.push(c)
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
