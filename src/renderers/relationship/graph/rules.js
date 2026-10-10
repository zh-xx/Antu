// ============================================================
//  src/renderers/relationship/graph/rules.js — validation for relationship
//
//  This file **answers only "is the data correct"**: it does not lay out, does not compute
//  coordinates, does not build nodes. Same split as procedure's rules.js, for the same reason
//  (spec/procedure/schema-draft.md §5): validation and layout stay two layers.
//
//  The rule list is spec/relationship/schema-draft.md §5: errors 1 to 12 stop the drawing,
//  hints 13 to 16 never do.
//  Plain JS, no React, so the Node side (MCP) and the unit tests can import it directly.
// ============================================================

import { tEn } from '../../../core/i18n.js'
import { SOURCE_TYPE_KEYS } from '../../../core/labels.js'

/** Entity kinds. They fix the shape and colour of the box and nothing else. */
export const ENTITY_KINDS = ['person', 'company', 'organization', 'government', 'other']

/**
 * Relation kinds, and whether each is drawn with an arrowhead unless the relation says otherwise
 * (`directed`). Direction always runs from `from` to `to`; what that means per kind is in
 * spec/relationship/schema-draft.md §4.1.
 */
export const RELATION_KINDS = ['equity', 'control', 'contract', 'debt', 'guarantee', 'kinship', 'employment', 'agency', 'other']
export const UNDIRECTED_BY_DEFAULT = new Set(['contract', 'kinship'])

/** Which kinds may carry each dedicated field */
const SHARE_KINDS = ['equity']
const AMOUNT_KINDS = ['debt', 'contract']
const SECURES_KINDS = ['guarantee']
/** A guarantee secures a claim: one of these */
const CLAIM_KINDS = ['debt', 'contract']

const ISO_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])

/** Is this relation drawn with an arrowhead? The kind's default, unless `directed` says otherwise. */
export const isDirected = (r) => (typeof r?.directed === 'boolean' ? r.directed : !UNDIRECTED_BY_DEFAULT.has(r?.kind))

/**
 * Validate a relationship spec, returning an array of errors (an empty array = pass). Every
 * error carries the field path and the entity / relation id, so the agent can correct it
 * directly.
 */
