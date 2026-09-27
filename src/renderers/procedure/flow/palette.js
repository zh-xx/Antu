// ============================================================
//  src/renderers/procedure/flow/palette.js — the flowchart's SVG colours
//
//  Why colours live in JS and not in the stylesheet: the image export (shell/exportPng.js)
//  clones the canvas with html-to-image, and SVG paint set by a CSS **class rule** does not
//  survive that clone — measured: every shape and link came out filled solid black. Paint set
//  as SVG **attributes** does (the timeline's axis arrow relies on the same thing). So every
//  fill and stroke that has to be in the exported picture is written here and passed as an
//  attribute; the stylesheet only adds what is screen-only (hover shadow, focus ring).
//
//  Two dimensions, never mixed (spec/procedure/schema-draft.md §4.3): kind fixes the shape,
//  outcome fixes the colour.
// ============================================================

/** Node outline and fill by outcome. neutral grey, positive green, negative red. */
export const OUTCOME_PAINT = {
  neutral: { stroke: '#94a3b8', fill: '#ffffff' },
  positive: { stroke: '#16a34a', fill: '#f0fdf4' },
  negative: { stroke: '#dc2626', fill: '#fef2f2' },
}

/** The start pill: a tinted fill, so the entry is found at a glance (only when neutral) */
export const START_PAINT = { stroke: '#64748b', fill: '#f1f5f9' }

/** A note takes no part in the flow: no border, a pale yellow sheet, only the fold is drawn */
export const NOTE_PAINT = { stroke: 'none', fill: '#fefce8', fold: '#d6c98f' }

/** Paint for one node's outline */
export function nodePaint(kind, outcome = 'neutral') {
  if (kind === 'note') return NOTE_PAINT
  if (kind === 'start' && outcome === 'neutral') return START_PAINT
  return OUTCOME_PAINT[outcome] ?? OUTCOME_PAINT.neutral
}

/**
 * Paint for one link. The main-line highlight is part of this, not a CSS state: with the
 * switch on, the exported picture has to show the main line too.
 */
export function linkPaint(kind, highlightMain) {
  if (kind === 'back') return { stroke: '#b8c2d0', width: 1.3, dash: '5 4' }
  if (kind === 'main' && highlightMain) return { stroke: '#475569', width: 2.2, dash: undefined }
  return { stroke: '#94a3b8', width: 1.3, dash: undefined }
}
