// ============================================================
//  src/renderers/fact/timelineLayout.js —— fact 布局
//
//  规范约定：**数组顺序即权威顺序**（不按 date 重排）。
//
//  两种布局：
//   buildTimeline     —— 单线纵向（默认）
//   buildSingleActor  —— 单主体横向时间轴，按 groups 分上下两侧
// ============================================================

export const NODE_WIDTH = 320
export const NODE_HEIGHT = 96
export const NODE_GAP = 48

/** 组中心到轴线的距离 */
const GROUP_OFFSET = 150
const X_START = 120
const X_STEP = NODE_WIDTH + NODE_GAP

function toNodeData(event, actors) {
  const actorMap = new Map(actors.map((a) => [a.id, a.name]))
  return {
    event,
    actorNames: (event.actorIds || []).map((id) => actorMap.get(id) || id),
    sourceCount: (event.sourceIds || []).length,
  }
}

/**
 * 单线纵向时间轴（默认）
 */
export function buildTimeline(spec) {
  const { events = [], actors = [] } = spec

  const nodes = events.map((e, i) => ({
    id: e.id,
    type: 'event',
    position: { x: 0, y: i * (NODE_HEIGHT + NODE_GAP) },
    data: toNodeData(e, actors),
  }))

  const edges = events.slice(1).map((e, i) => ({
    id: `axis-${events[i].id}-${e.id}`,
    source: events[i].id,
    target: e.id,
    style: { stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '4 4' },
    selectable: false,
    focusable: false,
  }))

  return { nodes, edges }
}

/**
 * 单主体横向时间轴：事件按数组顺序横向排列，按 groups 分上下两侧
 * - group 序号 0 → 轴上方；1 → 轴下方；无 groupId → 骑在轴线上
 */
export function buildSingleActor(spec) {
  const { events = [], actors = [], groups = [] } = spec
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]))

  const nodes = events.map((e, i) => {
    const gi = groupIndex.get(e.groupId)
    let y
    if (gi === 0) y = -GROUP_OFFSET - NODE_HEIGHT / 2      // 上方
    else if (gi === 1) y = GROUP_OFFSET - NODE_HEIGHT / 2   // 下方
    else y = -NODE_HEIGHT / 2                               // 未分组：骑在轴线上
    return {
      id: e.id,
      type: 'event',
      position: { x: X_START + i * X_STEP, y },
      data: toNodeData(e, actors),
    }
  })

  // 轴线装饰节点（横线），宽度覆盖全部事件
  const axisWidth = X_START + events.length * X_STEP
  nodes.unshift({
    id: '__axis__',
    type: 'axis',
    position: { x: 0, y: -1 },
    data: { width: axisWidth },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  })

  return { nodes, edges: [] }
}

/** 按 spec 自动选择布局 */
export function buildFactGraph(spec) {
  const useGroups = Array.isArray(spec.groups) && spec.groups.length > 0
  return useGroups ? buildSingleActor(spec) : buildTimeline(spec)
}
