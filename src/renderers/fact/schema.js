// ============================================================
//  src/renderers/fact/schema.js — the "knowledge" the fact top-level type exposes
//
//  This file answers two questions, and it is **pure JS** throughout (no components, so Node and MCP can import it directly):
//    1. whether a fact spec is valid
//    2. which ways of drawing this top-level type exist, and what layout function each one has
//
//  Why a file of its own: the registry keeps "knowledge" and "components" apart.
//  Components are .jsx and only a browser can load them; MCP needs the rules and cannot load components.
//  Once the two are apart, MCP no longer hand-writes a dispatch table of its own.
//
//  Note: **the validation rules are not here**. There is only one copy, in timeline/grid.js (errors are collected along the way while laying out),
//  and this file only wraps it in a public interface, repeating not one line.
// ============================================================

import { specVersionFieldRow } from '../../core/specVersion.js'
import { dateOrderNotes } from './dateOrder.js'
import { buildGrid } from './timeline/grid.js'
import { buildFactGraph } from './timeline/layout.js'
import { buildChronicleGraph, TITLE_FONT as CHRONICLE_TITLE_FONT } from './chronicle/layout.js'
import { buildScaleGraph, TITLE_FONT as SCALE_TITLE_FONT } from './scale/layout.js'
import { fitWidthZoom, fitZoom, textSizeLines } from '../../core/canvas.js'
import { LABEL_FONT } from './cardGeometry.js'

/**
 * Field metadata: **the agent-facing reference is generated from here**, not copied by hand
 * (this project has been bitten four times by writing one fact in two places).
 * **Fixed English, not following the interface language**: it goes into a model's context via MCP's
 * antu_schema, where English costs fewer tokens and needs no second copy (see core/i18n.js).
 * req = required; ty = type; note = one-line explanation an agent can act on. Only **field-level**
 * rules are listed; cross-field rules are reported by the validator at run time (see spec/agent/fact/guide.md).
 */
/** The generation of this type's JSON format (core/specVersion.js, spec/versioning.md): +1 on a breaking change */
export const FACT_SPEC_VERSION = 2

export const FACT_FIELDS = {
  envelope: [
    { name: 'type', req: 'yes', ty: 'string', note: 'always "fact"' },
    specVersionFieldRow(FACT_SPEC_VERSION),
    { name: 'title', req: 'yes', ty: 'string', note: 'diagram title, shown at the top left' },
  ],
  actors: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique within the diagram; events reference it via actorIds' },
    { name: 'name', req: 'yes', ty: 'string', note: 'display name, e.g. "Huayuan Trading"' },
    { name: 'role', req: 'no', ty: 'string', note: 'procedural standing, e.g. "plaintiff"' },
    { name: 'groupId', req: '*', ty: 'string', note: 'the side this party is on: the 1st or the 2nd group. Required with 2 or more parties; not written with one' },
  ],
  groups: [
    { name: 'id', req: 'yes', ty: 'string', note: 'parties (2 or more) or events (one party) reference it via groupId' },
    { name: 'label', req: 'yes', ty: 'string', note: 'column heading, e.g. "Sun Hao\'s side" (parties) or "performance as agreed" (one party\'s acts)' },
    { name: '', req: '', ty: '', note: 'at most 3: the 1st on the left (top) side, the 2nd on the right (bottom) side, the 3rd on the axis' },
    { name: '', req: '', ty: '', note: '2 or more parties: the groups split the parties. 0 or 1 party: they split the events by kind of act' },
  ],
  sources: [
    { name: 'id', req: 'yes', ty: 'string', note: 'events reference it via sourceIds' },
    { name: 'type', req: 'yes', ty: 'string', note: 'contract / evidence / judgment / transcript, etc.' },
    { name: 'name', req: 'yes', ty: 'string', note: 'material name, e.g. "corridor surveillance video"' },
    { name: 'loc', req: 'no', ty: 'object', note: 'location, e.g. { file, page } or { file, timestamp }' },
    { name: 'quote', req: 'no', ty: 'string', note: 'verbatim excerpt (several passages joined with ……), shown when the card is opened; a shortened or reworded version goes in detail' },
  ],
  slots: [
    { name: 'events', req: 'yes', ty: 'array', note: 'events at this time point; must not be empty' },
    { name: '', req: '', ty: '', note: 'array order is chronological order; date is display-only and never reorders' },
  ],
  events: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique within the diagram' },
    { name: 'date', req: 'no', ty: 'string', note: 'ISO 8601. Go to seconds when known, otherwise stop at the day. **Leave it out when the material gives no date: never make one up.** The card then says the date is unknown; the order is the order of slots, so nothing moves' },
    { name: 'label', req: 'yes', ty: 'string', note: 'card title; about 20 characters per line, at most two lines' },
    { name: 'dateEnd', req: 'no', ty: 'string', note: 'for a span, the end instant; needs date, and must not be earlier than it' },
    { name: 'approx', req: 'no', ty: 'boolean', note: 'time is not exact (estimated or inferred); the diagram shows "approx."' },
    { name: 'dateNote', req: 'no', ty: 'string', note: 'why the time is not exact, and how it was derived' },
    { name: 'summary', req: 'no', ty: 'string', note: 'the line under the card title; about 22 characters' },
    { name: 'detail', req: 'no', ty: 'string', note: 'full text revealed when the card is opened' },
    { name: 'actorIds', req: 'no', ty: 'string[]', note: 'parties involved. One: that party\'s side and column. Two or more, or none: the centre axis' },
    { name: 'groupId', req: '*', ty: 'string', note: 'only when the diagram has 0 or 1 party: which side this event falls on. With 2 or more parties, leave it out' },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which materials it rests on' },
  ],
}

