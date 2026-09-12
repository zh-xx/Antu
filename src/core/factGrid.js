// ============================================================
//  src/core/factGrid.js —— fact 排布的唯一事实来源
//
//  把一份 fact 规范算成“哪个事件落在第几行、第几列”。
//  校验层（validate.js）和渲染层（fact 渲染器）都调用它，
//  保证“检查的规则”和“画出来的样子”用的是同一套逻辑。
//
//  规则见 spec/fact-timeline-rules.md：
//   - 行 = 槽（slots 数组下标）
//   - 列 = 站位 × 主体：第 1 侧各主体、轴线、第 2 侧各主体
//   - 站位由 groupId 决定；涉及 ≥2 个主体则落轴线
//   - 距离按侧内主体次序
// ============================================================

export const SIDE = { SIDE1: 'side1', AXIS: 'axis', SIDE2: 'side2' }

/** 组数上限：轴只有两侧加轴线三个位置 */
export const MAX_GROUPS = 3

const ISO_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$/

const SIDE_BY_GROUP_INDEX = [SIDE.SIDE1, SIDE.SIDE2, SIDE.AXIS]

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * 算出一份 fact 规范的网格。
 * @returns {{
 *   errors: string[],
 *   columns: Array<{ key, side, actorId?, actorName?, groupIndex? }>,
 *   rows: Array<{ index, cells: Map<string, object> }>,
 *   placements: Map<string, { row, col, key }>,
 *   axisColumnIndex: number,
 *   actorById: Map, groupById: Map, groupIndexById: Map, sourceById: Map,
 *   eventCount: number,
 * }}
 */
