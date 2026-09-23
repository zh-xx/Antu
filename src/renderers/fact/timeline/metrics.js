// ============================================================
//  src/renderers/fact/timeline/metrics.js —— 一切"算"出来的数
//
//  只做计算，不造节点。三件事：
//    1. 尺寸常量（格子多宽、留白多少、标题区多大）
//    2. 估行数（标题几行、主体标签几行）
//    3. 方向无关的坐标映射（一个格子在哪、轴线在哪、整张图多大）
//
//  第 3 件的要点：这些数本身不随方向变，只是**挂在不同轴上**。
//  竖向时时间沿纵轴走，横向时沿横轴走。所以映射写成一份，
//  由 isH 决定怎么挂，而不是写两套。
// ============================================================

import { SIDE } from './grid.js'
import {
  ACTOR_FONT,
  ACTOR_TAG_GAP,
  ACTOR_TAG_PAD,
  CARD_INNER_W,
  LABEL_LINE_CAP,
  MAX_LABEL_LINES,
  cardHeightOf,
} from '../cardGeometry.js'

/** 格子横宽与留白 */
export const CELL_W = 316

/** 卡片与格子之间的留白（纵向也用它） */
export const CELL_GAP = 28

/** 标题区：竖向在上方留高度，横向在左侧留宽度。
 *  横向留得比竖向宽，因为标题文字要在一列里放得下（"双方共同或客观经过"约需 126px）。 */
export const HEADER_H = 96
export const HEADER_W = 150

/** 轴点直径 */
export const DOT_SIZE = 10

/**
 * 轴末端那个箭头超出轴线的长度（见 AxisLineNode：竖向挂在轴下面，横向挂在轴右边）。
 *
 * **必须算进内容尺寸**，否则导出的图会把箭头切掉——内容高到轴线为止，
 * 箭头在轴线之外 6px，落在捕获范围外。实测过一次：导出图里轴上光秃秃的。
 */
export const ARROW_EXTENT = 6

/** 侧 → 配色序号（与 CSS 里的 g0 / g1 / g2 对应） */
export function groupIndexOf(side) {
  if (side === SIDE.SIDE1) return 0
  if (side === SIDE.SIDE2) return 1
  return 2
}

/**
 * 全图标题实际要几行（取最大值，因为同一张图里卡片必须一样高）。
 * 按码点数估算：汉字按 1em 算，是最宽的情况，所以只会估多、不会估少，
 * 估多了顶多留一点余量，估少了标题会被截断。估出的行数封顶在 TITLE_LINES。
 */
export function labelLinesOf(grid) {
  let max = 1
  for (const row of grid.rows) {
    row.cells.forEach((event) => {
      const n = [...(event.label || '')].length
      max = Math.max(max, Math.min(MAX_LABEL_LINES, Math.ceil(n / LABEL_LINE_CAP)))
    })
  }
  return max
}

/**
 * 全图主体标签要几行（同样取最大值）。
 * 标签是可换行的，按一行算的话多出来的高度会从标题和摘要身上扣、把字压变形。
 * 按名字宽度估：一个汉字约 1em（10px），每个标签另有左右内边距各 7px，
 * 标签之间留 4px。和标题一样，只会估多不会估少。
 */
export function actorLinesOf(grid, fields) {
  if (!fields.actors) return 0
  let max = 0
  for (const row of grid.rows) {
    row.cells.forEach((event) => {
      const names = (Array.isArray(event.actorIds) ? event.actorIds : []).map(
        (id) => grid.actorById.get(id)?.name || id,
      )
      if (names.length === 0) return
      const width =
        names.reduce((n, name) => n + [...name].length * ACTOR_FONT + ACTOR_TAG_PAD, 0) +
        ACTOR_TAG_GAP * (names.length - 1)
      max = Math.max(max, Math.ceil(width / CARD_INNER_W))
    })
  }
  return max
}

/**
 * 把网格算成像素。返回的东西够造节点用了。
 *
 * @param grid    timeline/grid.js 算出来的网格
 * @param fields  卡片上开了哪些字段（影响卡片高度，进而影响格子高度）
 * @param isH     是否横向（时间沿横轴走）
 */
export function makeMetrics(grid, fields, isH) {
  const colCount = grid.columns.length
  const rowCount = grid.rows.length

  // 卡片高度由「要显示哪些字段」和「标题实际几行」算出来，
  // 格子高度再跟着卡片走。两处都跟着内容走，卡片才不会空出一块。
  const labelLines = labelLinesOf(grid)
  const actorLines = actorLinesOf(grid, fields)
  const cardH = cardHeightOf(fields, labelLines, actorLines)
  const cellH = cardH + CELL_GAP

  // 一个时间点占的长度、一条车道占的长度。这两组数字本身不随方向变，
  // 只是挂在不同的轴上：竖向时间沿纵向走，横向时间沿横向走。
  const slotExtent = isH ? CELL_W : cellH
  const laneExtent = isH ? cellH : CELL_W

  // 网格起点：竖向在上方留标题区，横向在左侧留标题区
  const originX = isH ? HEADER_W : 0
  const originY = isH ? 0 : HEADER_H

  // 一格在屏幕上占的宽高（竖向：宽 = 车道宽、高 = 时间点高；横向互换）
  const cellBoxW = isH ? slotExtent : laneExtent
  const cellBoxH = isH ? laneExtent : slotExtent

  // 一个格子左上角在哪。槽沿时间轴走，车道沿车道轴走。
  const cellAt = (slotIndex, laneIndex) =>
    isH
      ? { x: originX + slotIndex * slotExtent, y: laneIndex * laneExtent }
      : { x: laneIndex * laneExtent, y: originY + slotIndex * slotExtent }

  // 轴线所在车道的中心线（沿车道轴量的坐标）
  const axisCenter = grid.axisColumnIndex * laneExtent + laneExtent / 2

  // 内容尺寸要把箭头算进去（见 ARROW_EXTENT）
  const contentW = isH ? originX + rowCount * slotExtent + ARROW_EXTENT : colCount * laneExtent
  const contentH = isH ? colCount * laneExtent : originY + rowCount * slotExtent + ARROW_EXTENT

  return {
    isH,
    colCount,
    rowCount,
    labelLines,
    actorLines,
    cardH,
    cellH,
    slotExtent,
    laneExtent,
    originX,
    originY,
    cellBoxW,
    cellBoxH,
    cellAt,
    axisCenter,
    contentW,
    contentH,
  }
}
