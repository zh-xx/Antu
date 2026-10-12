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
export const NODE_MAX_LINES = 2
/** A diamond folds its text into a block that is taller than a box's, so it keeps three lines */
export const DIAMOND_MAX_LINES = 3
/** Inner padding of a box, and the extra side room a pill needs for its rounded ends */
export const NODE_PAD_X = 18
export const NODE_PAD_Y = 14
export const PILL_EXTRA_X = 10
/** The strip a document's wavy bottom edge takes */
export const DOC_WAVE = 8
/** The text column: never narrower than this, and wrapped once wider than the cap */
export const TEXT_MIN_W = 56
export const TEXT_MAX_W = 176
/** A diamond holds its text in its middle, so its text column is capped narrower */
export const DIAMOND_TEXT_MAX_W = 148

/** ELK spacing: between two layers, and between two nodes side by side in one layer */
export const LAYER_GAP = 28
export const NODE_GAP = 28

/** A stage box: room at the top for its title, and around its nodes */
export const STAGE_PAD_TOP = 44
export const STAGE_PAD = 28
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
 * What a node shows of its text. The rest is in the popover, so a node stays short enough to read at a glance:
 * a label that needs more than NODE_MAX_LINES lines at the widest text column (about 24 Chinese characters; the
 * validation hints at it, rule 22) is cut by the line limit, and the detail line is cut at its last punctuation within
 * DETAIL_SHOW_W (about 16 Chinese characters), or at DETAIL_SHOW_W. Measured in widths, not characters: an English
 * label of 30 characters is shorter than a Chinese one of 20.
 */
export const DETAIL_SHOW_W = 192
const CUT_AT = /[，。；：、,.;:!?！？）)\s]/

/** The first line of a detail, cut for the node; `cut` says whether something was left out */
export function shortDetail(detail) {
  const whole = String(detail ?? '')
  const first = whole.split('\n')[0]
  const chars = [...first]
  let w = 0
  let end = chars.length
  for (let i = 0; i < chars.length; i += 1) {
    w += textEm(chars[i]) * DETAIL_FONT
    if (w > DETAIL_SHOW_W) {
      end = i
      break
    }
  }
  if (end === chars.length) return { text: first, cut: whole.includes('\n') }
  let at = end
  for (let i = end - 1; i >= Math.floor(end / 2); i -= 1) {
    if (CUT_AT.test(chars[i])) {
      at = i
      break
    }
  }
  return { text: `${chars.slice(0, at).join('').replace(/[，；：、,;:\s]+$/, '')}…`, cut: true }
}

const SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null
/** A piece that must stay with the word before it: a closing mark, a percent sign, a unit right after a number */
const STICKS = /^[%％)）」』”’,，.。、;；:：!！?？]+$/

/**
 * A label as words, each kept whole: a line breaks between words, not through one ("是否达到基 / 准", "50 / %").
 * Intl.Segmenter knows Chinese words; where it is missing a character is a word. FlowNode draws the label with
 * these pieces and wrapLines counts its lines with them, so the box and the text agree.
 */
export function wordsOf(label) {
  const text = String(label ?? '')
  const raw = SEGMENTER ? [...SEGMENTER.segment(text)].map((x) => x.segment) : [...text]
  const out = []
  for (const piece of raw) {
    if (out.length && STICKS.test(piece)) out[out.length - 1] += piece
    else out.push(piece)
  }
  return out
}

/** The measure of bold text is a little wider than the plain estimate (a Latin letter most of all) */
const BOLD_SLACK = 1.07

/**
 * How many lines a label takes in a text column of `colW` px when a line breaks only between words: a greedy wrap by
 * the same measure the boxes use. A word wider than a column takes the lines it needs.
 */
export function wrapLines(label, colW) {
  let lines = 1
  let used = 0
  for (const word of wordsOf(label)) {
    const w = textEm(word) * NODE_FONT * BOLD_SLACK
    if (used > 0 && used + w > colW + 0.5) {
      lines += 1
      used = 0
    }
    if (w > colW) {
      lines += Math.ceil(w / colW) - 1
      used = w % colW
    } else used += w
  }
  return lines
}

/** Whether a node's label is longer than the node shows: it needs more lines than the node has, at the widest column */
export const labelCut = (label, kind) => wrapLines(label, kind === 'decision' ? DIAMOND_TEXT_MAX_W : TEXT_MAX_W) > (kind === 'decision' ? DIAMOND_MAX_LINES : NODE_MAX_LINES)

/**
 * The single source of node sizes. The rendering layer must not write a second copy.
 * Returns { w, h, textW }: textW is the width of the text column the node draws its text in.
 */
export function sizeOf(node) {
  const label = String(node?.label ?? '')
  const short = node?.detail ? shortDetail(node.detail) : { text: '', cut: false }
  const detail = short.text
  const cap = node?.kind === 'decision' ? DIAMOND_TEXT_MAX_W : TEXT_MAX_W
  const labelW = textEm(label) * NODE_FONT
  // The detail shows one line (the rest is in the popover), so it can widen the box only up to the cap
  const detailW = detail ? textEm(detail) * DETAIL_FONT : 0
  // A diamond is widest in the middle and pointed at both ends, so a long single line makes a
  // flat, squashed one; its text is folded into a roughly square block instead
  const want = node?.kind === 'decision' ? Math.sqrt(labelW * NODE_LINE * 2.2) : labelW
  const textW = Math.ceil(Math.min(cap, Math.max(TEXT_MIN_W, want, Math.min(detailW, cap))))
  const wanted = wrapLines(label, textW)
  const maxLines = node?.kind === 'decision' ? DIAMOND_MAX_LINES : NODE_MAX_LINES
  const lines = Math.min(maxLines, Math.max(1, wanted))
  // Whether the node leaves something out that the popover shows: a label cut by the line limit, or a cut detail
  const cut = wanted > maxLines || short.cut
  const textH = lines * NODE_LINE + (detail ? DETAIL_LINE + 2 : 0)
  switch (node?.kind) {
    case 'start':
    case 'end':
      return { cut, w: textW + (NODE_PAD_X + PILL_EXTRA_X) * 2, h: textH + NODE_PAD_Y * 2, textW }
    case 'decision':
      // The text rectangle (textW × textH) fits inside a diamond W × H when
      // textW / W + textH / H <= 1; these proportions keep it just inside
      return { cut, w: Math.round(textW * 1.7 + 24), h: Math.round(textH * 2.4 + 16), textW }
    case 'document':
      // The wavy bottom edge takes a strip the text must stay out of
      return { cut, w: textW + NODE_PAD_X * 2, h: textH + NODE_PAD_Y * 2 + DOC_WAVE, textW }
    default:
      return { cut, w: textW + NODE_PAD_X * 2, h: textH + NODE_PAD_Y * 2, textW }
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
