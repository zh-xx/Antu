// ============================================================
//  src/renderers/procedure/flow/metrics.js — procedure sizes and spacing
//
//  The single source of every size the flowchart uses. The computation of positions is in
//  layout.js (ELK); this file only answers "how big is this node", "how big is this label".
//  The reason for the split is the same as on the fact side: when one number changes, it must
//  be possible to see at a glance what else it moves.
//
//  **A node is as big as its text** (the lesson from putting the same data through Mermaid):
//  fixed boxes of 208×64 with 12.5px text left most of every box empty, so the whole diagram was
//  large and, fitted to a screen, its text too small to read. Now the text decides the width (up
//  to a cap, then it wraps, at most NODE_MAX_LINES lines) and the height follows. The stylesheet
//  draws the text with exactly these numbers (the node passes textW down), so the box and the
//  text in it cannot disagree.
// ============================================================

// The same text measure the fact cards use, so a CJK character counts the same everywhere
import { textEm } from '../../fact/cardGeometry.js'

/** Node text: the label, and one line of detail under it */
export const NODE_FONT = 14
export const NODE_LINE = 20
export const DETAIL_FONT = 12
export const DETAIL_LINE = 16
export const NODE_MAX_LINES = 3
/** Inner padding of a box, and the extra side room a pill needs for its rounded ends */
export const NODE_PAD_X = 14
export const NODE_PAD_Y = 10
export const PILL_EXTRA_X = 10
/** The strip a document's wavy bottom edge takes */
export const DOC_WAVE = 8
/** The text column: never narrower than this, and wrapped once wider than the cap */
export const TEXT_MIN_W = 56
export const TEXT_MAX_W = 176
/** A diamond holds its text in its middle, so its text column is capped narrower */
export const DIAMOND_TEXT_MAX_W = 128

/** ELK spacing: between two layers, and between two nodes side by side in one layer */
export const LAYER_GAP = 24
export const NODE_GAP = 24

/** A stage box: room at the top for its title, and around its nodes */
export const STAGE_PAD_TOP = 30
export const STAGE_PAD = 14
export const STAGE_TITLE_FONT = 13

/** Padding around the content. The image export adds more on top; this one keeps the diagram itself off the edge */
export const PAD = 32

/** Distance between two parallel rule trunks */
export const TRACK = 6

/**
 * Condition labels: ELK is given a box per label and keeps it clear of every node. The box is
 * computed from these, and the stylesheet draws the text with the same numbers.
 */
export const LABEL_FONT = 12
export const LABEL_LINE = 16
export const LABEL_PAD_X = 6
export const LABEL_MAX_W = 150

/** Corner radius of an orthogonal link where it turns */
export const CORNER_R = 8

/**
 * The single source of node sizes. The rendering layer must not write a second copy.
 * Returns { w, h, textW }: textW is the width of the text column the node draws its text in.
 */
export function sizeOf(node) {
  const label = String(node?.label ?? '')
  const detail = node?.detail ? String(node.detail) : ''
  const cap = node?.kind === 'decision' ? DIAMOND_TEXT_MAX_W : TEXT_MAX_W
  const labelW = textEm(label) * NODE_FONT
  // The detail shows one line (the rest is in the popover), so it can widen the box only up to the cap
  const detailW = detail ? textEm(detail) * DETAIL_FONT : 0
  // A diamond is widest in the middle and pointed at both ends, so a long single line makes a
  // flat, squashed one; its text is folded into a roughly square block instead
  const want = node?.kind === 'decision' ? Math.sqrt(labelW * NODE_LINE * 2.2) : labelW
  const textW = Math.ceil(Math.min(cap, Math.max(TEXT_MIN_W, want, Math.min(detailW, cap))))
  const lines = Math.min(NODE_MAX_LINES, Math.max(1, Math.ceil(labelW / textW - 1e-9)))
  const textH = lines * NODE_LINE + (detail ? DETAIL_LINE + 2 : 0)
  switch (node?.kind) {
    case 'start':
    case 'end':
      return { w: textW + (NODE_PAD_X + PILL_EXTRA_X) * 2, h: textH + NODE_PAD_Y * 2, textW }
    case 'decision':
      // The text rectangle (textW × textH) fits inside a diamond W × H when
      // textW / W + textH / H <= 1; these proportions keep it just inside
      return { w: Math.round(textW * 1.7 + 24), h: Math.round(textH * 2.4 + 16), textW }
    case 'document':
      // The wavy bottom edge takes a strip the text must stay out of
      return { w: textW + NODE_PAD_X * 2, h: textH + NODE_PAD_Y * 2 + DOC_WAVE, textW }
    default:
      return { w: textW + NODE_PAD_X * 2, h: textH + NODE_PAD_Y * 2, textW }
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
