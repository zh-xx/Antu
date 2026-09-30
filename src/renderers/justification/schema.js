// ============================================================
//  src/renderers/justification/schema.js — the "knowledge" a justification diagram exposes
//
//  Same position and same job as relationship's schema.js: it answers two things, both plain JS:
//    1. whether a justification is valid (the rules are in tree/rules.js; this file only wraps them)
//    2. which kinds this type has, and what each one's layout function is
//
//  The field list, the agent-facing reference, is generated from JUSTIFICATION_FIELDS below, never
//  copied by hand. The specification is spec/justification/schema-draft.md.
// ============================================================

import { specVersionFieldRow } from '../../core/specVersion.js'
import { validateJustification, hintsOfJustification, NODE_KINDS, STANCES, HOLDS_KINDS, COMBINES } from './tree/rules.js'
import { buildJustificationGraph } from './tree/layout.js'
import { fitZoom, textSizeLines } from '../../core/canvas.js'
import { NODE_FONT } from './tree/metrics.js'

/**
 * Field metadata: req = required; ty = type; note = a one-line explanation. Cross-field rules
 * (dangling references, cycles, a leaf with a supporter) are not in this table; rules.js reports
 * them one by one at run time.
 */
/** The generation of this type's JSON format (core/specVersion.js, spec/versioning.md): +1 on a breaking change */
export const JUSTIFICATION_SPEC_VERSION = 1

export const JUSTIFICATION_FIELDS = {
  envelope: [
    { name: 'type', req: 'yes', ty: 'string', note: 'always "justification"' },
    specVersionFieldRow(JUSTIFICATION_SPEC_VERSION),
    { name: 'title', req: 'yes', ty: 'string', note: 'diagram title, shown at the top left' },
    { name: 'speaker', req: 'no', ty: 'string', note: 'whose reasoning this is, e.g. the court; one side only' },
  ],
  groups: [
    { name: 'id', req: 'yes', ty: 'string', note: 'nodes reference it via groupId' },
    { name: 'label', req: 'yes', ty: 'string', note: 'one issue of the reasoning, e.g. "Issue 1: was it defensive?"' },
    { name: '', req: '', ty: '', note: 'a node is in at most one group; omit groups and no boxes are drawn; nodes in no group stand above the issues' },
  ],
  nodes: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique among nodes; links reference it via from/to' },
    {
      name: 'kind',
      req: 'yes',
      ty: 'string',
      note: `${NODE_KINDS.join(' / ')}. fact = what the court found happened; inference = drawn from facts; judgement = a value call on facts`,
    },
    { name: 'label', req: 'yes', ty: 'string', note: 'the one sentence shown on the node' },
    { name: 'detail', req: 'no', ty: 'string', note: 'full text that does not fit (a statute, the judgment\'s own words); in the popover' },
    { name: 'holds', req: 'no', ty: 'yes|no', note: `whether the statement holds in this reasoning; only on ${HOLDS_KINDS.join(' / ')}; omit = not stated` },
    { name: 'combine', req: 'no', ty: 'all|any', note: `${COMBINES.join(' | ')}: all = every one of what it rests on is needed ("and"), any = one is enough ("or"); only on ${HOLDS_KINDS.join(' / ')}; omit = not stated` },
    { name: 'date', req: 'no', ty: 'ISO date', note: 'facts only: when it happened, YYYY-MM-DD or YYYY-MM-DDTHH:MM' },
    { name: 'groupId', req: 'no', ty: 'string', note: 'references groups' },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which materials it rests on (a norm: the statute or case)' },
  ],
  links: [
    { name: 'from', req: 'yes', ty: 'string', note: 'node id; the link runs from the supporting side (or the norm) to the supported one' },
    { name: 'to', req: 'yes', ty: 'string', note: 'node id' },
    { name: 'stance', req: 'no', ty: 'string', note: `${STANCES.join(' / ')}; default for. basis: the norm \`to\` rests on (only from a norm). against: opposes \`to\`` },
    { name: 'label', req: 'no', ty: 'string', note: 'a short phrase on the line; omit and none is shown' },
  ],
  sources: [
    { name: 'id', req: 'yes', ty: 'string', note: 'nodes reference it via sourceIds' },
    { name: 'type', req: 'yes', ty: 'string', note: 'statute / case / evidence and four more, the same seven as fact' },
    { name: 'name', req: 'yes', ty: 'string', note: 'material name, e.g. "Guiding Case No. 93 · reasons"' },
    { name: 'loc', req: 'no', ty: 'object', note: 'location, e.g. { caseNo, court } or { lawName, article, version }' },
  ],
}

