// ============================================================
//  src/renderers/fact/timelineLayout.js —— fact 布局（网格）
//
//  行 = 槽（slots 数组下标，自上而下就是时间先后）
//  列 = 站位 × 主体：第 1 侧各主体、轴线、第 2 侧各主体
//
//  排布逻辑全部在 core/factGrid.js，这里只把格子换成像素坐标。
//
//  节点顺序决定绘制层级（后画的压在上面）：
//     列标题 / 轴线 → 引线层 → 卡片
//  引线单独成一层，是为了让卡片盖住引线，而不是引线横穿卡片。
// ============================================================

import { buildGrid, SIDE } from '../../core/factGrid.js'
import {
  CARD_W,
  LABEL_LINE_CAP,
  TITLE_LINES,
  cardHeightOf,
} from '../../core/cardGeometry.js'

/**
 * 全图标题实际要几行（取最大值，因为同一张图里卡片必须一样高）。
 * 按码点数估算：汉字按 1em 算，是最宽的情况，所以只会估多、不会估少，
 * 估多了顶多留一点余量，估少了标题会被截断。估出的行数封顶在 TITLE_LINES。
 */
function labelLinesOf(grid) {
  let max = 1
  for (const row of grid.rows) {
    row.cells.forEach((event) => {
      const n = [...(event.label || '')].length
      max = Math.max(max, Math.min(TITLE_LINES, Math.ceil(n / LABEL_LINE_CAP)))
    })
  }
  return max
}

/** 格子横宽与留白 */
export const CELL_W = 316
/** 卡片与格子之间的留白（纵向也用它） */
export const CELL_GAP = 28
/** 列标题占的高度 */
export const HEADER_H = 96

const DOT_SIZE = 10

/** 侧 → 配色序号（与 CSS 里的 g0 / g1 / g2 对应） */
export function groupIndexOf(side) {
  if (side === SIDE.SIDE1) return 0
  if (side === SIDE.SIDE2) return 1
  return 2
}

/**
 * 列标题：只写这一列的组名，不写“第 N 侧 / 轴线”这类位置描述。
 * 位置看图就知道，写在标题里只是占地方。
 * 组名本身才是信息（“正常（按约定履行）”），没有组就留空。
 */
function sideTitleOf(side, groups) {
  const groupIndex = side === SIDE.SIDE1 ? 0 : side === SIDE.SIDE2 ? 1 : 2
  return groups[groupIndex]?.label ?? ''
}

function toCardData(event, grid, rowIndex) {
  const actorNames = (Array.isArray(event.actorIds) ? event.actorIds : [])
    .map((id) => grid.actorById.get(id)?.name || id)
  // 依据在这里就解析好，卡片浮层直接用，不必再回头翻 spec
  const sources = (Array.isArray(event.sourceIds) ? event.sourceIds : [])
    .map((id) => grid.sourceById.get(id))
    .filter(Boolean)
  return {
    event,
    actorNames,
    sources,
    sourceCount: sources.length,
    row: rowIndex,
  }
}

/**
 * 把一份已通过校验的 fact 规范算成 React Flow 的节点。
 * edges 恒为空；卡片到轴点的引线由单独的“引线层”节点承担。
 */
