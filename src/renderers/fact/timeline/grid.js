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

import { SUMMARY_MAX } from '../cardGeometry.js'

export const SIDE = { SIDE1: 'side1', AXIS: 'axis', SIDE2: 'side2' }

/** 组数上限：轴只有两侧加轴线三个位置 */
const MAX_GROUPS = 3

/**
 * 内置的缺省视角。数据里不写 `views` 时就用它，行为与加视角之前完全一致：
 * 按分组分侧，不按主体筛。
 */
const DEFAULT_VIEW = { label: '全体', splitBy: 'group' }

/** 这份数据有哪些视角。不写就给一个内置的。 */
export function viewsOf(spec) {
  const list = Array.isArray(spec?.views) ? spec.views.filter(isPlainObject) : []
  return list.length > 0 ? list : [DEFAULT_VIEW]
}

/** 视角某一侧声明的主体清单（去重保序，只认字符串 id） */
function viewActors(view, side) {
  const a = view?.[side]?.actors
  if (!Array.isArray(a)) return []
  return [...new Set(a.filter((x) => typeof x === 'string'))]
}

/** 视角某一侧的标题：按主体分侧时取自视角，按分组分侧时取自 groups */
function sideLabelsOf(view, groups) {
  if (view.splitBy === 'actor') {
    return {
      [SIDE.SIDE1]: view?.side1?.label ?? '',
      [SIDE.SIDE2]: view?.side2?.label ?? '',
      [SIDE.AXIS]: view?.axis?.label ?? '',
    }
  }
  return {
    [SIDE.SIDE1]: groups[0]?.label ?? '',
    [SIDE.SIDE2]: groups[1]?.label ?? '',
    [SIDE.AXIS]: groups[2]?.label ?? '',
  }
}

const ISO_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$/

/**
 * 两个 ISO 时间谁在前。
 * 比到两者共同的长度为止：ISO 8601 的字符串按字典序比就是按时间比，
 * 但精度可能不同（一个到秒、一个只到日），只比共同部分才不会误判。
 * 例如 "2017-05-02" 与 "2017-05-02T09:24:16" 共同部分相等，不算谁早。
 */
