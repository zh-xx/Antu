// ============================================================
//  src/core/registry.js —— 渲染器注册表
//
//  引擎的核心机制：type → 渲染器组件。
//  新增图类型 = 注册一个新渲染器，核心本体不动。
// ============================================================

const registry = new Map()

/** 注册一个图类型的渲染器 */
export function registerRenderer(type, Component) {
  if (!type) throw new Error('registerRenderer: type 不能为空')
  registry.set(type, Component)
}

/** 按 type 取渲染器（取不到返回 undefined） */
export function getRenderer(type) {
  return registry.get(type)
}

/** 当前已注册的图类型列表（调试用） */
export function listTypes() {
  return [...registry.keys()]
}
