// ============================================================
//  src/renderers/fact/chronicle/layout.js — the chronicle: every event in one column, in order
//
//  The second way of drawing a fact diagram, from the same JSON as the timeline (issue #85):
//    left   the time column (date on one line, time of day on the next)
//    middle one spine with a dot per event, coloured by group
//    right  the card: full title, summary and tags, never clamped — the card grows to fit. The group name is
//           not written on the card at all: it is the mark on the line (circle, square or diamond, with the
//           colour) and the legend, which the reader can click to light one group up
//  Between two time points a pill says how much time passed. A gap of 30 days or more is a
//  "long" gap: the pill turns amber and the spine is dashed there, so a reader sees at once
//  where the story jumps.
//
//  Pure JS (no components): the Node side computes the same geometry for antu_layout, and the
//  tests check every example against it.
//
//  Rules:
//    - order is the slot order (the slots array is the chronology); inside a slot, events are
//      sorted by date when every one of them has a date, otherwise kept as written
//    - views are not used: the chronicle shows every event once, so no view can fail to fit
//    - nothing is ever refused: errors is always empty (any valid fact JSON must draw here)
//    - card height comes from the text it holds (wrapLineCount), so no text is cut off
// ============================================================

import { groupOfEvent } from '../timeline/grid.js'
import { ACTOR_FONT, ACTOR_TAG_PAD, textWidth, wrapLineCount, wrapLinesBy } from '../cardGeometry.js'

/** Horizontal geometry. The time column ends at WHEN_W, its text right-aligned against the spine. */
export const WHEN_W = 150
export const SPINE_X = 174
export const CARD_X = 198
export const CARD_W = 560
export const CONTENT_W = CARD_X + CARD_W

/** Card padding and text metrics. The styles take these through CSS variables, never a second copy. */
export const PAD_X = 14
export const PAD_Y = 10
export const TITLE_FONT = 14
export const TITLE_LH = 20
export const SUMMARY_FONT = 12.5
export const SUMMARY_LH = 18
export const TAG_FONT = 11.5
export const TAG_LH = 20
const BLOCK_GAP = 4
const TAGS_GAP = 6
/** Horizontal gap between two tags on the tag row */
const TAG_SPACING = 10
/** A source count is short in any language ("3 sources", "来源 3"); this is a generous width for it */
const SOURCE_TAG_W = 90

export const CARD_INNER_W = CARD_W - PAD_X * 2

/**
 * How much wider than the em table the text may be drawn (see wrapLineCount). Measured over every
 * fact example in Chromium on Linux (DejaVu Sans, the widest of the common fonts): bold Latin
 * titles up to 1.14, regular Latin summaries up to 1.06, CJK up to 1.05. Each is rounded up, so a
 * card errs taller, never shorter, than its text.
 */
export const TITLE_SCALE = { latin: 1.2, cjk: 1.06 }
export const SUMMARY_SCALE = { latin: 1.12, cjk: 1.06 }

/** The time column: date line and time line */
export const WHEN_LH = 18
/** The spine dot sits on the middle of the title's first line */
export const DOT_SIZE = 13
export const DOT_Y = PAD_Y + TITLE_LH / 2

/** Vertical spacing between two cards, by what lies between them */
export const SPACING = {
  /** same time point (one slot): close together, no pill */
  sameSlot: 10,
  /** the gap cannot be told (a date is missing, or the times overlap): no pill */
  none: 22,
  /** a gap under 30 days: a grey pill */
  short: 38,
  /** a gap of 30 days or more: an amber pill and a dashed spine */
  long: 70,
}

/** The group legend above the first card */
export const LEGEND_H = 34

/** A gap of this many days or more is "long" */
export const LONG_GAP_DAYS = 30

const DAY = 86400000
const ISO_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2})(?::(\d{2})(?::(\d{2}))?)?)?)?)?$/

/** Split an ISO date into its numbers and how precise it is. null when it is not a date at all. */
export function parseIso(iso) {
  const m = typeof iso === 'string' ? ISO_RE.exec(iso) : null
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const prec = h != null ? 'time' : d != null ? 'day' : mo != null ? 'month' : 'year'
  return { y: +y, mo: mo ? +mo : 1, d: d ? +d : 1, h: h ? +h : 0, mi: mi ? +mi : 0, s: s ? +s : 0, prec }
}