export function buildGrid(spec) {
  const errors = []
  const actors = Array.isArray(spec?.actors) ? spec.actors : []
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const sources = Array.isArray(spec?.sources) ? spec.sources : []
  const slots = spec?.slots

  const empty = {
    errors,
    columns: [],
    rows: [],
    placements: new Map(),
    axisColumnIndex: 0,
    actorById: new Map(),
    groupById: new Map(),
    groupIndexById: new Map(),
    sourceById: new Map(),
    eventCount: 0,
  }

  // ---------- 主体清单 ----------
  const actorById = new Map()
  actors.forEach((a, i) => {
    if (!isPlainObject(a)) {
      errors.push(`actors[${i}]: 不是对象`)
      return
    }
    if (!a.id) {
      errors.push(`actors[${i}]: 缺少必填字段 \`id\``)
      return
    }
    if (actorById.has(a.id)) errors.push(`actors[${i}]: id "${a.id}" 重复`)
    actorById.set(a.id, a)
    if (!a.name) errors.push(`actors[${i}] (${a.id}): 缺少必填字段 \`name\``)
  })

  // ---------- 分组清单 ----------
  const groupById = new Map()
  const groupIndexById = new Map()
  if (groups.length > MAX_GROUPS) {
    errors.push(`groups: 最多 ${MAX_GROUPS} 个（轴只有两侧加轴线三个站位），实际 ${groups.length} 个`)
  }
  groups.forEach((g, i) => {
    if (!isPlainObject(g)) {
      errors.push(`groups[${i}]: 不是对象`)
      return
    }
    if (!g.id) {
      errors.push(`groups[${i}]: 缺少必填字段 \`id\``)
      return
    }
    if (groupIndexById.has(g.id)) errors.push(`groups[${i}]: id "${g.id}" 重复`)
    groupById.set(g.id, g)
    groupIndexById.set(g.id, i)
    if (!g.label) errors.push(`groups[${i}] (${g.id}): 缺少必填字段 \`label\``)
  })

  // ---------- 来源表 ----------
  const sourceById = new Map()
  sources.forEach((s, i) => {
    if (!isPlainObject(s)) {
      errors.push(`sources[${i}]: 不是对象`)
      return
    }
    if (!s.id) {
      errors.push(`sources[${i}]: 缺少必填字段 \`id\``)
      return
    }
    if (sourceById.has(s.id)) errors.push(`sources[${i}]: id "${s.id}" 重复`)
    sourceById.set(s.id, s)
    if (!s.type) errors.push(`sources[${i}] (${s.id}): 缺少必填字段 \`type\``)
    if (!s.name) errors.push(`sources[${i}] (${s.id}): 缺少必填字段 \`name\``)
  })

  // ---------- 槽 ----------
  if (!Array.isArray(slots)) {
    errors.push('`slots` 必须是数组（一个槽 = 一个时间点）')
    return { ...empty, actorById, groupById, groupIndexById, sourceById }
  }
  if (slots.length === 0) errors.push('`slots` 不能为空')

  const eventIds = new Set()
  const seenActorsOnSide = { [SIDE.SIDE1]: new Set(), [SIDE.SIDE2]: new Set() }
  /** 摊平后的事件：{ slotIndex, event, side, actorId|null } */
  const flat = []

  slots.forEach((slot, si) => {
    const at = `slots[${si}]`
    if (!isPlainObject(slot)) {
      errors.push(`${at}: 必须是对象，形如 { events: [ … ] }`)
      return
    }
    if (!Array.isArray(slot.events)) {
      errors.push(`${at}.events 必须是数组`)
      return
    }
    if (slot.events.length === 0) errors.push(`${at}.events 不能为空（空槽没有意义）`)

    slot.events.forEach((e, ei) => {
      const eAt = `${at}.events[${ei}]${e?.id ? ` (${e.id})` : ''}`
      if (!isPlainObject(e)) {
        errors.push(`${eAt}: 不是对象`)
        return
      }
      if (!e.id) errors.push(`${eAt}: 缺少必填字段 \`id\``)
      else if (eventIds.has(e.id)) errors.push(`${eAt}: id "${e.id}" 与前面的事件重复`)
      else eventIds.add(e.id)

      if (!e.date) errors.push(`${eAt}: 缺少必填字段 \`date\``)
      else if (!ISO_RE.test(e.date)) {
        errors.push(`${eAt}: \`date\` 不符合 ISO 8601（如 2017-05-02T09:24:03），实际为 "${e.date}"`)
      }
      if (!e.label) errors.push(`${eAt}: 缺少必填字段 \`label\``)

      const ids = Array.isArray(e.actorIds) ? e.actorIds : []
      ids.forEach((id) => {
        if (!actorById.has(id)) errors.push(`${eAt}: actorIds 引用了不存在的 actor "${id}"`)
      })
      if (e.groupId && !groupIndexById.has(e.groupId)) {
        errors.push(`${eAt}: groupId 引用了不存在的 group "${e.groupId}"`)
      }
      const srcIds = Array.isArray(e.sourceIds) ? e.sourceIds : []
      srcIds.forEach((id) => {
        if (!sourceById.has(id)) errors.push(`${eAt}: sourceIds 引用了不存在的 source "${id}"`)
      })

      // ---------- 站位 ----------
      const gi = e.groupId ? groupIndexById.get(e.groupId) : undefined
      let side
      if (ids.length >= 2) {
        side = SIDE.AXIS // 多主体 → 自动落轴线
        if (gi === 0 || gi === 1) {
          errors.push(
            `${eAt}: 事件涉及 ${ids.length} 个主体，按规则应落轴线上，但 groupId 指向了侧别组 "${e.groupId}"，两者矛盾`,
          )
        }
      } else if (e.groupId === undefined || e.groupId === null || e.groupId === '') {
        side = SIDE.AXIS // 不写分组 → 轴线
      } else if (gi === undefined) {
        return // 未知分组，上面已报错
      } else {
        side = SIDE_BY_GROUP_INDEX[gi] ?? SIDE.AXIS // 第 3 组及以后 → 轴线
      }

      if (side !== SIDE.AXIS && ids.length !== 1) {
        errors.push(
          `${eAt}: 写了侧别组 "${e.groupId}"，必须恰好指定 1 个主体（现在是 ${ids.length} 个）；不涉及具体主体的事件请归入轴线组或不写 groupId`,
        )
        return
      }

      const actorId = side !== SIDE.AXIS && ids.length === 1 ? ids[0] : null
      if (actorId && actorById.has(actorId)) seenActorsOnSide[side].add(actorId)

      flat.push({ slotIndex: si, event: e, side, actorId })
    })
  })

  // ---------- 建列 ----------
  // 第 1 侧：在这一侧出现过的主体（按 actors 清单顺序，也就是由内到外的距离次序）
  // 轴线：固定一列（不按主体细分）
  // 第 2 侧：同第 1 侧
  const actorOrder = actors.map((a) => (isPlainObject(a) ? a.id : null)).filter(Boolean)
  const columnsFor = (side) => actorOrder.filter((id) => seenActorsOnSide[side].has(id))

  const columns = []
  // 第 1 侧排在轴线左边：清单里越靠前的主体离轴越近，
  // 而列是从左往右排的，所以这里要倒过来，贴轴的那一列才落在最右。
  columnsFor(SIDE.SIDE1)
    .reverse()
    .forEach((actorId) => {
      columns.push({ key: `${SIDE.SIDE1}:${actorId}`, side: SIDE.SIDE1, actorId, actorName: actorById.get(actorId)?.name })
    })
  const axisColumnIndex = columns.length
  columns.push({ key: SIDE.AXIS, side: SIDE.AXIS })
  columnsFor(SIDE.SIDE2).forEach((actorId) => {
    columns.push({ key: `${SIDE.SIDE2}:${actorId}`, side: SIDE.SIDE2, actorId, actorName: actorById.get(actorId)?.name })
  })

  const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]))

  // ---------- 摆格子 + 撞车检查 ----------
  const rows = slots.map((_, i) => ({ index: i, cells: new Map() }))
  const placements = new Map()
  let eventCount = 0

  flat.forEach(({ slotIndex, event, side, actorId }) => {
    const key = side === SIDE.AXIS ? SIDE.AXIS : `${side}:${actorId}`
    const col = colIndexByKey.get(key)
    if (col === undefined) return // 异常数据，前面已报错

    eventCount += 1
    const row = rows[slotIndex]
    if (row.cells.has(key)) {
      const other = row.cells.get(key)
      errors.push(
        `slots[${slotIndex}]: 同一个槽的同一条车道放了两个事件（"${other.id}" 与 "${event.id}"），一格只能放一个`,
      )
    } else {
      row.cells.set(key, event)
    }
    placements.set(event.id, { row: slotIndex, col, key })
  })

  return {
    errors,
    columns,
    rows,
    placements,
    axisColumnIndex,
    actorById,
    groupById,
    groupIndexById,
    sourceById,
    eventCount,
  }
}
