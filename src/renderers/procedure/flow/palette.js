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
//  outcome reads in black and white too. With the "States" switch on (issue 187), the paint is one of four states read
//  from kind and outcome: ordinary, gone wrong (yellow), terminated (red), a normal end (green).
// ============================================================

/** Paint for one node's outline: { stroke, fill, width, dash? } (a note: a dashed outline and a fold) */
export function nodePaint(kind, outcome, theme, states = false) {
  const f = theme.flow
  if (kind === 'note') return { ...f.note, stroke: f.note.fold, width: 1, dash: '4 3' }
  const st = states ? stateOf(kind, outcome) : 'normal'
  if (st !== 'normal') return statePaint(st, theme)
  if (kind === 'start' && (outcome ?? 'neutral') === 'neutral') return { ...f.outcome.neutral, ...f.start }
  // With the states on, an ordinary step is ordinary whatever its outcome says (a positive step is not an end)
  return states ? f.outcome.neutral : (f.outcome[outcome] ?? f.outcome.neutral)
}

/**
 * The state a node is in, read from what the file already says (issue 187): an end with a negative outcome is a
 * termination (stop, red), any other end a normal end (done, green); a node on the way with a negative outcome is
 * something gone wrong (warn, yellow); the rest is performance as it should be (normal, the theme's own paint)
 */
export function stateOf(kind, outcome) {
  const o = outcome ?? 'neutral'
  if (kind === 'note') return 'normal'
  if (kind === 'end') return o === 'negative' ? 'stop' : 'done'
  return o === 'negative' ? 'warn' : 'normal'
}

/** The paint of a state: its colour, with the line of the outcome it stands for (dashed for warn and stop, heavy for done) */
export function statePaint(state, theme) {
  const f = theme.flow
  const line = state === 'done' ? f.outcome.positive : f.outcome.negative
  return { ...line, ...f.state[state] }
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
