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
import { listKnowledgeTypes, layoutKindsOf } from '../../src/core/registry.js'

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

/** The types and their kinds, the first kind being the one a diagram opens in */
export function kinds() {
  return Object.fromEntries(listKnowledgeTypes().map(({ type }) => [type, layoutKindsOf(type)]))
}

/** The version of every type and every kind (`antu versions --json`) */
export function versions() {
  return versionsReport(VERSION ?? 'dev')
}
