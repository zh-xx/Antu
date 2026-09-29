// ============================================================
//  src/renderers/justification/tree/metrics.js — justification sizes and spacing
//
//  The single source of every size the justification tree uses. The positions come from ELK
//  (layout.js); this file only answers "how big is this node".
//
//  A node is as big as its text: a small line on top says what it is (fact, inference, ...) and
//  carries a fact's date, and under it the sentence, wrapped. The stylesheet draws the text with
//  exactly these numbers (the node passes textW down), so the box and the text cannot disagree.
// ============================================================

// The same text measure the fact cards and the other diagrams use, so a CJK character counts the same everywhere
import { textEm } from '../../fact/cardGeometry.js'

/** Node text: the sentence, and the line above it that names the kind */
export const NODE_FONT = 13
export const NODE_LINE = 19
export const TAG_LINE = 16
export const NODE_MAX_LINES = 6
/** Inner padding of a node */
export const NODE_PAD_X = 14
export const NODE_PAD_Y = 9
/** The text column: never narrower than this, and wrapped once wider than the cap */
export const TEXT_MIN_W = 120
export const TEXT_MAX_W = 230

/** ELK spacing: between two levels of an issue, and between two nodes on one level */
export const LAYER_GAP = 44
export const NODE_GAP = 22
/** The channel between two issues */
export const ISSUE_GAP = 70
/** The space between the end conclusion's row and the issues under it */
export const TOP_GAP = 60

/** An issue box: room at the top for its title, and around its nodes */
export const GROUP_PAD_TOP = 32
export const GROUP_PAD = 18
export const GROUP_TITLE_FONT = 13

/** Padding around the content */
export const PAD = 32

/** Link labels */
export const LABEL_FONT = 12
export const LABEL_LINE = 16
export const LABEL_PAD_X = 6
export const LABEL_MAX_W = 150

/** What crossing another link costs the router: the same reasoning as the relationship diagram's */
export const CROSS_COST = 450

/** How far beyond its two ends the router first looks for a link between two issues */
export const SEARCH_MARGIN = 160

/** Past this many nodes the diagram is reported with a hint (it is not an error) */
export const SCALE_HINT_NODES = 60

/** Latin letters run wider than textEm counts them, and a node has no room to spare */
const LATIN = 1.15
const emOf = (text) => {
  const s = String(text ?? '')
  const latin = [...s].filter((ch) => ch.codePointAt(0) < 0x2e80).join('')
  return textEm(s) + textEm(latin) * (LATIN - 1)
}

/** The box a link's label needs: width capped, text wrapped into lines */
export function labelBox(text) {
  const textW = emOf(text) * LABEL_FONT
  const width = Math.min(LABEL_MAX_W, Math.ceil(textW + LABEL_PAD_X * 2))
  const lines = Math.max(1, Math.ceil(textW / (LABEL_MAX_W - LABEL_PAD_X * 2) - 1e-9))
  return { width, height: lines * LABEL_LINE + 2 }
}

/** The single source of node sizes. Returns { w, h, textW, lines }: textW is the width of the text column the node draws its text in. */
export function sizeOf(node) {
  const label = String(node?.label ?? '')
  const em = emOf(label) * NODE_FONT
  const textW = Math.ceil(Math.min(TEXT_MAX_W, Math.max(TEXT_MIN_W, em)))
  const lines = Math.min(NODE_MAX_LINES, Math.max(1, Math.ceil(em / textW - 1e-9)))
  return {
    w: textW + NODE_PAD_X * 2,
    h: lines * NODE_LINE + TAG_LINE + NODE_PAD_Y * 2,
    textW,
    lines,
  }
}