function isBefore(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const n = Math.min(a.length, b.length)
  return a.slice(0, n) < b.slice(0, n)
}

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
export function buildGrid(spec, view) {
  const effectiveView = isPlainObject(view) ? view : viewsOf(spec)[0]
  const byActor = effectiveView.splitBy === 'actor'
  const in1 = viewActors(effectiveView, 'side1')
  const in2 = viewActors(effectiveView, 'side2')

  const errors = []
  const actors = Array.isArray(spec?.actors) ? spec.actors : []
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const sources = Array.isArray(spec?.sources) ? spec.sources : []
  const slots = spec?.slots

  const empty = {
    errors,
    view: effectiveView,
    sideLabels: { [SIDE.SIDE1]: '', [SIDE.SIDE2]: '', [SIDE.AXIS]: '' },
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

  // ---------- 视角清单 ----------
  // 只校验结构（引用是否存在、两侧是否重叠），不管当前选中哪个视角。
  // 事件能不能摆下取决于当前视角，那部分在下面按当前视角判。
  if (spec?.views !== undefined && spec?.views !== null) {
    if (!Array.isArray(spec.views)) {
      errors.push('`views` 必须是数组')
    } else {
      spec.views.forEach((v, vi) => {
        const vAt = `views[${vi}]`
        if (!isPlainObject(v)) {
          errors.push(`${vAt}: 必须是对象`)
          return
        }
        if (!v.label) errors.push(`${vAt}: 缺少必填字段 \`label\``)
        if (v.splitBy !== 'actor' && v.splitBy !== 'group') {
          errors.push(
            `${vAt}: \`splitBy\` 只能是 "actor"（按主体分侧）或 "group"（按分组分侧），实际为 "${v.splitBy}"`,
          )
        }
        if (v.splitBy === 'actor') {
          const a1 = viewActors(v, 'side1')
          const a2 = viewActors(v, 'side2')
          ;[...a1, ...a2].forEach((id) => {
            if (!actorById.has(id)) errors.push(`${vAt}: 引用了不存在的 actor "${id}"`)
          })
          const both = a1.filter((id) => a2.includes(id))
          if (both.length > 0) {
            errors.push(`${vAt}: 主体 ${both.join('、')} 同时出现在两侧，一个主体只能在一侧`)
          }
        }
      })
    }
  }

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

      // dateEnd 是可选字段，但一旦写了就必须合法，否则卡片上那行时间会显示乱码
      if (e.dateEnd !== undefined && e.dateEnd !== null) {
        if (typeof e.dateEnd !== 'string' || !ISO_RE.test(e.dateEnd)) {
          errors.push(
            `${eAt}: \`dateEnd\` 不符合 ISO 8601（如 2017-05-02T09:26:24），实际为 "${e.dateEnd}"`,
          )
        } else if (isBefore(e.dateEnd, e.date)) {
          errors.push(`${eAt}: \`dateEnd\` (${e.dateEnd}) 早于 \`date\` (${e.date})，时段不能倒着走`)
        }
      }

      // summary 是卡片上的一行补充，超过一行卡片就放不下了
      if (e.summary !== undefined && e.summary !== null) {
        if (typeof e.summary !== 'string') {
          errors.push(`${eAt}: \`summary\` 必须是字符串`)
        } else if ([...e.summary].length > SUMMARY_MAX) {
          errors.push(
            `${eAt}: \`summary\` 超过 ${SUMMARY_MAX} 字（实际 ${[...e.summary].length} 字），卡片一行放不下；要么缩短，要么改写成 detail`,
          )
        }
      }

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
      // 两种看法：
      //   按主体（视角）：谁做的摆谁那边，跨两侧或一侧多人一起做的落轴线
      //   按分组（数据）：groupId 指向哪一组就摆哪一侧，涉及 ≥2 主体落轴线
      const gi = e.groupId ? groupIndexById.get(e.groupId) : undefined
      let side
      let actorId = null

      if (byActor) {
        // 视角声明了主体，就只显示与这些主体有关的事件（没主体的事件是客观事实，照常显示）。
        // 视角两侧都空（"只看时间先后"）时不做筛选，全部落轴线。
        const inScope = [...in1, ...in2]
        if (
          inScope.length > 0 &&
          ids.length > 0 &&
          !ids.some((id) => inScope.includes(id))
        ) {
          return
        }
        if (ids.length === 1 && in1.includes(ids[0])) {
          side = SIDE.SIDE1
          actorId = ids[0]
        } else if (ids.length === 1 && in2.includes(ids[0])) {
          side = SIDE.SIDE2
          actorId = ids[0]
        } else {
          side = SIDE.AXIS // 没主体、跨两侧、或一侧多人一起做的事
        }
      } else if (ids.length >= 2) {
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

      if (!byActor && side !== SIDE.AXIS && ids.length !== 1) {
        errors.push(
          `${eAt}: 写了侧别组 "${e.groupId}"，必须恰好指定 1 个主体（现在是 ${ids.length} 个）；不涉及具体主体的事件请归入轴线组或不写 groupId`,
        )
        return
      }

      if (!byActor && side !== SIDE.AXIS && ids.length === 1) actorId = ids[0]
      if (actorId && actorById.has(actorId)) seenActorsOnSide[side].add(actorId)

      flat.push({ slotIndex: si, event: e, side, actorId })
    })
  })

  // ---------- 建列 ----------
  // 列的**先后次序一律由图级 actors 清单决定**（靠前的贴近轴线），两个模式都一样。
  // 视角只回答"谁在哪一侧"，不回答"谁在内谁在外"：一个意思一个地方说。
  // 按主体分侧时，某一列没有事件也保留（空列本身是信息，这一方在这类事上没有动作）；
  // 按分组分侧时，列取"在这一侧出现过的主体"。
  const actorOrder = actors.map((a) => (isPlainObject(a) ? a.id : null)).filter(Boolean)
  const columnsFor = (side) =>
    byActor
      ? actorOrder.filter((id) => viewActors(effectiveView, side).includes(id))
      : actorOrder.filter((id) => seenActorsOnSide[side].has(id))

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
    view: effectiveView,
    sideLabels: sideLabelsOf(effectiveView, groups),
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
