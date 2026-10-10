// ============================================================
//  src/renderers/relationship/graph/palette.js — what the relationship diagrams ask the theme for
//
//  The colours are not here any more: they are the theme's (src/theme/themes.js, issue #97). A
//  relationship view asks for a role, a kind of party or a kind of relation, and gets paint as plain data,
//  which it writes as SVG **attributes**, so the exported picture keeps it (paint set by a CSS class rule is
//  lost in the export: shell/exportPng.js).
//
//  Two dimensions, never mixed: a party's kind fixes the outline and its corners; a relation's kind fixes
//  how its line is drawn. In the black-and-white theme the weight, the dash and the outline carry it.
// ============================================================

import { themeOf } from '../../../theme/themes.js'

/** Outline and fill of a kind of party in a theme (the document theme when none is given) */
export const entityPaint = (kind, theme = themeOf()) => theme.entity[kind] ?? theme.entity.other

/** Radius of the corners of a kind of party */
export const entityRadius = (kind, theme = themeOf()) => theme.radius[kind] ?? theme.radius.other

/** How a kind of relation is drawn: stroke, width, a dash pattern, or a double line */
export const relationPaint = (kind, theme = themeOf()) => theme.relation[kind] ?? theme.relation.other

/** A camp's box: a pale wash behind its entities, a hairline edge, a quiet title */
export const groupPaint = (theme = themeOf()) => theme.group

/** The box round a camp of the relationship diagram: its own fill, edge, weight and dash */
export const campBoxPaint = (theme = themeOf()) => theme.campBox

/** An entity is being looked at: the links that touch it stay, the rest fade to this opacity */
export const DIM_OPACITY = 0.18
