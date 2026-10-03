// ============================================================
//  src/renderers/relationship/related/layout.js — the related-party list (issue #93): one party and everyone tied to it
//
//  The seventh way of drawing a relationship diagram, from the same JSON as the graph. A table centred on
//  one party (the one with most relations by default, as in the focus view; the reader can pick another):
//  one row for each party that has a relation with it, giving the kinds, every relation as written (with
//  an arrow for which way it runs: → the centre is the `from`, ← the centre is the `to`, ↔ no direction),
//  and the sources. A party with several relations to the centre has them in one row.
//
//  Under the table: the parties with no relation to the centre, and every relation that does not involve
//  the centre, so every relation is on the page once. It is a table, so "Copy as table" puts it on the
//  clipboard (and a lawyer can paste it into a brief). Any valid JSON draws. Pure JS, so Node computes the
//  same geometry for antu_layout and the tests check every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { wrapLineCount } from '../../fact/cardGeometry.js'
import { makePartyData } from '../partyData.js'
import { defaultCentre } from '../focus/layout.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
export const COLS = [190, 150, 400, 200]
const TOP_H = 52
const HEAD_H = 34
const FONT = 13
const LH = 19
const CELL_PAD_X = 10
const CELL_PAD_Y = 8
/** Node estimates widen Latin text a little (the page's real font is wider than the em table) */
const SCALE = { latin: 1.2, cjk: 1.06 }

const lineCount = (text, width) => Math.max(1, wrapLineCount(text, (width - CELL_PAD_X * 2) / FONT, SCALE))

/** The centre actually used: the one asked for when the data has it, else the default */
export function centreOf(spec, asked) {
  return spec.entities.some((e) => e.id === asked) ? asked : defaultCentre(spec)
}

/** The arrow for which way a relation runs, seen from the centre */
const arrowOf = (r, centre) => (!isDirected(r) ? '↔' : r.from === centre ? '→' : '←')

/**
 * The rows, no geometry.
 * @returns { rows: [{ id, name, role, kinds: string[], rels: [{ rel, arrow }], sources: string[] }], none: entity[], rest: relation[] }
 */
export function relatedRows(spec, centre) {
  const sourceName = new Map((spec.sources ?? []).map((s) => [s.id, s.name]))
  const byParty = new Map()
  for (const r of spec.relations) {
    if (r.from !== centre && r.to !== centre) continue
    const other = r.from === centre ? r.to : r.from
    if (!byParty.has(other)) byParty.set(other, [])
    byParty.get(other).push({ rel: r, arrow: arrowOf(r, centre) })
  }
  const rows = []
  for (const e of spec.entities) {
    if (e.id === centre || !byParty.has(e.id)) continue
    const rels = byParty.get(e.id)
    rows.push({
      id: e.id,
      name: e.label,
      role: e.role ?? '',
      kinds: [...new Set(rels.map((x) => x.rel.kind))],
      rels,
      sources: [...new Set(rels.flatMap((x) => (x.rel.sourceIds ?? []).map((id) => sourceName.get(id) ?? id)))],
    })
  }
  // The party's own relation to itself cannot exist (validation); a relation with a party that is the centre twice either
  const none = spec.entities.filter((e) => e.id !== centre && !byParty.has(e.id))
  const rest = spec.relations.filter((r) => r.from !== centre && r.to !== centre)
  return { rows, none, rest }
}

export function buildRelatedGraph(spec, fields = {}) {
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
  const centre = centreOf(spec, fields.centre)
  const { rows, none, rest } = relatedRows(spec, centre)

  const tableW = COLS.reduce((a, b) => a + b, 0)
  const width = tableW + PAD * 2
  const layer = { width, height: 0, links: [], pills: [], empties: [], frames: [], texts: [], table: null }
  layer.texts.push({ x: PAD, y: PAD, w: tableW, main: t('rel.related.title', { name: nameOf(centre) }), sub: t('rel.related.legend') })
  const top = PAD + TOP_H
  const sep = t('rel.equity.sep')

  // Cells: the text of each, and how tall a row must be for the longest
  const cellsOf = (row) => {
    const rels = row.rels.map((x) => `${x.arrow} ${textOf(x.rel)}`)
    return [
      { lines: [row.name, ...(row.role ? [row.role] : [])], bold: true },
      { lines: [row.kinds.map((k) => t(`rel.kind.${k}`)).join(sep)] },
      { lines: rels },
      { lines: [row.sources.length ? row.sources.join(sep) : '—'] },
    ]
  }
  const header = [t('rel.related.colParty'), t('rel.related.colKind'), t('rel.related.colText'), t('rel.related.colSource')]
  const xs = COLS.reduce((acc, w) => [...acc, acc.at(-1) + w], [PAD])
  let y = top + HEAD_H
  const tableRows = rows.map((row) => {
    const cells = cellsOf(row).map((c, i) => ({ ...c, h: c.lines.reduce((n, l) => n + lineCount(l, COLS[i]) * LH, 0) }))
    const h = Math.max(...cells.map((c) => c.h)) + CELL_PAD_Y * 2
    const out = { id: row.id, y, h, cells: cells.map((c, i) => ({ x: xs[i], w: COLS[i], lines: c.lines, bold: c.bold ?? false })) }
    y += h
    return out
  })
  layer.table = { x: PAD, y: top, w: tableW, headH: HEAD_H, xs, header: header.map((text, i) => ({ x: xs[i], w: COLS[i], text })), rows: tableRows, bottom: y }

  const sections = sectionWriter(layer, tableW, y + SECTION_GAP)
  if (!rows.length) sections.empty(t('rel.related.none', { name: nameOf(centre) }), t('rel.related.noneHint'))
  if (none.length && rows.length) sections.section(t('rel.related.apart', { n: none.length }), [{ main: none.map((e) => e.label).join(sep) }])
  if (none.length && !rows.length) sections.section(t('rel.related.apart', { n: none.length }), [{ main: none.map((e) => e.label).join(sep) }])
  if (rest.length) {
    sections.section(
      t('rel.related.rest', { n: rest.length }),
      rest.map((r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })),
    )
  }
  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height

  const nodes = [
    {
      id: '__related__',
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
    },
  ]
  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  return {
    errors,
    hints,
    nodes,
    edges: [],
    connections: [],
    centre,
    defaultCentre: defaultCentre(spec),
    related: rows.length,
    none: none.length,
    rest: rest.length,
    size: { width, height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}

/** The table for the clipboard: the same rows as the picture, as text */
export function relatedTable(spec, centre, t = tEn) {
  if (validateRelationship(spec).length) return { headers: [], rows: [] }
  const party = makePartyData(spec, t)
  const textIndex = new Map(spec.relations.map((r, i) => [r.id, i]))
  const sep = t('rel.equity.sep')
  const c = centreOf(spec, centre)
  const { rows } = relatedRows(spec, c)
  return {
    headers: [t('rel.related.colParty'), t('rel.related.colKind'), t('rel.related.colText'), t('rel.related.colSource')],
    rows: rows.map((r) => [r.name, r.kinds.map((k) => t(`rel.kind.${k}`)).join(sep), r.rels.map((x) => `${x.arrow} ${party.labelTexts[textIndex.get(x.rel.id)]}`).join('; '), r.sources.join(sep)]),
  }
}
