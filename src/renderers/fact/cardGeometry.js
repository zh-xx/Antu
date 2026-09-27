// ============================================================
//  src/renderers/fact/cardGeometry.js — the geometric specification of a card
//
//  Every number about card size is collected here, in one place only:
//    · the validation layer uses it to work out "how many characters fit on one summary line"
//    · the rendering layer uses it for card height and position, and hands padding and font
//      sizes to the styles through CSS variables
//
//  Why it must be collected: change either of these two numbers (card width, summary font size)
//  on its own and the character limit goes wrong, the symptom being only "some summaries are
//  inexplicably truncated" — very hard to track down.
// ============================================================

/** Card outer width. Fixed at 288: inner width 262, about 22 characters per line at an 11.5px font. */
export const CARD_W = 288

/** Card padding. The vertical one is exported because index.jsx injects it as a CSS variable. */
export const CARD_PAD_X = 13
export const CARD_PAD_Y = 11

/** Heights of the blocks inside a card. These are used only when computing height, and are not exported. */
const TITLE_LINE_H = 19
/** How many lines the title may take at most (the estimate never exceeds it) */
const TITLE_LINES = 2
const ROW_H = 18
const ROW_GAP = 6
const FOOT_H = 16

/** Title font size. Width is estimated in em below: inner width ÷ font size = how wide one line can be. */
export const LABEL_FONT = 13
/** Summary font size, as above */
export const SNIPPET_FONT = 11.5

/**
 * How many em one character takes.
 * **Not counted by character count**: CJK and Latin differ in width by nearly a factor of two, and
 * "1 character = 1em" only holds for CJK; an English summary translated from Chinese doubles its
 * character count, is judged too long, and **the whole diagram refuses to render** (see
 * err.summaryTooLong in timeline/grid.js). Values err generous (over-estimate rather than under):
 * exact typography needs real font metrics, which a pure function in Node cannot get.
 */
const CJK_EM = 1.0
const LATIN_EM = 0.55

function charEm(ch) {
  const c = ch.codePointAt(0)
  // CJK unified ideographs, kana, hangul, fullwidth forms, CJK symbols and punctuation → full width
  if (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6)
  ) {
    return CJK_EM
  }
  return LATIN_EM
}

/** How many em a piece of text takes (summed by code point, a surrogate pair counted once) */
export function textEm(text) {
  let n = 0
  for (const ch of String(text ?? '')) n += charEm(ch)
  return n
}

/** How many px a piece of text takes when drawn */
export const textWidth = (text, font) => textEm(text) * font

/** Card inner width */
export const CARD_INNER_W = CARD_W - CARD_PAD_X * 2

/** Width capacity of one title line (em). Change the card width or the font size and this follows automatically. */
export const LABEL_LINE_EM = CARD_INNER_W / LABEL_FONT

/** Width limit of one summary line (em). Change the card width or the font size and this follows automatically. */
export const SUMMARY_MAX_EM = CARD_INNER_W / SNIPPET_FONT

/** The summary limit converted into roughly how many CJK characters; only a concrete reference for the error message. */
export const SUMMARY_MAX = Math.floor(SUMMARY_MAX_EM)

/** Typesetting parameters for party tags: used to estimate how many lines the tags take (tags wrap, so one line is not enough) */
export const ACTOR_FONT = 10
export const ACTOR_TAG_PAD = 14 // 7px padding on each side
export const ACTOR_TAG_GAP = 4

/** How many lines the title may take at most; caps the rendering layer's estimate */
export const MAX_LABEL_LINES = TITLE_LINES

/**
 * Card height is computed from "which fields to show", "how many lines the title takes" and
 * "how many lines the party tags take". None of the three may be hard-coded: a field switched
 * off would leave an empty block; a one-line title still reserving two lines leaves a blank line;
 * party tags counted as one line but wrapping to two take the extra height out of the title and
 * summary and squash the text. All cards in one diagram must be the same height, so all three
 * counts take the maximum; actorLines = 0 means parties are hidden, so that row takes no height.
 */
export function cardHeightOf(fields = {}, labelLines = TITLE_LINES, actorLines = 0) {
  let h = CARD_PAD_Y * 2 + TITLE_LINE_H * labelLines + ROW_GAP + FOOT_H
  if (fields.summary) h += ROW_H + ROW_GAP
  if (fields.actors && actorLines > 0) h += ROW_H * actorLines + ROW_GAP
  return h
}
