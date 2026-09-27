// ============================================================
//  src/renderers/fact/schema.js — the "knowledge" the fact top-level type exposes
//
//  This file answers two questions, and it is **pure JS** throughout (no components, so Node and MCP can import it directly):
//    1. whether a fact spec is valid
//    2. which ways of drawing this top-level type exist, and what layout function each one has
//
//  Why a file of its own: the registry keeps "knowledge" and "components" apart.
//  Components are .jsx and only a browser can load them; MCP needs the rules and cannot load components.
//  Once the two are apart, MCP no longer hand-writes a dispatch table of its own (see known-issues item 2).
//
//  Note: **the validation rules are not here**. There is only one copy, in timeline/grid.js (errors are collected along the way while laying out),
//  and this file only wraps it in a public interface, repeating not one line.
// ============================================================

import { buildGrid } from './timeline/grid.js'
import { buildFactGraph } from './timeline/layout.js'

/**
 * Field metadata: **the agent-facing reference is generated from here**, not copied by hand
 * (this project has been bitten four times by writing one fact in two places; see known-issues item 2).
 * **Fixed English, not following the interface language**: it goes into a model's context via MCP's
 * antu_schema, where English costs fewer tokens and needs no second copy (see core/i18n.js).
 * req = required; ty = type; note = one-line explanation an agent can act on. Only **field-level**
 * rules are listed; cross-field rules are reported by the validator at run time (see spec/agent/fact/guide.md).
 */
export const FACT_FIELDS = {
  envelope: [
    { name: 'type', req: 'yes', ty: 'string', note: 'always "fact"' },
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
    { name: 'name', req: 'yes', ty: 'string', note: 'material name, e.g. "elevator lobby surveillance video"' },
    { name: 'loc', req: 'no', ty: 'object', note: 'location, e.g. { file, page } or { file, timestamp }' },
    { name: 'quote', req: 'no', ty: 'string', note: 'verbatim excerpt, shown when the card is opened' },
  ],
  slots: [
    { name: 'events', req: 'yes', ty: 'array', note: 'events at this time point; must not be empty' },
    { name: '', req: '', ty: '', note: 'array order is chronological order; date is display-only and never reorders' },
  ],
  events: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique within the diagram' },
    { name: 'date', req: 'yes', ty: 'string', note: 'ISO 8601. Go to seconds when known, otherwise stop at the day' },
    { name: 'label', req: 'yes', ty: 'string', note: 'card title; about 20 characters per line, at most two lines' },
    { name: 'dateEnd', req: 'no', ty: 'string', note: 'for a span, the end instant; must not be earlier than date' },
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

export const factKnowledge = {
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

  /** Which ways of drawing a fact diagram exist. For now only the timeline. */
  layouts: {
    timeline: buildFactGraph,
  },
}
