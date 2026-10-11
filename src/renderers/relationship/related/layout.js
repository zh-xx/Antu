// ============================================================
//  src/renderers/relationship/related/layout.js — the related-party list (issue #93): one party and everyone tied to it
//
//  The seventh way of drawing a relationship diagram, from the same JSON as the graph. A table centred on
//  one party (the one with most relations by default, as in the focus view; the reader can pick another):
//  one block for each party that has a relation with it, a line in it for each relation: its category, its
//  content as written with, under it, which way it runs in the two names ("A → B", or "A — B (no direction)"),
//  and the sources (that column is left out when no relation names one). The party's own cell, and its
//  sources, are as tall as all its relations together.
//
//  Nothing is listed under the table: the parties with no relation to the centre and the relations that do not
//  involve it are in the graph and the other views. Any valid JSON draws. Pure JS, so Node computes the
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
export const COLS = [190, 130, 400, 200]
const TOP_H = 70
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

  // The source column is left out when no relation in the table names a source
  const hasSources = rows.some((r) => r.sources.length)
  const cols = hasSources ? COLS : COLS.slice(0, 3)
  const tableW = cols.reduce((a, b) => a + b, 0)
  const width = tableW + PAD * 2
  const layer = { width, height: 0, links: [], pills: [], empties: [], frames: [], texts: [], table: null }
  const relCount = rows.reduce((n, r) => n + r.rels.length, 0)
  // The title stands over the middle of the table, bold and larger than the text under it
  layer.texts.push({ x: PAD, y: PAD, w: tableW, main: t('rel.related.title', { name: nameOf(centre) }), sub: t('rel.related.count', { n: rows.length, m: relCount }), tone: 'title' })
  const top = PAD + TOP_H
  const sep = t('rel.equity.sep')

  // One line of the table for each relation, so its category, content and direction stand level; the party
  // (and its sources) is one cell as tall as all its relations together
  const header = [t('rel.related.colParty'), t('rel.related.colKind'), t('rel.related.colText'), ...(hasSources ? [t('rel.related.colSource')] : [])]
  const xs = cols.reduce((acc, w) => [...acc, acc.at(-1) + w], [PAD])
  // Which way a relation runs is said with the two names, under the relation as written: no word to learn
  const directionOf = (r) => (isDirected(r) ? `${nameOf(r.from)} → ${nameOf(r.to)}` : t('rel.related.dirNone', { a: nameOf(r.from), b: nameOf(r.to) }))
  let y = top + HEAD_H
  const tableRows = []
  for (const row of rows) {
    const subs = row.rels.map((x) => {
      const dir = directionOf(x.rel)
      const texts = [[t(`rel.kind.${x.rel.kind}`)], [textOf(x.rel), dir]]
      const h = Math.max(...texts.map((lines, k) => lines.reduce((n, l) => n + lineCount(l, COLS[k + 1]), 0))) * LH + CELL_PAD_Y * 2
      return { texts, h }
    })
    const partyLines = [row.name, ...(row.role ? [row.role] : [])]
    const sourceLines = [row.sources.length ? row.sources.join(sep) : '—']
    const need = (lines, w) => lines.reduce((n, l) => n + lineCount(l, w) * LH, 0) + CELL_PAD_Y * 2
    const total = Math.max(subs.reduce((n, sb) => n + sb.h, 0), need(partyLines, COLS[0]), hasSources ? need(sourceLines, COLS[3]) : 0)
    // Any height the party's own cells need beyond its relations goes to the last relation's line
    const extra = total - subs.reduce((n, sb) => n + sb.h, 0)
    let sy = y
    subs.forEach((sb, k) => {
      const h = sb.h + (k === subs.length - 1 ? extra : 0)
      const cells = sb.texts.map((lines, c) => ({ x: xs[c + 1], w: COLS[c + 1], lines, bold: false, sub: lines.length > 1 }))
      if (k === 0) {
        cells.unshift({ x: xs[0], w: COLS[0], lines: partyLines, bold: true, y, h: total })
        if (hasSources) cells.push({ x: xs[3], w: COLS[3], lines: sourceLines, bold: false, y, h: total })
      }
      tableRows.push({ id: k === 0 ? row.id : `${row.id}#${k}`, party: row.id, y: sy, h, sep: k === subs.length - 1, cells })
      sy += h
    })
    y += total
  }
  layer.table = { x: PAD, y: top, w: tableW, headH: HEAD_H, xs, header: header.map((text, i) => ({ x: xs[i], w: cols[i], text })), rows: tableRows, bottom: y }

  const sections = sectionWriter(layer, tableW, y + SECTION_GAP)
  if (!rows.length) sections.empty(t('rel.related.none', { name: nameOf(centre) }), t('rel.related.noneHint'))
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
