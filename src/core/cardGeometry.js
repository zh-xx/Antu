// ============================================================
//  src/core/cardGeometry.js —— 卡片的几何规格
//
//  跟卡片尺寸有关的数字全部集中在这里，只此一份：
//    · 校验层拿它算「摘要一行能放几个字」
//    · 渲染层拿它算卡片高度、位置，并通过 CSS 变量把内边距和字号交给样式
//
//  为什么必须集中：这两个数（卡片宽度、摘要字号）任何一处单独改掉，
//  字数上限就失准，而症状只是「某些摘要莫名其妙被截断」，极难排查。
// ============================================================

/** 卡片外框宽度。定在 288：内宽 262，11.5px 字号下一行约 22 个字。 */
export const CARD_W = 288

/** 卡片内边距 */
export const CARD_PAD_X = 13
export const CARD_PAD_Y = 11

/** 卡片内部各块的高度 */
export const TITLE_LINE_H = 19
/** 标题最多留几行（估出来的行数不会超过它） */
export const TITLE_LINES = 2
export const ROW_H = 18
export const ROW_GAP = 6
export const FOOT_H = 16

/** 标题字号。同样：汉字约占 1em，内宽 ÷ 字号 = 一行放得下几个字。 */
export const LABEL_FONT = 13
/** 摘要字号 */
export const SNIPPET_FONT = 11.5

/** 卡片内宽 */
export const CARD_INNER_W = CARD_W - CARD_PAD_X * 2

/** 标题一行的字数容量 */
export const LABEL_LINE_CAP = Math.floor(CARD_INNER_W / LABEL_FONT)

/** 摘要一行的字数上限。卡片宽度或字号一改，这里自动跟着变。 */
export const SUMMARY_MAX = Math.floor(CARD_INNER_W / SNIPPET_FONT)

/**
 * 卡片高度由「要显示哪些字段」和「标题实际要几行」算出来。
 *
 * 两处都不能写死：
 *   · 字段一关，卡片就会空出一块（留了两行标题却没有摘要和主体）
 *   · 标题实际只有一行时还留两行，中间就空一行（这是最常见的浪费）
 *
 * 注意同一张图里所有卡片必须一样高，所以行数取的是全图的**最大值**。
 */
export function cardHeightOf(fields = {}, labelLines = TITLE_LINES) {
  let h = CARD_PAD_Y * 2 + TITLE_LINE_H * labelLines + ROW_GAP + FOOT_H
  if (fields.summary) h += ROW_H + ROW_GAP
  if (fields.actors) h += ROW_H + ROW_GAP
  return h
}
