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
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

export const MAX_CHAINS = 3
/** Chains longer than the shortest by more than this are not looked for */
const SLACK = 3
/** The search stops after this many chains found (a very tangled case); the count then says "at least" */
const SEARCH_CAP = 5000
const MIN_CONTENT_W = 760
const MIN_BOX_W = 150
/** Between two columns at the least; wider when a label has to sit on the line */
const MIN_GAP = 110
const PILL_MARGIN = 14
const ROW_TITLE_H = 24
const ROW_GAP = 40
const CARD_CLEAR = 108

/** How wide a label's pill is (CJK wider than Latin; the page's pill has 9px of padding each side and wraps at 220) */
export const pillW = (text) => Math.min(220, 20 + [...text].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 12.5 : 7.4), 0))

/**
 * Which column each party of each chain stands in: the two ends in the first and the last, the parties between
 * in the columns in between, and a party that two chains pass in the same column in both, so the rows read as
 * one picture. The longest chain sets the columns; a party another chain adds takes a free column in its place
 * between its neighbours; when that cannot be done in order, that row is spaced on its own.
 * @returns number[][]  per chain, the column of each of its parties
 */
export function columnsOf(chains) {
  if (!chains.length) return []
  const mid = Math.max(...chains.map((c) => c.nodes.length - 2))
  const last = mid + 1
  const colOf = new Map()
  const result = []
  const order = chains.map((c, i) => i).sort((a, b) => chains[b].nodes.length - chains[a].nodes.length || a - b)
  for (const ci of order) {
    const nodes = chains[ci].nodes
    const k = nodes.length - 2
    const interior = nodes.slice(1, -1)
    // The columns the parties already have, then the gaps between them filled evenly
    let cols = interior.map((id) => colOf.get(id) ?? null)
    const known = cols.filter((v) => v !== null)
    let ok = known.every((v, i) => i === 0 || v > known[i - 1]) && known.every((v) => v >= 1 && v <= last - 1)
    if (ok) {
      let i = 0
      while (i < k && ok) {
        if (cols[i] !== null) {
          i += 1
          continue
        }
        let j = i
        while (j < k && cols[j] === null) j += 1
        const lo = i === 0 ? 0 : cols[i - 1]
        const hi = j === k ? last : cols[j]
        const room = hi - lo - 1
        const count = j - i
        if (room < count) {
          ok = false
          break
        }
        for (let n = 0; n < count; n += 1) cols[i + n] = lo + 1 + Math.floor((n * room) / count)
        i = j
      }
    }
    if (!ok) cols = interior.map((_, i) => 1 + Math.floor((i * (last - 1)) / Math.max(1, k)))
    // Strictly increasing whatever happened above
    for (let i = 0; i < k; i += 1) cols[i] = Math.min(Math.max(cols[i], i === 0 ? 1 : cols[i - 1] + 1), last - (k - i))
    interior.forEach((id, i) => {
      if (!colOf.has(id)) colOf.set(id, cols[i])
    })
    result[ci] = [0, ...cols, last]
  }
  return result
}

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

  // One row per chain, written as a sentence: the two ends (dark) with the parties between, every line level.
  // Rows share columns by party, so a party that two chains pass stands over the other (see columnsOf).
  const chains = found.chains
  const shortestLen = chains[0]?.rels.length ?? 0
  const cols = columnsOf(chains)
  const nCols = chains.length ? Math.max(...cols.flat()) + 1 : 0
  const boxW = Math.max(MIN_BOX_W, ...[...new Set(chains.flatMap((c) => c.nodes))].map((id) => party.sizes.get(id).w))
  // The gap between two neighbouring columns is as wide as the widest label that has to sit on a line across it
  const gap = Array.from({ length: Math.max(0, nCols - 1) }, () => MIN_GAP)
  chains.forEach((c, ci) =>
    c.rels.forEach((r, i) => {
      const span = cols[ci][i + 1] - cols[ci][i]
      const need = (pillW(textOf(r)) + 2 * PILL_MARGIN - (span - 1) * boxW) / span
      for (let k = cols[ci][i]; k < cols[ci][i + 1]; k += 1) gap[k] = Math.max(gap[k], need)
    }),
  )
  const colX = [PAD]
  for (let k = 0; k < gap.length; k += 1) colX.push(colX[k] + boxW + gap[k])
  const contentRight = nCols ? colX[nCols - 1] + boxW : PAD
  const contentW = Math.max(contentRight - PAD, MIN_CONTENT_W - PAD * 2)
  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  const drawn = new Set()
  const drawnRels = new Set()
  // The label card at the top left covers the first 140 px or so: the first row starts below it
  let y = PAD + CARD_CLEAR
  chains.forEach((c, ci) => {
    layer.texts.push({ x: PAD, y, w: contentW, main: `${ci + 1}. ${t('rel.path.steps', { n: c.rels.length })}`, tone: 'row' })
    y += ROW_TITLE_H
    const h = Math.max(...c.nodes.map((id) => party.sizes.get(id).h))
    const cy = y + h / 2
    c.nodes.forEach((id, i) => {
      drawn.add(id)
      const end = i === 0 || i === c.nodes.length - 1
      nodes.push({
        id: `${id}@r${ci}`,
        type: 'rnode',
        position: { x: colX[cols[ci][i]], y },
        data: { ...party.dataOf(entityById.get(id), { layer: 0, hintKey: 'rel.previewHint', vertical: false, plain: true, end }), w: boxW, h, textW: boxW - 28 },
      })
    })
    c.rels.forEach((r, i) => {
      drawnRels.add(r.id)
      const x1 = colX[cols[ci][i]] + boxW
      const x2 = colX[cols[ci][i + 1]]
      // The line reads towards B; its arrowhead goes where the relation itself runs
      const arrow = !isDirected(r) ? 'none' : r.from === c.nodes[i] ? 'end' : 'start'
      layer.links.push({ d: `M ${x1} ${cy} L ${x2} ${cy}`, kind: r.kind, ink: true, back: false, via: [], arrow, width: c.rels.length === shortestLen ? 2.6 : 1.6 })
      layer.pills.push({ x: (x1 + x2) / 2, y: cy, text: textOf(r), kind: r.kind, ink: true, back: false, relId: r.id })
    })
    y += h + ROW_GAP
  })
  y = chains.length ? y - ROW_GAP + SECTION_GAP : y
  const more = found.total - chains.length
  if (chains.length && (more > 0 || found.truncated)) {
    layer.texts.push({ x: PAD, y: y - SECTION_GAP + 14, w: contentW, main: t('rel.path.more', { n: more, atLeast: found.truncated ? 1 : 0 }), tone: 'note' })
    y += 24
  }

  const sections = sectionWriter(layer, contentW, y)
  const sep = t('rel.equity.sep')
  if (!chains.length) sections.empty(t('rel.path.noChain', { a: nameOf(ends.from), b: nameOf(ends.to) }), t('rel.path.noChainHint'))
  const off = entities.filter((e) => !drawn.has(e.id))
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
    chains: chains.length,
    totalChains: found.total,
    truncated: found.truncated,
    shortest: found.shortest,
    drawnParties: drawn.size,
    off: off.length,
    offRels: offRels.length,
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
