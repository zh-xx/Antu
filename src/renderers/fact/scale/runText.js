// ============================================================
//  src/renderers/fact/scale/runText.js — the time range of a gathered run, as one short text
// ============================================================

import { formatDate } from '../dateText.js'

/** "21:53–22:26" within one day, "2032-04-13 21:00–2032-04-14 02:18" across days */
export function runRange(events, lang) {
  const dated = events.filter((e) => typeof e.date === 'string' && e.date).map((e) => e.date).sort()
  if (!dated.length) return ''
  const first = formatDate(dated[0], false, lang)
  const last = formatDate(dated[dated.length - 1], false, lang)
  if (first === last) return first
  const sameDay = dated[0].slice(0, 10) === dated[dated.length - 1].slice(0, 10)
  if (sameDay && first.includes(' ') && last.includes(' ')) return `${first}–${last.split(' ').pop()}`
  return `${first}–${last}`
}
