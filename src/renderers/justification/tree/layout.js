// ============================================================
//  src/renderers/justification/tree/layout.js — laying out the justification tree (pure computation)
//
//  Input: a justification spec. Output, in the same shape as the other types' layouts:
//    nodes        React Flow nodes (position, size, the text to show)
//    connections  the geometry of the links (the polyline points, and where a label goes)
//    groupBoxes   the boxes around each issue's nodes
//    size         how large the content is
//
//  **edges is always an empty array**: the links are drawn by a self-drawn layer, from the points
//  computed here.
//
//  The tree. The end conclusion stands first and what supports it below, layer by layer: an issue's
//  conclusion, its elements and the norm they rest on, judgements, inferences, facts. A link runs
//  from the supporting node to the supported one, so ELK is given every link the other way round
//  (supported -> supporting) and puts the conclusion on top.
//
//  The issues. A group is an issue, and issues stand side by side, each in a box (the relationship
//  diagram's camps, for the same reason: ELK cannot lay out a box around nodes that sit in different
//  layers). So:
//    1. each issue is laid out by ELK on its own, from the links inside it; nodes that belong to no
//       issue (the end conclusion) are one more unboxed group of their own, put above the issues;
//    2. the issues are set side by side, tops aligned, each as tall as its own content;
//    3. every link is routed by the orthogonal router (procedure/flow/router.js): fewest bends, then
//       shortest, clear of every node and issue title, few crossings; links of one stance into one
//       node share a trunk (five facts into one element read as one bundle);
//    4. a link that has a label of its own gets a spot on its line.
//
//  Everything is computed in one frame, the vertical one (layers down, issues across). The horizontal
//  orientation is that picture transposed, exactly as in the relationship diagram: a tree read from
//  the conclusion on the left to the facts on the right. One code path, two orientations.
//
//  Kept out of this file on purpose: what `holds` and `stance` look like. They are paint only (the
//  renderer), so the geometry never moves when a node is struck through.
// ============================================================

import { validateJustification, hintsOfJustification, stanceOf } from './rules.js'
import { elkLayoutSync } from '../../procedure/flow/elk.js'
import { toPathD, toCurveD } from '../../procedure/flow/layout.js'
import { routeLink } from '../../procedure/flow/router.js'
import { toReal } from '../../procedure/flow/columns.js'
import { titleBoxOf, edgesOfBox, portCostFor, segsOf, placeOnLine, fallbackRoute } from '../../relationship/graph/layout.js'
import { tEn } from '../../../core/i18n.js'
import { textEm } from '../../fact/cardGeometry.js'
import { crossScore, routedCrossings } from './crossings.js'
import {
  PAD,
  LAYER_GAP,
  NODE_GAP,
  ISSUE_GAP,
  TOP_GAP,
  GROUP_PAD_TOP,
  GROUP_PAD,
  SCALE_HINT_NODES,
  CROSS_COST,
  SEARCH_MARGIN,
  FOLD_NOTE_W,
  GROUP_TITLE_FONT,
  sizeOf,
  labelBox,
} from './metrics.js'

/** How many seeds ELK is tried with for each issue */
const LAYOUT_TRIES = 8

/** How many of the best-ranked placements of an issue are routed for real, to choose among them */
const REAL_TRIES = 4

const emptyStats = () => ({ nodes: 0, copies: 0, links: 0, groups: 0, layers: 0, widest: 0, kinds: {}, hidden: 0 })

/** ELK's options: layers down, the written order breaks ties, links orthogonal (only the nodes are used) */
const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': String(NODE_GAP),
  'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
  'elk.spacing.edgeNode': '16',
  'elk.spacing.edgeEdge': '12',
  'elk.spacing.edgeLabel': '4',
  'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.edgeLabels.inline': 'false',
  'elk.separateConnectedComponents': 'false',
}

/**
 * Lay out one justification spec.
 *
 * The signature matches the other types' (spec, fields, view, orientation), because the registry
 * calls them all with the same four parameters. justification has no views (spec §0.10); view is
 * accepted and unused.
 */
