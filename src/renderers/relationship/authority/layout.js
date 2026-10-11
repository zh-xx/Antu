// ============================================================
//  src/renderers/relationship/authority/layout.js — the authority chart (issue #93): who commands whom
//
//  The sixth way of drawing a relationship diagram, from the same JSON as the graph. Only the relations of
//  authority are drawn: `control` (the controller above the controlled), `employment` (the employer above
//  the employed) and `agency` (the principal above the agent), as an organisation chart, each line
//  carrying the text the graph would put on it. It answers "who is above whom".
//
//  With several separate structures a company is picked (relationship/scope.js): the picture holds it at the top
//  and everyone below it, and the lines above it are listed under it ("Above it"); a party with nothing below it
//  keeps the ones above in its picture. What the picture leaves out is not listed: the graph and the other views
//  hold every relation. A case with no authority says so. A cycle of authority is allowed (it shows what the data says): one line of it is drawn dashed, round the side,
//  and flagged, and it is left out of the levels (relationship/layered.js).
//
//  Any valid JSON draws. Pure JS, so Node computes the same geometry for antu_layout and the tests check
//  every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { classifyLayers, layeredGraph, placePills, pathOf, equalWidths } from '../layered.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { splitScope, companyOf, hasSeveral } from '../scope.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { pillW, pillH } from '../pill.js'
import { tEn } from '../../../core/i18n.js'

export const AUTHORITY_KINDS = ['control', 'employment', 'agency']
const NODE_GAP = 40
/** Between two levels: room for the lines and their labels, which can run to a few lines */
const LEVEL_GAP = 160
const MIN_CONTENT_W = 760

/**
 * The structure, no geometry.
 * @returns { edges, ids, level, roots, rest, apart, company, companies }  as classifyEquity, for the three kinds of authority
 */
export function classifyAuthority(spec, asked) {
  const all = spec.relations.filter((r) => AUTHORITY_KINDS.includes(r.kind)).map((r) => ({ key: r.id, rel: r, from: r.from, to: r.to, back: false }))
  const inAll = new Set(all.flatMap((e) => [e.from, e.to]))
  const chartIds = spec.entities.map((e) => e.id).filter((id) => inAll.has(id))
  // One party's picture (relationship/scope.js): it at the top and everyone below it; the lines above it are listed
  const company = companyOf(asked, chartIds, all)
  const split = company ? splitScope(all, company) : null
  const edges = split ? split.drawn : all
  const above = split ? split.above.map((e) => e.rel) : []
  const drawn = new Set(edges.map((e) => e.key))
  const aboveIds = new Set(above.map((r) => r.id))
  const rest = spec.relations.filter((r) => !drawn.has(r.id) && !aboveIds.has(r.id))
  const inChart = new Set([...(company ? [company] : []), ...edges.flatMap((e) => [e.from, e.to])])
  const ids = spec.entities.map((e) => e.id).filter((id) => inChart.has(id))
  const inAbove = new Set(above.flatMap((r) => [r.from, r.to]))
  const apart = spec.entities.filter((e) => !inChart.has(e.id) && !inAbove.has(e.id))
  const { back, level, roots } = classifyLayers(ids, edges)
  for (const e of edges) e.back = back.has(e.key)
  return { edges, ids, level, roots, rest, above, apart, company, several: hasSeveral(chartIds, all), companies: chartIds }
}

export function buildAuthorityGraph(spec, fields = {}) {
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
  const parts = classifyAuthority(spec, fields.company)

  const sizeOf = equalWidths(parts.ids, parts.level, (id) => party.sizes.get(id))
  const g = layeredGraph(parts.ids, parts.edges, sizeOf, { gapAcross: NODE_GAP, gapAlong: LEVEL_GAP })
  const backCount = parts.edges.filter((e) => e.back).length
  const contentW = Math.max(g.size.width + (backCount ? 24 : 0), MIN_CONTENT_W - PAD * 2)
  const shift = PAD + (contentW - g.size.width - (backCount ? 24 : 0)) / 2

  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  for (const [id, b] of g.boxes) {
    nodes.push({ id, type: 'rnode', position: { x: b.x + shift, y: b.y + PAD }, data: party.dataOf(entityById.get(id), { layer: g.level.get(id), hintKey: 'rel.previewHint', w: b.w, textW: sizeOf(id).textW }) })
  }
  const pillTexts = parts.edges.map((e) => (e.back ? `${textOf(e.rel)} · ${t('rel.authority.cycle')}` : textOf(e.rel)))
  const spots = placePills(parts.edges.map((e, i) => ({ seg: g.links.get(e.key).segs.at(-1), w: pillW(pillTexts[i]), h: pillH(pillTexts[i]), back: e.back, gathered: g.links.get(e.key).gathered })))
  parts.edges.forEach((e, i) => {
    const link = g.links.get(e.key)
    layer.links.push({ d: pathOf(link.segs, shift, PAD), kind: e.rel.kind, back: e.back, via: link.via.map(([x, yy]) => [x + shift, yy + PAD]), arrow: isDirected(e.rel) ? 'end' : 'none' })
    layer.pills.push({ x: spots[i][0] + shift, y: spots[i][1] + PAD, text: pillTexts[i], kind: e.rel.kind, back: e.back, relId: e.rel.id })
  })

  const sections = sectionWriter(layer, contentW, g.size.height + PAD + (parts.ids.length ? SECTION_GAP : 0))
  if (!parts.ids.length) sections.empty(t('rel.authority.none'), t('rel.authority.noneHint'))
  if (parts.above.length) {
    sections.section(
      t('rel.authority.above', { n: parts.above.length }),
      parts.above.map((r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })),
    )
  }
  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__authority__',
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
    levels: g.levels.length,
    tops: parts.roots.length,
    chartParties: parts.ids.length,
    authorityLines: parts.edges.length,
    cycles: backCount,
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
