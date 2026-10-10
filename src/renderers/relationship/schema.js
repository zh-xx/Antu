// ============================================================
//  src/renderers/relationship/schema.js — the "knowledge" a relationship diagram exposes
//
//  Same position and same job as procedure's schema.js: it answers two things, both plain JS:
//    1. whether a relationship is valid (the rules are in graph/rules.js; this file only wraps them)
//    2. which kinds this type has, and what each one's layout function is
//
//  The field list, the agent-facing reference, is generated from RELATIONSHIP_FIELDS below, never
//  copied by hand. The specification is spec/relationship/schema-draft.md.
// ============================================================

import { specVersionFieldRow } from '../../core/specVersion.js'
import { validateRelationship, hintsOfRelationship, ENTITY_KINDS, RELATION_KINDS } from './graph/rules.js'
import { buildRelationshipGraph } from './graph/layout.js'
import { buildFocusGraph } from './focus/layout.js'
import { buildMatrixGraph } from './matrix/layout.js'
import { buildEquityGraph } from './equity/layout.js'
import { buildAuthorityGraph } from './authority/layout.js'
import { buildRelatedGraph } from './related/layout.js'
import { buildPathGraph } from './path/layout.js'
import { fitZoom, textSizeLines } from '../../core/canvas.js'
import { ENTITY_FONT } from './graph/metrics.js'

/**
 * Field metadata: req = required; ty = type; note = a one-line explanation. Cross-field rules
 * (dangling references, a guarantee that secures nothing, shares over 100) are not in this
 * table; rules.js reports them one by one at run time.
 */
/** The generation of this type's JSON format (core/specVersion.js, spec/versioning.md): +1 on a breaking change */
export const RELATIONSHIP_SPEC_VERSION = 1

export const RELATIONSHIP_FIELDS = {
  envelope: [
    { name: 'type', req: 'yes', ty: 'string', note: 'always "relationship"' },
    specVersionFieldRow(RELATIONSHIP_SPEC_VERSION),
    { name: 'title', req: 'yes', ty: 'string', note: 'diagram title, shown at the top left' },
    { name: 'asOf', req: 'no', ty: 'ISO date', note: 'the date these relations hold; the diagram is a cross-section at one point in time' },
  ],
  groups: [
    { name: 'id', req: 'yes', ty: 'string', note: 'entities reference it via groupId' },
    { name: 'label', req: 'yes', ty: 'string', note: 'the camp or cluster boxed together, e.g. "creditor side"' },
    { name: '', req: '', ty: '', note: 'an entity is in at most one group; groups do not nest; omit groups and no boxes are drawn' },
  ],
  entities: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique among entities; relations reference it via from/to' },
    { name: 'kind', req: 'yes', ty: 'string', note: `${ENTITY_KINDS.join(' / ')}; fixes the shape and colour only` },
    { name: 'label', req: 'yes', ty: 'string', note: 'the name shown on the box' },
    { name: 'role', req: 'no', ty: 'string', note: 'the role in this case, one short line under the name, e.g. "guarantor"' },
    { name: 'detail', req: 'no', ty: 'string', note: 'registered capital, ID number and the like; the full text in the popover' },
    { name: 'groupId', req: 'no', ty: 'string', note: 'references groups' },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which materials it rests on' },
  ],
  relations: [
    { name: 'id', req: 'yes', ty: 'string', note: 'unique among relations (a guarantee\'s secures refers to it)' },
    { name: 'from', req: 'yes', ty: 'string', note: 'entity id; the direction of the relation runs from here' },
    { name: 'to', req: 'yes', ty: 'string', note: 'entity id' },
    {
      name: 'kind',
      req: 'yes',
      ty: 'string',
      note: `${RELATION_KINDS.join(' / ')}. equity: holder -> held. debt: creditor -> debtor. guarantee: guarantor -> creditor. control/employment/agency: the controlling / employing / authorising side first. A tie that stands, never an act (a blow, an insult): acts go in a fact diagram`,
    },
    { name: 'label', req: 'no', ty: 'string', note: 'a short phrase on the line; omit it and the engine writes one from the kind ("Holds 60%")' },
    { name: 'detail', req: 'no', ty: 'string', note: 'terms, dates; the full text in the popover' },
    { name: 'directed', req: 'no', ty: 'boolean', note: 'override of the kind\'s default: contract and kinship have no arrowhead, the rest do' },
    { name: 'share', req: 'no', ty: 'number', note: 'equity only: the percentage held, 0 to 100' },
    { name: 'amount', req: 'no', ty: 'string', note: 'debt and contract only: the sum as it should be read, e.g. "CNY 500,000"' },
    { name: 'secures', req: 'no', ty: 'string', note: 'guarantee only: the id of the debt or contract relation it secures' },
    { name: 'sourceIds', req: 'no', ty: 'string[]', note: 'which materials it rests on' },
  ],
  sources: [
    { name: 'id', req: 'yes', ty: 'string', note: 'entities and relations reference it via sourceIds' },
    { name: 'type', req: 'yes', ty: 'string', note: 'contract / evidence / statute and four more, the same seven as fact' },
    { name: 'name', req: 'yes', ty: 'string', note: 'material name, e.g. "loan contract"' },
    { name: 'loc', req: 'no', ty: 'object', note: 'location, e.g. { file, page }' },
  ],
}

