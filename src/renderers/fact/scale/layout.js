// ============================================================
//  src/renderers/fact/scale/layout.js — the proportional time scale (issue #85, kind A)
//
//  The third way of drawing a fact diagram. Distance along the axis is real time, so how densely
//  the events lie is itself the information ("months of default, then everything in one evening").
//
//    lanes     one horizontal line per group (side 1, side 2, the axis group), plus "other" for
//              events with no group; labelled on the left
//    marks     a dot at the event's time; a bar from date to dateEnd; a light band over the whole
//              month or year when the date is given only to the month or the year (never a dot:
//              that would look exact to the day); a hollow dot for an undated event, placed
//              between its dated neighbours in data order
//    breaks    the axis breaks where the time scale changes (found automatically, at most two);
//              each segment is as wide as its number of events needs, and inside a segment the
//              position is exact
//    cards     above their lane, on a leader line down to the mark; cards that would overlap
//              stack upwards (up to LEVELS); a run that still does not fit is gathered into one
//              card ("3 events · 21:53–22:26") and listed in full under the diagram, so nothing is
//              hidden in an exported picture
//
//  No two cards ever overlap: the placement below guarantees it and the tests check it on every
//  example. Pure JS: Node computes the same geometry for antu_layout.
// ============================================================

import { wrapLineCount, wrapLinesBy } from '../cardGeometry.js'
import { gapOfMs, parseIso } from '../chronicle/layout.js'
import { groupOfEvent } from '../timeline/grid.js'

// ---------- geometry ----------

/** The lane label column on the left */
export const LABEL_W = 132
/** Card size: two title lines at most, then the time */
export const CARD_W = 196
export const PAD_X = 10
export const PAD_Y = 8
export const TITLE_FONT = 12.5
export const TITLE_LH = 17
export const TIME_FONT = 11
export const TIME_LH = 15
export const MAX_TITLE_LINES = 2
export const CARD_INNER_W = CARD_W - PAD_X * 2
/** Generous widths for Node's estimate (see chronicle/layout.js TITLE_SCALE); the page measures exactly */
const TITLE_SCALE = { latin: 1.2, cjk: 1.06 }
/** Height of a card with 1 or 2 title lines */
export const cardHeightOf = (titleLines) => PAD_Y * 2 + TITLE_LH * titleLines + 2 + TIME_LH
/** Stacking: a lane holds this many levels of cards above its line */
export const LEVELS = 3
const LEVEL_GAP = 10
export const LEVEL_H = cardHeightOf(MAX_TITLE_LINES) + LEVEL_GAP
/** Horizontal room kept between two cards on one level */
const CARD_GAP = 10
/** Below the lowest card, down to the lane line (the leader line runs here) */
const LANE_FOOT = 22
/** Above the highest card of a lane */
const LANE_TOP = 12
/** A lane is as tall as the levels its cards use (one at least) */
export const laneHeightOf = (levelsUsed) => LANE_TOP + Math.max(1, levelsUsed) * LEVEL_H + LANE_FOOT
/** Each event asks for this much axis width in its segment; a segment is never narrower than SEG_MIN */
export const PER_EVENT_W = 116
export const SEG_MIN = 170
/** Padding inside a segment, so its first and last marks are not on the break */
export const SEG_PAD = CARD_W / 2
/** The shaded break between two segments */
export const BREAK_W = 64
/** Below the last lane: the time axis with its ticks, then the segment captions */
export const AXIS_H = 56
/** The list of gathered events under the diagram: one line each, plus a heading per run */
export const LIST_LH = 18
const LIST_TOP = 14
/** Dots at the very same moment stack upwards by this much */
export const SAME_TIME_STEP = 12

// ---------- breaks ----------

/** A gap breaks the axis only when it is at least this long (an evening is never cut) */
export const BREAK_FLOOR_MS = 2 * 86400000
/** ...and this many times the typical gap that follows it */
export const BREAK_RATIO = 20
export const MAX_BREAKS = 2

const DAY = 86400000
const HOUR = 3600000

/**
 * When an event happens, as numbers: { from, to, kind, exact }.
 *   dot   a time of day is given
 *   bar   a span: dateEnd after date
 *   band  only the day, month or year is given: the whole period is drawn, never a point
 *         (the point used for order is set later, inside the period, by its neighbours)
 */
