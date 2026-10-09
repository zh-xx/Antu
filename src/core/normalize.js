// ============================================================
//  src/core/normalize.js — repair what is wrong in the marks of a spec but not in its content (issue 163)
//
//  The entry of `normalize` in `@zh-xx/antu/validate` and `@zh-xx/antu/embed`. Each type that has something
//  to repair supplies it as `normalize` in its knowledge (procedure: the main line, flow/normalize.js); this
//  file only copies the spec and dispatches, like validate.js. A host calls it when it chooses to: nothing in
//  Antu calls it by itself.
// ============================================================

import { knowledgeOf } from './registry.js'

/**
 * @returns {{ spec: unknown, changes: string[] }} a repaired copy (the input is never modified) and what was
 *          changed, in words an agent can read; `changes` is empty when nothing was
 */
export function normalizeSpec(spec) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return { spec, changes: [] }
  const copy = structuredClone(spec)
  const repair = typeof copy.type === 'string' ? knowledgeOf(copy.type)?.normalize : undefined
  return { spec: copy, changes: repair ? [...repair(copy)] : [] }
}