/**
 * Render the field metadata into one compact block of text for an agent.
 * This function's existence means **the reference material and the code share one source**,
 * so the two cannot drift apart. Output is fixed English, consistent with FACT_FIELDS.
 */
export function describeFactSchema() {
  const lines = ['Fields of a fact spec. "yes" means required.', '']
  for (const [group, rows] of Object.entries(FACT_FIELDS)) {
    lines.push(`[${group}]`)
    for (const r of rows) {
      if (!r.name) {
        lines.push(`  · ${r.note}`)
        continue
      }
      lines.push(`  ${r.name.padEnd(12)} ${r.req.padEnd(3)} ${r.ty.padEnd(15)} ${r.note}`)
    }
    lines.push('')
  }
  lines.push('"*": required or not depending on the number of parties, as the note says.')
  lines.push('Cross-field rules (dangling references, a span running backwards, a party without a')
  lines.push('side, two events in the same lane of one time slot) are not listed')
  lines.push('above: call antu_validate after writing. It reports each problem with its field path.')
  return lines.join('\n')
}

/**
 * The chronicle's geometry report: one column, so there is no orientation
 * to choose. It opens fitted to its width and the reader scrolls, so the text size is the width-fit
 * size; how much scrolling that takes is reported as "screens".
 */
function chronicleReport(spec, layout, { fields, canvas }) {
  const g = layout(spec, fields)
  const fit = Number(fitWidthZoom(g.size, canvas).toFixed(3))
  const whole = Number(fitZoom(g.size, canvas).toFixed(3))
  const screens = Math.max(1, Math.round(((g.size.height * fit) / canvas.height) * 10) / 10)
  const gaps = g.items.filter((i) => i.gap)
  return {
    text: { font: CHRONICLE_TITLE_FONT, canvas, open: { name: 'fitted to width', fit }, other: { name: 'whole column', fit: whole } },
    counts: {
      slots: Array.isArray(spec.slots) ? spec.slots.length : 0,
      events: g.items.length,
      actors: spec.actors?.length ?? 0,
      sources: spec.sources?.length ?? 0,
    },
    size: g.size,
    screens,
    gaps: { short: gaps.filter((i) => !i.gap.long).length, long: gaps.filter((i) => i.gap.long).length },
    undated: g.items.filter((i) => !i.event.date).length,
  }
}

function formatChronicleReport(r) {
  const lines = []
  lines.push(`Kind: chronicle (every event in one column, in slot order; orientation does not apply)`)
  lines.push(`Data: ${r.counts.events} events / ${r.counts.slots} time slots / ${r.counts.actors} parties / ${r.counts.sources} sources`)
  lines.push(`Content ${r.size.width}×${r.size.height}; it opens fitted to its width, about ${r.screens} screen(s) tall`)
  lines.push(`Gaps written between time points: ${r.gaps.short} short, ${r.gaps.long} of 30 days or more (marked)`)
  if (r.undated) lines.push(`${r.undated} event(s) without a date: shown in slot order with a hollow dot, and no gap on either side`)
  lines.push(...textSizeLines(r.text, 'splitting the case into periods, one diagram each'))
  return lines.join('\n')
}

/**
 * The time scale's geometry report: its segments (where the axis breaks, by what unit, how many
 * events), the gathered runs, and the text size as it opens (fitted whole).
 */
