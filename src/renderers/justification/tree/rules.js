// ============================================================
//  src/renderers/justification/tree/rules.js — validation for justification
//
//  This file **answers only "is the data correct"**: it does not lay out and does not compute
//  coordinates. Same split as procedure's and relationship's rules.js.
//
//  The rule list is spec/justification/schema-draft.md §5: errors 1 to 12 stop the drawing, hints
//  13 to 18 never do. Plain JS, no React, so the Node side (MCP) and the unit tests can import it.
// ============================================================

import { tEn } from '../../../core/i18n.js'

/** The six node kinds (spec §4.1) */
export const NODE_KINDS = ['conclusion', 'norm', 'element', 'fact', 'inference', 'judgement']
/** The stance of a link (spec §4.3) */
export const STANCES = ['for', 'against', 'basis']
/** Kinds that can hold or be rejected; a fact is found, a norm applies */
export const HOLDS_KINDS = ['conclusion', 'element', 'inference', 'judgement']

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])

/** The stance of a link, `for` when it does not say */
export const stanceOf = (link) => link?.stance ?? 'for'

/**
 * Validate a justification spec, returning an array of errors (an empty array = pass). Every error
 * carries the field path and the node id, so the agent can correct it directly.
 */
export function validateJustification(spec) {
  const errors = []
  if (!isObj(spec)) return [tEn('err.specNotObject')]

  // Rule 1: the two lists that make a diagram
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) errors.push(tEn('jerr.nodesEmpty'))
  if (!Array.isArray(spec.links) || spec.links.length === 0) errors.push(tEn('jerr.linksEmpty'))
  if (errors.length) return errors

  if (spec.speaker !== undefined && (typeof spec.speaker !== 'string' || !spec.speaker.trim())) {
    errors.push(tEn('jerr.mustBeString', { at: 'envelope', field: 'speaker' }))
  }

  const groupIds = new Set()
  if (spec.groups !== undefined) {
    if (!Array.isArray(spec.groups)) {
      errors.push(tEn('jerr.notArray', { field: 'groups' }))
    } else {
      spec.groups.forEach((g, i) => {
        const at = `groups[${i}]` + (isObj(g) && g.id ? ` (${g.id})` : '')
        if (!isObj(g)) return void errors.push(tEn('jerr.notObject', { at: `groups[${i}]` }))
        if (!g.id || typeof g.id !== 'string') errors.push(tEn('jerr.required', { at, field: 'id' }))
        else if (groupIds.has(g.id)) errors.push(tEn('jerr.duplicateId', { at, id: g.id, what: 'group' }))
        else groupIds.add(g.id)
        if (!g.label || typeof g.label !== 'string') errors.push(tEn('jerr.required', { at, field: 'label' }))
      })
    }
  }
  const sourceIds = new Set(list(spec.sources).filter(isObj).map((s) => s.id))

  // ── nodes (rules 2, 3, 7, 8, 9) ──
  const nodeById = new Map()
  spec.nodes.forEach((n, i) => {
    if (!isObj(n)) return void errors.push(tEn('jerr.notObject', { at: `nodes[${i}]` }))
    const at = `nodes[${i}]` + (n.id ? ` (${n.id})` : '')
    if (!n.id || typeof n.id !== 'string') {
      errors.push(tEn('jerr.required', { at, field: 'id' }))
      return
    }
    if (nodeById.has(n.id)) errors.push(tEn('jerr.duplicateId', { at, id: n.id, what: 'node' }))
    else nodeById.set(n.id, n)
    if (!NODE_KINDS.includes(n.kind)) {
      errors.push(tEn('jerr.badNodeKind', { at, value: String(n.kind), allowed: NODE_KINDS.join(' / ') }))
    }
    if (!n.label || typeof n.label !== 'string' || !n.label.trim()) errors.push(tEn('jerr.required', { at, field: 'label' }))
    if (n.detail !== undefined && typeof n.detail !== 'string') errors.push(tEn('jerr.mustBeString', { at, field: 'detail' }))
    if (n.groupId !== undefined && !groupIds.has(n.groupId)) {
      errors.push(tEn('jerr.badRef', { at, field: 'groupId', kind: 'group', id: String(n.groupId) }))
    }
    for (const id of list(n.sourceIds)) {
      if (!sourceIds.has(id)) errors.push(tEn('jerr.badRef', { at, field: 'sourceIds', kind: 'source', id: String(id) }))
    }
    // Rule 8: holds is yes or no, and only where a statement can hold
    if (n.holds !== undefined) {
      if (n.holds !== 'yes' && n.holds !== 'no') errors.push(tEn('jerr.badHolds', { at, value: String(n.holds) }))
      else if (!HOLDS_KINDS.includes(n.kind)) errors.push(tEn('jerr.holdsNotHere', { at, kind: String(n.kind), kinds: HOLDS_KINDS.join(' / ') }))
    }
    // Rule 9: a date belongs on a fact and is a date
    if (n.date !== undefined) {
      if (n.kind !== 'fact') errors.push(tEn('jerr.dateNotHere', { at, kind: String(n.kind) }))
      else if (typeof n.date !== 'string' || !ISO_DATE_TIME.test(n.date)) errors.push(tEn('jerr.badDate', { at, value: String(n.date) }))
    }
  })

  // ── links (rules 4, 5, 6) ──
  const seen = new Set()
  spec.links.forEach((k, i) => {
    if (!isObj(k)) return void errors.push(tEn('jerr.notObject', { at: `links[${i}]` }))
    const at = `links[${i}]` + (typeof k.from === 'string' && typeof k.to === 'string' ? ` (${k.from} -> ${k.to})` : '')
    for (const end of ['from', 'to']) {
      if (typeof k[end] !== 'string' || !nodeById.has(k[end])) errors.push(tEn('jerr.badEnd', { at, end, id: String(k[end]) }))
    }
    if (typeof k.from === 'string' && k.from === k.to) errors.push(tEn('jerr.selfLink', { at, id: k.from }))
    const stance = stanceOf(k)
    if (!STANCES.includes(stance)) {
      errors.push(tEn('jerr.badStance', { at, value: String(k.stance), allowed: STANCES.join(' / ') }))
    } else if (stance === 'basis' && nodeById.get(k.from)?.kind !== 'norm') {
      errors.push(tEn('jerr.basisNotNorm', { at, kind: String(nodeById.get(k.from)?.kind) }))
    }
    if (typeof k.from === 'string' && typeof k.to === 'string') {
      const key = [k.from, k.to, stance].join('|')
      if (seen.has(key)) errors.push(tEn('jerr.duplicateLink', { at, stance }))
      seen.add(key)
    }
    if (k.label !== undefined && typeof k.label !== 'string') errors.push(tEn('jerr.mustBeString', { at, field: 'label' }))
  })
  if (errors.length) return errors

  // ── structure that needs every link to be sound (rules 10, 11, 12) ──
  const out = new Map()
  const into = new Map()
  for (const k of spec.links) {
    out.set(k.from, [...(out.get(k.from) ?? []), k.to])
    into.set(k.to, [...(into.get(k.to) ?? []), k.from])
  }
  // Rule 10: no cycle
  const state = new Map()
  const cycle = []
  const walk = (u, path) => {
    state.set(u, 1)
    for (const v of out.get(u) ?? []) {
      if (state.get(v) === 1) cycle.push([...path.slice(path.indexOf(v)), v])
      else if (!state.has(v)) walk(v, [...path, v])
    }
    state.set(u, 2)
  }
  for (const id of nodeById.keys()) if (!state.has(id)) walk(id, [id])
  for (const c of cycle) errors.push(tEn('jerr.cycle', { path: c.join(' -> ') }))
  // Rule 11: a fact or a norm is a leaf
  spec.nodes.forEach((n, i) => {
    if ((n.kind === 'fact' || n.kind === 'norm') && (into.get(n.id) ?? []).length) {
      errors.push(tEn('jerr.leafHasInput', { at: `nodes[${i}] (${n.id})`, kind: n.kind }))
    }
  })
  // Rule 12: the diagram ends in a conclusion
  const ends = spec.nodes.filter((n) => n.kind === 'conclusion' && !(out.get(n.id) ?? []).length)
  if (!ends.length) errors.push(tEn('jerr.noEnd'))

  return errors
}