const PREC_RANK = { year: 0, month: 1, day: 2, time: 3 }
const utc = (p) => Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)

/**
 * How much time passed from `from` to `to`, measured no finer than the coarser of the two dates
 * (a day-only date cannot say how many hours passed). Returns null when nothing can be said:
 * a date is missing, or `to` is not after `from` at that precision.
 *
 * The result is a message key with its values, so the browser and the Node report word it alike:
 *   { key, vars, long, approx }
 */
export function gapBetween(from, to, approx = false) {
  const a = parseIso(from)
  const b = parseIso(to)
  if (!a || !b) return null
  const prec = PREC_RANK[a.prec] <= PREC_RANK[b.prec] ? a.prec : b.prec
  const out = (key, vars, long) => ({ key, vars, long, approx: Boolean(approx) })
  if (prec === 'year' || prec === 'month') {
    const months = prec === 'year' ? (b.y - a.y) * 12 : (b.y - a.y) * 12 + (b.mo - a.mo)
    if (months <= 0) return null
    return monthsText(months, out)
  }
  if (prec === 'time') {
    const ms = utc(b) - utc(a)
    if (ms <= 0) return null
    if (ms < DAY) {
      const sec = Math.round(ms / 1000)
      if (sec < 60) return out('chronicle.gapSeconds', { n: sec }, false)
      if (sec < 3600) return out('chronicle.gapMinutes', { n: Math.round(sec / 60) }, false)
      let h = Math.floor(sec / 3600)
      let m = Math.round((sec - h * 3600) / 60)
      if (m === 60) {
        h += 1
        m = 0
      }
      return m ? out('chronicle.gapHoursMinutes', { h, m }, false) : out('chronicle.gapHours', { n: h }, false)
    }
    return daysText(Math.floor(ms / DAY), out)
  }
  // Day precision: count calendar days, the time of day (if any) left out
  const days = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY)
  if (days <= 0) return null
  return daysText(days, out)
}

/**
 * The same wording for a span already in milliseconds (the time scale's breaks): the largest
 * unit that fits, from seconds to years.
 */
export function gapOfMs(ms) {
  const out = (key, vars, long) => ({ key, vars, long, approx: false })
  if (!(ms > 0)) return null
  if (ms < DAY) {
    const sec = Math.round(ms / 1000)
    if (sec < 60) return out('chronicle.gapSeconds', { n: sec }, false)
    if (sec < 3600) return out('chronicle.gapMinutes', { n: Math.round(sec / 60) }, false)
    const h = Math.round(sec / 3600)
    return out('chronicle.gapHours', { n: h }, false)
  }
  return daysText(Math.round(ms / DAY), out)
}

function daysText(days, out) {
  if (days < LONG_GAP_DAYS) return out('chronicle.gapDays', { n: days }, false)
  return monthsText(Math.max(1, Math.round(days / 30.44)), out)
}

function monthsText(months, out) {
  const y = Math.floor(months / 12)
  const m = months % 12
  if (!y) return out('chronicle.gapMonths', { n: m }, true)
  if (!m) return out('chronicle.gapYears', { n: y }, true)
  return out('chronicle.gapYearsMonths', { y, m }, true)
}

/** The later of two ISO dates (mixed precision compares well enough by string: "2030-06" < "2030-06-02") */
const later = (a, b) => (a == null ? b : b == null ? a : a > b ? a : b)

/**
 * The reading order and what lies between neighbours. Pure data, no geometry.
 * @returns [{ event, slotIndex, first, gap, spacing, sameDay }]
 *   first   the first event of its slot
 *   gap     what passed since the previous time point (only on `first`, and null when unknown)
 *   spacing which SPACING applies above this card ('top' for the very first)
 *   sameDay the date is the same calendar day as the event above, so the time column leaves it out
 */
