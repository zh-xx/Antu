// ============================================================
//  tools/api/validate.mjs — the entry of `@zh-xx/antu/validate` (issue #152)
//
//  For the side that makes the JSON: a host whose model writes a spec checks it before it keeps it, and hands
//  the problems (each names its field) back to the model to repair. The same checks, notes and geometry report
//  as the command line and the MCP server (tools/lib/report.mjs), as data rather than text. Node and browser:
//  no files, no network. Bundled by vite.api.config.js into dist-npm/lib/validate.mjs. Contract: spec/embed.md.
// ============================================================

import { validate as problemsOf, notesOf, layoutReport, formatLayoutReport, kindProblem } from '../lib/report.mjs'
import { versionsReport } from '../lib/versions.mjs'
import { knowledgeOf, listKnowledgeTypes, layoutKindsOf } from '../../src/core/registry.js'
import { normalizeSpec } from '../../src/core/normalize.js'
import { tEn } from '../../src/core/i18n.js'

// set by the bundler; a run from the source reads it where the engine does
// eslint-disable-next-line no-undef
const VERSION = typeof __ANTU_VERSION__ === 'undefined' ? null : __ANTU_VERSION__

/**
 * Is the spec valid?
 * @returns {{ ok: boolean, errors: string[], notes: string[] }}  `errors` name their field
 *          (`nodes[2] (n-3): …`); `notes` are what is not an error but the author should see, given only
 *          when there are no errors
 */
export function validate(spec) {
  const errors = problemsOf(spec)
  return { ok: errors.length === 0, errors: [...errors], notes: errors.length ? [] : [...notesOf(spec)] }
}

/**
 * How big the drawing will be, before it is drawn: the geometry report of `antu layout`, as data, with its text.
 * @param {{ kind?: string, orientation?: 'vertical'|'horizontal' }} [options]
 * @returns {{ ok: true, type: string, kind: string, text: string } & object | { ok: false, reason: string, errors?: string[] }}
 */
export function layout(spec, { kind, orientation } = {}) {
  const errors = problemsOf(spec)
  if (errors.length) return { ok: false, reason: 'the spec is not valid', errors: [...errors] }
  const bad = kindProblem(spec, kind)
  if (bad) return { ok: false, reason: bad }
  const report = layoutReport(spec, { kind, orientation })
  return report.ok ? { ...report, text: formatLayoutReport(report) } : report
}

/**
 * Repair what is inconsistent in the marks of a spec but not in its content, and say what was done
 * (issue 163). For a procedure: the main line, when the edges marked `main` do not form one chain from the
 * start to an end. The input is not modified. Call it before `validate` when a model wrote the spec.
 * @returns {{ spec: unknown, changes: string[] }}
 */
export function normalize(spec) {
  return normalizeSpec(spec)
}

/**
 * The field table of one type, the same text `antu_schema` serves. It is generated from the type's own
 * descriptor (registry knowledge), so it cannot disagree with the validator.
 * @param {string} [type]
 * @returns {{ ok: true, text: string } | { ok: false, reason: string }} `reason` names the available types
 */
export function describe(type = 'fact') {
  const k = knowledgeOf(type)
  if (!k) return { ok: false, reason: unknownType(type) }
  return { ok: true, text: k.describe() }
}

/** The wording used when the type asked for does not exist yet (the same as tools/mcp/engine.mjs) */
function unknownType(type) {
  const known = listKnowledgeTypes()
  const list = known.map((t) => `${t.type} (${tEn(t.labelKey)})`).join(', ')
  return `no reference material for type "${type}" yet. Available: ${list || '(none)'}.`
}

/** The types and their kinds, the first kind being the one a diagram opens in */
export function kinds() {
  return Object.fromEntries(listKnowledgeTypes().map(({ type }) => [type, layoutKindsOf(type)]))
}

/** The version of every type and every kind (`antu versions --json`) */
export function versions() {
  return versionsReport(VERSION ?? 'dev')
}
