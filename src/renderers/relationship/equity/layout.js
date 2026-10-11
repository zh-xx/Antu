// ============================================================
//  src/renderers/relationship/equity/layout.js — the equity tree (issue #91): who holds what, top to bottom
//
//  The fourth way of drawing a relationship diagram, from the same JSON as the graph. Only `equity`
//  relations are drawn as the tree: a holder above what it holds, each line carrying its `share` as a
//  pill ("not stated" where the data has none). It is an aid for reading a case, not a due-diligence
//  chart: nothing is added to what the data says, and it does not claim to be complete.
//
//    tree      the parties with an equity relation, in levels (longest path from a holder that is held by
//              no one), the order inside a level chosen to keep the lines short
//    company   with several separate structures a company is picked (relationship/scope.js): the picture holds it
//              at the top and everyone below it; the lines above it are listed under it ("Above it"); a company
//              with nothing below it keeps the ones above in its picture
//    below     "Indirect holdings": for each ultimate holder (held by no one), what it holds through
//              others, as the sum of the products along each path ("55% × 80% = 44%"); only when every
//              share on every path is stated, otherwise the row says it cannot be computed
//
//  A cross-holding (a cycle) is allowed: one line of each cycle is drawn dashed, upward, and flagged,
//  and it is left out of the levels and of the products. A line that skips levels goes around the boxes
//  between: it has a waypoint in each level, placed like a thin empty box. What the picture leaves out (the parties and
//  relations that are not equity, or not in the company's picture) is not listed: the graph and the other views hold
//  every relation. Any valid JSON draws (no equity at all has an
//  explicit empty state). Pure JS, so Node computes the same geometry for antu_layout and the tests
//  check every example.
// ============================================================

import { validateRelationship, hintsOfRelationship } from '../graph/rules.js'
import { classifyLayers, layeredGraph, placePills, pathOf, equalWidths } from '../layered.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { splitScope, companyOf, hasSeveral } from '../scope.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { pillW, pillH } from '../pill.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
const NODE_GAP = 40
/** Between two levels: room for the lines and the pills on them */
const LEVEL_GAP = 96
const MIN_CONTENT_W = 760
/** At most this many rows in the list of indirect holdings; the rest is counted */
export const MAX_INDIRECT_ROWS = 30

/** The text of a share: "55%" (a share may be 33.5) */
export const shareText = (share) => `${Number(Number(share).toFixed(2))}%`

/**
 * The structure of the tree, no geometry.
 * @returns {
 *   edges:     the equity relations, each with `back: true` when it closes a cross-holding,
 *   ids:       the parties in the tree, in written order,
 *   level:     Map id -> level (0 = held by no one),
 *   roots:     ids of the ultimate holders (no incoming line except a back line),
 *   rest:      relations that are not equity,
 *   above:     with a company chosen, the equity relations above it (its holders), written under the picture,
 *   apart:     entities not in the picture (no equity relation, or outside the chosen company's picture),
 *   company:   the party whose picture it is, null for all of it,
 *   companies: the parties in the whole tree, which the reader may pick from,
 * }
 */
export function classifyEquity(spec, asked) {
  const all = spec.relations.filter((r) => r.kind === 'equity').map((r) => ({ key: r.id, rel: r, from: r.from, to: r.to, back: false }))
  const inAll = new Set(all.flatMap((e) => [e.from, e.to]))
  const treeIds = spec.entities.map((e) => e.id).filter((id) => inAll.has(id))
  // One party's picture (relationship/scope.js): it at the top and everyone below it; the lines above it are listed
  const company = companyOf(asked, treeIds, all)
  const split = company ? splitScope(all, company) : null
  const edges = split ? split.drawn : all
  const above = split ? split.above.map((e) => e.rel) : []
  const drawn = new Set(edges.map((e) => e.key))
  const aboveIds = new Set(above.map((r) => r.id))
  const rest = spec.relations.filter((r) => !drawn.has(r.id) && !aboveIds.has(r.id))
  const inTree = new Set([...(company ? [company] : []), ...edges.flatMap((e) => [e.from, e.to])])
  const ids = spec.entities.map((e) => e.id).filter((id) => inTree.has(id))
  const inAbove = new Set(above.flatMap((r) => [r.from, r.to]))
  const apart = spec.entities.filter((e) => !inTree.has(e.id) && !inAbove.has(e.id))
  const { back, level, roots } = classifyLayers(ids, edges)
  for (const e of edges) e.back = back.has(e.key)
  return { edges, ids, level, roots, rest, above, apart, company, several: hasSeveral(treeIds, all), companies: treeIds }
}

/**
 * What each ultimate holder holds through others: for every holder R held by no one and every party X
 * below it reached by at least one path of two or more lines, the total over all paths of the product of
 * the shares, and the terms. `total` is null when a share on a path is not stated.
 * @returns [{ holder, held, total, terms: string[] | null }]
 */