export function buildJustificationGraph(spec, fields = {}, view, orientation = 'horizontal') {
  // The interface, the geometry report and an export all lay out the same diagram again and again, and a big
  // one takes a second: the last few layouts are kept, keyed by the diagram's content and the orientation.
  // What is returned is read, never changed.
  // The issues folded up are part of what is laid out, so they are part of the key
  const collapsed = Array.isArray(fields?.collapsed) ? [...fields.collapsed].sort() : []
  let key
  try {
    key = `${orientation}|${collapsed.join(',')}|${JSON.stringify(spec)}`
  } catch {
    key = null
  }
  if (key !== null && cache.has(key)) {
    const hit = cache.get(key)
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const built = layOut(spec, orientation, new Set(collapsed))
  if (key !== null) {
    cache.set(key, built)
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
  }
  return built
}

const CACHE_SIZE = 6
const cache = new Map()

function layOut(spec, orientation, collapsed) {
  const errors = validateJustification(spec)
  const hints = hintsOfJustification(spec)
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

  const nodes = spec.nodes
  const allLinks = spec.links
  const groups = Array.isArray(spec.groups) ? spec.groups : []
  const groupById = new Map(groups.map((g) => [g.id, g]))
  if (nodes.length > SCALE_HINT_NODES) {
    hints.push(tEn('jhint.tooLarge', { n: nodes.length, limit: SCALE_HINT_NODES }))
  }

  // ── where each node stands ──
  // A fact or a norm is a leaf and may support things in several issues. It stays one node in the data,
  // and is drawn once in every issue that uses it (a copy carries the id of the node it copies, and the
  // reader sees it is the same one): the issue box then holds all it needs, and no line has to run across
  // the picture to a fact that stands in another box. A leaf that only supports things in one issue stands
  // in that issue, wherever it says its own `groupId` is; one that supports only unboxed nodes stays where
  // it says.
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const isBoxed = (gid) => groups.some((g) => g.id === gid)
  const homeOf = (n) => (isBoxed(n.groupId) ? n.groupId : null)
  const allPlacements = []
  const standsIn = new Map() // node id -> its placements
  for (const n of nodes) {
    let homes = [homeOf(n)]
    if (n.kind === 'fact' || n.kind === 'norm') {
      const used = []
      for (const k of allLinks) {
        const g = k.from === n.id ? homeOf(nodeById.get(k.to)) : null
        if (g !== null && !used.includes(g)) used.push(g)
      }
      if (used.length) homes = used.includes(homes[0]) ? [homes[0], ...used.filter((g) => g !== homes[0])] : used
    }
    const mine = homes.map((g, j) => ({ pid: j === 0 ? n.id : `${n.id}~${g}`, node: n, group: g, copyOf: j === 0 ? null : n.id }))
    standsIn.set(n.id, mine)
    allPlacements.push(...mine)
  }
  // The placement a link meets at each end: a copy is chosen by the issue of the node at the other end
  const pidAt = (id, otherId) => {
    const mine = standsIn.get(id)
    if (mine.length === 1) return mine[0].pid
    const g = homeOf(nodeById.get(otherId))
    return (mine.find((m) => m.group === g) ?? mine[0]).pid
  }
  const allEnds = allLinks.map((k) => ({ from: pidAt(k.from, k.to), to: pidAt(k.to, k.from) }))

  // ── issues folded up ──
  // A folded issue keeps only what it sums up to: the nodes (not the facts and norms) that lead out of it, its
  // conclusion, or the element that goes straight to the end conclusion. Everything else in the issue, and
  // every link that touched it, is left out of the picture, and the issue's box says how many were. Nothing
  // is lost from the data, and a fact that another issue still uses stays there (each placement is judged
  // on its own).
  const leaf = (m) => m.node.kind === 'fact' || m.node.kind === 'norm'
  const placeOf = new Map(allPlacements.map((m) => [m.pid, m]))
  const leavesIssue = (m, gid) => allLinks.some((_, i) => allEnds[i].from === m.pid && placeOf.get(allEnds[i].to)?.group !== gid)
  const drop = new Set()
  const hiddenIn = new Map()
  for (const gid of collapsed) {
    if (!isBoxed(gid)) continue
    const inside = allPlacements.filter((m) => m.group === gid)
    let keep = inside.filter((m) => !leaf(m) && leavesIssue(m, gid))
    if (!keep.length) keep = inside.filter((m) => !leaf(m) && !allLinks.some((_, i) => allEnds[i].from === m.pid))
    if (!keep.length) keep = inside.slice(0, 1)
    const kept = new Set(keep.map((m) => m.pid))
    let n = 0
    for (const m of inside) {
      if (!kept.has(m.pid)) {
        drop.add(m.pid)
        n += 1
      }
    }
    hiddenIn.set(gid, n)
  }
  const placements = allPlacements.filter((m) => !drop.has(m.pid))
  const shownIdx = allLinks.map((_, i) => i).filter((i) => !drop.has(allEnds[i].from) && !drop.has(allEnds[i].to))
  const links = shownIdx.map((i) => allLinks[i])
  const ends = shownIdx.map((i) => allEnds[i])

  // ── the issues, in the order written; whoever belongs to none is laid above them ──
  const boxed = groups.map((g) => ({ group: g, members: placements.filter((m) => m.group === g.id) })).filter((c) => c.members.length)
  const loose = placements.filter((m) => m.group === null)
  const camps = boxed.length ? boxed : [{ group: null, members: placements }]
  const top = boxed.length && loose.length ? { group: null, members: loose } : null

  // ── sizes and label boxes, in the frame (transposed when the picture runs left to right) ──
  const sizes = new Map(nodes.map((n) => [n.id, sizeOf(n)]))
  const frameSize = (m) => {
    const { w, h } = sizes.get(m.node.id)
    return vertical ? { w, h } : { w: h, h: w }
  }
  const labelFrame = links.map((k) => {
    if (!k.label) return null
    const b = labelBox(k.label)
    return vertical ? b : { width: b.height, height: b.width }
  })

  // The title strip takes GROUP_PAD_TOP along the real top of a box: the frame's top when vertical, its left when transposed
  const PAD_A0 = vertical ? GROUP_PAD_TOP : GROUP_PAD
  const PAD_C0 = vertical ? GROUP_PAD : GROUP_PAD_TOP

  // ── routing a set of links: used for the real thing, and to try an issue's candidate placements ──
  const routeSet = (idxs, at, ctx) => {
    const { nodeRects, titles, borders, boxOf, nodeGroup } = ctx
    const touches = (r, bx) => r.x < bx.x + bx.w && bx.x < r.x + r.w && r.y < bx.y + bx.h && bx.y < r.y + r.h
    const segTouches = ([p, q], bx) =>
      Math.max(p[0], q[0]) >= bx.x && Math.min(p[0], q[0]) <= bx.x + bx.w && Math.max(p[1], q[1]) >= bx.y && Math.min(p[1], q[1]) <= bx.y + bx.h
    const dist = (i) => {
      const a = at.get(ends[i].from)
      const b = at.get(ends[i].to)
      return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    }
    // Short ones first, so the long ones go round them
    const order = [...idxs].sort((a, b) => dist(a) - dist(b) || a - b)
    const drawn = new Array(links.length)
    const done = []
    for (const i of order) {
      const k = links[i]
      const a = at.get(ends[i].from)
      const b = at.get(ends[i].to)
      // Links of one stance into one node may run along each other and share the port into it
      const routes = done.map((c) => {
        const o = links[c.index]
        return { points: c.points, share: ends[c.index].to === ends[i].to && stanceOf(o) === stanceOf(k) }
      })
      // A link inside one issue is first sought inside that issue's box only (a link between two issues,
      // in the rectangle that spans its two ends and a margin): the router's grid grows with everything it
      // is given, and a 40-node tree took six seconds when every link saw every node. Only what touches the
      // box is passed in; a link that cannot be routed there is routed among everything.
      const around = (m) => {
        const x0 = Math.min(a.x, b.x) - m
        const y0 = Math.min(a.y, b.y) - m
        return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) + m - x0, h: Math.max(a.y + a.h, b.y + b.h) + m - y0 }
      }
      const box =
        nodeGroup.get(ends[i].from) && nodeGroup.get(ends[i].from) === nodeGroup.get(ends[i].to)
          ? boxOf.get(nodeGroup.get(ends[i].from))
          : around(SEARCH_MARGIN)
      const route = (inBox) =>
        routeLink({
          from: a,
          to: b,
          nodes: inBox ? nodeRects.filter((r) => touches(r, inBox)) : nodeRects,
          blocks: inBox ? titles.filter((r) => touches(r, inBox)) : titles,
          routes: inBox ? routes.filter((r) => segsOf(r.points).some((sg) => segTouches(sg, inBox))) : routes,
          borders: inBox ? borders.filter((sg) => segTouches(sg, inBox)) : borders,
          bounds: inBox ?? undefined,
          portCost: portCostFor(a, b),
          crossCost: CROSS_COST,
          sidePorts: true,
        })
      const points = route(box) ?? route(null) ?? fallbackRoute(a, b)
      const c = { index: i, points, labelAt: null, labelSize: labelFrame[i] ?? null }
      drawn[i] = c
      done.push(c)
    }
    return { drawn, order }
  }

  // ── ① each issue by ELK, on its own, compact ──
  const layCamp = (members, ci) => {
    const inside = new Set(members.map((m) => m.pid))
    const inner = links.map((k, i) => i).filter((i) => inside.has(ends[i].from) && inside.has(ends[i].to))
    const graphOf = (seed, normAbove) => ({
      id: `issue${ci}`,
      layoutOptions: { ...ELK_OPTIONS, 'elk.randomSeed': String(seed) },
      children: members.map((m) => ({ id: m.pid, width: frameSize(m).w, height: frameSize(m).h })),
      // every link the other way round: the supported node is the parent, so the conclusion stands on top
      edges: inner.map((i) => {
        const k = links[i]
        return {
          id: `k${i}`,
          // a norm is either the parent of what it is the basis of (one layer above its elements, beside the issue's
          // conclusion) or one more supporter among the facts on the far side of them. The first reads best;
          // the second is the only way to keep every line apart when a norm is the basis of several elements
          // that all lead to one conclusion (conclusion and norm on the two sides of the elements).
          sources: [normAbove && stanceOf(k) === 'basis' ? ends[i].from : ends[i].to],
          targets: [normAbove && stanceOf(k) === 'basis' ? ends[i].to : ends[i].from],
          ...(labelFrame[i] ? { labels: [{ id: `l${i}`, text: k.label, width: labelFrame[i].width, height: labelFrame[i].height }] } : {}),
        }
      }),
    })
    // ELK's sweep is a heuristic and its outcome depends on a seed: lay the issue out with several, and keep
    // the picture whose links (drawn as straight lines between the node centres) cross least. The seeds are
    // fixed, so the same data always gives the same picture.
    const hasNorm = inner.some((i) => stanceOf(links[i]) === 'basis')
    const candidates = []
    for (const normAbove of hasNorm ? [true, false] : [true]) {
      for (let seed = 0; seed < LAYOUT_TRIES; seed += 1) {
        const tried = elkLayoutSync(graphOf(seed, normAbove))
        const rect = new Map(tried.children.map((c) => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]))
        // a norm placed among the facts is a little worse off than one above: it has to be clearly better
        candidates.push({ tried, rect, score: crossScore(rect, inner.map((i) => ends[i])) + (normAbove ? 0 : 0.5) })
        if (candidates[candidates.length - 1].score === 0) break
      }
    }
    candidates.sort((a, b) => a.score - b.score)
    // The straight-line count only ranks them roughly (it cannot see which side a line leaves a node by), so the
    // best few are drawn for real, inside a box of their own, and the one with fewest real crossings wins.
    let laid = candidates[0].tried
    if (candidates[0].score > 0 && inner.length > 1) {
      let best = Infinity
      for (const cand of candidates.slice(0, REAL_TRIES).filter((c) => c.score <= candidates[0].score + 3)) {
        const padC = camps[ci]?.group ? PAD_C0 : 0
        const padA = camps[ci]?.group ? PAD_A0 : 0
        const at = new Map([...cand.rect].map(([id, r]) => [id, { ...r, x: padC + r.x, y: padA + r.y }]))
        const box = { groupId: 'try', x: 0, y: 0, w: cand.tried.width + padC + GROUP_PAD, h: padA + cand.tried.height + GROUP_PAD }
        const ctx = {
          nodeRects: [...at.values()],
          titles: camps[ci]?.group ? [titleBoxOf(box, camps[ci].group.label, vertical)] : [],
          borders: edgesOfBox(box),
          boxOf: new Map([['try', box]]),
          nodeGroup: new Map(members.map((m) => [m.pid, camps[ci]?.group ? 'try' : null])),
        }
        const { drawn } = routeSet(inner, at, ctx)
        const score = routedCrossings(inner.map((i) => drawn[i].points)) * 100 + cand.score
        if (score < best) {
          best = score
          laid = cand.tried
        }
      }
    }
    const at = new Map(laid.children.map((c) => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]))
    const tops = [...new Set([...at.values()].map((r) => Math.round(r.y)))].sort((m, n) => m - n)
    const level = new Map([...at].map(([id, r]) => [id, tops.indexOf(Math.round(r.y))]))
    const widest = Math.max(...tops.map((t) => [...at.values()].filter((r) => Math.round(r.y) === t).length))
    return { at, width: laid.width, height: laid.height, level, levels: tops.length, widest }
  }
  const lay = camps.map((c, ci) => layCamp(c.members, ci))
  const layTop = top ? layCamp(top.members, camps.length) : null

  // ── ② the issues side by side, tops aligned; the unboxed nodes centred above ──
  const placed = new Map()
  const boxes = []
  const levelOf = new Map()
  const topH = layTop ? layTop.height + TOP_GAP : 0
  const y0 = PAD + topH
  let cursor = PAD
  let lowest = PAD
  camps.forEach((camp, ci) => {
    const l = lay[ci]
    const padC = camp.group ? PAD_C0 : 0
    const padA = camp.group ? PAD_A0 : 0
    for (const [id, r] of l.at) {
      placed.set(id, { x: cursor + padC + r.x, y: y0 + padA + r.y, w: r.w, h: r.h })
      levelOf.set(id, l.level.get(id) + (layTop ? 1 : 0))
    }
    let w = l.width + padC + (camp.group ? GROUP_PAD : 0)
    let h = padA + l.height + (camp.group ? GROUP_PAD : 0)
    // A folded issue is a small box, and its title (the issue's name and how many are folded) has to fit on the
    // real top of it: the frame's width when vertical, its depth when the picture is transposed
    if (camp.group && collapsed.has(camp.group.id)) {
      const need = textEm(camp.group.label) * GROUP_TITLE_FONT + FOLD_NOTE_W + GROUP_PAD * 2
      if (vertical) w = Math.max(w, need)
      else h = Math.max(h, need)
    }
    if (camp.group) {
      boxes.push({
        groupId: camp.group.id,
        label: camp.group.label,
        x: cursor,
        y: y0,
        w,
        h,
        collapsed: collapsed.has(camp.group.id),
        hidden: hiddenIn.get(camp.group.id) ?? 0,
        total: allPlacements.filter((m) => m.group === camp.group.id).length,
      })
    }
    lowest = Math.max(lowest, y0 + h)
    cursor += w + ISSUE_GAP
  })
  const contentW = cursor - ISSUE_GAP
  if (layTop) {
    const x0 = PAD + Math.max(0, (contentW - PAD - layTop.width) / 2)
    for (const [id, r] of layTop.at) {
      placed.set(id, { x: x0 + r.x, y: PAD + r.y, w: r.w, h: r.h })
      levelOf.set(id, 0)
    }
  }
  const frameWidth = Math.max(contentW, layTop ? PAD + layTop.width : 0) + PAD
  const frameHeight = lowest + PAD

  // ── ③ every link routed ──
  const nodeRects = [...placed.values()]
  const titles = boxes.map((b) => titleBoxOf(b, b.label, vertical))
  const borders = boxes.flatMap(edgesOfBox)
  const nodeGroup = new Map(placements.map((m) => [m.pid, boxes.some((bx) => bx.groupId === m.group) ? m.group : null]))
  const boxOf = new Map(boxes.map((bx) => [bx.groupId, bx]))
  const { drawn, order } = routeSet(links.map((k, i) => i), placed, { nodeRects, titles, borders, boxOf, nodeGroup })

  // ── ④ the labels that exist, each on its own line ──
  const placedLabels = []
  const rectOf = (c) => ({ x: c.labelAt.x, y: c.labelAt.y, w: c.labelSize.width, h: c.labelSize.height })
  for (const i of order) {
    const c = drawn[i]
    if (!c.labelSize) continue
    const others = drawn.filter((o) => o !== c)
    c.labelAt = placeOnLine(c.points, c.labelSize, nodeRects, [...titles, ...placedLabels.map(rectOf)], others, borders)
    placedLabels.push(c)
  }

  // ── out of the frame, transposed when the picture runs left to right ──
  const real = toReal({ placed, boxes, connections: drawn, width: frameWidth, height: frameHeight }, vertical)
  const size = { ...real.size }
  const connections = real.connections.map((c) => {
    const k = links[c.index]
    return {
      id: `k:${c.index}`,
      // the placements the line runs between (a copy has its own id); the nodes they stand for
      from: ends[c.index].from,
      to: ends[c.index].to,
      fromNode: k.from,
      toNode: k.to,
      stance: stanceOf(k),
      label: k.label ?? null,
      points: c.points,
      d: toPathD(c.points),
      dCurve: toCurveD(c.points),
      labelAt: c.labelAt,
      labelSize: c.labelSize,
    }
  })
  // A route can reach past the boxes, and a label past the last issue: the content grows to hold them
  for (const c of connections) {
    for (const [x, y] of c.points) {
      size.width = Math.max(size.width, x + PAD)
      size.height = Math.max(size.height, y + PAD)
    }
    if (c.labelAt && c.labelSize) {
      size.width = Math.max(size.width, c.labelAt.x + c.labelSize.width + PAD)
      size.height = Math.max(size.height, c.labelAt.y + c.labelSize.height + PAD)
    }
  }

  const sourceById = new Map((spec.sources ?? []).map((s) => [s.id, s]))
  const nameOf = new Map(nodes.map((n) => [n.id, n.label]))
  // What each node is joined to, for its overlay: its grounds (links into it) and what it supports (links out of it)
  const groundsOf = (id) =>
    allLinks.filter((k) => k.to === id).map((k) => ({ id: k.from, stance: stanceOf(k), text: nameOf.get(k.from), label: k.label ?? null }))
  const supportsOf = (id) =>
    allLinks.filter((k) => k.from === id).map((k) => ({ id: k.to, stance: stanceOf(k), text: nameOf.get(k.to), label: k.label ?? null }))
  const rfNodes = placements.map((m) => {
    const n = m.node
    const p = real.placed.get(m.pid)
    return {
      id: m.pid,
      type: 'jnode',
      position: { x: p.x, y: p.y },
      data: {
        node: n,
        // set on a copy: the id of the node it copies. `copies` is how many places the node is drawn in.
        copyOf: m.copyOf,
        copies: standsIn.get(n.id).length,
        // the issue this placement stands in (a copy's differs from the node's own `groupId`)
        groupId: m.group,
        w: p.w,
        h: p.h,
        // the width of the text column the size was computed for; the node draws its text in it
        textW: sizes.get(n.id).textW,
        groupLabel: groupById.get(m.group)?.label ?? '',
        sources: (n.sourceIds ?? []).map((id) => sourceById.get(id)).filter(Boolean),
        sourceCount: (n.sourceIds ?? []).filter((id) => sourceById.has(id)).length,
        grounds: groundsOf(n.id),
        supports: supportsOf(n.id),
        layer: levelOf.get(m.pid),
        vertical,
      },
    }
  })

  const kinds = {}
  for (const n of nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1
  const layers = Math.max(...lay.map((l) => l.levels)) + (layTop ? 1 : 0)
  const widest = Math.max(...lay.map((l) => l.widest), layTop ? layTop.widest : 0)

  return {
    errors,
    hints,
    orientation: dir,
    nodes: rfNodes,
    edges: [],
    connections,
    groupBoxes: real.stageBoxes.map((b) => ({ groupId: b.groupId, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, collapsed: b.collapsed, hidden: b.hidden, total: b.total })),
    size,
    stats: { nodes: nodes.length, copies: allPlacements.length - nodes.length, links: allLinks.length, groups: boxes.length, layers, widest, kinds, hidden: drop.size },
  }
}
