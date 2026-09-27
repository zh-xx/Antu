// ============================================================
//  src/renderers/procedure/flow/metrics.js — procedure sizes and spacing
//
//  Constants and one function that looks a size up by kind, **no computation at
//  all**. The computation is in layout.js. The reason for the split is the same
//  as on the fact side: when one number changes, it must be possible to see at a
//  glance what else it moves (on the fact side the single source of sizes is
//  cardGeometry.js).
//
//  Sizes come in three classes by kind, not nine:
//    · pill (start / end) a little shorter, fully rounded
//    · box (step / document / note) standard height
//    · diamond (decision) taller and wider, so the text fits inside the diamond
// ============================================================

/** Width and height of box nodes */
export const BOX_W = 208
export const BOX_H = 64

/** Pill (start / end) */
export const PILL_W = 176
export const PILL_H = 52

/** Diamond (decision point). Both dimensions exceed the box's, because the text has to fit inside the diamond */
export const DIAMOND_W = 232
export const DIAMOND_H = 112

/** Vertical spacing between layers (room for the condition labels beside the edges) */
export const GAP_Y = 64

/**
 * The same gap in a horizontal diagram. Wider, because a condition label there has to fit
 * *between* two layers, left of its target, written across the page: at 64 the labels ran
 * under the previous column's nodes and were cut off.
 */
export const GAP_Y_H = 120

/** The gap between layers for an orientation */
export const layerGap = (vertical) => (vertical ? GAP_Y : GAP_Y_H)

/** Spacing between nodes sitting side by side within one layer */
export const GAP_X = 36

/** Padding around the content. The image export adds more on top; this one keeps the diagram itself off the edge */
export const PAD = 40

/**
 * Distance between two lines that share a gap or a channel (route.js). Small enough that three
 * tracks fit either side of a gutter's centre between two diamonds (GAP_X / 2 = 18 each way),
 * large enough that two parallel lines still read as two.
 */
export const TRACK = 6

/**
 * Room kept outside the outermost columns, on both sides across the flow: the outer gutters are
 * channels too (a back edge from the rightmost column needs somewhere to run), so they need
 * room for their tracks.
 */
export const OUTER = 24

/** Corner radius of an orthogonal link where it turns */
export const CORNER_R = 10

/**
 * The stage gutter: the strip beside the node field where stage bands and their names sit.
 * Vertical: a column on the left (the names are written horizontally, so it needs width).
 * Horizontal: a row along the top (one line of name, so a little height is enough).
 * Only reserved when the diagram has stages and the band switch is on.
 */
export const STAGE_GUTTER_V = 132
export const STAGE_GUTTER_H = 44

/** The single source of node sizes. The rendering layer must not write a second copy. */
export function sizeOf(node) {
  switch (node?.kind) {
    case 'start':
    case 'end':
      return { w: PILL_W, h: PILL_H }
    case 'decision':
      return { w: DIAMOND_W, h: DIAMOND_H }
    default:
      return { w: BOX_W, h: BOX_H }
  }
}

/** Vertically a layer's "height" looks at the tallest node; horizontally its "width" looks at the widest */
export function extentOf(node, vertical) {
  const { w, h } = sizeOf(node)
  return vertical ? h : w
}

/** The node's side in the within-layer direction (width when vertical, height when horizontal) */
export function acrossOf(node, vertical) {
  const { w, h } = sizeOf(node)
  return vertical ? w : h
}
