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
import { SIDE_LABELS } from '../../core/labels.js'

/** 一个格子的尺寸 */
export const CELL_W = 384
export const CELL_H = 176
/** 卡片尺寸（格子减去四周留白） */
export const CARD_W = 320
export const CARD_H = 112
/** 列标题占的高度 */
export const HEADER_H = 96

const DOT_SIZE = 10

/** 侧 → 配色序号（与 CSS 里的 g0 / g1 / g2 对应） */
export function groupIndexOf(side) {
  if (side === SIDE.SIDE1) return 0
  if (side === SIDE.SIDE2) return 1
  return 2
}

function sideTitleOf(side, groups) {
  const groupIndex = side === SIDE.SIDE1 ? 0 : side === SIDE.SIDE2 ? 1 : 2
  const group = groups[groupIndex]
  const sideName = SIDE_LABELS[side] ?? side
  return group ? `${sideName} · ${group.label}` : sideName
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
export function buildFactGraph(spec) {
  const grid = buildGrid(spec)
  const groups = Array.isArray(spec.groups) ? spec.groups : []

  const colCount = grid.columns.length
  const rowCount = grid.rows.length
  const side1Count = grid.columns.filter((c) => c.side === SIDE.SIDE1).length
  const side2Count = grid.columns.filter((c) => c.side === SIDE.SIDE2).length

  const axisX = grid.axisColumnIndex * CELL_W + CELL_W / 2
  const gridTop = HEADER_H
  const gridBottom = gridTop + rowCount * CELL_H

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
    data: { cols: colCount, rows: rowCount, cellW: CELL_W, cellH: CELL_H, top: gridTop },
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

  // ---------- 轴线（含每个槽的轴点） ----------
  const dotYs = grid.rows.map((r) => r.index * CELL_H + CELL_H / 2 - DOT_SIZE / 2)
  nodes.push({
    id: '__axis__',
    type: 'axis',
    position: { x: axisX - 1, y: gridTop },
    data: { height: gridBottom - gridTop, dotSize: DOT_SIZE, dotYs },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  })

  // ---------- 算卡片位置，顺手收集引线 ----------
  const cardNodes = []
  const linkSegments = []

  grid.rows.forEach((row) => {
    row.cells.forEach((event, key) => {
      const col = grid.columns.findIndex((c) => c.key === key)
      if (col < 0) return

      const cardX = col * CELL_W + (CELL_W - CARD_W) / 2
      const cardY = gridTop + row.index * CELL_H + (CELL_H - CARD_H) / 2
      const centerY = cardY + CARD_H / 2

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
        },
      })
    })
  })

  // ---------- 引线层：排在卡片之前，好让卡片压住引线 ----------
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

  nodes.push(...cardNodes)

  return {
    nodes,
    edges: [],
    grid,
    layout: 'grid',
    size: { width: colCount * CELL_W, height: gridBottom },
  }
}
