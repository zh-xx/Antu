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

/**
 * The column layout (columns.js): the gap between two stage columns (the channel links between
 * stages run in), and the least width of a column, so a rule card under it stays readable
 */
export const COLUMN_GAP = 56
export const COLUMN_MIN_W = 180

/** Padding around the content. The image export adds more on top; this one keeps the diagram itself off the edge */
export const PAD = 32

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
 * The curved style: the same route, each turn drawn as a wide arc of up to this radius (half the
 * shorter of its two legs, so a short step between two turns becomes one smooth S). Capped, so
 * an arc never swings far off its route into what lies beside it.
 */
export const CURVE_R = 40

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

// ── The rule table (ruleTable.js, RuleTableNode.jsx) ─────────
// The contingent clauses, as a table under the diagram. The layout counts each row's lines from
// its text with these numbers, and the stylesheet sets the text with the same ones.

/** Text in the cells, the padding of a cell, and the indent of a listed trigger */
export const TABLE_FONT = 13
export const TABLE_LINE = 20
export const TABLE_PAD_X = 12
export const TABLE_PAD_Y = 9
export const TABLE_LIST_INDENT = 16
/** The table follows the diagram's width, within these limits (a very wide row reads badly) */
export const TABLE_MIN_W = 640
export const TABLE_MAX_W = 1100
/** Gap between the diagram and the table */
export const TABLE_GAP = 40
/** The title block, the column headings, and a group heading */
export const TABLE_TITLE_H = 52
export const TABLE_HEAD_H = 32
export const TABLE_GROUP_H = 40
/** Column shares: situation, consequence, stages */
export const TABLE_COLS = [0.34, 0.44, 0.22]
/** Margin on the text measure: a row one line too short would cut its text off */
export const TABLE_SLACK = 1.1
