// ============================================================
//  src/theme/scale.js — the one scale every diagram is drawn on (the same for every theme)
//
//  Issue #97. A theme changes the look (colour, corners, font); it never changes these numbers, so a
//  picture lays out the same in every theme and a layout module can be computed in Node.
//
//    grid     8 px: every size and gap is a multiple of it
//    node     heights snap up to the grid (40 / 48 / 64 are the common ones), widths to 40 from 120
//             (120 / 160 / 200)
//    type     five sizes, line height 1.4
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

/** The five type sizes (px) and their weights; the line height is 1.4 of the size, rounded to 2 px */
export const TYPE = {
  caption: { size: 11, weight: 400 },
  body: { size: 12.5, weight: 400 },
  title: { size: 14, weight: 600 },
  heading: { size: 16, weight: 700 },
  display: { size: 20, weight: 700 },
}
export const lineHeight = (size) => Math.round((size * 1.4) / 2) * 2

/** Line weights: hairline, normal, emphasis, heavy */
export const LINE = { hair: 0.75, normal: 1.1, strong: 1.75, heavy: 2.5 }

/** Line styles as dash arrays; `solid` is none, `double` is drawn by the line layer as a wide line with a paper-coloured core */
export const DASH = { solid: undefined, dashed: '6 4', dotted: '2 3', longDash: '10 4', dashDot: '10 3 2 3' }

/** The width of a node box that fits `needed` px: 120, 160, 200, … */
export const nodeWidth = (needed) => Math.max(NODE.minW, Math.ceil(needed / NODE.stepW - 1e-9) * NODE.stepW)
/** The height of a node box that fits `needed` px: on the grid, at least 40 */
export const nodeHeight = (needed) => Math.max(NODE.minH, snap(needed))
