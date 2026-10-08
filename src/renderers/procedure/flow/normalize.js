// ============================================================
//  src/renderers/procedure/flow/normalize.js — repair the main-line marks of a procedure (issue 163)
//
//  A model that writes a procedure gets the content right far more often than the `main` marks: an
//  automatic-renewal edge back into the flow marked main (the main line never reaches an end), or two
//  marked edges out of one decision. Both are marks, not content, so they can be put right by code instead
//  of another round with the model.
//
//  What counts as broken is what validation reports (flow/rules.js, "the main line"): more than one marked
//  edge out of a node, or a marked chain from the entry that does not reach an end. Anything else is left
//  exactly as it is, including a spec with no marks at all. Plain JS; it works on the copy it is given.
// ============================================================

import { tEn } from '../../../core/i18n.js'
import { ruleEndIds } from './rules.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Repair the main line of `spec` in place (the caller hands in a copy).
 * @returns {string[]} what was changed, in words an agent can read; empty when nothing was
 */
export function normalizeProcedure(spec) {
  if (!isObj(spec) || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) return []
  const byId = new Map()
  for (const n of spec.nodes) if (isObj(n) && typeof n.id === 'string' && !byId.has(n.id)) byId.set(n.id, n)
  // only edges whose both ends exist take part; validation reports the others
  const edges = spec.edges
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => isObj(e) && byId.has(e.from) && byId.has(e.to))

  const entry = entryOf(byId, edges, ruleEndIds(spec))
  if (entry === undefined) return []

  const problem = mainLineProblem(byId, edges, entry)
  if (!problem) return []

  const path = mainPath(byId, edges, entry)
  if (!path) return []

  const onPath = new Set(path.map(({ index }) => index))
  const changes = [tEn('norm.mainRemarked', { problem, from: entry, to: path[path.length - 1].e.to })]
  for (const { e, index } of edges) {
    const at = `edges[${index}] (${e.from} -> ${e.to})`
    if (onPath.has(index) && e.main !== true) {
      e.main = true
      changes.push(tEn('norm.mainSet', { at }))
    } else if (!onPath.has(index) && e.main === true) {
      delete e.main
      changes.push(tEn('norm.mainCleared', { at }))
    }
  }
  return changes
}

/** The entry the way validation picks it: a start with no incoming edge, else the first node with none */
function entryOf(byId, edges, ruleEnds) {
  const hasIn = new Set(edges.map(({ e }) => e.to))
  const sources = [...byId.keys()].filter((id) => !hasIn.has(id) && !ruleEnds.has(id) && byId.get(id).kind !== 'note')
  return sources.find((id) => byId.get(id).kind === 'start') ?? sources[0]
}

/** Why the marked main line is broken, the way validation would say it; null when it is not */
function mainLineProblem(byId, edges, entry) {
  const mains = new Map()
  for (const { e } of edges) {
    if (e.main !== true) continue
    if (mains.has(e.from)) return tEn('perr.tooManyMain', { id: e.from, n: edges.filter((x) => x.e.from === e.from && x.e.main === true).length })
    mains.set(e.from, e.to)
  }
  if (mains.size === 0) return null
  const seen = new Set()
  for (let at = entry; ; ) {
    seen.add(at)
    if (byId.get(at).kind === 'end') return null
    const next = mains.get(at)
    if (next === undefined || seen.has(next)) return tEn('perr.mainBroken', { id: at })
    at = next
  }
}

/**
 * The path the main line is marked along: from the entry to the normal end (an `end` whose outcome is
 * positive, else any `end`), keeping to the edges already marked wherever it can. A 0-1 shortest path: an
 * edge already marked costs nothing, any other costs one. Ties go to the end that comes first in `nodes`.
 * @returns {{ e, index }[] | null} null when no end can be reached
 */
function mainPath(byId, edges, entry) {
  const cost = new Map([[entry, 0]])
  const via = new Map()
  const deque = [entry]
  while (deque.length) {
    const at = deque.shift()
    for (const edge of edges) {
      if (edge.e.from !== at) continue
      const step = edge.e.main === true ? 0 : 1
      const c = cost.get(at) + step
      if (c < (cost.get(edge.e.to) ?? Infinity)) {
        cost.set(edge.e.to, c)
        via.set(edge.e.to, edge)
        if (step === 0) deque.unshift(edge.e.to)
        else deque.push(edge.e.to)
      }
    }
  }
  const ends = [...byId.values()].filter((n) => n.kind === 'end' && cost.has(n.id))
  const positive = ends.filter((n) => n.outcome === 'positive')
  const pool = positive.length ? positive : ends
  if (!pool.length) return null
  const goal = pool.reduce((best, n) => (cost.get(n.id) < cost.get(best.id) ? n : best)).id

  const path = []
  for (let at = goal; at !== entry; ) {
    const edge = via.get(at)
    path.unshift(edge)
    at = edge.e.from
  }
  return path
}