export function timeOf(event) {
  const p = parseIso(event?.date)
  if (!p) return null
  const at = (q) => Date.UTC(q.y, q.mo - 1, q.d, q.h, q.mi, q.s)
  const endOf = (q) =>
    q.prec === 'year' ? Date.UTC(q.y + 1, 0, 1) : q.prec === 'month' ? Date.UTC(q.y, q.mo, 1) : q.prec === 'day' ? Date.UTC(q.y, q.mo - 1, q.d + 1) : at(q)
  const from = at(p)
  const e = parseIso(event?.dateEnd)
  if (e && endOf(e) > from) return { from, to: endOf(e), kind: 'bar', exact: true }
  if (p.prec === 'time') return { from, to: from, kind: 'dot', exact: true }
  return { from, to: endOf(p), kind: 'band', exact: false }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Where the axis breaks: between which two consecutive (distinct) times. A gap breaks when it is
 * longer than BREAK_FLOOR_MS and BREAK_RATIO times the median of the next three gaps (the
 * previous three when there are none after it), counting only gaps smaller than itself. At most
 * MAX_BREAKS, the largest first.
 * @param times sorted distinct times
 * @returns indices i: the break lies between times[i] and times[i + 1], ascending
 */
export function findBreaks(times) {
  const gaps = times.slice(1).map((t, i) => t - times[i])
  const found = []
  // The gaps next to gap i, up to three, stopping at the first one at least as large: a window that
  // reached across a larger gap would compare a month with the seconds of a burst beyond it
  const window = (i, dir) => {
    const out = []
    for (let k = i + dir; k >= 0 && k < gaps.length && out.length < 3; k += dir) {
      if (gaps[k] >= gaps[i]) break
      out.push(gaps[k])
    }
    return out
  }
  gaps.forEach((g, i) => {
    if (g < BREAK_FLOOR_MS) return
    let near = window(i, 1)
    if (!near.length) near = window(i, -1)
    if (!near.length) return
    const typical = Math.max(median(near), 60000)
    if (g / typical >= BREAK_RATIO) found.push({ i, g })
  })
  return found
    .sort((a, b) => b.g - a.g)
    .slice(0, MAX_BREAKS)
    .map((b) => b.i)
    .sort((a, b) => a - b)
}

/** The tick unit of a segment, by how long it lasts */
export function unitOf(span) {
  if (span > 2 * 365 * DAY) return 'year'
  if (span > 60 * DAY) return 'month'
  if (span > 2 * DAY) return 'day'
  if (span > 3 * HOUR) return 'hour'
  return 'minute'
}

/** Tick times inside [from, to] at whole units, thinned to fit `maxTicks` */
export function ticksOf(from, to, unit, maxTicks) {
  const d = new Date(from)
  const out = []
  const steps = { year: [1, 2, 5, 10], month: [1, 2, 3, 6], day: [1, 2, 7, 14], hour: [1, 2, 3, 6, 12], minute: [1, 2, 5, 10, 15, 30] }[unit]
  for (const step of steps) {
    out.length = 0
    let c
    if (unit === 'year') c = Date.UTC(d.getUTCFullYear(), 0, 1)
    else if (unit === 'month') c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    else if (unit === 'day') c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    else if (unit === 'hour') c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
    else c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
    let guard = 0
    while (c <= to && guard++ < 2000) {
      if (c >= from) out.push(c)
      const x = new Date(c)
      if (unit === 'year') c = Date.UTC(x.getUTCFullYear() + step, 0, 1)
      else if (unit === 'month') c = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + step, 1)
      else if (unit === 'day') c = c + step * DAY
      else if (unit === 'hour') c = c + step * HOUR
      else c = c + step * 60000
    }
    if (out.length <= maxTicks) break
  }
  return [...out]
}

