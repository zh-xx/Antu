// ============================================================
//  src/renderers/justification/tree/palette.js — the justification tree's SVG paint, from the theme
//
//  Why paint is given as SVG attributes and not in the stylesheet: the image export (shell/exportPng.js) clones
//  the canvas with html-to-image, and SVG paint set by a CSS **class rule** does not survive that clone. Paint
//  set as SVG **attributes** does. So every fill and stroke that has to be in the exported picture comes from
//  the theme (src/theme) and is passed as an attribute; the stylesheet only adds what is screen-only.
//
//  Two dimensions, never mixed: a node's kind fixes its paint and the shape of its outline; a link's stance
//  fixes its paint and how its line is drawn (support plain, opposition dashed, a norm's basis dotted). What a
//  node holds (`holds`) is not a colour at all: a rejected node is faded, dashed and struck through, so it
//  reads the same in greyscale.
// ============================================================

export const nodePaint = (kind, theme) => theme.justify.node[kind] ?? theme.justify.node.fact

export const stancePaint = (stance, theme) => theme.justify.stance[stance] ?? theme.justify.stance.for

/** An issue's box: a pale wash behind its nodes, a hairline edge, a quiet title */
export const groupPaint = (theme) => theme.flow.stage

/** A node is being looked at: what it rests on and what it supports stay, the rest fade to this opacity */
export const DIM_OPACITY = 0.18
/** A rejected node (`holds: "no"`) is drawn at this opacity */
export const REJECTED_OPACITY = 0.62
