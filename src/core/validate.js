// ============================================================
//  src/core/validate.js — the validation gate (the engine's first step)
//
//  Aimed at LLM generation: when something is wrong it must name "which field is
//  not compliant", so the agent can correct it itself. Each type supplies its own
//  rules (see renderers/<type>/schema.js); this file does the envelope-layer
//  validation only, then dispatches by looking the type up.
// ============================================================

import { validatorOf } from './registry.js'
import { tEn } from './i18n.js'

/** Validate the envelope layer: shared by all diagram types */
function validateEnvelope(spec) {
  const errors = []
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return [tEn('err.specNotObject')]
  }
  if (!spec.type) errors.push(tEn('err.envelopeTypeRequired'))
  else if (typeof spec.type !== 'string') errors.push(tEn('err.envelopeTypeString'))
  if (spec.title !== undefined && typeof spec.title !== 'string') {
    errors.push(tEn('err.envelopeTitleString'))
  }
  return errors
}

/**
 * Validation entry point: returns an array of errors (an empty array = pass)
 */
export function validateSpec(spec) {
  const envelopeErrors = validateEnvelope(spec)
  if (envelopeErrors.length) return envelopeErrors

  // Dispatch by looking the type up. Each type supplies its own rules
  // (renderers/<type>/schema.js, plain JS, registered in the registry), so this
  // file knows no concrete type.
  const validate = validatorOf(spec.type)
  return validate ? validate(spec) : []
}