/** A tick's label, by unit (the times are the data's own wall-clock times, kept in UTC numbers) */
export function tickLabel(t, unit, prevT) {
  const x = new Date(t)
  const p2 = (n) => String(n).padStart(2, '0')
  const date = `${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`
  if (unit === 'year') return String(x.getUTCFullYear())
  if (unit === 'month') return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}`
  if (unit === 'day') return date
  const clock = `${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}`
  // A tick within the day names its day when the day changes (and on the first tick)
  const newDay = prevT == null || new Date(prevT).getUTCDate() !== x.getUTCDate()
  return newDay ? `${date} ${clock}` : clock
}

// ---------- lanes ----------

/** The key of the lane an event is drawn in: its group's id, or with `byParty` its one party's own lane */
export function laneKeyOf(spec, { byParty = false } = {}) {
  const groupOf = groupOfEvent(spec)
  const sideGroups = new Set((Array.isArray(spec?.groups) ? spec.groups.slice(0, 2) : []).map((g) => g?.id))
  const actorGroup = new Map((Array.isArray(spec?.actors) ? spec.actors : []).filter((a) => a?.id).map((a) => [a.id, a.groupId]))
  return (e) => {
    const g = groupOf(e)
    const ids = Array.isArray(e?.actorIds) ? e.actorIds : []
    // a party's own lane only for an event of one party on a side (the same rule as the timeline's columns)
    if (byParty && ids.length === 1 && sideGroups.has(g) && actorGroup.get(ids[0]) === g) return `actor:${ids[0]}`
    return g
  }
}

/**
 * The lanes: one per group (at most three, as validation allows), then "other" if any event has none.
 * With `byParty` (2 or more parties), a side group gives one lane per party in it instead, in the order of `actors`.
 */
export function lanesOf(spec, events, { byParty = false } = {}) {
  const keyOf = laneKeyOf(spec, { byParty })
  const groups = (Array.isArray(spec?.groups) ? spec.groups.slice(0, 3) : []).filter((g) => g && g.id)
  const actors = (Array.isArray(spec?.actors) ? spec.actors : []).filter((a) => a?.id)
  const perParty = byParty && actors.length >= 2
  const lanes = groups.flatMap((g, i) => {
    const members = perParty && i < 2 ? actors.filter((a) => a.groupId === g.id) : []
    if (!members.length) return [{ key: g.id, label: g.label ?? '', groupIndex: i }]
    return members.map((a, k) => ({ key: `actor:${a.id}`, label: a.name ?? '', side: k === 0 ? g.label ?? '' : null, groupIndex: i }))
  })
  const known = new Set(lanes.map((l) => l.key))
  if (events.some((e) => !known.has(keyOf(e)))) lanes.push({ key: '__other__', label: null, groupIndex: 2, other: true })
  return lanes
}

// ---------- placing cards ----------

/**
 * Place the cards of one lane on levels so that none overlap. Greedy, in order of x: each card
 * takes the lowest level whose last card ends left of it. When some card finds no level, the two
 * nearest neighbours (cards or gathered runs) are gathered into one and the lane is placed again,
 * until everything fits. Gathering the nearest first keeps as many events on their own card as
 * possible.
 * @param items [{ id, x }] sorted by x
 * @returns [{ ids, x, level, from, to }] — one entry per card; more than one id = gathered
 */
export function placeLane(items, { levels = LEVELS, width = CARD_W, gap = CARD_GAP } = {}) {
  let units = items.map((it) => ({ ids: [it.id], x: it.x, from: it.x, to: it.x }))
  for (;;) {
    const placed = tryLevels(units, levels, width, gap)
    if (placed) return placed
    // Gather the closest neighbouring pair
    let best = -1
    let bestD = Infinity
    for (let i = 0; i + 1 < units.length; i++) {
      const d = units[i + 1].x - units[i].x
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0) return tryLevels(units, levels, width, gap) ?? []
    const a = units[best]
    const b = units[best + 1]
    const ids = [...a.ids, ...b.ids]
    const from = Math.min(a.from, b.from)
    const to = Math.max(a.to, b.to)
    units.splice(best, 2, { ids, x: (from + to) / 2, from, to })
    units = units.sort((p, q) => p.x - q.x)
  }
}

function tryLevels(units, levels, width, gap) {
  const right = Array(levels).fill(-Infinity)
  const out = []
  for (const u of units) {
    const left = u.x - width / 2
    const level = right.findIndex((r) => r + gap <= left)
    if (level < 0) return null
    right[level] = u.x + width / 2
    out.push({ ...u, level })
  }
  return out
}

// ---------- the whole graph ----------

/**
 * Turn a fact spec into React Flow nodes for the time scale.
 * Called as (spec, fields, options) like the chronicle; options: { measure(text, 'title') => px }.
 */
export function buildScaleGraph(spec, _fields = {}, { measure, byParty = false } = {}) {
  const actorById = new Map((spec?.actors || []).filter(Boolean).map((a) => [a.id, a]))
  const sourceById = new Map((spec?.sources || []).filter(Boolean).map((s) => [s.id, s]))
  const flat = []
  ;(Array.isArray(spec?.slots) ? spec.slots : []).forEach((slot, slotIndex) => {
    for (const e of Array.isArray(slot?.events) ? slot.events : []) if (e && typeof e === 'object') flat.push({ event: e, slotIndex })
  })

  // 1. Times. An exact time (dot, bar) is its own point. A period (band) and an undated event take
  //    their point from their exact neighbours in data order: halfway between them, kept inside
  //    the period. So a "that day" event written after the evening's events stays after them.
  flat.forEach((f) => (f.time = timeOf(f.event)))
  flat.forEach((f) => {
    if (f.time?.exact) f.time.t = f.time.from
  })
  const exactAround = (i) => ({
    before: flat.slice(0, i).reverse().find((g) => g.time?.exact),
    after: flat.slice(i + 1).find((g) => g.time?.exact),
  })
  // A point after the last (or before the first) exact time: a step of 1/20 of their span, at least
  // a minute, so it reads as "next" without stretching the axis
  const exactTimes = flat.filter((f) => f.time?.exact).map((f) => f.time.t)
  const step = exactTimes.length > 1 ? Math.max(60000, (Math.max(...exactTimes) - Math.min(...exactTimes)) / 20) : HOUR
  const placeBetween = (i, lo, hi) => {
    const { before, after } = exactAround(i)
    let t
    if (before && after) t = (before.time.t + after.time.t) / 2
    else if (before) t = before.time.t + step
    else if (after) t = after.time.t - step
    else t = lo != null ? (lo + hi) / 2 : i * HOUR
    return lo != null ? Math.min(Math.max(t, lo), hi - 1) : t
  }
  flat.forEach((f, i) => {
    if (f.time && !f.time.exact) f.time.t = placeBetween(i, f.time.from, f.time.to)
  })
  // Undated: from its dated neighbours of any kind
  flat.forEach((f, i) => {
    if (f.time) return
    const before = flat.slice(0, i).reverse().find((g) => g.time)
    const after = flat.slice(i + 1).find((g) => g.time)
    const t = before && after ? (before.time.t + after.time.t) / 2 : before ? before.time.t + step : after ? after.time.t - step : i * HOUR
    f.time = { t, from: t, to: t, kind: 'dot', undated: true }
  })

  // 2. Segments: break the axis where the scale changes
  const times = [...new Set(flat.map((f) => f.time.t))].sort((a, b) => a - b)
  const breaks = findBreaks(times)
  const bounds = []
  let start = 0
  for (const i of breaks) {
    bounds.push([times[start], times[i]])
    start = i + 1
  }
  bounds.push([times[start], times[times.length - 1]])
  const segOf = (t) => {
    const k = bounds.findIndex(([, to]) => t <= to)
    return k < 0 ? bounds.length - 1 : k
  }
  const segments = bounds.map(([from, to], k) => {
    const events = flat.filter((f) => segOf(f.time.t) === k)
    // A segment of one instant has no scale to speak of: it is named by its day
    return { index: k, from, to, count: events.length, unit: to > from ? unitOf(to - from) : 'day' }
  })
  let x = LABEL_W
  segments.forEach((s, k) => {
    if (k > 0) {
      const gapMs = s.from - segments[k - 1].to
      s.breakBefore = { x, w: BREAK_W, gap: gapOfMs(gapMs) }
      x += BREAK_W
    }
    s.x0 = x
    s.w = Math.max(SEG_MIN, s.count * PER_EVENT_W)
    s.x1 = x + s.w
    x = s.x1
  })
  const width = x
  // Position inside a segment: exact, between its padded edges; a segment of one instant is centred
  const xOf = (t) => {
    const s = segments[segOf(t)]
    const inner = s.w - SEG_PAD * 2
    if (s.to === s.from) return s.x0 + s.w / 2
    return s.x0 + SEG_PAD + ((Math.min(Math.max(t, s.from), s.to) - s.from) / (s.to - s.from)) * inner
  }
  const clampSeg = (t, k) => Math.min(Math.max(t, segments[k].from), segments[k].to)

  // 3. Lanes, and the marks in them
  const lanes = lanesOf(spec, flat.map((f) => f.event), { byParty })
  const keyOf = laneKeyOf(spec, { byParty })
  const laneOf = (e) => {
    const i = lanes.findIndex((l) => l.key === keyOf(e))
    return i >= 0 ? i : lanes.length - 1
  }
  // Lane heights follow the levels their cards use, so they are known only after placing (step 4)
  const laneTops = []
  const laneHs = []
  const laneTop = (li) => laneTops[li]
  const lineY = (li) => laneTops[li] + laneHs[li]
  const marks = flat.map((f, order) => {
    const k = segOf(f.time.t)
    const kind = f.time.kind
    // A period or span is drawn over the part of it inside its segment, at least 6px wide
    let x0 = kind === 'dot' ? xOf(f.time.t) : xOf(clampSeg(f.time.from, k))
    let x1 = kind === 'dot' ? x0 : xOf(clampSeg(f.time.to, k))
    const at = kind === 'bar' ? x0 : xOf(f.time.t)
    // A period narrower than this scale can show (a day on a scale of months) is drawn as a dot:
    // at this scale a dot claims no more precision than the date has
    const shown = kind === 'band' && x1 - x0 < 8 ? 'dot' : kind
    if (shown === 'dot') x0 = x1 = at
    else if (x1 - x0 < 6) x1 = x0 + 6
    return { id: f.event.id, order, lane: laneOf(f.event), kind: shown, x: at, x0, x1, undated: Boolean(f.time.undated), event: f.event }
  })
  // Same moment in one lane: the dots stack upwards
  const seen = new Map()
  for (const m of marks) {
    const key = `${m.lane}:${Math.round(m.x)}`
    m.stack = seen.get(key) ?? 0
    seen.set(key, m.stack + 1)
  }

  // 4. Cards, lane by lane
  const lineCount = (text) =>
    Math.min(
      MAX_TITLE_LINES,
      Math.max(1, measure ? wrapLinesBy(text, CARD_INNER_W - 3, (tok) => measure(tok, 'title')) : wrapLineCount(text, CARD_INNER_W / TITLE_FONT, TITLE_SCALE)),
    )
  const cards = []
  const gathered = []
  const placed = lanes.map((lane, li) => {
    const inLane = marks.filter((m) => m.lane === li).sort((a, b) => a.x - b.x || a.order - b.order)
    // A card is centred over its mark, but kept inside the diagram right of the lane labels; the
    // placement works on that kept centre, so keeping it inside can never push it onto a neighbour
    const keep = (cx) => Math.min(Math.max(cx, LABEL_W + 4 + CARD_W / 2), width - CARD_W / 2)
    return placeLane(inLane.map((m) => ({ id: m.id, x: keep(m.x) })))
  })
  let top = 0
  placed.forEach((units, li) => {
    laneTops[li] = top
    laneHs[li] = laneHeightOf(Math.max(0, ...units.map((u) => u.level)) + 1)
    top += laneHs[li]
  })
  placed.forEach((units, li) => {
    const anchorOf = (u) => {
      const xs = u.ids.map((id) => marks.find((m) => m.id === id).x)
      return (Math.min(...xs) + Math.max(...xs)) / 2
    }
    for (const u of units) {
      const left = u.x - CARD_W / 2
      const members = u.ids.map((id) => marks.find((m) => m.id === id)).sort((a, b) => a.order - b.order)
      const isRun = members.length > 1
      const titleLines = isRun ? 1 : lineCount(members[0].event.label || '')
      const h = cardHeightOf(titleLines)
      const bottom = lineY(li) - LANE_FOOT - u.level * LEVEL_H
      const card = {
        id: isRun ? `__run__${gathered.length + 1}` : members[0].id,
        lane: li,
        level: u.level,
        x: left,
        y: bottom - h,
        w: CARD_W,
        h,
        titleLines,
        anchor: anchorOf(u),
        members,
      }
      if (isRun) {
        card.run = gathered.length + 1
        card.span = [Math.min(...members.map((m) => m.x0)), Math.max(...members.map((m) => m.x1))]
        gathered.push(card)
      }
      cards.push(card)
    }
  })

  // 5. Under the diagram: the axis, then the full list of every gathered run
  const lanesH = laneTops.length ? laneTops[laneTops.length - 1] + laneHs[laneHs.length - 1] : 0
  const axisY = lanesH + 14
  const ticks = segments.flatMap((s) => {
    const maxTicks = Math.max(2, Math.floor(s.w / 84))
    let ts = s.to > s.from ? ticksOf(s.from, s.to, s.unit, maxTicks) : []
    // No whole unit falls inside (a short segment, or one instant): label its ends instead, to the minute
    let unit = s.unit
    if (!ts.length) {
      ts = s.to > s.from ? [s.from, s.to] : [s.from]
      // One instant: its day only, since its point may be a day-only date placed by its neighbours
      unit = s.to > s.from ? 'minute' : 'day'
    }
    return ts.map((t, i) => ({ x: xOf(t), label: tickLabel(t, unit, i ? ts[i - 1] : null) }))
  })
  const listRows = gathered.reduce((n, g) => n + 1 + g.members.length, 0)
  const listH = gathered.length ? LIST_TOP + listRows * LIST_LH : 0
  const height = lanesH + AXIS_H + listH

  const groupIndexOfEvent = (e) => lanes[laneOf(e)].groupIndex
  const nodes = [
    {
      id: '__scale__',
      type: 'scaleLayer',
      position: { x: 0, y: 0 },
      // Decoration layer: 1×1 for React Flow, drawn at full size inside (see timeline/nodes.js cellsNode)
      width: 1,
      height: 1,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      style: { pointerEvents: 'none' },
      data: {
        width,
        lanesH,
        axisY,
        lanes: lanes.map((l, li) => ({ ...l, top: laneTop(li), lineY: lineY(li) })),
        segments,
        ticks,
        marks: marks.map((m) => ({ id: m.id, kind: m.kind, x: m.x, x0: m.x0, x1: m.x1, y: lineY(m.lane) - m.stack * SAME_TIME_STEP, undated: m.undated, approx: Boolean(m.event.approx), groupIndex: lanes[m.lane].groupIndex })),
        leaders: cards.map((c) => ({ x: Math.min(Math.max(c.anchor, c.x + 8), c.x + c.w - 8), y0: c.y + c.h, y1: lineY(c.lane) - 6, run: Boolean(c.run) })),
        brackets: gathered.map((g) => ({ x0: g.span[0], x1: g.span[1], y: lineY(g.lane) + 9, run: g.run })),
      },
    },
  ]
  for (const c of cards) {
    nodes.push({
      id: c.id,
      type: c.run ? 'scaleRun' : 'scaleCard',
      position: { x: c.x, y: c.y },
      width: c.w,
      height: c.h,
      draggable: false,
      connectable: false,
      data: c.run
        ? { run: c.run, events: c.members.map((m) => m.event), groupIndex: lanes[c.lane].groupIndex, cardH: c.h }
        : {
            event: c.members[0].event,
            undated: c.members[0].undated,
            groupIndex: groupIndexOfEvent(c.members[0].event),
            titleLines: c.titleLines,
            cardH: c.h,
            actorNames: (Array.isArray(c.members[0].event.actorIds) ? c.members[0].event.actorIds : []).map((id) => actorById.get(id)?.name || id),
            sources: (Array.isArray(c.members[0].event.sourceIds) ? c.members[0].event.sourceIds : []).map((id) => sourceById.get(id)).filter(Boolean),
          },
    })
  }
  if (gathered.length) {
    nodes.push({
      id: '__runs__',
      type: 'scaleRunList',
      position: { x: LABEL_W, y: lanesH + AXIS_H + LIST_TOP },
      width: 1,
      height: 1,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      data: { runs: gathered.map((g) => ({ run: g.run, events: g.members.map((m) => m.event) })), width: width - LABEL_W, lh: LIST_LH },
    })
  }

  return {
    errors: [],
    nodes,
    edges: [],
    layout: 'scale',
    eventCount: flat.length,
    segments,
    gathered: gathered.map((g) => ({ run: g.run, ids: g.members.map((m) => m.id) })),
    cards: cards.map((c) => ({ id: c.id, lane: c.lane, level: c.level, x: c.x, y: c.y, w: c.w, h: c.h, ids: c.members.map((m) => m.id) })),
    undated: marks.filter((m) => m.undated).length,
    size: { width, height },
  }
}