/** Render the field metadata into one compact text for the agent. Same source as the code, so it is never written twice. */
export function describeJustificationSchema() {
  const lines = ['Fields of a justification spec. "yes" means required.', '']
  for (const [group, rows] of Object.entries(JUSTIFICATION_FIELDS)) {
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
  lines.push('Cross-field rules (dangling references, a cycle, a fact or norm with something supporting it, no end')
  lines.push('conclusion, holds or date on the wrong kind) are not listed above: call antu_validate after writing.')
  lines.push('It reports each problem.')
  return lines.join('\n')
}

export const justificationKnowledge = {
  specVersion: JUSTIFICATION_SPEC_VERSION,
  /** The display name of the type: a message key, resolved per language by the consumer (core/labels.js) */
  label: 'graphType.justification',

  fields: JUSTIFICATION_FIELDS,
  describe: describeJustificationSchema,

  /** The label card's third line, counted in a justification's own units */
  info: (spec, t, formatNumber) => [
    t('info.nodes', { n: formatNumber(Array.isArray(spec.nodes) ? spec.nodes.length : 0) }),
    t('info.links', { n: formatNumber(Array.isArray(spec.links) ? spec.links.length : 0) }),
    t('info.sources', { n: formatNumber(spec.sources?.length || 0) }),
  ],

  /**
   * The geometry report for MCP's antu_layout. A justification has no views and nothing "does not
   * fit": scale is reported, never refused, and the agent decides whether to split by issue.
   */
  report: (spec, layout, { canvas }) => {
    const byOrientation = {}
    let g
    for (const o of ['horizontal', 'vertical']) {
      g = layout(spec, {}, undefined, o)
      byOrientation[o] = { size: g.size, fit: Number(fitZoom(g.size, canvas).toFixed(3)) }
    }
    const v = byOrientation.vertical
    const h = byOrientation.horizontal
    // With every issue folded: the reader's way of seeing a big reasoning whole, without splitting it
    const issues = Array.isArray(spec.groups) ? spec.groups.map((x) => x?.id).filter(Boolean) : []
    const folded = issues.length > 1 ? fitZoom(layout(spec, { collapsed: issues }, undefined, 'horizontal').size, canvas) : undefined
    return {
      text: { font: NODE_FONT, canvas, open: { name: 'horizontal', fit: h.fit }, other: { name: 'vertical', fit: v.fit }, folded },
      counts: {
        nodes: g.stats.nodes,
        links: g.stats.links,
        groups: g.stats.groups,
        layers: g.stats.layers,
        widest: g.stats.widest,
        kinds: g.stats.kinds,
        sources: spec.sources?.length ?? 0,
      },
      byOrientation,
      // A justification opens horizontal: the conclusion at the left, the facts at the right, read as a sentence
      suggestedOrientation: 'horizontal',
      betterFit: v.fit > h.fit ? 'vertical' : 'horizontal',
      hints: g.hints,
    }
  },

  /** The geometry report as the short text the tool returns to an agent */
  formatReport: (r) => {
    const c = r.counts
    const v = r.byOrientation.vertical
    const h = r.byOrientation.horizontal
    const kinds = Object.entries(c.kinds)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')
    const lines = [
      `Data: ${c.nodes} nodes (${kinds}) / ${c.links} links / ${c.groups} issues / ${c.sources} sources`,
      `Shape: ${c.layers} layers, widest layer ${c.widest} nodes`,
      `Horizontal: content ${h.size.width}×${h.size.height}, fit zoom ${h.fit}`,
      `Vertical: content ${v.size.width}×${v.size.height}, fit zoom ${v.fit}`,
      `Suggested orientation: ${r.suggestedOrientation} (what the diagram opens with)`,
    ]
    if (r.betterFit !== r.suggestedOrientation) {
      lines.push(`Vertical fits a screen better (${v.fit} vs ${h.fit}); the reader can switch to it.`)
    }
    lines.push(...textSizeLines(r.text, 'one diagram per issue'))
    if (r.hints.length) {
      lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
    }
    return lines.join('\n')
  },

  /** One example's size, for MCP's example list */
  summarize: (spec) => {
    const nodes = Array.isArray(spec.nodes) ? spec.nodes.length : 0
    const links = Array.isArray(spec.links) ? spec.links.length : 0
    const groups = Array.isArray(spec.groups) ? spec.groups.length : 0
    return { nodes, links, groups, line: `${nodes} nodes / ${links} links / ${groups} issues` }
  },

  /** Validation: there is only one copy of the rules, in tree/rules.js */
  validate: (spec) => validateJustification(spec),

  /** What validation cannot call an error but the author should see: rules 13 to 18 of the spec */
  notes: (spec) => hintsOfJustification(spec),

  /** Which kinds a justification diagram has. Currently the tree only. */
  layouts: {
    tree: buildJustificationGraph,
  },
}