function scaleReport(spec, layout, { canvas }) {
  const g = layout(spec, {})
  const fit = Number(fitZoom(g.size, canvas).toFixed(3))
  return {
    text: { font: SCALE_TITLE_FONT, canvas, open: { name: 'fitted whole', fit }, other: { name: 'fitted whole', fit } },
    counts: { events: g.eventCount, actors: spec.actors?.length ?? 0, sources: spec.sources?.length ?? 0 },
    size: g.size,
    segments: g.segments.map((s) => ({ unit: s.unit, count: s.count })),
    gathered: g.gathered.map((r) => r.ids.length),
    undated: g.undated,
  }
}

function formatScaleReport(r) {
  const lines = []
  lines.push('Kind: scale (distance on the axis is real time; orientation does not apply)')
  lines.push(`Data: ${r.counts.events} events / ${r.counts.actors} parties / ${r.counts.sources} sources`)
  lines.push(`Content ${r.size.width}×${r.size.height}`)
  lines.push(
    r.segments.length > 1
      ? `The axis breaks into ${r.segments.length} segments: ${r.segments.map((s, i) => `${i + 1}. by ${s.unit}, ${s.count} event(s)`).join('; ')}`
      : `One segment, by ${r.segments[0]?.unit ?? 'day'}`,
  )
  if (r.gathered.length) {
    lines.push(`${r.gathered.length} run(s) of events too close to show one by one are gathered (${r.gathered.join(', ')} events); they are listed in full under the diagram`)
  }
  if (r.undated) lines.push(`${r.undated} event(s) without a date: placed between their neighbours in data order, with a hollow dot`)
  lines.push(...textSizeLines(r.text, 'splitting the case into periods, one diagram each'))
  return lines.join('\n')
}

