// ============================================================
//  src/renderers/fact/schema.js —— 事实图对外提供的"知识"
//
//  这个文件回答两件事，都是**纯 JS**（不含组件，所以 Node 和 MCP 能直接 import）：
//    1. 一份 fact 合不合法
//    2. 这个大类有哪几种画法，各自的排布函数是什么
//
//  为什么单独一个文件：注册表把"知识"和"组件"分成两套。
//  组件是 .jsx，只有浏览器能加载；MCP 需要的是规则，加载不了组件。
//  分开之后，MCP 不用再自己手写一份分发表（见 known-issues 第 2 条）。
//
//  注意：**校验规则不在这里**。规则只有一份，在 timeline/grid.js（排的过程中顺手收错误），
//  这里只是把它包一层对外接口，一行都不重复。
// ============================================================

import { buildGrid } from './timeline/grid.js'
import { buildFactGraph } from './timeline/layout.js'

/**
 * 字段元数据：**给 agent 那份参考资料从这里生成**，不是手抄的。
 *
 * 为什么要元数据而不是手写文档：这个项目已经吃过四次"同一件事写两处然后走偏"
 * 的苦（类名撞车、1.12 两份、MCP 分发表、HTML 模板两份）。
 * 再手抄一份给 agent 的规则就是第五次。
 *
 * req  = 必填；ty = 类型；note = 一句话说明（用 agent 能直接用的话写）
 *
 * 注意：这里只列**字段级**的规则。跨字段的规则（引用完整性、时段不能倒着走、
 * 一个主体只能在一侧、一格一事件）不在这张表里，它们由校验器在运行时逐条报出。
 * 见 spec/agent-guide.md 的说明。
 */
export const FACT_FIELDS = {
  信封层: [
    { name: 'type', req: '是', ty: 'string', note: '固定填 "fact"' },
    { name: 'title', req: '是', ty: 'string', note: '图的标题，显示在左上角' },
  ],
  主体_actors: [
    { name: 'id', req: '是', ty: 'string', note: '图内唯一，事件用 actorIds 引用它' },
    { name: 'name', req: '是', ty: 'string', note: '显示名，如"华远贸易"' },
    { name: 'role', req: '否', ty: 'string', note: '诉讼地位，如"原告"' },
  ],
  分组_groups: [
    { name: 'id', req: '是', ty: 'string', note: '事件用 groupId 引用它' },
    { name: 'label', req: '是', ty: 'string', note: '列标题，如"按约定履行"' },
    { name: '', req: '', ty: '', note: '最多 3 个：第 1 个在左（上）、第 2 个在右（下）、第 3 个在轴线' },
  ],
  来源_sources: [
    { name: 'id', req: '是', ty: 'string', note: '事件用 sourceIds 引用它' },
    { name: 'type', req: '是', ty: 'string', note: 'contract / evidence / judgment / transcript 等' },
    { name: 'name', req: '是', ty: 'string', note: '材料名，如"电梯间监控视频"' },
    { name: 'loc', req: '否', ty: 'object', note: '定位，如 { file, page } 或 { file, timestamp }' },
    { name: 'quote', req: '否', ty: 'string', note: '原文摘录，点开卡片时显示' },
  ],
  时间槽_slots: [
    { name: 'events', req: '是', ty: 'array', note: '这个时间点里的事件，不能为空数组' },
    { name: '', req: '', ty: '', note: '数组顺序就是时间先后；date 只用来显示，不决定顺序' },
  ],
  事件_events: [
    { name: 'id', req: '是', ty: 'string', note: '图内唯一' },
    { name: 'date', req: '是', ty: 'string', note: 'ISO 8601。能精确到秒就写到秒，只知到日就写到日' },
    { name: 'label', req: '是', ty: 'string', note: '卡片标题，一行约 20 字、最多两行' },
    { name: 'dateEnd', req: '否', ty: 'string', note: '持续事件给结束时刻，必须不早于 date' },
    { name: 'approx', req: '否', ty: 'boolean', note: '时间非精确（估计值/推算值），图上显示"约"' },
    { name: 'dateNote', req: '否', ty: 'string', note: '说明时间为何非精确、怎么来的' },
    { name: 'summary', req: '否', ty: 'string', note: '卡片标题下那一行，约 22 字' },
    { name: 'detail', req: '否', ty: 'string', note: '点开卡片后展开的详情' },
    { name: 'actorIds', req: '否', ty: 'string[]', note: '涉及的主体。给 2 个以上时这个事件落轴线' },
    { name: 'groupId', req: '否', ty: 'string', note: '决定这个事件落在哪一侧' },
    { name: 'sourceIds', req: '否', ty: 'string[]', note: '依据哪些材料' },
  ],
  视角_views: [
    { name: 'label', req: '是', ty: 'string', note: '视角名，显示在下拉里' },
    { name: 'splitBy', req: '是', ty: '"actor" | "group"', note: '按主体分侧还是按分组分侧' },
    { name: 'side1 / side2', req: '否', ty: 'object', note: '{ label, actors: [...] }。splitBy=actor 时要用' },
    { name: 'axis', req: '否', ty: 'object', note: '{ label }。轴线那一列的标题' },
    { name: '', req: '', ty: '', note: '不写 views 也可以，引擎会给一个"全体"视角' },
  ],
}

/**
 * 把字段元数据渲染成一段紧凑的文本，给 agent 看。
 * 这个函数的存在意味着：**参考资料与代码同源**，不会各写一份然后走偏。
 */
export function describeFactSchema() {
  const lines = ['fact（事实图）的字段。带"是"的必填。', '']
  for (const [group, rows] of Object.entries(FACT_FIELDS)) {
    lines.push(`【${group.replace('_', ' ')}】`)
    for (const r of rows) {
      if (!r.name) {
        lines.push(`  · ${r.note}`)
        continue
      }
      lines.push(`  ${r.name.padEnd(12)} ${r.req.padEnd(2)} ${r.ty.padEnd(15)} ${r.note}`)
    }
    lines.push('')
  }
  lines.push('跨字段的规则（引用是否悬空、时段是否倒着走、一个主体是否同时出现在两侧、')
  lines.push('同一时间点的同一车道是否放了两条事件）不列在上面：')
  lines.push('写完调 antu_validate，它会逐条告诉你哪里不对、怎么改。')
  return lines.join('\n')
}

export const factKnowledge = {
  /** 大类的名字，工具里报"目前有哪几类"要用 */
  label: '事实图',

  /**
   * 字段元数据与它的渲染函数。
   * 放进 knowledge 而不是各自散着，是为了让注册表能**按大类**取到：
   * MCP 的 antu_schema 传 type 就能拿到对应大类的字段表，
   * 不必像原先那样把 fact 写死在工具里。
   */
  fields: FACT_FIELDS,
  describe: describeFactSchema,

  /**
   * 校验一份 fact 规范，返回错误数组。
   * 规则在 timeline/grid.js：**校验与排布共用同一份计算**，两处不会各说各话。
   */
  validate: (spec) => buildGrid(spec).errors,

  /** 事实图有哪几种画法。目前只有时间图。 */
  layouts: {
    timeline: buildFactGraph,
  },
}
