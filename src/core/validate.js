// ============================================================
//  src/core/validate.js —— 校验门卫（引擎入口第一道工序）
//
//  面向 LLM 生成：错了要能指出"哪个字段不合规"，让 agent 自行修正。
//  fact 的排布规则集中在 factGrid.js，这里只做信封层校验后转交。
// ============================================================

import { buildGrid } from './factGrid.js'

/** 校验信封层：所有图类型共有 */
function validateEnvelope(spec) {
  const errors = []
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return ['规范必须是一个 JSON 对象']
  }
  if (!spec.type) errors.push('缺少必填字段 `type`（引擎按它选择渲染器）')
  else if (typeof spec.type !== 'string') errors.push('`type` 必须是字符串')
  if (spec.title !== undefined && typeof spec.title !== 'string') {
    errors.push('`title` 必须是字符串')
  }
  return errors
}

/**
 * 校验入口：返回错误数组（空数组 = 通过）
 */
export function validateSpec(spec) {
  const envelopeErrors = validateEnvelope(spec)
  if (envelopeErrors.length) return envelopeErrors

  if (spec.type === 'fact') return buildGrid(spec).errors

  // 其他类型暂未实现校验
  return []
}