export function validateRelationship(spec) {
  const errors = []
  if (!isObj(spec)) return [tEn('err.specNotObject')]

  // Rule 12: asOf is a date
  if (spec.asOf !== undefined && (typeof spec.asOf !== 'string' || !ISO_RE.test(spec.asOf))) {
    errors.push(tEn('rerr.badAsOf', { value: String(spec.asOf) }))
  }

  // The title is shown at the top left and names the diagram's remembered choices
  if (typeof spec.title !== 'string' || !spec.title.trim()) errors.push(tEn('rerr.required', { at: 'the diagram', field: 'title' }))

  // Rule 1: the two lists that make a diagram
  if (!Array.isArray(spec.entities) || spec.entities.length === 0) errors.push(tEn('rerr.entitiesEmpty'))
  if (!Array.isArray(spec.relations) || spec.relations.length === 0) errors.push(tEn('rerr.relationsEmpty'))
  if (errors.length) return errors

  // ── diagram-level lists a reference can point into ──
  const groupIds = new Set()
  if (spec.groups !== undefined) {
    if (!Array.isArray(spec.groups)) {
      errors.push(tEn('rerr.notArray', { field: 'groups' }))
    } else {
      spec.groups.forEach((g, i) => {
        const at = `groups[${i}]` + (isObj(g) && g.id ? ` (${g.id})` : '')
        if (!isObj(g)) return void errors.push(tEn('rerr.notObject', { at: `groups[${i}]` }))
        if (!g.id || typeof g.id !== 'string') errors.push(tEn('rerr.required', { at, field: 'id' }))
        else if (groupIds.has(g.id)) errors.push(tEn('rerr.duplicateId', { at, id: g.id, what: 'group' }))
        else groupIds.add(g.id)
        if (!g.label || typeof g.label !== 'string') errors.push(tEn('rerr.required', { at, field: 'label' }))
      })
    }
  }
  // The materials the entities and relations rest on: each has an id, a type and a name
  const sourceIds = new Set()
  if (spec.sources !== undefined) {
    if (!Array.isArray(spec.sources)) {
      errors.push(tEn('rerr.notArray', { field: 'sources' }))
    } else {
      spec.sources.forEach((src, i) => {
        const at = `sources[${i}]` + (isObj(src) && src.id ? ` (${src.id})` : '')
        if (!isObj(src)) return void errors.push(tEn('rerr.notObject', { at: `sources[${i}]` }))
        if (!src.id || typeof src.id !== 'string') errors.push(tEn('rerr.required', { at, field: 'id' }))
        else if (sourceIds.has(src.id)) errors.push(tEn('rerr.duplicateId', { at, id: src.id, what: 'source' }))
        else sourceIds.add(src.id)
        if (!src.name || typeof src.name !== 'string') errors.push(tEn('rerr.required', { at, field: 'name' }))
        if (!Object.keys(SOURCE_TYPE_KEYS).includes(src.type)) errors.push(tEn('rerr.badSourceType', { at, value: String(src.type), allowed: Object.keys(SOURCE_TYPE_KEYS).join(' / ') }))
      })
    }
  }

  // ── entities (rules 2 to 4, 8) ──
  const entityById = new Map()
  spec.entities.forEach((e, i) => {
    if (!isObj(e)) return void errors.push(tEn('rerr.notObject', { at: `entities[${i}]` }))
    const at = `entities[${i}]` + (e.id ? ` (${e.id})` : '')
    if (!e.id || typeof e.id !== 'string') {
      errors.push(tEn('rerr.required', { at, field: 'id' }))
      return
    }
    if (entityById.has(e.id)) errors.push(tEn('rerr.duplicateId', { at, id: e.id, what: 'entity' }))
    else entityById.set(e.id, e)
    if (!ENTITY_KINDS.includes(e.kind)) {
      errors.push(tEn('rerr.badEntityKind', { at, value: String(e.kind), allowed: ENTITY_KINDS.join(' / ') }))
    }
    if (!e.label || typeof e.label !== 'string') errors.push(tEn('rerr.required', { at, field: 'label' }))
    for (const f of ['role', 'detail']) {
      if (e[f] !== undefined && typeof e[f] !== 'string') errors.push(tEn('rerr.mustBeString', { at, field: f }))
    }
    if (e.groupId !== undefined && !groupIds.has(e.groupId)) {
      errors.push(tEn('rerr.badRef', { at, field: 'groupId', kind: 'group', id: String(e.groupId) }))
    }
    for (const id of list(e.sourceIds)) {
      if (!sourceIds.has(id)) errors.push(tEn('rerr.badRef', { at, field: 'sourceIds', kind: 'source', id: String(id) }))
    }
  })

  // ── relations (rules 2 to 11) ──
  const relationById = new Map()
  const seenPair = new Set()
  spec.relations.forEach((r, i) => {
    if (!isObj(r)) return void errors.push(tEn('rerr.notObject', { at: `relations[${i}]` }))
    const at = `relations[${i}]` + (r.id ? ` (${r.id})` : '')
    if (!r.id || typeof r.id !== 'string') errors.push(tEn('rerr.required', { at, field: 'id' }))
    else if (relationById.has(r.id)) errors.push(tEn('rerr.duplicateId', { at, id: r.id, what: 'relation' }))
    else relationById.set(r.id, r)

    if (!RELATION_KINDS.includes(r.kind)) {
      errors.push(tEn('rerr.badRelationKind', { at, value: String(r.kind), allowed: RELATION_KINDS.join(' / ') }))
    }
    // Rule 5 and 6: both ends exist, and are two different entities
    for (const end of ['from', 'to']) {
      if (typeof r[end] !== 'string' || !entityById.has(r[end])) {
        errors.push(tEn('rerr.badEnd', { at, end, id: String(r[end]) }))
      }
    }
    if (typeof r.from === 'string' && r.from === r.to) errors.push(tEn('rerr.selfRelation', { at, id: r.from }))
    // Rule 7: the same relation twice
    if (typeof r.from === 'string' && typeof r.to === 'string') {
      const key = [r.from, r.to, r.kind, r.label ?? ''].join('\u0000')
      if (seenPair.has(key)) errors.push(tEn('rerr.duplicateRelation', { at, from: r.from, to: r.to, kind: String(r.kind) }))
      seenPair.add(key)
    }
    for (const f of ['label', 'detail']) {
      if (r[f] !== undefined && typeof r[f] !== 'string') errors.push(tEn('rerr.mustBeString', { at, field: f }))
    }
    if (r.directed !== undefined && typeof r.directed !== 'boolean') errors.push(tEn('rerr.mustBeBoolean', { at, field: 'directed' }))
    for (const id of list(r.sourceIds)) {
      if (!sourceIds.has(id)) errors.push(tEn('rerr.badRef', { at, field: 'sourceIds', kind: 'source', id: String(id) }))
    }

    // Rules 9 and 10: a dedicated field on the kinds it belongs to
    if (r.share !== undefined) {
      if (!SHARE_KINDS.includes(r.kind)) errors.push(tEn('rerr.fieldNotHere', { at, field: 'share', kinds: SHARE_KINDS.join(' / ') }))
      else if (typeof r.share !== 'number' || !(r.share >= 0 && r.share <= 100)) errors.push(tEn('rerr.badShare', { at, value: String(r.share) }))
    }
    if (r.amount !== undefined) {
      if (!AMOUNT_KINDS.includes(r.kind)) errors.push(tEn('rerr.fieldNotHere', { at, field: 'amount', kinds: AMOUNT_KINDS.join(' / ') }))
      else if (typeof r.amount !== 'string' || !r.amount.trim()) errors.push(tEn('rerr.mustBeString', { at, field: 'amount' }))
    }
    if (r.secures !== undefined && !SECURES_KINDS.includes(r.kind)) {
      errors.push(tEn('rerr.fieldNotHere', { at, field: 'secures', kinds: SECURES_KINDS.join(' / ') }))
    }
  })

  // Rule 11: what a guarantee secures is a claim that exists. Checked after every relation is known.
  spec.relations.forEach((r, i) => {
    if (!isObj(r) || r.secures === undefined || !SECURES_KINDS.includes(r.kind)) return
    const at = `relations[${i}]` + (r.id ? ` (${r.id})` : '')
    const target = relationById.get(r.secures)
    if (!target) errors.push(tEn('rerr.badSecures', { at, id: String(r.secures) }))
    else if (!CLAIM_KINDS.includes(target.kind)) {
      errors.push(tEn('rerr.securesNotClaim', { at, id: r.secures, kind: String(target.kind), claims: CLAIM_KINDS.join(' / ') }))
    }
  })

  return errors
}

