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

/** ELK spacing: between two layers, and between two nodes side by side in one layer */
export const LAYER_GAP = 48
export const NODE_GAP = 40

/** Padding around the content. The image export adds more on top; this one keeps the diagram itself off the edge */
export const PAD = 40

/** Distance between two parallel rule trunks */
export const TRACK = 6

/**
 * Condition labels: ELK is given a box per label and keeps it clear of every node. The box is
 * computed from these, and the stylesheet draws the text with the same numbers.
 */
export const LABEL_FONT = 11
export const LABEL_LINE = 16
export const LABEL_PAD_X = 6
export const LABEL_MAX_W = 150

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

// ── Rule cards (the contingent clauses beside the flow) ──────
// A rule card is sized from its text, not fixed: "if … then …" runs from four characters to
// three triggers of twenty. The estimate uses the same text measure as the fact cards
// (textEm), and the stylesheet clamps each part to the lines counted here, so the box and the
// text inside it cannot disagree.

/** Scope bars: beside the lane, one per distinct stage range, this far apart */
export const SCOPE_BAR_GAP = 12
export const SCOPE_BAR_PITCH = 8

/** Card width, and the gap between the node field and the rule lane */
export const RULE_W = 248
export const RULE_GAP = 40
/** Space between two cards stacked in the lane */
export const RULE_STACK_GAP = 12
/** Inner padding, the coloured bar on the leading edge, and the text metrics */
export const RULE_PAD = 10
export const RULE_BAR = 4
export const RULE_WHEN_FONT = 11.5
export const RULE_WHEN_LINE = 16
export const RULE_THEN_FONT = 12.5
export const RULE_THEN_LINE = 18
export const RULE_FOOT = 18
/** At most this many lines per trigger and for the consequence; the rest is in the popover */
export const RULE_WHEN_MAX_LINES = 2
export const RULE_THEN_MAX_LINES = 3

/** Height of one rule card, from its text */
export function ruleHeight(rule, textEm) {
  const inner = RULE_W - RULE_PAD * 2 - RULE_BAR
  const whens = Array.isArray(rule.when) ? rule.when : [rule.when]
  // A list of triggers is bulleted: the bullet takes about one em of each line
  const whenPerLine = inner / RULE_WHEN_FONT - (whens.length > 1 ? 1 : 0)
  // A list opens with its own line ("if any of:")
  const whenLines = whens.reduce(
    (n, w) => n + Math.min(RULE_WHEN_MAX_LINES, Math.max(1, Math.ceil(textEm(w) / whenPerLine))),
    whens.length > 1 ? 1 : 0,
  )
  const thenLines = Math.min(RULE_THEN_MAX_LINES, Math.max(1, Math.ceil(textEm(rule.then) / (inner / RULE_THEN_FONT))))
  return RULE_PAD * 2 + whenLines * RULE_WHEN_LINE + 4 + thenLines * RULE_THEN_LINE + 4 + RULE_FOOT
}
