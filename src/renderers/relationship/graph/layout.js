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
import { placeLabel, toReal } from '../../procedure/flow/columns.js'
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

/** The box of a group's title, in the frame: where a link must not run */
const titleBoxOf = (box, label) => {
  const w = Math.min(box.w - GROUP_PAD * 2, textEm(label) * GROUP_TITLE_FONT + 4)
  return { x: box.x + GROUP_PAD - 2, y: box.y + 7, w, h: 18 }
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

  // ── ① each camp by ELK, on its own ──
  const spacing = {
    'elk.spacing.nodeNode': String(NODE_GAP),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
    'elk.spacing.edgeNode': '16',
    'elk.spacing.edgeEdge': '12',
    'elk.spacing.edgeLabel': '4',
    'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  }
  const layCamp = (camp, ci) => {
    const inside = new Set(camp.members.map((e) => e.id))
    const graph = {
      id: `camp${ci}`,
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.padding': '[top=0,left=0,bottom=0,right=0]',
        'elk.edgeRouting': 'ORTHOGONAL',
        ...spacing,
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.edgeLabels.inline': 'false',
        'elk.separateConnectedComponents': 'false',
      },
      children: camp.members.map((e) => {
        const { w, h } = frameSize(e)
        return { id: e.id, width: w, height: h }
      }),
      // Only the relations inside the camp shape it; the ones across are routed afterwards
      edges: relations
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => inside.has(r.from) && inside.has(r.to))
        .map(({ r, i }) => ({
          id: `r${i}`,
          sources: [r.from],
          targets: [r.to],
          labels: [{ id: `l${i}`, text: labels[i].text, width: labels[i].frame.width, height: labels[i].frame.height }],
        })),
    }
    const laid = elkLayoutSync(graph)
    const at = new Map(laid.children.map((c) => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]))
    return { at, width: laid.width, height: laid.height }
  }

  // ── ② the camps side by side, tops aligned ──
  const placed = new Map()
  const boxes = []
  let cursor = PAD
  let tallest = 0
  camps.forEach((camp, ci) => {
    const lay = layCamp(camp, ci)
    const padX = camp.group ? GROUP_PAD : 0
    const padTop = camp.group ? GROUP_PAD_TOP : 0
    const padBottom = camp.group ? GROUP_PAD : 0
    for (const [id, r] of lay.at) placed.set(id, { x: cursor + padX + r.x, y: PAD + padTop + r.y, w: r.w, h: r.h })
    const w = lay.width + padX * 2
    const h = lay.height + padTop + padBottom
    if (camp.group) boxes.push({ groupId: camp.group.id, label: camp.group.label, x: cursor, y: PAD, w, h })
    tallest = Math.max(tallest, h)
    cursor += w + CAMP_GAP
  })
  const frameWidth = cursor - CAMP_GAP + PAD
  const frameHeight = tallest + PAD * 2

  // ── ③ every relation routed, ④ every label placed ──
  const nodeRects = [...placed.values()]
  const titles = boxes.map((b) => titleBoxOf(b, b.label))
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
    const r = relations[i]
    const a = placed.get(r.from)
    const b = placed.get(r.to)
    const labelsSoFar = done.map(labelRect)
    const points =
      routeLink({
        from: a,
        to: b,
        nodes: nodeRects,
        blocks: [...titles, ...labelsSoFar],
        routes: done.map((c) => ({ points: c.points })),
        borders,
        portCost: portCostFor(a, b),
      }) ?? fallbackRoute(a, b)
    const size = { width: labels[i].frame.width, height: labels[i].frame.height }
    const labelAt = placeLabel(points, size, nodeRects, [...titles, ...labelsSoFar], done, borders)
    const c = { index: i, points, labelAt, labelSize: size }
    drawn[i] = c
    done.push(c)
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

  // Layers, read back from where ELK put the entities (for the stats). Entities of different camps
  // at the same level count as one layer: a layer is a level, whichever camp it is in.
  const a0 = (id) => Math.round(vertical ? real.placed.get(id).y : real.placed.get(id).x)
  const layerStarts = [...new Set(entities.map((e) => a0(e.id)))].sort((a, b) => a - b)
  const perLayer = layerStarts.map((a) => entities.filter((e) => a0(e.id) === a).length)

  const sourceById = new Map((spec.sources ?? []).map((s) => [s.id, s]))
  const degree = new Map(entities.map((e) => [e.id, 0]))
  for (const r of relations) {
    degree.set(r.from, degree.get(r.from) + 1)
    degree.set(r.to, degree.get(r.to) + 1)
  }
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
        layer: layerStarts.indexOf(a0(e.id)),
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
      layers: layerStarts.length,
      widest: Math.max(...perLayer),
      kinds,
    },
  }
}
