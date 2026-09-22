// ============================================================
//  src/core/registry.js —— 渲染器注册表
//
//  引擎的核心机制：**大类 × 子类 → 渲染器组件**。
//
//  为什么要两级：
//    大类（type，信封层）决定 JSON 长什么样，schema 只规定到这一层。
//    大类之下没有"子类型"字段；子类是**渲染层的划分**：
//    同一个大类的几种画法，各自有各自的渲染规则，但吃同一份 schema。
//
//  由此带出一条硬约束：
//    **任意一份合法的大类 JSON，都必须能用该大类的任意一个子类渲染。**
//    不允许出现"这份数据只有某个子类画得出来"。将来加了新子类，
//    已有的每一份 JSON 立刻就能用它看，数据一个字不改。
//
//  用哪个子类是看图时选的，不在数据里。
// ============================================================

/** type -> Map(kind -> { kind, label, Component })，Map 的插入顺序即子类的展示顺序 */
const registry = new Map()

/**
 * 知识注册表：type -> { validate, layouts }。
 *
 * 和上面那张表的区别：上面注册的是**组件**（.jsx，只有浏览器能加载），
 * 这里注册的是**纯 JS 的规则**（怎么校验、怎么排布）。
 * 分开的原因：Node 侧的 MCP 需要"fact 怎么校验、有哪些画法"，
 * 但它加载不了 .jsx。原先它只能自己手写一份分发表，于是同一个事实写了两处
 * （见 known-issues 第 2 条）。现在两边都从这一张表取。
 */
const knowledge = new Map()

/**
 * 注册某大类的知识。
 * @param type 大类
 * @param k    { validate(spec) => string[], layouts: { kind: buildGraph } }
 */
export function registerKnowledge(type, k) {
  if (!type) throw new Error('registerKnowledge: type 不能为空')
  if (!k?.validate) throw new Error('registerKnowledge: 缺少 validate')
  if (!k?.describe) throw new Error('registerKnowledge: 缺少 describe（给 agent 的字段表）')
  knowledge.set(type, k)
}

/**
 * 取某大类的全部知识。
 * 给 agent 的参考资料都从这里出：字段表（fields/describe）、校验、有哪些画法。
 * 这样加一个新大类时，工具那边一行都不用改。
 */
export function knowledgeOf(type) {
  return knowledge.get(type)
}

/** 已登记知识的大类。用于告诉 agent"目前有哪几类"。 */
export function listKnowledgeTypes() {
  return [...knowledge.entries()].map(([type, k]) => ({ type, label: k.label ?? type }))
}

/** 取某大类的校验函数。没注册就返回 undefined（表示不校验）。 */
export function validatorOf(type) {
  return knowledge.get(type)?.validate
}

/** 取某大类的排布函数。不传 kind（或传了没有的）就给第一个，也就是默认画法。 */
export function layoutOf(type, kind) {
  const layouts = knowledge.get(type)?.layouts
  if (!layouts) return undefined
  if (kind && layouts[kind]) return layouts[kind]
  return Object.values(layouts)[0]
}

/** 某大类有哪几种画法（按注册顺序）。用于 Node 侧报"这个大类有哪些子类"。 */
export function layoutKindsOf(type) {
  return Object.keys(knowledge.get(type)?.layouts ?? {})
}

/**
 * 注册一个子类渲染器。
 * @param type      大类（信封层的 type），如 'fact'
 * @param kind      子类，如 'timeline'
 * @param Component 渲染器组件
 * @param label     子类的中文名，如 '时间图'。不传就用 kind 本身
 */
export function registerRenderer(type, kind, Component, label) {
  if (!type) throw new Error('registerRenderer: type 不能为空')
  if (!kind) throw new Error('registerRenderer: kind 不能为空')
  if (!Component) throw new Error('registerRenderer: Component 不能为空')
  if (!registry.has(type)) registry.set(type, new Map())
  registry.get(type).set(kind, { kind, label: label || kind, Component })
}

/**
 * 取渲染器。
 * 不传 kind（或传了个没注册的）就给该大类的第一个子类，也就是默认画法。
 */
export function getRenderer(type, kind) {
  const kinds = registry.get(type)
  if (!kinds || kinds.size === 0) return undefined
  if (kind && kinds.has(kind)) return kinds.get(kind).Component
  return kinds.values().next().value.Component
}

/** 某大类下有哪些子类，按注册顺序。返回 [{ kind, label }] */
export function listKinds(type) {
  const kinds = registry.get(type)
  if (!kinds) return []
  return [...kinds.values()].map(({ kind, label }) => ({ kind, label }))
}

/** 已注册的大类列表（调试用） */
export function listTypes() {
  return [...registry.keys()]
}
