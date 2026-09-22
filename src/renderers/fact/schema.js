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

export const factKnowledge = {
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
