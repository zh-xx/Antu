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
