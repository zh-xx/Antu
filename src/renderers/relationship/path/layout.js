// ============================================================
//  src/renderers/relationship/path/layout.js — the relation path (issue #93): how two parties are tied
//
//  The eighth way of drawing a relationship diagram, from the same JSON as the graph. Pick a start party A
//  and an end party B: the shortest chains of relations that tie them are drawn left to right, A on the
//  left. "How are these two connected?" is a different question from "who is around this party" (the focus
//  view), and the answer is a few chains, not a picture of everything.
//
//    walking   the direction of a relation is ignored when looking for a chain (a holder and what it holds
//              are tied), but each line keeps its own arrowhead, so the chain still says who holds whom
//    which     the shortest chains first, at most 3 (ties broken by the order the relations are written);
//              a chain may not pass a party twice. How many more there are is said under the picture
//    default   A and B are the two parties furthest apart (the ends of the longest shortest chain), so the
//              view is never empty; the reader picks others
//    under     each drawn chain written out as text, then the parties and relations on no drawn chain, so
//              every relation is on the page once
//
//  If A and B are not tied at all, the view says so. Any valid JSON draws. Pure JS, so Node computes the same
//  geometry for antu_layout and the tests check every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { layeredGraph, bezierAt, pathOf } from '../layered.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

export const MAX_CHAINS = 3
/** Chains longer than the shortest by more than this are not looked for */
const SLACK = 3
/** The search stops after this many chains found (a very tangled case); the count then says "at least" */
const SEARCH_CAP = 5000
const NODE_GAP = 36
/** Between two levels: room for the lines and their labels, which are written along the line */
const LEVEL_GAP = 190
const MIN_CONTENT_W = 760

/** Distances from one party over every relation, direction ignored: Map id -> steps */
function distancesFrom(spec, from) {
  const next = new Map(spec.entities.map((e) => [e.id, []]))
  for (const r of spec.relations) {
    next.get(r.from).push(r.to)
    next.get(r.to).push(r.from)
  }
  const dist = new Map([[from, 0]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    for (const n of next.get(queue[i])) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(queue[i]) + 1)
        queue.push(n)
      }
    }
  }
  return dist
}

/** The two parties furthest apart (written order breaks ties), so the first view always has a chain */
export function defaultEnds(spec) {
  let best = null
  for (const a of spec.entities) {
    const dist = distancesFrom(spec, a.id)
    for (const b of spec.entities) {
      if (b.id === a.id || !dist.has(b.id)) continue
      if (best === null || dist.get(b.id) > best.d) best = { from: a.id, to: b.id, d: dist.get(b.id) }
    }
  }
  return best ? { from: best.from, to: best.to } : { from: spec.entities[0].id, to: spec.entities[Math.min(1, spec.entities.length - 1)].id }
}

/** The two ends actually used: the ones asked for when the data has both (and they differ), else the default */
export function endsOf(spec, asked = {}) {
  const has = (id) => spec.entities.some((e) => e.id === id)
  if (has(asked.from) && has(asked.to) && asked.from !== asked.to) return { from: asked.from, to: asked.to }
  return defaultEnds(spec)
}

/**
 * The chains from `from` to `to`: shortest first, then in written order of their relations.
 * @returns { chains: [{ nodes: id[], rels: relation[] }], total, truncated, shortest }
 *   chains: at most MAX_CHAINS; total: how many were found (counted up to SEARCH_CAP and SLACK longer than the shortest)
 */
