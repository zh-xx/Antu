// ============================================================
//  src/renderers/relationship/summary/layout.js — the camp summary (issue #93): the camps as blocks
//
//  The ninth way of drawing a relationship diagram, from the same JSON as the graph. When there are many
//  parties the graph draws every one; here each camp (`groups`) is one block listing its members, and the
//  parties of no camp stand as single boxes. Between two blocks there is one line, and its label says how
//  many relations run between them and of which kinds ("claim 1 · guarantee 2"). It answers "which side
//  stands where against which", and it is the only view that stays readable with twenty parties.
//
//    levels   left to right: the line between two blocks runs from the side the most of its relations run
//             from (the creditor's camp before the debtor's, the holder's before the held's)
//    inside   the relations between two members of one camp are counted in the block's foot
//    under    every relation, written out: first those between blocks, then those inside a camp, so every
//             relation is on the page once
//
//  With no `groups`, every party is its own box and the view then looks like the graph; the report says so.
//  Any valid JSON draws. Pure JS, so Node computes the same geometry for antu_layout and the tests check
//  every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected, RELATION_KINDS } from '../graph/rules.js'
import { layeredGraph, bezierAt, pathOf } from '../layered.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { wrapLineCount } from '../../fact/cardGeometry.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
export const BLOCK_W = 280
export const MAX_MEMBERS = 8
const BLOCK_PAD = 18
const TITLE_H = 28
const LINE_H = 22
const FOOT_H = 26
const NODE_GAP = 40
/** Between two levels: room for the lines and their labels */
const LEVEL_GAP = 200
const MIN_CONTENT_W = 760
const SCALE = { latin: 1.2, cjk: 1.06 }
const FONT = 13

const lineCount = (text, width) => Math.max(1, wrapLineCount(text, width / FONT, SCALE))

/**
 * The units: each camp with members is a block, each party of no camp a unit of its own.
 * @returns [{ id, group | null, members: entity[] }] camps in written order, then the single parties
 */
export function summaryUnits(spec) {
  const known = new Set((spec.groups ?? []).map((g) => g.id))
  const units = []
  for (const g of spec.groups ?? []) {
    const members = spec.entities.filter((e) => e.groupId === g.id)
    if (members.length) units.push({ id: `g:${g.id}`, group: g, members })
  }
  for (const e of spec.entities) if (!known.has(e.groupId)) units.push({ id: e.id, group: null, members: [e] })
  return units
}

/**
 * The lines between units and what is inside each.
 * @returns { between: [{ key, a, b, rels }], inside: Map unit id -> relation[] }
 *   a -> b is the way the line reads: the unit most of the relations run from
 */
export function summaryLines(spec, units) {
  const unitOf = new Map(units.flatMap((u) => u.members.map((m) => [m.id, u.id])))
  const pairs = new Map()
  const inside = new Map(units.map((u) => [u.id, []]))
  for (const r of spec.relations) {
    const u = unitOf.get(r.from)
    const v = unitOf.get(r.to)
    if (u === v) {
      inside.get(u).push(r)
      continue
    }
    const key = [u, v].sort().join('|')
    if (!pairs.has(key)) pairs.set(key, { key, ends: [u, v].sort(), rels: [] })
    pairs.get(key).rels.push(r)
  }
  const between = [...pairs.values()].map((p) => {
    const [x, y] = p.ends
    const fromX = p.rels.filter((r) => unitOf.get(r.from) === x).length
    const fromY = p.rels.length - fromX
    // The side more of the relations run from comes first; a tie keeps the written order of the first relation
    const first = unitOf.get(p.rels[0].from)
    const a = fromX > fromY ? x : fromY > fromX ? y : first
    return { key: p.key, a, b: a === x ? y : x, rels: p.rels }
  })
  return { between, inside }
}

