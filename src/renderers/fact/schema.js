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
import { buildGrid, viewsOf } from './timeline/grid.js'
import { buildFactGraph } from './timeline/layout.js'
import { buildChronicleGraph, TITLE_FONT as CHRONICLE_TITLE_FONT } from './chronicle/layout.js'
import { buildScaleGraph, TITLE_FONT as SCALE_TITLE_FONT } from './scale/layout.js'
import { fitWidthZoom, fitZoom, textSizeLines } from '../../core/canvas.js'
import { LABEL_FONT } from './cardGeometry.js'
import { tEn } from '../../core/i18n.js'

/**
 * Field metadata: **the agent-facing reference is generated from here**, not copied by hand
 * (this project has been bitten four times by writing one fact in two places).
 * **Fixed English, not following the interface language**: it goes into a model's context via MCP's
 * antu_schema, where English costs fewer tokens and needs no second copy (see core/i18n.js).
 * req = required; ty = type; note = one-line explanation an agent can act on. Only **field-level**
 * rules are listed; cross-field rules are reported by the validator at run time (see spec/agent/fact/guide.md).
 */
/** The numbers and the names of the events a view leaves out, for the layout report */
function hiddenNote(view, grid) {
  const names = [...new Set(grid.hiddenEvents.flatMap((h) => h.actorIds))].map((id) => `${id} ${grid.actorById.get(id)?.name ?? ''}`.trim())
  return {
    label: view.label,
    drawn: grid.eventCount,
    total: grid.eventCount + grid.hiddenEvents.length,
    parties: names.join(', '),
    ids: grid.hiddenEvents.map((h) => h.id).join(', '),
  }
}

/** The generation of this type's JSON format (core/specVersion.js, spec/versioning.md): +1 on a breaking change */
export const FACT_SPEC_VERSION = 1

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
  ],
  groups: [
    { name: 'id', req: 'yes', ty: 'string', note: 'events reference it via groupId' },
    { name: 'label', req: 'yes', ty: 'string', note: 'column heading, e.g. "performance as agreed"' },
    { name: '', req: '', ty: '', note: 'at most 3: the 1st on the left (top) side, the 2nd on the right (bottom) side, the 3rd on the axis' },
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
    { name: 'actorIds', req: 'no', ty: 'string[]', note: 'parties involved. Two or more puts this event on the centre axis' },
    { name: 'groupId', req: 'no', ty: 'string', note: 'which side this event falls on' },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which materials it rests on' },
  ],
  views: [
    { name: 'label', req: 'yes', ty: 'string', note: 'view name, shown in the dropdown' },
    { name: 'splitBy', req: 'yes', ty: '"actor" | "group"', note: 'split the sides by party or by group' },
    { name: 'side1 / side2', req: 'no', ty: 'object', note: '{ label, actors: [...] }. Required when splitBy=actor' },
    { name: 'axis', req: 'no', ty: 'object', note: '{ label }. Heading of the centre column' },
    { name: '', req: '', ty: '', note: 'views may be omitted; the engine then provides a single "all" view' },
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
  lines.push('Cross-field rules (dangling references, a span running backwards, one party on')
  lines.push('both sides at once, two events in the same lane of one time slot) are not listed')
  lines.push('above: call antu_validate after writing. It reports each problem with its field path.')
  return lines.join('\n')
}