export function buildFactGraph(spec, fields = {}) {
  const grid = buildGrid(spec)
  const groups = Array.isArray(spec.groups) ? spec.groups : []

  const colCount = grid.columns.length
  const rowCount = grid.rows.length
  const side1Count = grid.columns.filter((c) => c.side === SIDE.SIDE1).length
  const side2Count = grid.columns.filter((c) => c.side === SIDE.SIDE2).length

  // 卡片高度由「要显示哪些字段」和「标题实际几行」算出来，
  // 格子高度再跟着卡片走。两处都跟着内容走，卡片才不会空出一块。
  const labelLines = labelLinesOf(grid)
  const cardH = cardHeightOf(fields, labelLines)
  const cellH = cardH + CELL_GAP

  const axisX = grid.axisColumnIndex * CELL_W + CELL_W / 2
  const gridTop = HEADER_H
  const gridBottom = gridTop + rowCount * cellH

  const nodes = []

  // ---------- 格子层（最底层，默认隐藏，由开关控制） ----------
  // 只把行列数与格子尺寸交代出去，具体画多少格由组件决定
  // （它会在内容两侧各多画一列空位）
  nodes.push({
    id: '__cells__',
    type: 'cells',
    position: { x: 0, y: 0 },
    // 必须显式给出尺寸：React Flow 会把“没有尺寸”的节点整个设成
    // visibility:hidden，装饰层本来就是 0×0，不声明就一个像素都看不见。
    width: 0,
    height: 0,
    data: { cols: colCount, rows: rowCount, cellW: CELL_W, cellH, top: gridTop },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  })

  // ---------- 列标题 ----------
  grid.columns.forEach((col, ci) => {
    const manyCols =
      col.side === SIDE.SIDE1 ? side1Count > 1 : col.side === SIDE.SIDE2 ? side2Count > 1 : false
    nodes.push({
      id: `__head__${col.key}`,
      type: 'colHeader',
      position: { x: ci * CELL_W, y: 0 },
      data: {
        width: CELL_W,
        side: col.side,
        groupIndex: groupIndexOf(col.side),
        sideTitle: sideTitleOf(col.side, groups),
        colTitle: manyCols ? col.actorName : null,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
    })
  })

  // ---------- 轴线（含每个槽的轴点）----------
  // 先算好，等引线入列之后再放进去：轴点必须压在引线上面。
  // 反过来的话，引线会一直画到轴点的圆心，把那个白心的圆圈戳穿。
  const dotYs = grid.rows.map((r) => r.index * cellH + cellH / 2 - DOT_SIZE / 2)
  const axisNode = {
    id: '__axis__',
    type: 'axis',
    position: { x: axisX - 1, y: gridTop },
    data: { height: gridBottom - gridTop, dotSize: DOT_SIZE, dotYs },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  }

  // ---------- 算卡片位置，顺手收集引线 ----------
  const cardNodes = []
  const linkSegments = []

  grid.rows.forEach((row) => {
    row.cells.forEach((event, key) => {
      const col = grid.columns.findIndex((c) => c.key === key)
      if (col < 0) return

      const cardX = col * CELL_W + (CELL_W - CARD_W) / 2
      const cardY = gridTop + row.index * cellH + (cellH - cardH) / 2
      const centerY = cardY + cardH / 2

      // 卡片靠轴的一侧拉一条引线到轴点；卡片本就在轴线列时不画
      if (col < grid.axisColumnIndex) {
        const from = cardX + CARD_W
        linkSegments.push({ left: from, top: centerY, width: axisX - from })
      } else if (col > grid.axisColumnIndex) {
        linkSegments.push({ left: axisX, top: centerY, width: cardX - axisX })
      }

      cardNodes.push({
        id: event.id,
        type: 'card',
        position: { x: cardX, y: cardY },
        data: {
          ...toCardData(event, grid, row.index),
          groupIndex: groupIndexOf(grid.columns[col].side),
          // 尺寸的唯一来源：样式里不再写宽高
          cardW: CARD_W,
          cardH,
          labelLines,
          fields,
        },
      })
    })
  })

  // ---------- 引线层 ----------
  // 层级自上而下：轴点 → 引线 → 卡片。
  // 引线排在轴之后，轴点才能盖住线的末端（线就不会插进圆圈里）；
  // 卡片排在最后，压住引线（线横穿中间列时不会压到卡片上）。
  if (linkSegments.length) {
    nodes.push({
      id: '__links__',
      type: 'links',
      position: { x: 0, y: 0 },
      // 同格子层：不声明尺寸就会被 React Flow 隐藏
      width: 0,
      height: 0,
      data: { segments: linkSegments },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
    })
  }

  nodes.push(axisNode)
  nodes.push(...cardNodes)

  return {
    nodes,
    edges: [],
    grid,
    layout: 'grid',
    size: { width: colCount * CELL_W, height: gridBottom },
  }
}
