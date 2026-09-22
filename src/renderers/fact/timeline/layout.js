// ============================================================
//  src/renderers/fact/timeline/layout.js —— fact 布局（网格）
//
//  行 = 槽（slots 数组下标，自上而下就是时间先后）
//  列 = 站位 × 主体：第 1 侧各主体、轴线、第 2 侧各主体
//
//  排布逻辑全部在 timeline/grid.js，这里只把格子换成像素坐标。
//
//  节点顺序决定绘制层级（后画的压在上面）：
//     列标题 / 轴线 → 引线层 → 卡片
//  引线单独成一层，是为了让卡片盖住引线，而不是引线横穿卡片。
// ============================================================

import { buildGrid, SIDE } from './grid.js'
import {
  ACTOR_FONT,
  ACTOR_TAG_GAP,
  ACTOR_TAG_PAD,
  CARD_INNER_W,
  CARD_W,
  LABEL_LINE_CAP,
  MAX_LABEL_LINES,
  cardHeightOf,
} from '../cardGeometry.js'

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
      max = Math.max(max, Math.min(MAX_LABEL_LINES, Math.ceil(n / LABEL_LINE_CAP)))
    })
  }
  return max
}

/** 格子横宽与留白 */
const CELL_W = 316
/** 卡片与格子之间的留白（纵向也用它） */
const CELL_GAP = 28
/** 标题区：竖向在上方留高度，横向在左侧留宽度。
 *  横向留得比竖向宽，因为标题文字要在一列里放得下（"双方共同或客观经过"约需 126px）。 */
const HEADER_H = 96
const HEADER_W = 150

const DOT_SIZE = 10

/** 侧 → 配色序号（与 CSS 里的 g0 / g1 / g2 对应） */
function groupIndexOf(side) {
  if (side === SIDE.SIDE1) return 0
  if (side === SIDE.SIDE2) return 1
  return 2
}

/**
 * 全图主体标签要几行（同样取最大值）。
 * 标签是可换行的，按一行算的话多出来的高度会从标题和摘要身上扣、把字压变形。
 * 按名字宽度估：一个汉字约 1em（10px），每个标签另有左右内边距各 7px，
 * 标签之间留 4px。和标题一样，只会估多不会估少。
 */
function actorLinesOf(grid, fields) {
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
export function buildFactGraph(spec, fields = {}, view, orientation = 'vertical') {
  const isH = orientation === 'horizontal'
  // 视角也是排布的输入：它决定分侧依据、有哪些列
  const grid = buildGrid(spec, view)

  const colCount = grid.columns.length
  const rowCount = grid.rows.length
  const side1Count = grid.columns.filter((c) => c.side === SIDE.SIDE1).length
  const side2Count = grid.columns.filter((c) => c.side === SIDE.SIDE2).length

  // 卡片高度由「要显示哪些字段」和「标题实际几行」算出来，
  // 格子高度再跟着卡片走。两处都跟着内容走，卡片才不会空出一块。
  const labelLines = labelLinesOf(grid)
  const actorLines = actorLinesOf(grid, fields)
  const cardH = cardHeightOf(fields, labelLines, actorLines)
  const cellH = cardH + CELL_GAP

  // ---------- 方向无关的坐标映射 ----------
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

  const contentW = isH ? originX + rowCount * slotExtent : colCount * laneExtent
  const contentH = isH ? colCount * laneExtent : originY + rowCount * slotExtent

  const nodes = []

  // ---------- 格子层（最底层，默认隐藏，由开关控制） ----------
  // 只把行列数与格子尺寸交代出去，具体画多少格由组件决定
  // （它会在内容两侧各多画一列空位）
  nodes.push({
    id: '__cells__',
    type: 'cells',
    position: { x: 0, y: 0 },
    // 装饰层的尺寸要走两条互相打架的规则，所以只能给 1×1：
    //   不声明  → React Flow 把“没尺寸”的节点整个设成 visibility:hidden，看不见
    //   声明 0×0 → 它永远拿不到 measured，而只要有一个节点没有 measured，
    //              React Flow 就把 nodesInitialized 判成 false，
    //              fitView 的队列路径便永不结算（症状：画布上“适应视图”按钮点了没反应）
    // 1×1 两条都满足：节点有尺寸所以可见、能被量到；真正画多大由里面的 SVG 决定。
    width: 1,
    height: 1,
    style: { pointerEvents: 'none' },
    data: { cols: colCount, rows: rowCount, cellW: cellBoxW, cellH: cellBoxH, originX, originY, isH },
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
      // 竖向：标题在网格上方一行；横向：标题在网格左侧一列
      position: isH ? { x: 0, y: ci * laneExtent } : { x: ci * laneExtent, y: 0 },
      data: {
        width: isH ? HEADER_W : laneExtent,
        height: isH ? laneExtent : null,
        isH,
        side: col.side,
        groupIndex: groupIndexOf(col.side),
        sideTitle: grid.sideLabels[col.side],
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
  // 轴点沿时间轴排，位置是相对轴线节点起点的偏移（竖向是 top，横向是 left）
  const dotOffsets = grid.rows.map((r) => r.index * slotExtent + slotExtent / 2 - DOT_SIZE / 2)
  const axisNode = {
    id: '__axis__',
    type: 'axis',
    position: isH ? { x: originX, y: axisCenter - 1 } : { x: axisCenter - 1, y: originY },
    data: { isH, length: rowCount * slotExtent, dotSize: DOT_SIZE, dotOffsets },
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

      const cell = cellAt(row.index, col)
      const cardX = cell.x + (cellBoxW - CARD_W) / 2
      const cardY = cell.y + (cellBoxH - cardH) / 2

      // 引线：从卡片靠轴的那条边拉到轴点。卡片本就在轴线车道上时不画。
      // 竖向走卡片左右两侧的横线，横向走卡片上下两侧的竖线。
      if (isH) {
        const cx = cardX + CARD_W / 2
        if (col < grid.axisColumnIndex) {
          const from = cardY + cardH // 卡片在轴线上方，从下边往下拉
          linkSegments.push({ left: cx, top: from, height: axisCenter - from })
        } else if (col > grid.axisColumnIndex) {
          linkSegments.push({ left: cx, top: axisCenter, height: cardY - axisCenter })
        }
      } else {
        const cy = cardY + cardH / 2
        if (col < grid.axisColumnIndex) {
          const from = cardX + CARD_W
          linkSegments.push({ left: from, top: cy, width: axisCenter - from })
        } else if (col > grid.axisColumnIndex) {
          linkSegments.push({ left: axisCenter, top: cy, width: cardX - axisCenter })
        }
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
          isH,
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
      // 同格子层：1×1 的理由见上面格子层那段注释
      width: 1,
      height: 1,
      style: { pointerEvents: 'none' },
      data: { segments: linkSegments, isH },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
    })
  }

  nodes.push(axisNode)
  nodes.push(...cardNodes)

  return {
    // 这个视角摆不下的事件会进这里（例如不分侧时同一时间点有多条）。
    // 必须带出来：不带的话事件会被静默丢掉，界面上看不出少东西。
    errors: grid.errors,
    sideLabels: grid.sideLabels,
    nodes,
    edges: [],
    grid,
    layout: 'grid',
    size: { width: contentW, height: contentH },
  }
}