export function chronicleItems(spec) {
  const slots = Array.isArray(spec?.slots) ? spec.slots : []
  const items = []
  // The end of the previous time point: the latest instant any of its events reaches
  let prevEnd = null
  let prevApprox = false
  let prevKnown = false
  slots.forEach((slot, slotIndex) => {
    const events = (Array.isArray(slot?.events) ? slot.events : []).filter((e) => e && typeof e === 'object')
    if (!events.length) return
    const allDated = events.every((e) => typeof e.date === 'string' && e.date)
    const ordered = allDated ? [...events].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)) : events
    // When the slot starts: its earliest date (undated events say nothing)
    const start = ordered.find((e) => e.date)?.date ?? null
    const startApprox = ordered.some((e) => e.date && e.approx)
    ordered.forEach((event, i) => {
      const first = i === 0
      let gap = null
      let spacing = 'sameSlot'
      if (first) {
        if (!items.length) spacing = 'top'
        else {
          gap = prevKnown && allDated ? gapBetween(prevEnd, start, prevApprox || startApprox) : null
          spacing = gap ? (gap.long ? 'long' : 'short') : 'none'
        }
      }
      const day = typeof event.date === 'string' && event.date.length >= 10 ? event.date.slice(0, 10) : null
      const above = items.at(-1)?.event
      const sameDay = Boolean(day && above && typeof above.date === 'string' && above.date.slice(0, 10) === day && !event.approx && !above.approx)
      items.push({ event, slotIndex, first, gap, spacing, sameDay })
    })
    // A slot with an undated event cannot anchor the next gap
    prevKnown = allDated
    prevEnd = null
    for (const e of ordered) prevEnd = later(prevEnd, later(e.date, e.dateEnd))
    prevApprox = ordered.some((e) => e.approx)
  })
  return items
}

/** The mark of a group on the line: circle, square, diamond (a group's place in `groups`); `none` without a group */
export const GROUP_SHAPES = ['circle', 'square', 'diamond']
export function groupShapeOf(spec, event) {
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const i = groups.findIndex((g) => g?.id === groupOfEvent(spec)(event))
  return i < 0 ? 'none' : GROUP_SHAPES[Math.min(i, 2)]
}

/** Colour index of an event: its group's place in `groups` (0, 1, 2), or 2 (neutral grey) without one */
export function groupIndexOf(spec, event) {
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const i = groups.findIndex((g) => g?.id === groupOfEvent(spec)(event))
  return i >= 0 && i < 3 ? i : 2
}

/**
 * How many lines the tag row takes: (if switched on) each party and the source count. The group is not a tag:
 * it is the mark on the line, and the legend says what the marks mean. Tags wrap as whole tags, like the browser's flex-wrap.
 */
export function tagLinesOf(event, spec, fields, actorById) {
  const widths = []
  if (fields.actors) {
    for (const id of Array.isArray(event.actorIds) ? event.actorIds : []) {
      widths.push(textWidth(actorById.get(id)?.name || id, ACTOR_FONT) + ACTOR_TAG_PAD)
    }
  }
  if (fields.sources) widths.push(SOURCE_TAG_W)
  if (!widths.length) return 0
  let lines = 1
  let used = 0
  for (const w of widths) {
    const add = used ? TAG_SPACING + w : w
    if (used && used + add > CARD_INNER_W) {
      lines += 1
      used = w
    } else used += add
  }
  return lines
}

/** Card height, from the lines its text takes */
export function cardHeightOf({ titleLines, summaryLines, tagLines }) {
  let h = PAD_Y * 2 + TITLE_LH * Math.max(1, titleLines)
  if (summaryLines) h += BLOCK_GAP + SUMMARY_LH * summaryLines
  if (tagLines) h += TAGS_GAP + TAG_LH * tagLines
  // The time column holds up to three lines (date, time, end); the card is never shorter than it
  return Math.max(h, PAD_Y + WHEN_LH * 3)
}

/**
 * How many lines the title and the summary take. With `measure` (the page's real font, see
 * ChronicleRenderer.jsx) the wrap is exact; without it (Node) the estimate errs one line long
 * rather than short, by the SCALE margins.
 */
