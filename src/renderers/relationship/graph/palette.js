// ============================================================
//  src/renderers/relationship/graph/palette.js — the relationship graph's SVG colours
//
//  Why colours live in JS and not in the stylesheet: the image export (shell/exportPng.js) clones
//  the canvas with html-to-image, and SVG paint set by a CSS **class rule** does not survive that
//  clone. Paint set as SVG **attributes** does. So every fill and stroke that has to be in the
//  exported picture is written here and passed as an attribute; the stylesheet only adds what is
//  screen-only (hover shadow, focus ring). Same reason and same convention as the flowchart's
//  palette (procedure/flow/palette.js).
//
//  Two dimensions, never mixed: an entity's kind fixes its colour and the shape of its outline; a
//  relation's kind fixes its colour and how its line is drawn.
// ============================================================

/** Entity fill and outline by kind */
export const ENTITY_PAINT = {
  person: { stroke: '#475569', fill: '#f1f5f9' },
  company: { stroke: '#1d4ed8', fill: '#dbeafe' },
  organization: { stroke: '#7c3aed', fill: '#ede9fe' },
  government: { stroke: '#b45309', fill: '#fef3c7' },
  other: { stroke: '#94a3b8', fill: '#f8fafc' },
}

export const entityPaint = (kind) => ENTITY_PAINT[kind] ?? ENTITY_PAINT.other

/**
 * How each kind of relation is drawn: colour, width, a dash pattern, or a double line. Kinds must
 * look different at a glance, in colour and in line, because the reader filters and reads by kind.
 */
export const RELATION_PAINT = {
  equity: { stroke: '#1d4ed8', width: 1.8 },
  control: { stroke: '#1e3a8a', width: 2.8 },
  contract: { stroke: '#64748b', width: 1.4 },
  debt: { stroke: '#b91c1c', width: 1.8 },
  guarantee: { stroke: '#7c3aed', width: 1.6, dash: '6 4' },
  kinship: { stroke: '#be185d', width: 4, double: true },
  employment: { stroke: '#0f766e', width: 1.6 },
  agency: { stroke: '#0f766e', width: 1.6, dash: '2 3' },
  other: { stroke: '#94a3b8', width: 1.4, dash: '5 4' },
}

export const relationPaint = (kind) => RELATION_PAINT[kind] ?? RELATION_PAINT.other

/** A camp's box: a pale wash behind its entities, a hairline edge, a quiet title (as a stage box) */
export const GROUP_PAINT = { fill: '#f8fafc', stroke: '#cbd5e1', title: '#475569' }
/** An entity is being looked at: the links that touch it stay, the rest fade to this opacity */
export const DIM_OPACITY = 0.18
