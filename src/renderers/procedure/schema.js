// ============================================================
//  src/renderers/procedure/schema.js — the "knowledge" a procedure diagram exposes
//
//  Same position and same job as fact's schema.js: it answers two things, both
//  plain JS:
//    1. whether a procedure is valid (the rules are in flow/rules.js; this file
//       only wraps them)
//    2. which kinds this type has, and what each one's layout function is
//
//  Why validation lives in rules.js and not in the layout: on the fact side the
//  two were stirred together, and the result was that "validate without laying
//  out" could not be done. procedure kept them apart from
//  day one.
// ============================================================

import { specVersionFieldRow } from '../../core/specVersion.js'
import { validateProcedure, KINDS, OUTCOMES, DOMAINS } from './flow/rules.js'
import { buildProcedureGraph } from './flow/layout.js'
import { fitZoom, textSizeLines } from '../../core/canvas.js'
import { NODE_FONT } from './flow/metrics.js'

/**
 * Field metadata: **the reference an agent gets is generated from this**, not
 * copied by hand. Same convention as fact: req = required; ty = type; note = a
 * one-line explanation.
 *
 * Cross-field rules (dangling references, outgoing edges of a decision,
 * connectivity, a broken main line) are not in this table; rules.js reports them
 * one by one at run time.
 */
/** The generation of this type's JSON format (core/specVersion.js, spec/versioning.md): +1 on a breaking change */
export const PROCEDURE_SPEC_VERSION = 1

export const PROCEDURE_FIELDS = {
  envelope: [
    { name: 'type', req: 'yes', ty: 'string', note: 'always "procedure"' },
    specVersionFieldRow(PROCEDURE_SPEC_VERSION),
    { name: 'title', req: 'yes', ty: 'string', note: 'diagram title, shown at the top left' },
  ],
  domain: [
    { name: 'domain', req: 'no', ty: 'string', note: `which class of flow this is: ${DOMAINS.join(' / ')}` },
  ],
  actors: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique within the diagram; nodes reference it via actorIds' },
    { name: 'name', req: 'yes', ty: 'string', note: 'display name, e.g. "Party A"' },
    { name: 'role', req: 'no', ty: 'string', note: 'role, e.g. "owner"' },
    { name: '', req: '', ty: '', note: 'actorIds on a node is display-only (it marks who acted); it never affects placement' },
  ],
  stages: [
    { name: 'id', req: 'yes', ty: 'string', note: 'nodes reference it via stageId' },
    { name: 'label', req: 'yes', ty: 'string', note: 'stage name, e.g. "requirements sign-off"' },
    { name: '', req: '', ty: '', note: 'array order is the order in the flow; omit stages and no stage bands are drawn' },
  ],
  sources: [
    { name: 'id', req: 'yes', ty: 'string', note: 'nodes reference it via sourceIds' },
    { name: 'type', req: 'yes', ty: 'string', note: 'contract / evidence / judgment and four more, the same seven as fact' },
    { name: 'name', req: 'yes', ty: 'string', note: 'material name, e.g. "software development services contract"' },
    { name: 'loc', req: 'no', ty: 'object', note: 'location, e.g. { file, clause, page }' },
  ],
  nodes: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique within the diagram; edges reference it via from/to' },
    {
      name: 'kind',
      req: 'yes',
      ty: 'string',
      note: `shape: ${KINDS.join(' / ')} (decision = a diamond decision point; it needs at least 2 outgoing edges, each with a condition)`,
    },
    { name: 'label', req: 'yes', ty: 'string', note: 'the line shown on the node; about 12 full-width characters per line' },
    { name: 'detail', req: 'no', ty: 'string', note: 'amounts, deadlines and the like; one line inside the box, the full text in the popover' },
    { name: 'actorIds', req: 'no', ty: 'string[]', note: 'references actors; display-only' },
    { name: 'stageId', req: 'no', ty: 'string', note: 'references stages; decides which stage band it falls in' },
    {
      name: 'outcome',
      req: 'no',
      ty: 'string',
      note: `outcome (drives colour, not shape): ${OUTCOMES.join(' / ')}, default neutral`,
    },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which materials it rests on' },
  ],
  rules: [
    { name: '', req: '', ty: '', note: 'Optional (v1.1). Contingent clauses: breach, delay liability, rights to terminate' },
    { name: '', req: '', ty: '', note: 'a rule is NOT a step: write it here, not as a node with edges out of some step' },
    { name: 'id', req: 'yes', ty: 'string', note: 'unique among rules and nodes' },
    { name: 'when', req: 'yes', ty: 'string|str[]', note: 'the trigger; an array means "any one of these"' },
    { name: 'then', req: 'yes', ty: 'string', note: 'the consequence, with amounts, e.g. "penalty 0.1% per day, capped at 5%"' },
    { name: 'stageIds', req: 'no', ty: 'string[]', note: 'the stages it applies in; omit = throughout. One rule for all its stages, never one copy per stage' },
    { name: 'outcome', req: 'no', ty: 'string', note: `colour: ${OUTCOMES.join(' / ')}` },
    { name: 'endId', req: 'no', ty: 'string', note: 'only if it ends the contract: the id of the end node it leads to' },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which clause it rests on' },
  ],
  edges: [
    { name: 'from', req: 'yes', ty: 'string', note: 'id of the source node' },
    { name: 'to', req: 'yes', ty: 'string', note: 'id of the target node' },
    {
      name: 'condition',
      req: 'no',
      ty: 'string',
      note: 'the condition for taking this edge (a human-readable phrase such as "pass" or "Party B\'s fault"). Required on every outgoing edge of a decision',
    },
    {
      name: 'main',
      req: 'no',
      ty: 'boolean',
      note: 'whether this edge is on the main line. If marked, it must connect through to an end; if unmarked the engine infers it',
    },
    {
      name: '',
      req: '',
      ty: '',
      note: 'several edges may run between the same pair of nodes (different conditions); they are merged into one link with the conditions shown side by side',
    },
  ],
}

