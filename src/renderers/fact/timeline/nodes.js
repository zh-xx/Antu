// ============================================================
//  src/renderers/fact/timeline/nodes.js —— 把算好的数造成 React Flow 节点
//
//  metrics.js 负责"算"，这里负责"造"。每类节点一小段：
//    格子层、列标题、轴线、引线层、卡片
//
//  装饰类节点（格子、引线）都要声明 width/height: 1，理由见 cellsNode 那段注释，
//  那条踩过坑，别再改回 0。
// ============================================================

import { SIDE } from './grid.js'
import { CARD_W } from '../cardGeometry.js'
import { DOT_SIZE, HEADER_W, groupIndexOf } from './metrics.js'

/** 装饰类节点共有的属性：不拖、不选、不可连、不可聚焦 */
const DECORATION = {
  draggable: false,
  selectable: false,
  connectable: false,
  focusable: false,
}

/**
 * 卡片的数据：主体名与来源在这里就解析好，浮层直接用，不必再回头翻 spec。
 */
export function cardData(event, grid, rowIndex) {
  const actorNames = (Array.isArray(event.actorIds) ? event.actorIds : []).map(
    (id) => grid.actorById.get(id)?.name || id,
  )
  const sources = (Array.isArray(event.sourceIds) ? event.sourceIds : [])
    .map((id) => grid.sourceById.get(id))
    .filter(Boolean)
  return { event, actorNames, sources, sourceCount: sources.length, row: rowIndex }
}

/**
 * 格子层（最底层，默认隐藏，由开关控制）。
 * 只把行列数与格子尺寸交代出去，具体画多少格由组件决定。
 */
export function cellsNode(m) {
  return {
    id: '__cells__',
    type: 'cells',
    position: { x: 0, y: 0 },
    // 装饰层的尺寸要走两条互相打架的规则，所以只能给 1×1：
    //   不声明  → React Flow 把"没尺寸"的节点整个设成 visibility:hidden，看不见
    //   声明 0×0 → 它永远拿不到 measured，而只要有一个节点没有 measured，
    //              React Flow 就把 nodesInitialized 判成 false，
    //              fitView 的队列路径便永不结算（症状：画布上"适应视图"按钮点了没反应）
    // 1×1 两条都满足：节点有尺寸所以可见、能被量到；真正画多大由里面的 SVG 决定。
    width: 1,
    height: 1,
    style: { pointerEvents: 'none' },
    data: {
      cols: m.colCount,
      rows: m.rowCount,
      cellW: m.cellBoxW,
      cellH: m.cellBoxH,
      originX: m.originX,
      originY: m.originY,
      isH: m.isH,
    },
    ...DECORATION,
  }
}

/** 列标题：竖向时在网格上方一行，横向时在网格左侧一列 */
export function headerNodes(grid, m) {
  const side1Count = grid.columns.filter((c) => c.side === SIDE.SIDE1).length
  const side2Count = grid.columns.filter((c) => c.side === SIDE.SIDE2).length

  return grid.columns.map((col, ci) => {
    // 只有该侧有多列（多主体）时才补一行主体名
    const manyCols =
      col.side === SIDE.SIDE1 ? side1Count > 1 : col.side === SIDE.SIDE2 ? side2Count > 1 : false
    return {
      id: `__head__${col.key}`,
      type: 'colHeader',
      position: m.isH ? { x: 0, y: ci * m.laneExtent } : { x: ci * m.laneExtent, y: 0 },
      data: {
        width: m.isH ? HEADER_W : m.laneExtent,
        height: m.isH ? m.laneExtent : null,
        isH: m.isH,
        side: col.side,
        groupIndex: groupIndexOf(col.side),
        sideTitle: grid.sideLabels[col.side],
        colTitle: manyCols ? col.actorName : null,
      },
      ...DECORATION,
    }
  })
}

/**
 * 轴线（含每个槽的轴点）。
 * 位置：竖向时贴着轴点列的中线、从标题区往下；横向时反过来。
 */
export function axisNode(grid, m) {
  // 轴点沿时间轴排，位置是相对轴线节点起点的偏移（竖向是 top，横向是 left）
  const dotOffsets = grid.rows.map(
    (r) => r.index * m.slotExtent + m.slotExtent / 2 - DOT_SIZE / 2,
  )
  return {
    id: '__axis__',
    type: 'axis',
    position: m.isH
      ? { x: m.originX, y: m.axisCenter - 1 }
      : { x: m.axisCenter - 1, y: m.originY },
    data: { isH: m.isH, length: m.rowCount * m.slotExtent, dotSize: DOT_SIZE, dotOffsets },
    ...DECORATION,
  }
}

/** 引线层。整层一个节点，排在卡片之前，所以卡片永远压住线。 */
export function linksNode(segments, isH) {
  return {
    id: '__links__',
    type: 'links',
    position: { x: 0, y: 0 },
    // 同格子层：1×1 的理由见 cellsNode 那段注释
    width: 1,
    height: 1,
    style: { pointerEvents: 'none' },
    data: { segments, isH },
    ...DECORATION,
  }
}

/**
 * 一张卡片，以及它连到轴点的引线（卡片本就在轴线车道上时没有引线）。
 *
 * 引线：从卡片靠轴的那条边拉到轴点。竖向走卡片左右两侧的横线，
 * 横向走卡片上下两侧的竖线。
 */
export function placeCard(event, colIndex, rowIndex, grid, m, fields) {
  const cell = m.cellAt(rowIndex, colIndex)
  const cardX = cell.x + (m.cellBoxW - CARD_W) / 2
  const cardY = cell.y + (m.cellBoxH - m.cardH) / 2

  let link = null
  if (m.isH) {
    const cx = cardX + CARD_W / 2
    if (colIndex < grid.axisColumnIndex) {
      const from = cardY + m.cardH
      link = { left: cx, top: from, height: m.axisCenter - from }
    } else if (colIndex > grid.axisColumnIndex) {
      link = { left: cx, top: m.axisCenter, height: cardY - m.axisCenter }
    }
  } else {
    const cy = cardY + m.cardH / 2
    if (colIndex < grid.axisColumnIndex) {
      const from = cardX + CARD_W
      link = { left: from, top: cy, width: m.axisCenter - from }
    } else if (colIndex > grid.axisColumnIndex) {
      link = { left: m.axisCenter, top: cy, width: cardX - m.axisCenter }
    }
  }

  const node = {
    id: event.id,
    type: 'card',
    position: { x: cardX, y: cardY },
    data: {
      ...cardData(event, grid, rowIndex),
      groupIndex: groupIndexOf(grid.columns[colIndex].side),
      // 尺寸的唯一来源：样式里不再写宽高
      cardW: CARD_W,
      cardH: m.cardH,
      labelLines: m.labelLines,
      fields,
      isH: m.isH,
    },
  }
  return { node, link }
}
