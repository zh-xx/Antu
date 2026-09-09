// ============================================================
//  src/core/validate.js —— 校验门卫（引擎入口第一道工序）
//
//  面向 LLM 生成：错了要能指出"哪个字段不合规"，让 agent 自行修正。
//  v0 只做"结构性校验"（存在性/类型/引用完整性），
//  不做严格 JSON Schema（等 schema 稳定后再引入）。
// ============================================================

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

/** 校验 fact 内容层（v0 按 fact-schema-draft 的字段规则） */
function validateFact(spec) {
  const errors = []
  const { events, actors = [], sources = [] } = spec

  if (!Array.isArray(events)) {
    errors.push('`events` 必须是数组')
    return errors
  }
  if (events.length === 0) errors.push('`events` 不能为空')

  const actorIds = new Set(actors.map((a) => a?.id).filter(Boolean))
  const sourceIds = new Set(sources.map((s) => s?.id).filter(Boolean))

  events.forEach((e, i) => {
    const at = `events[${i}]${e?.id ? ` (${e.id})` : ''}`
    if (!e || typeof e !== 'object') {
      errors.push(`${at}: 不是对象`)
      return
    }
    if (!e.id) errors.push(`${at}: 缺少必填字段 \`id\``)
    if (!e.date) errors.push(`${at}: 缺少必填字段 \`date\``)
    else if (!/^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$/.test(e.date)) {
      errors.push(`${at}: \`date\` 不符合 ISO 8601（如 2017-05-02T09:24:03），实际为 "${e.date}"`)
    }
    if (!e.label) errors.push(`${at}: 缺少必填字段 \`label\``)

    // 引用完整性：actorIds / sourceIds 必须能在本图找到
    ;(e.actorIds || []).forEach((id) => {
      if (!actorIds.has(id)) errors.push(`${at}: actorIds 引用了不存在的 actor "${id}"`)
    })
    ;(e.sourceIds || []).forEach((id) => {
      if (!sourceIds.has(id)) errors.push(`${at}: sourceIds 引用了不存在的 source "${id}"`)
    })
  })

  // 主体清单自身的完整性
  actors.forEach((a, i) => {
    if (!a?.id) errors.push(`actors[${i}]: 缺少必填字段 \`id\``)
    if (!a?.name) errors.push(`actors[${i}]: 缺少必填字段 \`name\``)
  })

  return errors
}

/**
 * 校验入口：返回错误数组（空数组 = 通过）
 */
export function validateSpec(spec) {
  const envelopeErrors = validateEnvelope(spec)
  if (envelopeErrors.length) return envelopeErrors

  if (spec.type === 'fact') return validateFact(spec)

  // 其他类型暂未实现校验
  return []
}