export function findChains(spec, from, to) {
  const dist = distancesFrom(spec, to)
  if (!dist.has(from)) return { chains: [], total: 0, truncated: false, shortest: 0 }
  const shortest = dist.get(from)
  const adj = new Map(spec.entities.map((e) => [e.id, []]))
  spec.relations.forEach((r, i) => {
    adj.get(r.from).push({ r, i, other: r.to })
    adj.get(r.to).push({ r, i, other: r.from })
  })
  const found = []
  let truncated = false
  const walk = (id, nodes, rels, seen) => {
    if (found.length >= SEARCH_CAP) {
      truncated = true
      return
    }
    if (id === to) {
      found.push({ nodes: [...nodes], rels: [...rels] })
      return
    }
    // Stay within reach of the end: the steps left must cover the distance still to go
    for (const { r, other } of adj.get(id)) {
      if (seen.has(other)) continue
      if (rels.length + 1 + (dist.get(other) ?? Infinity) > shortest + SLACK) continue
      seen.add(other)
      nodes.push(other)
      rels.push(r)
      walk(other, nodes, rels, seen)
      rels.pop()
      nodes.pop()
      seen.delete(other)
    }
  }
  walk(from, [from], [], new Set([from]))
  const order = new Map(spec.relations.map((r, i) => [r.id, i]))
  found.sort((a, b) => a.rels.length - b.rels.length || a.rels.map((r) => order.get(r.id)).join(',').localeCompare(b.rels.map((r) => order.get(r.id)).join(','), undefined, { numeric: true }))
  // Two chains over the same relations (the same chain met twice) are one
  const seenKeys = new Set()
  const unique = found.filter((c) => {
    const key = c.rels.map((r) => r.id).sort().join('|')
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
  return { chains: unique.slice(0, MAX_CHAINS), total: unique.length, truncated, shortest }
}

export function buildPathGraph(spec, fields = {}) {
  const errors = validateRelationship(spec)
  const hints = hintsOfRelationship(spec)
  const empty = { errors, hints, nodes: [], edges: [], connections: [], size: { width: 0, height: 0 }, stats: { entities: 0, relations: 0, groups: 0, kinds: {} } }
  if (errors.length) return empty
  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const entities = spec.entities
  const relations = spec.relations
  if (entities.length > SCALE_HINT_ENTITIES) hints.push(tEn('rhint.tooLarge', { n: entities.length, limit: SCALE_HINT_ENTITIES }))
  const entityById = new Map(entities.map((e) => [e.id, e]))
  const party = makePartyData(spec, t)
  const textIndex = new Map(relations.map((r, i) => [r.id, i]))
  const textOf = (r) => party.labelTexts[textIndex.get(r.id)]
  const nameOf = (id) => entityById.get(id).label
  const ends = endsOf(spec, fields)
  const found = findChains(spec, ends.from, ends.to)

  // The parties and relations of the drawn chains; each relation oriented along the first chain that has it
  const nodeIds = []
  const addNode = (id) => {
    if (!nodeIds.includes(id)) nodeIds.push(id)
  }
  addNode(ends.from)
  addNode(ends.to)
  const oriented = new Map() // relation id -> { from, to } in the way the picture reads (towards B)
  const shortestLen = found.chains[0]?.rels.length ?? 0
  const heavy = new Set() // relations of a shortest chain
  found.chains.forEach((c) => {
    c.rels.forEach((r, i) => {
      addNode(c.nodes[i])
      addNode(c.nodes[i + 1])
      if (!oriented.has(r.id)) oriented.set(r.id, { from: c.nodes[i], to: c.nodes[i + 1] })
      if (c.rels.length === shortestLen) heavy.add(r.id)
    })
  })
  const ids = entities.map((e) => e.id).filter((id) => nodeIds.includes(id))
  const edges = [...oriented].map(([key, o]) => ({ key, from: o.from, to: o.to }))

  const g = layeredGraph(ids, edges, (id) => party.sizes.get(id), { horizontal: true, gapAcross: NODE_GAP, gapAlong: LEVEL_GAP })
  const contentW = Math.max(g.size.width, MIN_CONTENT_W - PAD * 2)
  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  for (const [id, b] of g.boxes) {
    nodes.push({ id, type: 'rnode', position: { x: b.x + PAD, y: b.y + PAD }, data: party.dataOf(entityById.get(id), { layer: 0, hintKey: 'rel.previewHint', vertical: false }) })
  }
  const relById = new Map(relations.map((r) => [r.id, r]))
  for (const e of edges) {
    const rel = relById.get(e.key)
    const link = g.links.get(e.key)
    const o = oriented.get(e.key)
    // The line is drawn towards B; its arrowhead goes where the relation itself runs
    const arrow = !isDirected(rel) ? 'none' : rel.from === o.from ? 'end' : 'start'
    const at = bezierAt(link.segs.at(-1), 0.5)
    layer.links.push({ d: pathOf(link.segs, PAD, PAD), kind: rel.kind, back: link.back, via: link.via, arrow, width: heavy.has(rel.id) ? 3.2 : 1.8, opacity: heavy.has(rel.id) ? 1 : 0.85 })
    layer.pills.push({ x: at[0] + PAD, y: at[1] + PAD, text: textOf(rel), kind: rel.kind, back: link.back, relId: rel.id })
  }

  const top = (g.size.height || 0) + PAD
  const sections = sectionWriter(layer, contentW, top + SECTION_GAP)
  // The chains, written out
  const sep = t('rel.equity.sep')
  const chainText = (c) =>
    c.rels
      .map((r, i) => {
        const a = c.nodes[i]
        const label = textOf(r)
        const hop = !isDirected(r) ? `—${label}—` : r.from === a ? `—${label}→` : `←${label}—`
        return `${i === 0 ? nameOf(a) : ''} ${hop} ${nameOf(c.nodes[i + 1])}`
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  if (!found.chains.length) {
    sections.empty(t('rel.path.noChain', { a: nameOf(ends.from), b: nameOf(ends.to) }), t('rel.path.noChainHint'))
  } else {
    const items = found.chains.map((c, i) => ({ main: `${i + 1}. ${t('rel.path.steps', { n: c.rels.length })}: ${chainText(c)}` }))
    const more = found.total - found.chains.length
    if (more > 0 || found.truncated) items.push({ main: t('rel.path.more', { n: more, atLeast: found.truncated ? 1 : 0 }), tone: 'note' })
    sections.section(t('rel.path.chains', { n: found.chains.length }), items)
  }
  const drawnRels = new Set([...oriented.keys()])
  const off = entities.filter((e) => !nodeIds.includes(e.id))
  const offRels = relations.filter((r) => !drawnRels.has(r.id))
  if (off.length) sections.section(t('rel.path.off', { n: off.length }), [{ main: off.map((e) => e.label).join(sep) }])
  if (offRels.length) {
    sections.section(
      t('rel.path.offRels', { n: offRels.length }),
      offRels.map((r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })),
    )
  }
  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__path__',
    type: 'lineLayer',
    position: { x: 0, y: 0 },
    // Decoration layer: 1×1 for React Flow, drawn at full size inside (see fact/timeline/nodes.js cellsNode)
    width: 1,
    height: 1,
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    style: { pointerEvents: 'none' },
    data: layer,
  })

  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  return {
    errors,
    hints,
    nodes,
    edges: [],
    connections: [],
    from: ends.from,
    to: ends.to,
    defaultEnds: defaultEnds(spec),
    chains: found.chains.length,
    totalChains: found.total,
    truncated: found.truncated,
    shortest: found.shortest,
    drawnParties: nodeIds.length,
    off: off.length,
    offRels: offRels.length,
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
