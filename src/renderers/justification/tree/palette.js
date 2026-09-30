// ============================================================
//  src/renderers/justification/tree/palette.js — the justification tree's SVG colours
//
//  Why colours live in JS and not in the stylesheet: the image export (shell/exportPng.js) clones
//  the canvas with html-to-image, and SVG paint set by a CSS **class rule** does not survive that
//  clone. Paint set as SVG **attributes** does. So every fill and stroke that has to be in the
//  exported picture is written here and passed as an attribute; the stylesheet only adds what is
//  screen-only (hover shadow, focus ring). Same reason and same convention as the relationship
//  graph's palette.
//
//  Two dimensions, never mixed: a node's kind fixes its colour and the shape of its outline; a
//  link's stance fixes its colour and how its line is drawn. What a node holds (`holds`) is not a
//  colour at all: a rejected node is faded, dashed and struck through, so it reads the same in
//  greyscale.
// ============================================================

/** Node fill and outline by kind */
export const NODE_PAINT = {
  conclusion: { stroke: '#1d4ed8', fill: '#dbeafe', width: 2 },
  norm: { stroke: '#7c3aed', fill: '#ede9fe', width: 1.3 },
  element: { stroke: '#b45309', fill: '#fef3c7', width: 1.4 },
  fact: { stroke: '#64748b', fill: '#f1f5f9', width: 1.2 },
  inference: { stroke: '#15803d', fill: '#dcfce7', width: 1.3 },
  judgement: { stroke: '#be123c', fill: '#ffe4e6', width: 1.6 },
}

export const nodePaint = (kind) => NODE_PAINT[kind] ?? NODE_PAINT.fact

/**
 * How each stance is drawn: colour, width, a dash pattern. Support is the plain line; opposition is red
 * and dashed; a norm's basis is violet and dotted, the colour of the norm it comes from.
 */
export const STANCE_PAINT = {
  for: { stroke: '#475569', width: 1.5 },
  against: { stroke: '#dc2626', width: 1.7, dash: '6 4' },
  basis: { stroke: '#7c3aed', width: 1.4, dash: '2 3' },
}

export const stancePaint = (stance) => STANCE_PAINT[stance] ?? STANCE_PAINT.for

/** An issue's box: a pale wash behind its nodes, a hairline edge, a quiet title */
export const GROUP_PAINT = { fill: '#f8fafc', stroke: '#cbd5e1', title: '#475569' }

/** A node is being looked at: what it rests on and what it supports stay, the rest fade to this opacity */
export const DIM_OPACITY = 0.18
/** A rejected node (`holds: "no"`) is drawn at this opacity */
export const REJECTED_OPACITY = 0.62
