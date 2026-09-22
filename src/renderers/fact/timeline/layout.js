// ============================================================
//  src/renderers/fact/timeline/layout.js —— 时间图排布的入口
//
//  行 = 槽（slots 数组下标，自上而下就是时间先后）
//  列 = 站位 × 主体：第 1 侧各主体、轴线、第 2 侧各主体
//
//  这个文件只做"串起来"：
//    grid.js     算出每个事件落在第几行第几列
//    metrics.js  把行列算成像素
//    nodes.js    把像素造成 React Flow 节点
//
//  节点顺序决定绘制层级（后画的压在上面）：
//    格子层 → 列标题 → 引线层 → 轴线 → 卡片
//  引线排在轴线之前，轴点才能盖住线的末端（线不会插进圆圈里）；
//  卡片排在最后，压住引线。
// ============================================================

import { buildGrid } from './grid.js'
import { makeMetrics } from './metrics.js'
import { axisNode, cellsNode, headerNodes, linksNode, placeCard } from './nodes.js'

/**
 * 把一份已通过校验的 fact 规范算成 React Flow 的节点。
 * edges 恒为空；卡片到轴点的引线由单独的"引线层"节点承担。
 */
export function buildFactGraph(spec, fields = {}, view, orientation = 'vertical') {
  const isH = orientation === 'horizontal'
  // 视角也是排布的输入：它决定分侧依据、有哪些列
  const grid = buildGrid(spec, view)
  const m = makeMetrics(grid, fields, isH)

  const nodes = [cellsNode(m), ...headerNodes(grid, m)]

  // 卡片位置与引线一起算：引线要贴着卡片的边
  const cards = []
  const links = []
  grid.rows.forEach((row) => {
    row.cells.forEach((event, key) => {
      const col = grid.columns.findIndex((c) => c.key === key)
      if (col < 0) return
      const { node, link } = placeCard(event, col, row.index, grid, m, fields)
      cards.push(node)
      if (link) links.push(link)
    })
  })

  if (links.length) nodes.push(linksNode(links, isH))
  nodes.push(axisNode(grid, m))
  nodes.push(...cards)

  return {
    // 这个视角摆不下的事件会进这里（例如不分侧时同一时间点有多条）。
    // 必须带出来：不带的话事件会被静默丢掉，界面上看不出少东西。
    errors: grid.errors,
    sideLabels: grid.sideLabels,
    nodes,
    edges: [],
    grid,
    layout: 'grid',
    size: { width: m.contentW, height: m.contentH },
  }
}
