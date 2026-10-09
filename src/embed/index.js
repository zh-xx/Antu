// ============================================================
//  src/embed/index.js — the entry of `@zh-xx/antu/embed` (issue 152)
//
//  Everything a host's page needs to draw diagrams in its own window: `mount`, and the validation the
//  diagram itself runs, so a host can check a spec before it mounts it. Built by vite.embed.config.js into
//  one ES module with React, React Flow and the stylesheet inside. The contract is in spec/embed.md.
// ============================================================

// the knowledge of every type and the component of every kind; without it nothing draws and every spec "passes"
import '../renderers/components.js'
import { validateSpec } from '../core/validate.js'
import { listKinds } from '../core/registry.js'
import { normalizeSpec } from '../core/normalize.js'

export { mount } from './mount.js'

/**
 * Check a spec the way the diagram checks it before drawing.
 * @returns {{ ok: boolean, errors: string[] }}  each error names its field (for example `nodes[2] (n-3): …`)
 */
export function validate(spec) {
  const errors = validateSpec(spec)
  return { ok: errors.length === 0, errors: [...errors] }
}

/**
 * Repair what is inconsistent in the marks of a spec but not in its content (a procedure's main line), and
 * say what was done. The input is not modified. The same as `normalize` in `@zh-xx/antu/validate`.
 * @returns {{ spec: unknown, changes: string[] }}
 */
export function normalize(spec) {
  return normalizeSpec(spec)
}

/** The kinds a type can be drawn in, the first being the one it opens in */
export function kindsOf(type) {
  return listKinds(type).map((k) => k.kind)
}