/**
 * The chronicle's geometry report: one column, so there are no views to fit and no orientation
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
  lines.push(`Kind: chronicle (every event in one column, in slot order; views and orientation do not apply)`)
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
  lines.push('Kind: scale (distance on the axis is real time; views and orientation do not apply)')
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

  /**
   * What validation cannot call an error: a view that does not fit. `validate` checks the data
   * once (through the first view), and a view whose events collide in a lane is by design left out
   * of the view dropdown rather than rejected, so it is not an error. But it must not go unseen
   * either: with only the errors, a data set whose second view could never be drawn came back as
   * "passed". Every view is laid out here and the ones that do not fit are named.
   */
  notes: (spec) => [
    ...viewsOf(spec)
      .map((view) => ({ label: view.label, reason: buildGrid(spec, view).errors[0] }))
      .filter((v) => v.reason)
      .map((v) => tEn('note.viewBlocked', v)),
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
   * The geometry report for MCP's antu_layout (compute only, no rendering): per view, how
   * many events and columns and whether it fits; per orientation, the content size and the
   * fit zoom. It lives with the type because every quantity in it is a fact concept.
   */
  report: (spec, layout, { orientation, fields = { summary: true }, kind, canvas }) => {
    if (kind === 'chronicle') return chronicleReport(spec, layout, { fields, canvas })
    if (kind === 'scale') return scaleReport(spec, layout, { canvas })
    const views = viewsOf(spec)
    const rows = views.map((view, i) => {
      const graph = layout(spec, fields, view, orientation ?? 'vertical')
      const grid = buildGrid(spec, view)
      const cols = { side1: 0, axis: 0, side2: 0 }
      grid.columns.forEach((c) => {
        cols[c.side] += 1
      })
      return {
        index: i,
        label: view.label,
        events: graph.eventCount ?? grid.eventCount ?? 0,
        hidden: grid.hiddenEvents.length > 0 ? hiddenNote(view, grid) : null,
        slots: grid.rows.length,
        columns: cols,
        blocked: graph.errors.length > 0,
        blockReason: graph.errors[0] ?? null,
      }
    })
    // Both orientations, to advise one (the same slot-count rule the renderer uses by default)
    const byOrientation = {}
    for (const o of ['vertical', 'horizontal']) {
      const g = layout(spec, fields, undefined, o)
      byOrientation[o] = { size: g.size, fit: Number(fitZoom(g.size, canvas).toFixed(3)) }
    }
    const slotCount = Array.isArray(spec.slots) ? spec.slots.length : 0
    const opens = orientation ?? (slotCount >= 5 ? 'vertical' : 'horizontal')
    const others = opens === 'vertical' ? 'horizontal' : 'vertical'
    // The Stagger switch of the page (vertical only, off by default): said only when it makes the text larger
    const staggeredGraph = layout(spec, fields, undefined, 'vertical', { stagger: true })
    const staggered = { size: staggeredGraph.size, fit: Number(fitZoom(staggeredGraph.size, canvas).toFixed(3)) }
    const staggerHelps = staggered.fit > byOrientation.vertical.fit
    return {
      text: {
        font: LABEL_FONT,
        canvas,
        open: { name: opens, fit: byOrientation[opens].fit },
        other: { name: others, fit: byOrientation[others].fit },
        ...(staggerHelps ? { staggered: staggered.fit } : {}),
      },
      staggered,
      views,
      counts: {
        slots: slotCount,
        events: (spec.slots ?? []).reduce((n, s) => n + (s?.events?.length || 0), 0),
        actors: spec.actors?.length ?? 0,
        sources: spec.sources?.length ?? 0,
      },
      byOrientation,
      suggestedOrientation: slotCount >= 5 ? 'vertical' : 'horizontal',
      blockedViews: rows.filter((r) => r.blocked).map((r) => ({ label: r.label, reason: r.blockReason })),
      rows,
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
    lines.push(`Vertical: content ${v.size.width}×${v.size.height}, fit zoom ${v.fit}`)
    lines.push(`Horizontal: content ${h.size.width}×${h.size.height}, fit zoom ${h.fit}`)
    lines.push(
      r.suggestedOrientation === 'vertical'
        ? `Suggested orientation: vertical (by the slot-count rule, ${r.counts.slots} slots >= 5)`
        : `Suggested orientation: horizontal (by the slot-count rule, ${r.counts.slots} slots < 5)`,
    )
    lines.push(...textSizeLines(r.text, 'splitting the timeline into periods, one diagram each'))
    lines.push(`${r.views.length} view(s):`)
    for (const row of r.rows) {
      const c = row.columns
      const mark = row.blocked ? `does not fit (${row.blockReason})` : 'fits'
      const drawn = row.hidden ? `${row.hidden.drawn} of ${row.hidden.total} events drawn` : `${row.events} events`
      lines.push(`  ${row.index}. ${row.label}: side1 ${c.side1} / axis ${c.axis} / side2 ${c.side2}, ${drawn} -> ${mark}`)
      if (row.hidden) lines.push(`     left out: events ${row.hidden.ids}, of ${row.hidden.parties}: the view names parties on its sides and these are on neither. If they should be drawn, put the party on a side, or leave both side lists empty to show every event.`)
    }
    if (r.blockedViews.length > 0) {
      lines.push('')
      lines.push(`Note: ${r.blockedViews.length} view(s) do not fit and will not appear in the view dropdown.`)
      lines.push('Common cause: two or more events of one time slot fall in the same lane (the grid is one event per cell).')
      lines.push('How to fix: split that time slot into two finer time points, or change the groups / parties so the events land in different lanes.')
    }
    return lines.join('\n')
  },

  /** One example's size, for MCP's example list: the numbers and the line the tool prints */
  summarize: (spec) => {
    const slots = Array.isArray(spec.slots) ? spec.slots : []
    const events = slots.reduce((n, s) => n + (s?.events?.length || 0), 0)
    const actors = spec.actors?.length ?? 0
    const views = viewsOf(spec).map((v) => v.label)
    return {
      events,
      slots: slots.length,
      actors,
      views,
      line: `${events} events / ${slots.length} time slots / ${actors} parties\n    views: ${views.join(', ')}`,
    }
  },

  /** The version, status and release of each way of drawing (spec/versioning.md, "The diagrams"); the same names as `layouts` */
  diagrams: {
    timeline: { version: 1, status: 'experimental', since: '0.2.0' },
    chronicle: { version: 1, status: 'experimental', since: '0.7.0' },
    scale: { version: 1, status: 'experimental', since: '0.7.0' },
  },

  /** Which ways of drawing a fact diagram exist. The first is the default. */
  layouts: {
    timeline: buildFactGraph,
    chronicle: buildChronicleGraph,
    scale: buildScaleGraph,
  },
}