/** Render the field metadata into one compact text for the agent. Same source as the code, so it is never written twice. */
export function describeRelationshipSchema() {
  const lines = ['Fields of a relationship spec. "yes" means required.', '']
  for (const [group, rows] of Object.entries(RELATIONSHIP_FIELDS)) {
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
  lines.push('Cross-field rules (dangling references, a relation from an entity to itself, share and amount on the')
  lines.push('wrong kind, a guarantee that secures something that is not a claim) are not listed above: call')
  lines.push('antu_validate after writing. It reports each problem.')
  return lines.join('\n')
}

/**
 * The focus view's geometry report: no orientation to choose, so one size, fitted whole; what is
 * worth saying is who stands in the middle, how many rings there are, and whether some parties are
 * not reached from the centre (they are laid out apart, under the picture).
 */
function focusReport(spec, layout, { canvas }) {
  const g = layout(spec, {})
  const fit = Number(fitZoom(g.size, canvas).toFixed(3))
  const label = (spec.entities ?? []).find((e) => e.id === g.centre)?.label ?? g.centre
  return {
    text: { font: ENTITY_FONT, canvas, open: { name: 'fitted whole', fit }, other: { name: 'fitted whole', fit } },
    counts: { entities: g.stats.entities, relations: g.stats.relations, groups: g.stats.groups, kinds: g.stats.kinds, sources: spec.sources?.length ?? 0 },
    size: g.size,
    centre: { id: g.centre, label },
    rings: g.rings,
    islands: g.islands.length - 1,
    apart: g.islands.slice(1).reduce((n, i) => n + i.ids.length, 0),
    hints: g.hints,
  }
}

function formatFocusReport(r) {
  const c = r.counts
  const lines = [
    'Kind: focus (one party in the middle; orientation does not apply)',
    `Data: ${c.entities} entities / ${c.relations} relations / ${c.groups} groups / ${c.sources} sources`,
    `Opens centred on "${r.centre.label}" (the party with most relations; the reader can pick another)`,
    `Rings around it: ${r.rings.slice(1).map((n, i) => `${n} at ${i + 1} step${i ? 's' : ''}`).join(', ') || 'none (it has no relations)'}`,
    `Content ${r.size.width}×${r.size.height}`,
  ]
  if (r.apart) lines.push(`${r.apart} part${r.apart === 1 ? 'y is' : 'ies are'} not reached from the centre, laid out apart under the picture (${r.islands} separate group${r.islands === 1 ? '' : 's'})`)
  lines.push(...textSizeLines(r.text, 'splitting the diagram by group'))
  if (r.hints.length) lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
  return lines.join('\n')
}

/** The matrix's geometry report: no orientation to choose; how full the table is is what is worth saying */
function matrixReport(spec, layout, { canvas }) {
  const g = layout(spec, {})
  const fit = Number(fitZoom({ width: g.size.width, height: 1 }, { width: canvas.width, height: canvas.height * 1e6 }).toFixed(3))
  return {
    text: { font: ENTITY_FONT, canvas, open: { name: 'fitted to width', fit }, other: { name: 'fitted to width', fit } },
    counts: { entities: g.stats.entities, relations: g.stats.relations, groups: g.stats.groups, kinds: g.stats.kinds, sources: spec.sources?.length ?? 0 },
    size: g.size,
    filled: g.filled,
    stacked: g.stacked,
    possible: g.possible,
    fit,
    hints: g.hints,
  }
}

function formatMatrixReport(r) {
  const c = r.counts
  const lines = [
    'Kind: matrix (parties x parties, row to column; orientation does not apply)',
    `Data: ${c.entities} entities / ${c.relations} relations / ${c.groups} groups / ${c.sources} sources`,
    `Content ${r.size.width}×${r.size.height}; it opens fitted to its width (zoom ${r.fit})`,
    `${r.filled} of ${r.possible} possible pairs have a relation; ${r.stacked} cell(s) hold more than one`,
  ]
  if (r.fit < 0.6) lines.push('The table is wide for one screen: the reader will zoom in. Splitting the diagram by group keeps each table smaller.')
  lines.push(...textSizeLines(r.text, 'splitting the diagram by group'))
  if (r.hints.length) lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
  return lines.join('\n')
}

/** The equity tree's geometry report: how deep it is, who stands on top, what the data leaves unsaid */
function equityReport(spec, layout, { canvas }) {
  const g = layout(spec, {})
  const fit = Number(fitZoom({ width: g.size.width, height: 1 }, { width: canvas.width, height: canvas.height * 1e6 }).toFixed(3))
  return {
    text: { font: ENTITY_FONT, canvas, open: { name: 'fitted to width', fit }, other: { name: 'fitted to width', fit } },
    counts: { entities: g.stats.entities, relations: g.stats.relations, groups: g.stats.groups, kinds: g.stats.kinds, sources: spec.sources?.length ?? 0 },
    size: g.size,
    levels: g.levels,
    holders: g.holders,
    treeParties: g.treeParties,
    equityLines: g.equityLines,
    noShare: g.noShare,
    crossHoldings: g.crossHoldings,
    indirect: g.indirect,
    apart: g.apart,
    other: g.other,
    fit,
    hints: g.hints,
  }
}

function formatEquityReport(r) {
  const c = r.counts
  const lines = [
    'Kind: equity (holders above what they hold; orientation does not apply)',
    `Data: ${c.entities} entities / ${c.relations} relations / ${c.groups} groups / ${c.sources} sources`,
    `Content ${r.size.width}×${r.size.height}; it opens fitted to its width (zoom ${r.fit})`,
  ]
  if (!r.equityLines) lines.push('No equity relations in this data: the view says so and lists the rest under it; the graph suits this case better.')
  else {
    lines.push(`${r.equityLines} equity line(s) among ${r.treeParties} part${r.treeParties === 1 ? 'y' : 'ies'}, ${r.levels} level(s), ${r.holders} ultimate holder(s)`)
    if (r.noShare) lines.push(`${r.noShare} line(s) with no share written (drawn as "not stated"); indirect holdings through them cannot be worked out. Write share on them.`)
    if (r.crossHoldings) lines.push(`${r.crossHoldings} cross-holding line(s) (drawn dashed, upward, left out of the levels and the products)`)
    if (r.indirect) lines.push(`${r.indirect} holding(s) through others listed under the tree`)
  }
  if (r.apart) lines.push(`${r.apart} part${r.apart === 1 ? 'y has' : 'ies have'} no equity relation (listed under the tree)`)
  if (r.other) lines.push(`${r.other} relation(s) that are not shareholdings listed under the tree`)
  lines.push(...textSizeLines(r.text, 'splitting the diagram by group'))
  if (r.hints.length) lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
  return lines.join('\n')
}

/**
 * The four levelled / table views of issue #93 report alike: no orientation to choose, a width they open
 * fitted to, and what the data does or does not give them. `facts` are the kind's own lines.
 */
function viewReport(kind, facts) {
  return function report(spec, layout, { canvas }) {
    const g = layout(spec, {})
    const wide = kind === 'path'
    const fit = Number(fitZoom(wide ? g.size : { width: g.size.width, height: 1 }, wide ? canvas : { width: canvas.width, height: canvas.height * 1e6 }).toFixed(3))
    return {
      text: { font: ENTITY_FONT, canvas, open: { name: wide ? 'whole picture' : 'fitted to width', fit }, other: { name: wide ? 'whole picture' : 'fitted to width', fit } },
      counts: { entities: g.stats.entities, relations: g.stats.relations, groups: g.stats.groups, kinds: g.stats.kinds, sources: spec.sources?.length ?? 0 },
      size: g.size,
      fit,
      facts: facts(g, spec),
      hints: g.hints,
    }
  }
}

const authorityReport = viewReport('authority', (g) => {
  const out = []
  if (!g.authorityLines) out.push('No control, employment or agency relations in this data: the view says so and lists the rest; the graph suits this case better.')
  else {
    out.push(`${g.authorityLines} line(s) of authority among ${g.chartParties} part${g.chartParties === 1 ? 'y' : 'ies'}, ${g.levels} level(s), ${g.tops} at the top`)
    if (g.cycles) out.push(`${g.cycles} cycle line(s) (drawn dashed, round the side, left out of the levels)`)
  }
  if (g.apart) out.push(`${g.apart} part${g.apart === 1 ? 'y has' : 'ies have'} no relation of authority (listed under the chart)`)
  if (g.other) out.push(`${g.other} relation(s) of another kind listed under the chart`)
  return out
})

const relatedReport = viewReport('related', (g) => [
  `Centred on one party (the one with most relations by default; the reader can pick another)`,
  `${g.related} part${g.related === 1 ? 'y' : 'ies'} related to it; ${g.none} with no relation to it; ${g.rest} relation(s) that do not involve it (listed under the table)`,
])

const pathReport = viewReport('path', (g) => {
  const out = [`Opens on the two parties furthest apart (the reader picks others): ${g.chains ? `${g.chains} chain(s) drawn, shortest ${g.shortest} step(s)` : 'they are not tied by any chain'}`]
  if (g.totalChains > g.chains || g.truncated) out.push(`${g.truncated ? 'At least ' : ''}${g.totalChains - g.chains} more chain(s) not drawn (only the 3 shortest are)`)
  out.push(`${g.drawnParties} part${g.drawnParties === 1 ? 'y' : 'ies'} on the drawn chains; ${g.off} not on them (listed under the picture); ${g.offRels} relation(s) not on them (listed under the picture)`)
  return out
})

function formatViewReport(name, desc) {
  return (r) => {
    const c = r.counts
    const lines = [
      `Kind: ${name} (${desc}; orientation does not apply)`,
      `Data: ${c.entities} entities / ${c.relations} relations / ${c.groups} groups / ${c.sources} sources`,
      `Content ${r.size.width}×${r.size.height}; it opens ${r.text.open.name === 'whole picture' ? `fitted to the whole picture (zoom ${r.fit})` : `fitted to its width (zoom ${r.fit})`}`,
      ...r.facts,
    ]
    lines.push(...textSizeLines(r.text, 'splitting the diagram by group'))
    if (r.hints.length) lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
    return lines.join('\n')
  }
}
const formatAuthority = formatViewReport('authority', 'control, employment and agency as an organisation chart')
const formatRelated = formatViewReport('related', 'one party and everyone tied to it, as a table')
const formatPath = formatViewReport('path', 'the shortest chains of relations between two parties')

export const relationshipKnowledge = {
  specVersion: RELATIONSHIP_SPEC_VERSION,
  /** The display name of the type: a message key, resolved per language by the consumer (core/labels.js) */
  label: 'graphType.relationship',

  fields: RELATIONSHIP_FIELDS,
  describe: describeRelationshipSchema,

  /** The label card's third line, counted in a relationship's own units */
  info: (spec, t, formatNumber) => [
    t('info.entities', { n: formatNumber(Array.isArray(spec.entities) ? spec.entities.length : 0) }),
    t('info.relations', { n: formatNumber(Array.isArray(spec.relations) ? spec.relations.length : 0) }),
    t('info.sources', { n: formatNumber(spec.sources?.length || 0) }),
  ],

  /**
   * The geometry report for MCP's antu_layout. A relationship has no views and nothing "does not
   * fit": scale is reported, never refused, and the agent decides whether to split the diagram.
   */
  report: (spec, layout, { canvas, kind }) => {
    if (kind === 'focus') return focusReport(spec, layout, { canvas })
    if (kind === 'matrix') return matrixReport(spec, layout, { canvas })
    if (kind === 'equity') return equityReport(spec, layout, { canvas })
    if (kind === 'authority') return authorityReport(spec, layout, { canvas })
    if (kind === 'related') return relatedReport(spec, layout, { canvas })
    if (kind === 'path') return pathReport(spec, layout, { canvas })
    const byOrientation = {}
    let g
    for (const o of ['vertical', 'horizontal']) {
      g = layout(spec, {}, undefined, o)
      byOrientation[o] = { size: g.size, fit: Number(fitZoom(g.size, canvas).toFixed(3)) }
    }
    const v = byOrientation.vertical
    const h = byOrientation.horizontal
    return {
      text: { font: ENTITY_FONT, canvas, open: { name: 'vertical', fit: v.fit }, other: { name: 'horizontal', fit: h.fit } },
      counts: {
        entities: g.stats.entities,
        relations: g.stats.relations,
        groups: g.stats.groups,
        layers: g.stats.layers,
        widest: g.stats.widest,
        kinds: g.stats.kinds,
        sources: spec.sources?.length ?? 0,
      },
      byOrientation,
      // A relationship diagram opens vertical: holders above what they hold (see procedure's report)
      suggestedOrientation: 'vertical',
      betterFit: h.fit > v.fit ? 'horizontal' : 'vertical',
      hints: g.hints,
    }
  },

  /** The geometry report as the short text the tool returns to an agent */
  formatReport: (r) => {
    if (r.kind === 'focus') return formatFocusReport(r)
    if (r.kind === 'matrix') return formatMatrixReport(r)
    if (r.kind === 'equity') return formatEquityReport(r)
    if (r.kind === 'authority') return formatAuthority(r)
    if (r.kind === 'related') return formatRelated(r)
    if (r.kind === 'path') return formatPath(r)
    const c = r.counts
    const v = r.byOrientation.vertical
    const h = r.byOrientation.horizontal
    const kinds = Object.entries(c.kinds)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')
    const lines = [
      `Data: ${c.entities} entities / ${c.relations} relations (${kinds}) / ${c.groups} groups / ${c.sources} sources`,
      `Shape: ${c.layers} layers, widest layer ${c.widest} entities`,
      `Vertical: content ${v.size.width}×${v.size.height}, fit zoom ${v.fit}`,
      `Horizontal: content ${h.size.width}×${h.size.height}, fit zoom ${h.fit}`,
      `Suggested orientation: ${r.suggestedOrientation} (what the diagram opens with)`,
    ]
    if (r.betterFit !== r.suggestedOrientation) {
      lines.push(`Horizontal fits a screen better (${h.fit} vs ${v.fit}); the reader can switch to it.`)
    }
    lines.push(...textSizeLines(r.text, 'splitting the diagram by group'))
    if (r.hints.length) {
      lines.push('', `${r.hints.length} hint(s):`, ...r.hints.map((x) => `  - ${x}`))
    }
    return lines.join('\n')
  },

  /** One example's size, for MCP's example list */
  summarize: (spec) => {
    const entities = Array.isArray(spec.entities) ? spec.entities.length : 0
    const relations = Array.isArray(spec.relations) ? spec.relations.length : 0
    const groups = Array.isArray(spec.groups) ? spec.groups.length : 0
    return { entities, relations, groups, line: `${entities} entities / ${relations} relations / ${groups} groups` }
  },

  /** Validation: there is only one copy of the rules, in graph/rules.js */
  validate: (spec) => validateRelationship(spec),

  /**
   * What validation cannot call an error but the author should see: rules 13 to 16 of the spec
   * (shares over 100, an entity nothing relates to, a guarantee that names no claim, a cross-holding).
   */
  notes: (spec) => hintsOfRelationship(spec),

  /** The version, status and release of each way of drawing (spec/versioning.md, "The diagrams"); the same names as `layouts` */
  diagrams: {
    graph: { version: 2, status: 'experimental', since: '0.2.0' },
    focus: { version: 2, status: 'experimental', since: '0.7.0' },
    matrix: { version: 2, status: 'experimental', since: '0.7.0' },
    equity: { version: 2, status: 'experimental', since: '0.7.0' },
    authority: { version: 2, status: 'experimental', since: '0.7.0' },
    related: { version: 2, status: 'experimental', since: '0.7.0' },
    path: { version: 2, status: 'experimental', since: '0.7.0' },
  },

  /** Which ways of drawing a relationship diagram exist. The first is the default. */
  layouts: {
    graph: buildRelationshipGraph,
    focus: buildFocusGraph,
    matrix: buildMatrixGraph,
    equity: buildEquityGraph,
    authority: buildAuthorityGraph,
    related: buildRelatedGraph,
    path: buildPathGraph,
  },
}
