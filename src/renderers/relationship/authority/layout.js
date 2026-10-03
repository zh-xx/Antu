// ============================================================
//  src/renderers/relationship/authority/layout.js — the authority chart (issue #93): who commands whom
//
//  The sixth way of drawing a relationship diagram, from the same JSON as the graph. Only the relations of
//  authority are drawn: `control` (the controller above the controlled), `employment` (the employer above
//  the employed) and `agency` (the principal above the agent), as an organisation chart, each line
//  carrying the text the graph would put on it. It answers "who is above whom".
//
//  Everything else is listed under the picture, so that every relation is on the page once: the parties
//  with no relation of authority, and every relation that is not one. A case with none says so. A cycle of
//  authority is allowed (it shows what the data says): one line of it is drawn dashed, round the side,
//  and flagged, and it is left out of the levels (relationship/layered.js).
//
//  Any valid JSON draws. Pure JS, so Node computes the same geometry for antu_layout and the tests check
//  every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { classifyLayers, layeredGraph, bezierAt, pathOf } from '../layered.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

export const AUTHORITY_KINDS = ['control', 'employment', 'agency']
const NODE_GAP = 40
/** Between two levels: room for the lines and their labels, which can run to a few lines */
const LEVEL_GAP = 160
const MIN_CONTENT_W = 760

/**
 * The structure, no geometry.
 * @returns { edges, ids, level, roots, rest, apart }  as classifyEquity, for the three kinds of authority
 */
export function classifyAuthority(spec) {
  const edges = spec.relations.filter((r) => AUTHORITY_KINDS.includes(r.kind)).map((r) => ({ key: r.id, rel: r, from: r.from, to: r.to, back: false }))
  const rest = spec.relations.filter((r) => !AUTHORITY_KINDS.includes(r.kind))
  const inChart = new Set(edges.flatMap((e) => [e.from, e.to]))
  const ids = spec.entities.map((e) => e.id).filter((id) => inChart.has(id))
  const apart = spec.entities.filter((e) => !inChart.has(e.id))
  const { back, level, roots } = classifyLayers(ids, edges)
  for (const e of edges) e.back = back.has(e.key)
  return { edges, ids, level, roots, rest, apart }
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
  const parts = classifyAuthority(spec)

  const g = layeredGraph(parts.ids, parts.edges, (id) => party.sizes.get(id), { gapAcross: NODE_GAP, gapAlong: LEVEL_GAP })
  const backCount = parts.edges.filter((e) => e.back).length
  const contentW = Math.max(g.size.width + (backCount ? 24 : 0), MIN_CONTENT_W - PAD * 2)
  const shift = PAD + (contentW - g.size.width - (backCount ? 24 : 0)) / 2

  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  for (const [id, b] of g.boxes) {
    nodes.push({ id, type: 'rnode', position: { x: b.x + shift, y: b.y + PAD }, data: party.dataOf(entityById.get(id), { layer: g.level.get(id), hintKey: 'rel.previewHint' }) })
  }
  // Lines leaving one party fan out to the parties below it, and their labels are long: so that they do not
  // sit side by side, the labels of one party's lines take turns at two heights along the line
  const rank = new Map()
  for (const id of parts.ids) {
    const out = parts.edges.filter((e) => !e.back && e.from === id).sort((p, q) => g.links.get(p.key).segs.at(-1)[3][0] - g.links.get(q.key).segs.at(-1)[3][0])
    out.forEach((e, i) => rank.set(e.key, i))
  }
  for (const e of parts.edges) {
    const link = g.links.get(e.key)
    const at = bezierAt(link.segs.at(-1), e.back ? 0.5 : (rank.get(e.key) ?? 0) % 2 ? 0.84 : 0.5)
    layer.links.push({ d: pathOf(link.segs, shift, PAD), kind: e.rel.kind, back: e.back, via: link.via.map(([x, yy]) => [x + shift, yy + PAD]), arrow: isDirected(e.rel) ? 'end' : 'none' })
    layer.pills.push({ x: at[0] + shift, y: at[1] + PAD, text: e.back ? `${textOf(e.rel)} · ${t('rel.authority.cycle')}` : textOf(e.rel), kind: e.rel.kind, back: e.back, relId: e.rel.id })
  }

  const sections = sectionWriter(layer, contentW, g.size.height + PAD + (parts.ids.length ? SECTION_GAP : 0))
  if (!parts.edges.length) sections.empty(t('rel.authority.none'), t('rel.authority.noneHint'))
  if (parts.apart.length) sections.section(t('rel.authority.apart', { n: parts.apart.length }), [{ main: parts.apart.map((e) => e.label).join(t('rel.equity.sep')) }])
  if (parts.rest.length) {
    sections.section(
      t('rel.authority.other', { n: parts.rest.length }),
      parts.rest.map((r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })),
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
    other: parts.rest.length,
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