export function indirectHoldings(spec, parts = classifyEquity(spec)) {
  const out = new Map(parts.ids.map((id) => [id, []]))
  for (const e of parts.edges) if (!e.back) out.get(e.from).push(e)
  const rows = []
  for (const root of parts.roots) {
    // All simple paths from the root: the tree is a DAG once back lines are out, so every walk ends
    const found = new Map() // held id -> { paths: number[][] | null (unknown), multi: bool }
    const go = (id, shares, known) => {
      for (const e of out.get(id)) {
        const next = [...shares, e.rel.share]
        const ok = known && typeof e.rel.share === 'number'
        const rec = found.get(e.to) ?? { paths: [], unknown: false, long: false }
        if (!ok) rec.unknown = true
        else rec.paths.push(next)
        if (next.length >= 2) rec.long = true
        found.set(e.to, rec)
        go(e.to, next, ok)
      }
    }
    go(root, [], true)
    for (const id of parts.ids) {
      const rec = found.get(id)
      if (!rec || !rec.long) continue
      if (rec.unknown) rows.push({ holder: root, held: id, total: null, terms: null })
      else {
        const products = rec.paths.map((p) => p.reduce((acc, s) => acc * (s / 100), 1) * 100)
        const total = products.reduce((a, b) => a + b, 0)
        rows.push({ holder: root, held: id, total: Math.round(total * 100) / 100, terms: rec.paths.map((p) => p.map(shareText).join(' × ')) })
      }
    }
  }
  return rows
}

export function buildEquityGraph(spec, fields = {}) {
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
  const parts = classifyEquity(spec, fields.company)
  const nameOf = (id) => entityById.get(id).label

  // ── the drawing: levels top to bottom, lines round the boxes (relationship/layered.js) ──
  const sizeOf = equalWidths(parts.ids, parts.level, (id) => party.sizes.get(id))
  const g = layeredGraph(parts.ids, parts.edges, sizeOf, { gapAcross: NODE_GAP, gapAlong: LEVEL_GAP })
  const backCount = parts.edges.filter((e) => e.back).length
  const treeSpan = g.size.width
  const rightRoom = backCount ? 24 : 0
  const contentW = Math.max(treeSpan + rightRoom, MIN_CONTENT_W - PAD * 2)
  // Centre the tree; a back line runs out to the right, which centring leaves room for
  const shift = PAD + (contentW - treeSpan - rightRoom) / 2

  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  for (const [id, b] of g.boxes) {
    nodes.push({ id, type: 'rnode', position: { x: b.x + shift, y: b.y + PAD }, data: party.dataOf(entityById.get(id), { layer: g.level.get(id), hintKey: 'rel.previewHint', w: b.w, textW: sizeOf(id).textW }) })
  }
  const levels = g.levels
  let y = g.size.height + PAD

  // ── the lines and their pills ──
  const pillTexts = parts.edges.map((e) => {
    const share = typeof e.rel.share === 'number' ? shareText(e.rel.share) : t('rel.equity.noShare')
    return e.back ? `${share} · ${t('rel.equity.cross')}` : share
  })
  const spots = placePills(parts.edges.map((e, i) => ({ seg: g.links.get(e.key).segs.at(-1), w: pillW(pillTexts[i]), h: pillH(pillTexts[i]), back: e.back, gathered: g.links.get(e.key).gathered })))
  parts.edges.forEach((e, i) => {
    const link = g.links.get(e.key)
    layer.links.push({ d: pathOf(link.segs, shift, PAD), back: e.back, via: link.via.map(([x, yy]) => [x + shift, yy + PAD]) })
    layer.pills.push({ x: spots[i][0] + shift, y: spots[i][1] + PAD, text: pillTexts[i], unknown: typeof e.rel.share !== 'number', back: e.back, relId: e.rel.id })
  })

  const sections = sectionWriter(layer, contentW, y + (levels.length ? SECTION_GAP : 0))
  const section = sections.section
  if (!parts.ids.length) sections.empty(t('rel.equity.noEquity'), t('rel.equity.noEquityHint'))

  // ── who is above the chosen company ──
  if (parts.above.length) {
    section(
      t('rel.equity.above', { n: parts.above.length }),
      parts.above.map((r) => ({ main: `${nameOf(r.from)} → ${nameOf(r.to)}${t('rel.equity.colon')}${typeof r.share === 'number' ? shareText(r.share) : t('rel.equity.noShare')}` })),
    )
  }

  // ── indirect holdings ──
  const indirect = indirectHoldings(spec, parts)
  if (indirect.length) {
    const shown = indirect.slice(0, MAX_INDIRECT_ROWS)
    const items = shown.map((r) =>
      r.total === null
        ? { main: `${nameOf(r.holder)} → ${nameOf(r.held)}: ${t('rel.equity.notComputable')}`, tone: 'note' }
        : { main: `${nameOf(r.holder)} → ${nameOf(r.held)}: ${shareText(r.total)}`, sub: r.terms.length > 1 || r.terms[0].includes('×') ? `${r.terms.join(' + ')}` : undefined },
    )
    if (indirect.length > shown.length) items.push({ main: t('rel.equity.moreRows', { n: indirect.length - shown.length }), tone: 'note' })
    section(t('rel.equity.indirect', { n: indirect.length }), items)
  }

  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__equity__',
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
    levels: levels.length,
    holders: parts.roots.length,
    treeParties: parts.ids.length,
    equityLines: parts.edges.length,
    noShare: parts.edges.filter((e) => typeof e.rel.share !== 'number').length,
    crossHoldings: parts.edges.filter((e) => e.back).length,
    indirect: indirect.length,
    apart: parts.apart.length,
    above: parts.above.length,
    other: parts.rest.length,
    company: parts.company,
    several: parts.several,
    companies: parts.companies.map((id) => ({ id, label: entityById.get(id).label })),
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
