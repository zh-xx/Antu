// ============================================================
//  src/theme/scale.js — the one scale every diagram is drawn on (the same for every theme)
//
//  Issue #97. A theme changes the look (colour, corners, font); it never changes these numbers, so a
//  picture lays out the same in every theme and a layout module can be computed in Node.
//
//    grid     8 px: every size and gap is a multiple of it
//    node     heights snap up to the grid (40 / 48 / 64 are the common ones), widths to 40 from 120
//             (120 / 160 / 200)
//    type     the reading ramp (caption / body / title / heading / display, line height 1.4) and the
//             steps the pictures and the shell already use; a view does not invent a size of its own
//    line     four weights (0.75 / 1.1 / 1.75 / 2.5; made finer after the first look), four styles
// ============================================================

export const GRID = 8

/** Round up to the grid */
export const snap = (n, unit = GRID) => Math.ceil(n / unit - 1e-9) * unit

/** Node boxes */
export const NODE = {
  minH: 40,
  minW: 120,
  /** Widths go up in steps of this: 120, 160, 200 */
  stepW: 40,
  /** Space between two nodes, and between two levels */
  gap: 24,
  levelGap: 48,
  padX: 12,
  padY: 6,
}

/**
 * Type sizes, in px, the same in every theme (a theme changes the face and the colour, never these).
 *
 * The reading ramp is caption, body, title, heading, display. `lineHeight` is 1.4 of one of those,
 * rounded to 2 px. The other names are steps the pictures and the shell already draw at. They stay
 * named so a layout built on one of them does not move, and so a view cannot invent another:
 *
 *   tag    10     a chip: a party on a card, a note's corner, a source kind
 *   fine   10.5   a tick, a hint, the small line under a name
 *   meta   11.5   a snippet, a time under a title, a chip in a matrix or a route box
 *   label  12     the secondary line on a node
 *   node   13     the words in a node, a stage or group title
 *   card   13.5   the label card's title (the shell)
 *   lead   15     a rule table's title
 *   mark   17     a shell glyph (the close mark, the step arrows), not reading text
 *
 * A new size is added here. The stylesheet reads `--antu-type-*` (`typeVars`); the layout constants
 * are these steps. test/theme-lock.test.mjs fails if either writes a size of its own.
 * `weight` is the usual weight of that step; a view may still set its own.
 */
export const TYPE = {
  tag: { size: 10, weight: 400 },
  fine: { size: 10.5, weight: 400 },
  caption: { size: 11, weight: 400 },
  meta: { size: 11.5, weight: 400 },
  label: { size: 12, weight: 400 },
  body: { size: 12.5, weight: 400 },
  node: { size: 13, weight: 600 },
  card: { size: 13.5, weight: 600 },
  title: { size: 14, weight: 600 },
  lead: { size: 15, weight: 600 },
  heading: { size: 16, weight: 700 },
  mark: { size: 17, weight: 400 },
  display: { size: 20, weight: 700 },
}
export const lineHeight = (size) => Math.round((size * 1.4) / 2) * 2

/** `--antu-type-<name>` for every step, in px. Sizes do not change with the theme. */
export function typeVars() {
  return Object.fromEntries(Object.entries(TYPE).map(([name, step]) => [`--antu-type-${name}`, `${step.size}px`]))
}

/** Line weights: hairline, normal, emphasis, heavy */
export const LINE = { hair: 0.75, normal: 1.1, strong: 1.75, heavy: 2.5 }

/** Line styles as dash arrays; `solid` is none, `double` is drawn by the line layer as a wide line with a paper-coloured core */
export const DASH = { solid: undefined, dashed: '6 4', dotted: '2 3', longDash: '10 4', dashDot: '10 3 2 3' }

/** The width of a node box that fits `needed` px: 120, 160, 200, … */
export const nodeWidth = (needed) => Math.max(NODE.minW, Math.ceil(needed / NODE.stepW - 1e-9) * NODE.stepW)
/** The height of a node box that fits `needed` px: on the grid, at least 40 */
export const nodeHeight = (needed) => Math.max(NODE.minH, snap(needed))
