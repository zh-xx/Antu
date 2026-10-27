// ============================================================
//  tools/lib/report.mjs — what an agent is told about a diagram before it is drawn
//
//  Validation, the notes that are not errors, the geometry report, and the texts built from them. Pure
//  computation on the registry (no files, no browser), so it is shared by the MCP server (tools/mcp/) and
//  the command line in the skill (tools/cli/): both say the same words, from one place.
// ============================================================

import { knowledgeOf, layoutOf as layoutFromRegistry, layoutKindsOf } from '../../src/core/registry.js'
// Registers the knowledge for each type (pure JS, no components). With it, validation and layout both
// come from the registry.
import '../../src/renderers/index.js'
import { validateSpec } from '../../src/core/validate.js'
import { PAPER_LEVELS, isPaperLevel, paperOf, sheetsOf } from '../../src/core/paper.js'

/**
 * The default assumption for canvas size: used to compute the "fit zoom".
 * Comes from `paperOf('screen')` (issue 123): the same quantity print and future CLI/MCP share.
 */
export const CANVAS = paperOf('screen').canvas

// The layout functions no longer keep their own list: they go through the registry
// (registered in renderers/index.js). There used to be a hand-written LAYOUTS here
// duplicating the registry, so adding a sub-type meant changing two places.

/**
 * Resolve an optional paper level to the canvas the geometry report uses.
 * Omitting `paper` (or passing undefined) is `screen`. A bad level is a soft failure like a bad kind.
 * @param {'screen'|'a4l'|'a4p'|undefined} paper
 * @returns {{ ok: true, paper: 'screen'|'a4l'|'a4p', canvas: { width: number, height: number } } | { ok: false, reason: string }}
 */
function canvasForPaper(paper) {
  const level = paper === undefined || paper === null || paper === '' ? 'screen' : paper
  if (!isPaperLevel(level)) {
    return {
      ok: false,
      reason: `unknown paper level ${JSON.stringify(paper)}: use one of ${PAPER_LEVELS.join(', ')}`,
    }
  }
  return { ok: true, paper: level, canvas: paperOf(level).canvas }
}

/** Validation. Returns errors one by one (already in Chinese, for humans and agents) */
export function validate(spec) {
  try {
    return validateSpec(spec)
  } catch (e) {
    return [`the validation layer itself threw: ${e.message}`]
  }
}

/**
 * What validation does not call an error but the author should see (for fact: a slot whose date is
 * wholly earlier than the one before). Each type supplies its own (knowledge.notes).
 */
export function notesOf(spec) {
  try {
    return knowledgeOf(spec?.type)?.notes?.(spec) ?? []
  } catch (e) {
    return [`the notes layer itself threw: ${e.message}`]
  }
}

/**
 * Geometry report: compute only, no rendering.
 * This is the main basis on which an agent judges whether the diagram will be too wide
 * or too empty.
 *
 * What is counted belongs to the type (time slots and columns for a fact diagram; nodes,
 * layers and rules for a procedure), so the report itself comes from the type's knowledge
 * (renderers/<type>/schema.js); this only dispatches. It used to count fact's slots for
 * every type, and a procedure came back as "0 events / 0 time slots".
 *
 * `paper` (issue 123): optional `screen` | `a4l` | `a4p`. Default `screen` — same canvas as before.
 * CLI/MCP flags that pass this through are a later slice; the engine accepts it now.
 */
