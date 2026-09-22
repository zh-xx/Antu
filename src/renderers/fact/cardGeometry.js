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

/** 卡片内边距。纵向那个要给 index.jsx 注入 CSS 变量，所以导出。 */
export const CARD_PAD_X = 13
export const CARD_PAD_Y = 11

/** 卡片内部各块的高度。这几个只在算高度时用，不外导。 */
const TITLE_LINE_H = 19
/** 标题最多留几行（估出来的行数不会超过它） */
const TITLE_LINES = 2
const ROW_H = 18
const ROW_GAP = 6
const FOOT_H = 16

/** 标题字号。汉字约占 1em，内宽 ÷ 字号 = 一行放得下几个字。 */
export const LABEL_FONT = 13
/** 摘要字号，同上 */
export const SNIPPET_FONT = 11.5

/** 卡片内宽 */
export const CARD_INNER_W = CARD_W - CARD_PAD_X * 2

/** 标题一行的字数容量 */
export const LABEL_LINE_CAP = Math.floor(CARD_INNER_W / LABEL_FONT)

/** 摘要一行的字数上限。卡片宽度或字号一改，这里自动跟着变。 */
export const SUMMARY_MAX = Math.floor(CARD_INNER_W / SNIPPET_FONT)

/** 主体标签的排版参数：用来估标签占几行（标签可换行，不能只按一行算） */
export const ACTOR_FONT = 10
export const ACTOR_TAG_PAD = 14 // 左右内边距各 7px
export const ACTOR_TAG_GAP = 4

/** 标题最多留几行，供渲染层估算时封顶 */
export const MAX_LABEL_LINES = TITLE_LINES

/**
 * 卡片高度由「要显示哪些字段」「标题几行」「主体标签几行」算出来。
 *
 * 三处都不能写死：
 *   · 字段一关，卡片就会空出一块（留了两行标题却没有摘要和主体）
 *   · 标题实际只有一行时还留两行，中间就空一行（这是最常见的浪费）
 *   · 主体标签按一行算、实际折成两行，多出来的高度会从标题和摘要身上扣，
 *     把字压变形。标签是可换行的，必须按实际行数算
 *
 * 同一张图里所有卡片必须一样高，所以三个行数取的都是全图的最大值。
 * actorLines 传 0 表示不显示主体（或全图没有事件挂主体），那行不占高。
 */
export function cardHeightOf(fields = {}, labelLines = TITLE_LINES, actorLines = 0) {
  let h = CARD_PAD_Y * 2 + TITLE_LINE_H * labelLines + ROW_GAP + FOOT_H
  if (fields.summary) h += ROW_H + ROW_GAP
  if (fields.actors && actorLines > 0) h += ROW_H * actorLines + ROW_GAP
  return h
}