/**
 * Hints (rules 13 to 18): things worth a second look that do not stop the drawing. Safe to call on
 * data that has not passed validation: anything it cannot read is skipped.
 */
export function hintsOfJustification(spec) {
  const hints = []
  if (!isObj(spec) || !Array.isArray(spec.nodes) || !Array.isArray(spec.links)) return hints

  const nodes = list(spec.nodes).filter((n) => isObj(n) && typeof n.id === 'string')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links = list(spec.links).filter((k) => isObj(k) && byId.has(k.from) && byId.has(k.to))
  const out = new Map()
  const into = new Map()
  for (const k of links) {
    out.set(k.from, [...(out.get(k.from) ?? []), k])
    into.set(k.to, [...(into.get(k.to) ?? []), k])
  }
  const name = (n) => n.label ?? n.id

  // Rule 13: more than one end conclusion (is it one tree?)
  const ends = nodes.filter((n) => n.kind === 'conclusion' && !(out.get(n.id) ?? []).length)
  if (ends.length > 1) hints.push(tEn('jhint.severalEnds', { n: ends.length, ids: ends.map((n) => n.id).join(', ') }))

  for (const n of nodes) {
    // Rule 14: supports nothing (apart from an end conclusion)
    if (!(out.get(n.id) ?? []).length && !ends.includes(n)) {
      hints.push(tEn('jhint.supportsNothing', { id: n.id, label: name(n) }))
    }
    // Rule 15 and 16: where was it found, which provision
    if (n.kind === 'fact' && !list(n.sourceIds).length) hints.push(tEn('jhint.factNoSource', { id: n.id, label: name(n) }))
    if (n.kind === 'norm' && !list(n.sourceIds).length) hints.push(tEn('jhint.normNoSource', { id: n.id, label: name(n) }))
    // Rule 18: nothing supports a conclusion or an element
    if (n.kind === 'conclusion' || n.kind === 'element') {
      const ins = into.get(n.id) ?? []
      if (!ins.some((k) => stanceOf(k) === 'for' || stanceOf(k) === 'basis')) {
        hints.push(tEn('jhint.unsupported', { id: n.id, label: name(n) }))
      }
    }
    // Rule 17: an element that holds although everything that supports it was rejected
    if (n.kind === 'element' && n.holds === 'yes') {
      const fors = (into.get(n.id) ?? []).filter((k) => stanceOf(k) === 'for')
      if (fors.length && fors.every((k) => byId.get(k.from)?.holds === 'no')) {
        hints.push(tEn('jhint.holdsOnRejected', { id: n.id, label: name(n) }))
      }
    }
  }
  return hints
}