export function textLinesOf(event, fields, measure) {
  // 1px less than the box: canvas and layout round sub-pixels differently
  const wrap = (text, kind, font, scale) =>
    measure ? wrapLinesBy(text, CARD_INNER_W - 1, (tok) => measure(tok, kind)) : wrapLineCount(text, CARD_INNER_W / font, scale)
  return {
    title: Math.max(1, wrap(event.label || '', 'title', TITLE_FONT, TITLE_SCALE)),
    summary: fields.summary && event.summary ? wrap(event.summary, 'summary', SUMMARY_FONT, SUMMARY_SCALE) : 0,
  }
}

/**
 * Turn a fact spec into React Flow nodes for the chronicle.
 * The `layouts` table calls every kind as (spec, fields, view, orientation); the chronicle has no
 * view or orientation, and its third argument is options instead: { measure(text, 'title' | 'summary') => px }.
 * A view object passed there has no `measure`, so it is harmless.
 */
export function buildChronicleGraph(spec, fields = {}, { measure } = {}) {
  const actorById = new Map((spec?.actors || []).filter(Boolean).map((a) => [a.id, a]))
  const sourceById = new Map((spec?.sources || []).filter(Boolean).map((s) => [s.id, s]))
  // The legend: the first three groups (validation allows no more), each with its own colour index
  const groups = (Array.isArray(spec?.groups) ? spec.groups.slice(0, 3) : [])
    .map((g, i) => ({ label: g?.label, groupIndex: i, shape: GROUP_SHAPES[i] }))
    .filter((g) => g.label)
  const items = chronicleItems(spec)

  const cards = []
  const dots = []
  const pills = []
  const breaks = []
  let y = groups.length ? LEGEND_H : 0
  let prevBottom = null
  items.forEach((item, index) => {
    const { event } = item
    if (prevBottom != null) {
      const space = SPACING[item.spacing] ?? SPACING.none
      if (item.gap) {
        pills.push({ y: prevBottom + space / 2, gap: item.gap })
        if (item.gap.long) breaks.push({ y0: prevBottom, y1: prevBottom + space })
      }
      y = prevBottom + space
    }
    const { title: titleLines, summary: summaryLines } = textLinesOf(event, fields, typeof measure === 'function' ? measure : null)
    const tagLines = tagLinesOf(event, spec, fields, actorById)
    const h = cardHeightOf({ titleLines, summaryLines, tagLines })
    const groupIndex = groupIndexOf(spec, event)
    const actorNames = (Array.isArray(event.actorIds) ? event.actorIds : []).map((id) => actorById.get(id)?.name || id)
    const sources = (Array.isArray(event.sourceIds) ? event.sourceIds : []).map((id) => sourceById.get(id)).filter(Boolean)
    cards.push({
      id: event.id,
      type: 'entry',
      position: { x: 0, y },
      width: CONTENT_W,
      height: h,
      draggable: false,
      connectable: false,
      data: {
        event,
        index,
        groupIndex,
        shape: groupShapeOf(spec, event),
        actorNames,
        sources,
        fields,
        lines: { title: titleLines, summary: summaryLines, tags: tagLines },
        sameDay: item.sameDay,
        cardH: h,
      },
    })
    dots.push({ y: y + DOT_Y, groupIndex, shape: groupShapeOf(spec, event), hollow: !event.date })
    prevBottom = y + h
  })

  const height = prevBottom ?? 0
  const nodes = []
  if (items.length) {
    nodes.push({
      id: '__spine__',
      type: 'spine',
      position: { x: 0, y: 0 },
      // Decoration layer: 1×1 for React Flow, drawn at full size inside (see timeline/nodes.js cellsNode)
      width: 1,
      height: 1,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      style: { pointerEvents: 'none' },
      data: { x: SPINE_X, top: dots[0].y, bottom: dots[dots.length - 1].y, dots, pills, breaks, dotSize: DOT_SIZE },
    })
  }
  if (groups.length) {
    nodes.push({
      id: '__legend__',
      type: 'legend',
      position: { x: CARD_X, y: 0 },
      width: 1,
      height: 1,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      data: { groups },
    })
  }
  nodes.push(...cards)

  return {
    errors: [],
    nodes,
    edges: [],
    items,
    eventCount: items.length,
    layout: 'chronicle',
    size: { width: CONTENT_W, height },
  }
}
