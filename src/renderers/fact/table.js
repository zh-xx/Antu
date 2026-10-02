// ============================================================
//  src/renderers/fact/table.js — every event of a fact diagram as a table, for the clipboard
//
//  "Copy as table" (issue #85): a lawyer pastes the chronology into a brief or a spreadsheet.
//  The clipboard gets two forms at once: HTML (a real table in Word, WPS, Pages, Google Docs)
//  and tab-separated text (cells in Excel and Numbers, and plain text everywhere else).
//
//  Pure JS: rows come in reading order (the chronicle's order, which is the slot order), and
//  only data is written, never interface state (the card field switches do not narrow it).
// ============================================================

import { chronicleItems } from './chronicle/layout.js'
import { formatTimeText } from './dateText.js'
import { translate } from '../../core/i18n.js'

const COLUMNS = ['time', 'event', 'summary', 'group', 'actors', 'sources']

/** { headers: string[], rows: string[][] } in reading order */
export function factTable(spec, lang) {
  const actorById = new Map((spec?.actors || []).filter(Boolean).map((a) => [a.id, a.name]))
  const sourceById = new Map((spec?.sources || []).filter(Boolean).map((s) => [s.id, s.name]))
  const groupById = new Map((spec?.groups || []).filter(Boolean).map((g) => [g.id, g.label]))
  const names = (ids, map) => (Array.isArray(ids) ? ids : []).map((id) => map.get(id) || id).join(lang === 'zh' ? '、' : ', ')
  const rows = chronicleItems(spec).map(({ event }) => [
    formatTimeText(event, lang),
    event.label ?? '',
    event.summary ?? '',
    groupById.get(event.groupId) ?? '',
    names(event.actorIds, actorById),
    names(event.sourceIds, sourceById),
  ])
  return { headers: COLUMNS.map((c) => translate(lang, `table.${c}`)), rows }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** The HTML form: a plain bordered table, which word processors keep as a table */
export function tableHtml({ headers, rows }, title = '') {
  const cell = (tag) => (v) => `<${tag} style="border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top">${escapeHtml(v)}</${tag}>`
  const head = `<tr>${headers.map(cell('th')).join('')}</tr>`
  const body = rows.map((r) => `<tr>${r.map(cell('td')).join('')}</tr>`).join('')
  const caption = title ? `<caption style="text-align:left;font-weight:bold;padding:4px 0">${escapeHtml(title)}</caption>` : ''
  return `<table style="border-collapse:collapse">${caption}<thead>${head}</thead><tbody>${body}</tbody></table>`
}

/** The text form: tab-separated, one event per line. Tabs and line breaks inside a cell become spaces. */
export function tableTsv({ headers, rows }) {
  const clean = (v) => String(v).replace(/[\t\r\n]+/g, ' ')
  return [headers, ...rows].map((r) => r.map(clean).join('\t')).join('\n')
}
