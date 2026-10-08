// ============================================================
//  src/renderers/fact/dateOrder.js — does the order of the slots contradict the dates?
//
//  The order of the slots is the order of the events; `date` never reorders (spec/fact/schema-draft.md, "Order
//  mechanism"). The rule that goes with it: when the order clearly contradicts the dates, say so, and never reorder.
//
//  "Clearly" is read from the precision: a date is the span of time it names (a day is the whole day, a minute is
//  that minute), and the order is contradicted only when a later slot lies wholly before the span of the slot
//  before it. `2030-06-02` followed by `2030-06-02T20:14:03` overlaps, so it is not a contradiction. An event marked
//  `approx` is given one unit of its own precision of room on each side.
// ============================================================

import { tEn } from '../../core/i18n.js'

const FORM = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?)?)?$/

/** The span [from, to) in ms that an ISO 8601 date of truncated precision names, or null when it does not parse */
export function dateSpan(text) {
  const m = FORM.exec(typeof text === 'string' ? text.trim() : '')
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => (v === undefined ? undefined : Number(v)))
  const at = (yy, mm, dd, hh, mn, ss) => Date.UTC(yy, mm, dd, hh, mn, ss)
  let from
  let to
  if (mo === undefined) {
    from = at(y, 0, 1, 0, 0, 0)
    to = at(y + 1, 0, 1, 0, 0, 0)
  } else if (d === undefined) {
    from = at(y, mo - 1, 1, 0, 0, 0)
    to = at(y, mo, 1, 0, 0, 0)
  } else if (h === undefined) {
    from = at(y, mo - 1, d, 0, 0, 0)
    to = at(y, mo - 1, d + 1, 0, 0, 0)
  } else if (s === undefined) {
    from = at(y, mo - 1, d, h, mi, 0)
    to = from + 60_000
  } else {
    from = at(y, mo - 1, d, h, mi, s)
    to = from + 1000
  }
  return Number.isNaN(from) ? null : { from, to }
}

function spanOfEvent(event) {
  const start = dateSpan(event?.date)
  if (!start) return null
  let { from, to } = start
  const end = event.dateEnd === undefined ? null : dateSpan(event.dateEnd)
  if (end && end.to > from) to = Math.max(to, end.to)
  if (event.approx === true) {
    const unit = start.to - start.from
    from -= unit
    to += unit
  }
  return { from, to }
}

/**
 * The places where the slot order clearly contradicts the dates, as messages (English, like the other notes).
 * Each slot is compared with the nearest slot before it that has a date; events inside one slot are one time point
 * and are not compared with each other; an event without a date, or with a date that does not parse (validation
 * reports that), takes no part.
 */
export function dateOrderNotes(spec) {
  const notes = []
  let previous = null
  ;(Array.isArray(spec?.slots) ? spec.slots : []).forEach((slot, si) => {
    const dated = (Array.isArray(slot?.events) ? slot.events : [])
      .map((event, ei) => ({ event, ei, span: spanOfEvent(event) }))
      .filter((e) => e.span)
    if (dated.length === 0) return
    const span = { from: Math.min(...dated.map((e) => e.span.from)), to: Math.max(...dated.map((e) => e.span.to)) }
    if (previous && span.to <= previous.span.from) {
      const here = dated.find((e) => e.span.to <= previous.span.from) ?? dated[0]
      notes.push(
        tEn('note.dateOrder', {
          at: `slots[${si}].events[${here.ei}]`,
          id: here.event.id,
          date: here.event.date,
          beforeAt: `slots[${previous.si}].events[${previous.ei}]`,
          beforeId: previous.event.id,
          beforeDate: previous.event.date,
        }),
      )
    }
    const latest = dated.reduce((a, b) => (b.span.to > a.span.to ? b : a))
    previous = { span, si, ei: latest.ei, event: latest.event }
  })
  return notes
}
