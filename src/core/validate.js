// ============================================================
//  src/core/validate.js —— 校验门卫（引擎入口第一道工序）
//
//  面向 LLM 生成：错了要能指出"哪个字段不合规"，让 agent 自行修正。
//  各大类的规则由它们自己提供（见 renderers/<type>/schema.js），
//  这里只做信封层校验，然后按 type 查表分发。
// ============================================================

import { validatorOf } from './registry.js'

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

  // 按大类查表分发。各大类的规则由它们自己提供（renderers/<type>/schema.js，
  // 纯 JS，注册在 registry 里），所以这个文件不认识任何一个具体大类。
  const validate = validatorOf(spec.type)
  return validate ? validate(spec) : []
}
