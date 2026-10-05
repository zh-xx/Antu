// ============================================================
//  src/renderers/procedure/flow/palette.js — the flowchart's SVG paint, from the theme
//
//  Why paint is given as SVG attributes and not in the stylesheet: the image export (shell/exportPng.js)
//  clones the canvas with html-to-image, and SVG paint set by a CSS **class rule** does not survive that
//  clone (measured: every shape and link came out filled solid black). Paint set as SVG **attributes** does.
//  So every fill and stroke that has to be in the exported picture comes from the theme (src/theme) and is
//  passed as an attribute; the stylesheet only adds what is screen-only (hover shadow, focus ring).
//
//  Two dimensions, never mixed (spec/procedure/schema-draft.md §4.3): kind fixes the shape, outcome fixes
//  the paint. In every theme a positive outcome is a heavier line and a negative one a dashed line, so the
//  outcome reads in black and white too.
// ============================================================

/** Paint for one node's outline: { stroke, fill, width, dash? } (a note has no border and a fold) */
export function nodePaint(kind, outcome, theme) {
  const f = theme.flow
  if (kind === 'note') return { ...f.note, width: 1 }
  if (kind === 'start' && (outcome ?? 'neutral') === 'neutral') return { ...f.outcome.neutral, ...f.start }
  return f.outcome[outcome] ?? f.outcome.neutral
}

/** A stage box, and a stage box a looked-at rule applies in */
export const stagePaint = (theme, lit) => (lit ? theme.flow.stageLit : theme.flow.stage)

/**
 * Paint for one link. The main-line highlight is part of this, not a CSS state: with the switch on, the
 * exported picture has to show the main line too.
 */
export function linkPaint(kind, highlightMain, theme) {
  const l = theme.flow.link
  const p = kind === 'back' ? l.back : kind === 'main' && highlightMain ? l.main : l.plain
  return { stroke: p.stroke, width: p.width, dash: p.dash }
}