/** Render the field metadata into one compact text for the agent. Same source as the code, so it is never written twice. */
export function describeProcedureSchema() {
  const lines = ['Fields of a procedure spec. "yes" means required.', '']
  for (const [group, rows] of Object.entries(PROCEDURE_FIELDS)) {
    lines.push(`[${group}]`)
    for (const r of rows) {
      if (!r.name) {
        lines.push(`  · ${r.note}`)
        continue
      }
      lines.push(`  ${r.name.padEnd(10)} ${r.req.padEnd(2)} ${r.ty.padEnd(10)} ${r.note}`)
    }
    lines.push('')
  }
  lines.push('Cross-field rules (dangling references, whether a decision has enough')
  lines.push('outgoing edges, isolated nodes, whether the main line connects through) are')
  lines.push('not listed above: call antu_validate after writing. It reports each problem.')
  return lines.join('\n')
}

export const procedureKnowledge = {
  specVersion: PROCEDURE_SPEC_VERSION,
  /**
   * The display name of the type. What is stored is a **message key**, not the
   * message: the registry is also used on the Node side (MCP), which has no
   * interface language, so translation happens on the consumer side per language
   * (see core/labels.js).
   */
  label: 'graphType.procedure',

  fields: PROCEDURE_FIELDS,
  describe: describeProcedureSchema,

  /** The label card's third line, counted in a procedure's own units (see the same entry in fact/schema.js) */
  info: (spec, t, formatNumber) => {
    const nodes = Array.isArray(spec.nodes) ? spec.nodes.length : 0
    const stages = Array.isArray(spec.stages) ? spec.stages.length : 0
    let first = t('info.nodes', { n: formatNumber(nodes) })
    if (stages > 0) first += ` · ${t('info.stages', { n: formatNumber(stages) })}`
    return [
      first,
      t('info.actors', { n: formatNumber(spec.actors?.length || 0) }),
      t('info.sources', { n: formatNumber(spec.sources?.length || 0) }),
    ]
  },

  /**
   * The geometry report for MCP's antu_layout, counted in a procedure's own units: nodes,
   * links, layers, the widest layer, loops, rules; per orientation the content size and the
   * fit zoom. A procedure has no views and nothing "does not fit": scale is reported, never
   * refused (§6.3), and the agent decides whether to split the diagram.
   */
  report: (spec, layout, { canvas }) => {
    const byOrientation = {}
    let g
    for (const o of ['vertical', 'horizontal']) {
      g = layout(spec, {}, undefined, o)
      byOrientation[o] = { size: g.size, fit: Number(fitZoom(g.size, canvas).toFixed(3)) }
    }
    const v = byOrientation.vertical
    const h = byOrientation.horizontal
    return {
      text: { font: NODE_FONT, canvas, open: { name: 'vertical', fit: v.fit }, other: { name: 'horizontal', fit: h.fit } },
      counts: {
        nodes: g.stats.nodes,
        edges: g.stats.edges,
        links: g.stats.connections,
        layers: g.stats.layers,
        widest: g.stats.widest,
        backEdges: g.stats.backEdges,
        rules: Array.isArray(spec.rules) ? spec.rules.length : 0,
        stages: Array.isArray(spec.stages) ? spec.stages.length : 0,
        actors: spec.actors?.length ?? 0,
        sources: spec.sources?.length ?? 0,
      },
      byOrientation,
      // The orientation the app opens with: always vertical (§6, FlowRenderer.jsx). Reporting
      // "the one with the larger fit zoom" here once told an agent "horizontal" for 4 of 14
      // examples that opened vertical (issue #17); which one fits better is a separate fact
      suggestedOrientation: 'vertical',
      betterFit: h.fit > v.fit ? 'horizontal' : 'vertical',
      hints: g.hints,
    }
  },

  /** The geometry report as the short text the tool returns to an agent */
  formatReport: (r) => {
    const c = r.counts
    const v = r.byOrientation.vertical
    const h = r.byOrientation.horizontal
    const lines = [
      `Data: ${c.nodes} nodes / ${c.edges} edges (${c.links} links after merging) / ${c.rules} rules / ${c.stages} stages / ${c.actors} parties / ${c.sources} sources`,
      `Shape: ${c.layers} layers, widest layer ${c.widest} nodes, ${c.backEdges} loop(s) back`,
      `Vertical: content ${v.size.width}×${v.size.height}, fit zoom ${v.fit}`,
      `Horizontal: content ${h.size.width}×${h.size.height}, fit zoom ${h.fit}`,
      `Suggested orientation: ${r.suggestedOrientation} (what the diagram opens with; a flowchart reads top to bottom)`,
    ]
    if (r.betterFit !== r.suggestedOrientation) {
      lines.push(`Horizontal fits a screen better (${h.fit} vs ${v.fit}); the reader can switch to it.`)
    }
    lines.push(...textSizeLines(r.text, 'splitting the flow by stage'))
    if (r.hints.length) {
      lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
    }
    return lines.join('\n')
  },

  /** One example's size, for MCP's example list */
  summarize: (spec) => {
    const nodes = Array.isArray(spec.nodes) ? spec.nodes.length : 0
    const edges = Array.isArray(spec.edges) ? spec.edges.length : 0
    const rules = Array.isArray(spec.rules) ? spec.rules.length : 0
    const stages = Array.isArray(spec.stages) ? spec.stages.length : 0
    return { nodes, edges, rules, stages, line: `${nodes} nodes / ${edges} edges / ${rules} rules / ${stages} stages` }
  },

  /** Validation: there is only one copy of the rules, in flow/rules.js */
  validate: (spec) => validateProcedure(spec),

  /** Which kinds a procedure diagram has. Currently the flowchart only. */
  layouts: {
    flow: buildProcedureGraph,
  },
}
