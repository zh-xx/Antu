// ============================================================
//  src/core/validate.js — the validation gate (the engine's first step)
//
//  Aimed at LLM generation: when something is wrong it must name "which field is
//  not compliant", so the agent can correct it itself. Each type supplies its own
//  rules (see renderers/<type>/schema.js); this file does the envelope-layer
//  validation only, then dispatches by looking the type up.
// ============================================================

import { validatorOf, knowledgeOf, listKnowledgeTypes, layoutKindsOf } from './registry.js'
import { checkSpecVersion } from './specVersion.js'
import { tVal, withValidateLang } from './i18n.js'

/**
 * A `type` no type is registered under. It used to pass with no error (there was no validator to run), so a
 * spec that can never be drawn was "valid": a page then said "no renderer", and a mounted diagram never got
 * drawn and never failed either (issue 152). The likeliest slip is a way of drawing written as the type
 * (`"type": "flow"`), so that one names the type it belongs to.
 */
function unknownType(type) {
  const types = listKnowledgeTypes().map((t) => t.type)
  const owner = types.find((t) => layoutKindsOf(t).includes(type))
  if (owner) return tVal('err.envelopeTypeIsKind', { type, owner })
  return tVal('err.envelopeTypeUnknown', { type, list: types.join(' / ') || '(none registered)' })
}

/** Validate the envelope layer: shared by all diagram types */
function validateEnvelope(spec) {
  const errors = []
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return [tVal('err.specNotObject')]
  }
  if (!spec.type) errors.push(tVal('err.envelopeTypeRequired'))
  else if (typeof spec.type !== 'string') errors.push(tVal('err.envelopeTypeString'))
  if (spec.title !== undefined && typeof spec.title !== 'string') {
    errors.push(tVal('err.envelopeTitleString'))
  }
  if (typeof spec.type === 'string' && spec.type) {
    if (!knowledgeOf(spec.type)) return [...errors, unknownType(spec.type)]
    const bad = checkSpecVersion(spec, knowledgeOf(spec.type)?.specVersion)
    if (bad) errors.push(tVal(bad.key, bad.params))
  }
  return errors
}

/**
 * Validation entry point: returns an array of errors (an empty array = pass).
 * @param {object} [options]
 * @param {'zh'|'en'} [options.lang]  host UI language for messages; default English for agents (issue 166)
 */
export function validateSpec(spec, { lang } = {}) {
  return withValidateLang(lang, () => {
    const envelopeErrors = validateEnvelope(spec)
    if (envelopeErrors.length) return envelopeErrors

    // Dispatch by looking the type up. Each type supplies its own rules
    // (renderers/<type>/schema.js, plain JS, registered in the registry), so this
    // file knows no concrete type.
    const validate = validatorOf(spec.type)
    return validate ? validate(spec) : []
  })
}
