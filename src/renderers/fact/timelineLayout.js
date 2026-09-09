// ============================================================
//  src/renderers/fact/timelineLayout.js —— 时间轴布局（v0 单线）
//
//  规范约定：**数组顺序即权威顺序**（不按 date 重排）。
//  因此这里直接按 events 数组下标排列，date 只用于显示。
// ============================================================

export const NODE_WIDTH = 320
export const NODE_HEIGHT = 96
export const NODE_GAP = 48

/**
 * 把 fact 规范转成 React Flow 的 nodes/edges（单线时间轴）
 * @param {object} spec fact 规范
 * @returns {{nodes: object[], edges: object[]}}
 */
export function buildTimeline(spec) {
  const { events = [], actors = [] } = spec
  const actorMap = new Map(actors.map((a) => [a.id, a.name]))

  // 节点：按数组顺序纵向排列（x 固定，y 递增）
  const nodes = events.map((e, i) => ({
    id: e.id,
    type: 'event',
    position: { x: 0, y: i * (NODE_HEIGHT + NODE_GAP) },
    data: {
      event: e,
      actorNames: (e.actorIds || []).map((id) => actorMap.get(id) || id),
      sourceCount: (e.sourceIds || []).length,
    },
  }))

  // 连线：相邻事件用虚线相连，表示"时间轴"的流向（非语义关系）
  const edges = events.slice(1).map((e, i) => ({
    id: `axis-${events[i].id}-${e.id}`,
    source: events[i].id,
    target: e.id,
    type: 'default',
    style: { stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '4 4' },
    selectable: false,
    focusable: false,
  }))

  return { nodes, edges }
}
