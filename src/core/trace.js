// ============================================================
//  src/core/trace.js — rows for the in-page source overview (issue 124)
//
//  Provenance lives in the diagram JSON (`sources` + `sourceIds`). The page used to show it
//  only in per-card popovers. The overview lists the items a diagram type is about, each with
//  the materials it rests on, so a reader can check without opening thirty cards.
//
//  Plain JS, no React: the shell builds the panel from these rows, and unit tests assert the
//  shape on every example type. Kind-specific "only what this drawing shows" filtering stays
//  for a later slice; the first list follows the type's primary collections.
// ============================================================

import { sourcesOf } from './items.js'

/** A short place string from a source's `loc` (file/page, article, case number, URL). */
export function locTextOf(source) {
  if (!source || typeof source !== 'object') return ''
  const loc = source.loc && typeof source.loc === 'object' ? source.loc : {}
  switch (source.type) {
    case 'statute': {
      const article = loc.article != null && loc.article !== '' ? String(loc.article) : ''
      return [loc.lawName, article ? `art. ${article}` : '', loc.version].filter(Boolean).join(' · ')
    }
    case 'case':
      return [loc.caseNo, loc.court].filter(Boolean).join(' · ')
    case 'web':
      return loc.url || loc.site || ''
    default:
      return [
        loc.file,
        loc.page != null && loc.page !== '' ? `p. ${loc.page}` : '',
        loc.clause,
      ]
        .filter(Boolean)
        .join(' · ')
  }
}

/**
 * The items a diagram type puts on the picture, in diagram order, each with its sources.
 *
 * @returns {Array<{
 *   id: string,
 *   collection: string,
 *   label: string,
 *   detail: string,
 *   sources: object[],
 * }>}
 */
export function traceRowsOf(spec) {
  if (!spec || typeof spec !== 'object') return []
  const rows = []

  const add = (collection, item) => {
    if (!item || typeof item !== 'object' || item.id == null) return
    rows.push({
      id: String(item.id),
      collection,
      label: String(item.label || item.name || item.id),
      detail: item.detail ? String(item.detail) : '',
      sources: sourcesOf(spec, item),
    })
  }

  switch (spec.type) {
    case 'fact':
      for (const slot of spec.slots || []) {
        for (const ev of slot?.events || []) add('events', ev)
      }
      break
    case 'procedure':
      for (const n of spec.nodes || []) add('nodes', n)
      for (const r of spec.rules || []) add('rules', r)
      break
    case 'relationship':
      for (const e of spec.entities || []) add('entities', e)
      for (const r of spec.relations || []) add('relations', r)
      break
    case 'justification': {
      const walk = (nodes) => {
        for (const n of nodes || []) {
          add('nodes', n)
          if (Array.isArray(n.children)) walk(n.children)
          if (Array.isArray(n.nodes)) walk(n.nodes)
        }
      }
      walk(spec.nodes)
      if (Array.isArray(spec.issues)) {
        for (const issue of spec.issues) {
          walk(issue?.nodes)
          walk(issue?.children)
          if (issue?.id != null && (issue.label || issue.name)) add('issues', issue)
        }
      }
      break
    }
    default:
      break
  }

  return rows
}

/** Source types present in the rows, in stable enum order, for the filter chips. */
export const SOURCE_TYPE_ORDER = Object.freeze([
  'statute',
  'case',
  'contract',
  'evidence',
  'document',
  'web',
  'other',
])

export function sourceTypesIn(rows) {
  const seen = new Set()
  for (const row of rows || []) {
    for (const s of row.sources || []) {
      if (s?.type) seen.add(s.type)
    }
  }
  return SOURCE_TYPE_ORDER.filter((t) => seen.has(t))
}