export const factKnowledge = {
  specVersion: FACT_SPEC_VERSION,
  /**
   * Display name of the top-level type. What is stored is a **message key**, not the message:
   * the Node side of the registry (MCP) needs it too and has no interface language there,
   * so translation is done by the consumer per language (see core/labels.js).
   */
  label: 'graphType.fact',

  /**
   * The field metadata and its render function.
   * They live in knowledge rather than being scattered so that the registry can reach them
   * **by top-level type**: MCP's antu_schema passes type and gets that type's field table,
   * instead of hard-coding fact inside the tool as it used to.
   */
  fields: FACT_FIELDS,
  describe: describeFactSchema,

  /**
   * Validate a fact spec and return the array of errors.
   * The rules live in timeline/grid.js: **validation and layout share one computation**,
   * so the two can never tell different stories.
   */
  validate: (spec) => buildGrid(spec).errors,

  /** What validation cannot call an error: the slot order against the dates (a note, never a reorder; see dateOrder.js) */
  notes: (spec) => [
    // The slot order against the dates: a note, never an error, and never a reorder (see dateOrder.js)
    ...dateOrderNotes(spec),
  ],

  /**
   * The label card's third line: size and time span (the type is already in the line above).
   * Each type supplies its own, because "how big is this diagram" is counted in its own units
   * (time slots here, nodes and stages for a procedure). t and formatNumber come from the
   * caller, so this stays plain JS.
   */
  info: (spec, t, formatNumber) => {
    const slots = Array.isArray(spec.slots) ? spec.slots : []
    const dates = slots
      .flatMap((s) => (s?.events || []).map((e) => e?.date))
      .filter((d) => typeof d === 'string' && d)
      .sort()
    let slotsLine = t('info.slots', { n: formatNumber(slots.length) })
    if (dates.length > 0) {
      const first = dates[0].slice(0, 10)
      const last = dates[dates.length - 1].slice(0, 10)
      slotsLine += first === last ? ` · ${first}` : ` · ${t('info.span', { from: first, to: last })}`
    }
    return [
      slotsLine,
      t('info.actors', { n: formatNumber(spec.actors?.length || 0) }),
      t('info.sources', { n: formatNumber(spec.sources?.length || 0) }),
    ]
  },

  /**
   * The geometry report for MCP's antu_layout (compute only, no rendering): how
   * many events and columns and whether it fits; per orientation, the content size and the
   * fit zoom. It lives with the type because every quantity in it is a fact concept.
   */
  report: (spec, layout, { orientation, fields = { summary: true }, kind, canvas }) => {
    if (kind === 'chronicle') return chronicleReport(spec, layout, { fields, canvas })
    if (kind === 'scale') return scaleReport(spec, layout, { canvas })
    const graph = layout(spec, fields, undefined, orientation ?? 'vertical')
    const grid = buildGrid(spec)
    const columns = { side1: 0, axis: 0, side2: 0 }
    grid.columns.forEach((c) => {
      columns[c.side] += 1
    })
    const placement = {
      events: graph.eventCount ?? grid.eventCount ?? 0,
      columns,
      blocked: graph.errors.length > 0 ? graph.errors[0] : null,
    }
    // Both orientations, as the page opens them (the same slot-count rule the renderer uses by default). Vertical is
    // measured with the rows staggered, the page's default (spec/fact/rendering.md §8.1), so "as it opens" is what the
    // reader sees on a fresh page; the size with the switch off is kept beside it.
    const byOrientation = {}
    for (const o of ['vertical', 'horizontal']) {
      const g = layout(spec, fields, undefined, o, { stagger: true })
      byOrientation[o] = { size: g.size, fit: Number(fitZoom(g.size, canvas).toFixed(3)) }
    }
    const flat = layout(spec, fields, undefined, 'vertical', { stagger: false })
    const unstaggered = { size: flat.size, fit: Number(fitZoom(flat.size, canvas).toFixed(3)) }
    const slotCount = Array.isArray(spec.slots) ? spec.slots.length : 0
    const opens = orientation ?? (slotCount >= 5 ? 'vertical' : 'horizontal')
    const others = opens === 'vertical' ? 'horizontal' : 'vertical'
    return {
      text: {
        font: LABEL_FONT,
        canvas,
        open: { name: opens, fit: byOrientation[opens].fit },
        other: { name: others, fit: byOrientation[others].fit },
      },
      unstaggered,
      counts: {
        slots: slotCount,
        events: (spec.slots ?? []).reduce((n, s) => n + (s?.events?.length || 0), 0),
        actors: spec.actors?.length ?? 0,
        sources: spec.sources?.length ?? 0,
      },
      byOrientation,
      suggestedOrientation: slotCount >= 5 ? 'vertical' : 'horizontal',
      placement,
    }
  },

  /** The geometry report as the short text the tool returns to an agent */
  formatReport: (r) => {
    if (r.kind === 'chronicle') return formatChronicleReport(r)
    if (r.kind === 'scale') return formatScaleReport(r)
    const lines = []
    lines.push(`Data: ${r.counts.events} events / ${r.counts.slots} time slots / ${r.counts.actors} parties / ${r.counts.sources} sources`)
    const v = r.byOrientation.vertical
    const h = r.byOrientation.horizontal
    const flat = r.unstaggered
    const staggerNote =
      flat && (flat.size.height !== v.size.height || flat.size.width !== v.size.width)
        ? ` (rows staggered, the page's default; with "Stagger" off ${flat.size.width}×${flat.size.height}, fit zoom ${flat.fit})`
        : ''
    lines.push(`Vertical: content ${v.size.width}×${v.size.height}, fit zoom ${v.fit}${staggerNote}`)
    lines.push(`Horizontal: content ${h.size.width}×${h.size.height}, fit zoom ${h.fit}`)
    lines.push(
      r.suggestedOrientation === 'vertical'
        ? `Suggested orientation: vertical (by the slot-count rule, ${r.counts.slots} slots >= 5)`
        : `Suggested orientation: horizontal (by the slot-count rule, ${r.counts.slots} slots < 5)`,
    )
    lines.push(...textSizeLines(r.text, 'splitting the timeline into periods, one diagram each'))
    const p = r.placement
    lines.push(`Columns: side1 ${p.columns.side1} / axis ${p.columns.axis} / side2 ${p.columns.side2}, ${p.events} events`)
    if (p.blocked) {
      lines.push(`Does not fit: ${p.blocked}`)
      lines.push('Common cause: two or more events of one time slot fall in the same lane (the grid is one event per cell).')
      lines.push('How to fix: split that time slot into two finer time points, or check the parties of the events so they land in different lanes.')
    }
    return lines.join('\n')
  },

  /** One example's size, for MCP's example list: the numbers and the line the tool prints */
  summarize: (spec) => {
    const slots = Array.isArray(spec.slots) ? spec.slots : []
    const events = slots.reduce((n, s) => n + (s?.events?.length || 0), 0)
    const actors = spec.actors?.length ?? 0
    return {
      events,
      slots: slots.length,
      actors,
      line: `${events} events / ${slots.length} time slots / ${actors} parties`,
    }
  },

  /** The version, status and release of each way of drawing (spec/versioning.md, "The diagrams"); the same names as `layouts` */
  diagrams: {
    timeline: { version: 3, status: 'experimental', since: '0.2.0' },
    chronicle: { version: 2, status: 'experimental', since: '0.7.0' },
    scale: { version: 2, status: 'experimental', since: '0.7.0' },
  },

  /** Which ways of drawing a fact diagram exist. The first is the default. */
  layouts: {
    timeline: buildFactGraph,
    chronicle: buildChronicleGraph,
    scale: buildScaleGraph,
  },
}