/**
 * Hints (rules 13 to 16): things worth a second look that do not stop the drawing. Safe to call on
 * data that has not passed validation: anything it cannot read is skipped.
 */
export function hintsOfRelationship(spec) {
  const hints = []
  if (!isObj(spec) || !Array.isArray(spec.entities) || !Array.isArray(spec.relations)) return hints

  const entities = list(spec.entities).filter((e) => isObj(e) && typeof e.id === 'string')
  const ids = new Set(entities.map((e) => e.id))
  const relations = list(spec.relations).filter((r) => isObj(r) && ids.has(r.from) && ids.has(r.to))
  const name = (id) => entities.find((e) => e.id === id)?.label ?? id

  // Rule 13: the shares held in one entity add up to more than the whole
  const heldIn = new Map()
  for (const r of relations) {
    if (r.kind === 'equity' && typeof r.share === 'number') heldIn.set(r.to, (heldIn.get(r.to) ?? 0) + r.share)
  }
  for (const [id, total] of heldIn) {
    if (total > 100 + 1e-9) hints.push(tEn('rhint.shareOver100', { id, label: name(id), total: Number(total.toFixed(4)) }))
  }

  // Rule 14: an entity nothing relates to
  const touched = new Set(relations.flatMap((r) => [r.from, r.to]))
  for (const e of entities) {
    if (!touched.has(e.id)) hints.push(tEn('rhint.isolated', { id: e.id, label: e.label ?? e.id }))
  }

  // Rule 15: a guarantee that does not say which claim it secures
  for (const r of relations) {
    if (r.kind === 'guarantee' && r.secures === undefined) hints.push(tEn('rhint.noSecures', { id: r.id ?? `${r.from}->${r.to}` }))
  }

  // Rule 16: shareholdings that loop back (cross-holding). Allowed; it exists in the real world.
  const holds = new Map()
  for (const r of relations) if (r.kind === 'equity') holds.set(r.from, [...(holds.get(r.from) ?? []), r.to])
  const state = new Map()
  const cycle = []
  // Depth first without recursion: `path` is the parties from where the walk began to the one it is at
  for (const first of holds.keys()) {
    if (state.has(first)) continue
    const path = [first]
    const next = [0]
    state.set(first, 1)
    while (path.length) {
      const u = path.at(-1)
      const outs = holds.get(u) ?? []
      const i = next.at(-1)
      if (i < outs.length) {
        next[next.length - 1] += 1
        const v = outs[i]
        if (state.get(v) === 1) cycle.push([...path.slice(path.indexOf(v)), v])
        else if (!state.has(v)) {
          state.set(v, 1)
          path.push(v)
          next.push(0)
        }
      } else {
        state.set(u, 2)
        path.pop()
        next.pop()
      }
    }
  }
  for (const c of cycle) hints.push(tEn('rhint.equityCycle', { path: c.map(name).join(' → ') }))

  return hints
}