export function buildSummaryGraph(spec, fields = {}) {
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
  const sep = t('rel.equity.sep')
  const units = summaryUnits(spec)
  const unitById = new Map(units.map((u) => [u.id, u]))
  const { between, inside } = summaryLines(spec, units)
  const campCount = units.filter((u) => u.group).length

  // A block: the camp's name, its members (the first MAX_MEMBERS), a foot with the counts
  const kindsText = (rels) => {
    const n = new Map()
    for (const r of rels) n.set(r.kind, (n.get(r.kind) ?? 0) + 1)
    return RELATION_KINDS.filter((k) => n.has(k)).map((k) => `${t(`rel.kind.${k}`)} ${n.get(k)}`).join(' · ')
  }
  const blockOf = (u, index) => {
    const shown = u.members.slice(0, MAX_MEMBERS)
    const lines = shown.map((m) => (m.role ? `${m.label}（${m.role}）` : m.label))
    if (u.members.length > shown.length) lines.push(t('rel.summary.moreMembers', { n: u.members.length - shown.length }))
    const inner = inside.get(u.id)
    const foot = t('rel.summary.foot', { n: u.members.length, k: inner.length, kinds: kindsText(inner) })
    const innerW = BLOCK_W - BLOCK_PAD * 2
    const h = BLOCK_PAD * 2 + TITLE_H + lines.reduce((s, l) => s + lineCount(l, innerW) * LINE_H, 0) + FOOT_H + (foot.length * FONT * 1.1 > innerW ? FOOT_H / 2 : 0)
    return { id: u.id, w: BLOCK_W, h, title: u.group.label, lines, foot, tone: index % 2 }
  }
  const blocks = new Map()
  units.filter((u) => u.group).forEach((u, i) => blocks.set(u.id, blockOf(u, i)))
  const sizeOf = (id) => (blocks.has(id) ? blocks.get(id) : party.sizes.get(id))

  const edges = between.map((b) => ({ key: b.key, from: b.a, to: b.b }))
  const g = layeredGraph(units.map((u) => u.id), edges, sizeOf, { horizontal: true, gapAcross: NODE_GAP, gapAlong: LEVEL_GAP })
  const contentW = Math.max(g.size.width, MIN_CONTENT_W - PAD * 2)
  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], blocks: [], empties: [], frames: [], texts: [] }
  for (const [id, b] of g.boxes) {
    if (blocks.has(id)) layer.blocks.push({ ...blocks.get(id), x: b.x + PAD, y: b.y + PAD })
    else nodes.push({ id, type: 'rnode', position: { x: b.x + PAD, y: b.y + PAD }, data: party.dataOf(entityById.get(id), { layer: 0, hintKey: 'rel.previewHint', vertical: false }) })
  }
  for (const b of between) {
    const link = g.links.get(b.key)
    const at = bezierAt(link.segs.at(-1), 0.5)
    const counts = new Map()
    for (const r of b.rels) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
    // The line takes the colour of the kind with most relations (the first of those in the usual order)
    const kind = RELATION_KINDS.filter((k) => counts.has(k)).sort((x, y) => counts.get(y) - counts.get(x))[0]
    const allRun = b.rels.every((r) => isDirected(r) && (unitById.get(b.a).members.some((m) => m.id === r.from)))
    layer.links.push({ d: pathOf(link.segs, PAD, PAD), kind, back: link.back, via: link.via, arrow: allRun ? 'end' : 'none', width: 1.6 + Math.min(3, b.rels.length * 0.4) })
    layer.pills.push({ x: at[0] + PAD, y: at[1] + PAD, text: kindsText(b.rels), kind, back: link.back, relId: b.rels[0].id })
  }

  const sections = sectionWriter(layer, contentW, g.size.height + PAD + SECTION_GAP)
  const between2 = between.flatMap((b) => b.rels)
  const inner2 = [...inside.values()].flat()
  const line = (r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })
  if (between2.length) sections.section(t('rel.summary.between', { n: between2.length }), between2.map(line))
  if (inner2.length) sections.section(t('rel.summary.inside', { n: inner2.length }), inner2.map(line))
  const omitted = units.filter((u) => u.group && u.members.length > MAX_MEMBERS)
  if (omitted.length) sections.section(t('rel.summary.members', { n: omitted.length }), omitted.map((u) => ({ main: `${u.group.label}${t('rel.equity.colon')}${u.members.map((m) => m.label).join(sep)}` })))
  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__summary__',
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
    blocks: campCount,
    singles: units.length - campCount,
    lines: between.length,
    betweenRelations: between2.length,
    insideRelations: inner2.length,
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
