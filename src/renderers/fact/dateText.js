// ============================================================
//  src/renderers/fact/dateText.js — how a fact event's time is written
//
//  Shared by every fact kind (the timeline card, the chronicle's time column, the overlay), so
//  that one event never reads one way in one kind and another way in the next.
//
//  Language is passed in as a parameter: these functions live outside components, the "approx."
//  prefix has to follow the interface language, and they must not read global state.
// ============================================================

import { translate } from '../../core/i18n.js'

/** Turn an ISO 8601 time into readable display text */
export function formatDate(date, approx, lang) {
  // The local is named time, not t: inside a component t is the translation function, and a name clash silently picks the wrong thing.
  const [d, time] = String(date).split('T')
  const prefix = approx ? translate(lang, 'card.approxPrefix') : ''
  if (!time) return prefix + d
  const parts = time.split(':')
  const hhmm = parts.slice(0, 2).join(':')
  return `${prefix}${d} ${hhmm}${parts[2] ? ':' + parts[2] : ''}`
}

/** Display text for the end instant: on the same day only the time is written, across days the full date */
export function formatEnd(start, end, lang) {
  const full = formatDate(end, false, lang)
  const sameDay = String(start).split('T')[0] === String(end).split('T')[0]
  return sameDay && String(end).includes('T') ? full.split(' ').pop() : full
}

/**
 * The one line of time on a card.
 * With a dateEnd (a lasting event) it is written "start - end", which sets it apart from an
 * instantaneous event at a glance. Note this expresses a span in text only, never as length on
 * the timeline's axis: slots are equally spaced and real time is not, so drawing length by real
 * duration would deceive (in the corridor-charging case 4 seconds and 264 seconds take the same
 * distance).
 */
export function formatTimeText(event, lang) {
  // An event with no date (the material gives none): say so, do not show a blank or a made-up one
  if (!event.date) return translate(lang, 'card.dateUnknown')
  const start = formatDate(event.date, event.approx, lang)
  if (!event.dateEnd) return start
  return `${start} - ${formatEnd(event.date, event.dateEnd, lang)}`
}

/** Human-readable duration, for the overlay (the card line has no room for it) */
export function formatDuration(start, end, t) {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return ''
  let s = Math.round((b - a) / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const parts = []
  if (d) parts.push(t('card.unitDay', { n: d }))
  if (h) parts.push(t('card.unitHour', { n: h }))
  if (m) parts.push(t('card.unitMinute', { n: m }))
  if (s || !parts.length) parts.push(t('card.unitSecond', { n: s }))
  return parts.join(' ')
}

/**
 * The chronicle's time column: the date on its own line, the time of day under it, and the end
 * (if any) last. At most three lines; the layout reserves room for three.
 * With `sameDay` (the event above is on the same day) the date is left out and the time of day
 * stands alone, in bold: a column of the same date repeated is noise, and the day still reads
 * from the row where it first appears. An event with no time of day keeps its date.
 * @returns [{ text, strong }]
 */
export function whenLines(event, lang, sameDay = false) {
  if (!event.date) return [{ text: translate(lang, 'chronicle.dateUnknown'), strong: false }]
  const [d, time] = String(event.date).split('T')
  const prefix = event.approx ? translate(lang, 'card.approxPrefix') : ''
  const lines = [{ text: prefix + d, strong: true }]
  const clock = time ? formatDate(event.date, false, lang).split(' ').pop() : ''
  if (sameDay && clock) lines.shift()
  const lead = !lines.length
  if (!event.dateEnd) {
    if (clock) lines.push({ text: clock, strong: lead })
    return lines
  }
  const end = formatEnd(event.date, event.dateEnd, lang)
  // Same day with times: "20:14 – 20:16" on one line; otherwise the end gets a line of its own
  if (clock && !end.includes('-')) lines.push({ text: `${clock} – ${end}`, strong: lead })
  else {
    if (clock) lines.push({ text: clock, strong: lead })
    lines.push({ text: `– ${end}`, strong: false })
  }
  return lines
}