export function layoutReport(spec, { orientation, fields, kind: asked, paper } = {}) {
  const type = spec?.type
  // Ask the registry which rendering kinds this type has: the one asked for, else the first (the default).
  // (This used to read spec?.kindHint, a field the schema does not have.)
  const kinds = layoutKindsOf(type)
  if (asked && !kinds.includes(asked)) {
    return { ok: false, reason: `"${asked}" is not a kind of ${type}: ${kinds.join(', ') || 'it has none'}` }
  }
  const sheet = canvasForPaper(paper)
  if (!sheet.ok) return sheet
  const kind = asked ?? kinds[0] ?? null
  const layout = layoutFromRegistry(type, kind)
  const k = knowledgeOf(type)
  if (!layout || !k?.report) {
    return { ok: false, reason: `no geometry computation for type="${type}" kind="${kind}" yet` }
  }
  return {
    ok: true,
    type,
    kind,
    ...k.report(spec, layout, { orientation, fields, kind, canvas: sheet.canvas }),
    paper: sheet.paper,
    canvas: sheet.canvas,
  }
}

/** Why `kind` cannot be drawn for this spec ('' when it can, or when none was asked for) */
export function kindProblem(spec, kind) {
  if (!kind) return ''
  const kinds = layoutKindsOf(spec?.type)
  return kinds.includes(kind) ? '' : `"${kind}" is not a kind of ${spec?.type}: ${kinds.join(', ') || 'it has none'}`
}

/** Turn the geometry report into a short human-readable text (the part the tool returns to an agent) */
export function formatLayoutReport(r) {
  if (!r.ok) return r.reason
  const text = knowledgeOf(r.type).formatReport(r)
  const sheets = sheetsLine(r)
  return sheets ? `${text}\n${sheets}` : text
}

/**
 * How many sheets of the reported paper level the picture takes, printed at full size (issue 123). One line, added
 * here rather than in each type's formatter: every type already puts its content size in `text.size`.
 * Nothing is said for `screen`, where "sheets" has no meaning.
 */
function sheetsLine(r) {
  if (!r.paper || r.paper === 'screen') return ''
  const { across, down, total } = sheetsOf(r.text?.size, r.canvas)
  if (!total) return ''
  const sheet = `${r.canvas.width}×${r.canvas.height}`
  if (total === 1) return `Sheets at full size: one, on ${r.paper} (${sheet}).`
  return (
    `Sheets at full size: ${across} across × ${down} down = ${total} on ${r.paper} (${sheet}) — ` +
    'the whole picture does not fit one sheet, and printing today fits it onto one instead of breaking it.'
  )
}

/**
 * The text of `antu_validate`: passed (with the notes that are not errors) or the numbered problems.
 * @returns {{ ok: boolean, text: string }}
 */
export function validationMessage(spec) {
  const errors = validate(spec)
  if (errors.length === 0) {
    // Not errors, but not silence either: e.g. slots whose dates contradict their order
    const notes = notesOf(spec)
    const head = 'Validation passed.'
    return { ok: true, text: notes.length ? `${head}\n\n${notes.length} note(s), not errors:\n${notes.map((n) => `  - ${n}`).join('\n')}` : head }
  }
  const lines = errors.map((e, i) => `${i + 1}. ${e}`)
  return { ok: false, text: `Validation failed, ${errors.length} problem(s):\n\n${lines.join('\n')}` }
}

/** The text of `antu_layout`: the geometry report, or why there is none yet */
export function layoutMessage(spec, { orientation, fields, kind, paper } = {}) {
  const errors = validate(spec)
  if (errors.length > 0) {
    return { ok: false, text: `Validation has not passed yet; fix these before looking at the geometry:\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}` }
  }
  const report = layoutReport(spec, { orientation, fields, kind, paper })
  return report.ok ? { ok: true, text: formatLayoutReport(report) } : { ok: false, text: report.reason }
}

/**
 * What to look for in a screenshot of the diagram: what validation cannot see. One text for `antu_preview` (MCP)
 * and `preview` (the command line in the skill), so the two cannot come to say different things.
 */
export const PREVIEW_CHECK =
  'Passing validation does not mean it looks good. Look at the picture for what validation cannot see: are the cards ' +
  'or nodes crowded together, is the text too small to read, does a line run through a card, is the whole diagram ' +
  'mostly empty, are headings cut off. If it does not look right, change the JSON and look again.'
