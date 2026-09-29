// ============================================================
//  src/renderers/procedure/flow/rules.js — validation for procedure
//
//  This file **answers only "is the data correct"**: it does not lay out, does
//  not compute coordinates, does not build nodes.
//
//  Why a layer of its own: on the fact side validation and layout are stirred
//  together, with two consequences — "validate without
//  laying out" could not be done, and "the data is wrong" and "this version will
//  not fit" came out as the same sentence, so the reader could not tell whether
//  to fix the data or switch kind. procedure separated them from day one: the
//  rules are in this file, the placement is in layout.js.
//
//  The rule list and the wording of the errors are in
//  spec/procedure/schema-draft.md §5.
//  Plain JS, no React, so the Node side (MCP) and the unit tests can import it
//  directly.
// ============================================================

/** The closed vocabulary of node shapes. Changing this = changing the shape kinds; the rendering layer draws by it. */
export const KINDS = ['start', 'step', 'decision', 'end', 'document', 'note']

/** The outcome attribute. Two dimensions, not one: kind fixes the shape, outcome fixes the colour. */
export const OUTCOMES = ['positive', 'negative', 'neutral']

/** The domain enum. What it classifies is the whole diagram, not the elements in it. */
export const DOMAINS = [
  'litigation',
  'administrative',
  'contract-performance',
  'approval',
  'negotiation',
  'other',
]

import { tEn } from '../../../core/i18n.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const list = (v) => (Array.isArray(v) ? v : [])

/**
 * The ends that rules lead to (`rules[].endId`). Shared by validation, hints and layout, so
 * that all three agree on which nodes are entries.
 */
export function ruleEndIds(spec) {
  return new Set(list(spec?.rules).filter(isObj).map((r) => r.endId).filter((id) => typeof id === 'string'))
}

/**
 * Validate a procedure spec, returning an array of errors (an empty array =
 * pass). Every error carries the field path and the node/edge id, so that the
 * agent can correct it directly.
 */
export function validateProcedure(spec) {
  const errors = []
  if (!isObj(spec)) return [tEn('err.specNotObject')]

  if (spec.domain !== undefined && !DOMAINS.includes(spec.domain)) {
    errors.push(tEn('perr.domainNotInEnum', { value: spec.domain, allowed: DOMAINS.join(' / ') }))
  }

  const rawNodes = spec.nodes
  const rawEdges = spec.edges
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    errors.push(tEn('perr.nodesEmpty'))
  }
  if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
    errors.push(tEn('perr.edgesEmpty'))
  }
  if (errors.length) return errors

  // ── nodes ───────────────────────────────────────────────
  const byId = new Map()
  rawNodes.forEach((n, i) => {
    if (!isObj(n)) {
      errors.push(tEn('perr.notObject', { at: `nodes[${i}]` }))
      return
    }
    const at = `nodes[${i}]` + (n.id ? ` (${n.id})` : '')
    if (!n.id || typeof n.id !== 'string') {
      errors.push(tEn('perr.required', { at, field: 'id' }))
      return
    }
    if (byId.has(n.id)) errors.push(tEn('perr.duplicateNodeId', { at, id: n.id }))
    else byId.set(n.id, n)

    if (!KINDS.includes(n.kind)) {
      errors.push(tEn('perr.badKind', { at, value: n.kind, allowed: KINDS.join(' / ') }))
    }
    if (!n.label || typeof n.label !== 'string') {
      errors.push(tEn('perr.required', { at, field: 'label' }))
    }
    if (n.outcome !== undefined && !OUTCOMES.includes(n.outcome)) {
      errors.push(tEn('perr.badOutcome', { at, value: n.outcome, allowed: OUTCOMES.join(' / ') }))
    }
    if (n.detail !== undefined && typeof n.detail !== 'string') {
      errors.push(tEn('perr.mustBeString', { at, field: 'detail' }))
    }
  })

  // ── references into the diagram-level lists (actors / stages / sources) ──
  const actorIds = new Set(list(spec.actors).filter(isObj).map((a) => a.id))
  const stageIds = new Set(list(spec.stages).filter(isObj).map((s) => s.id))
  const sourceIds = new Set(list(spec.sources).filter(isObj).map((s) => s.id))
  for (const n of byId.values()) {
    for (const id of list(n.actorIds)) {
      if (!actorIds.has(id))
        errors.push(tEn('perr.badRef', { at: `nodes (${n.id})`, field: 'actorIds', kind: 'actor', id }))
    }
    for (const id of list(n.sourceIds)) {
      if (!sourceIds.has(id))
        errors.push(tEn('perr.badRef', { at: `nodes (${n.id})`, field: 'sourceIds', kind: 'source', id }))
    }
    if (n.stageId !== undefined && !stageIds.has(n.stageId)) {
      errors.push(tEn('perr.badRef', { at: `nodes (${n.id})`, field: 'stageId', kind: 'stage', id: n.stageId }))
    }
  }

  // ── rules (contingent clauses) ──────────────────────────
  // A rule is "if <when>, then <then>" that may fire at any point within its stages: breach,
  // delay liability, a right to terminate. It is **not** a step of the flow and has no edges;
  // only a rule that ends the contract names the end it leads to (`endId`).
  if (spec.rules !== undefined) {
    if (!Array.isArray(spec.rules)) {
      errors.push(tEn('perr.rulesNotArray'))
    } else {
      const ruleIds = new Set()
      spec.rules.forEach((r, i) => {
        if (!isObj(r)) {
          errors.push(tEn('perr.notObject', { at: `rules[${i}]` }))
          return
        }
        const at = `rules[${i}]` + (r.id ? ` (${r.id})` : '')
        if (!r.id || typeof r.id !== 'string') errors.push(tEn('perr.required', { at, field: 'id' }))
        else if (ruleIds.has(r.id) || byId.has(r.id)) errors.push(tEn('perr.duplicateRuleId', { at, id: r.id }))
        else ruleIds.add(r.id)
        const whens = Array.isArray(r.when) ? r.when : [r.when]
        if (whens.length === 0 || whens.some((w) => typeof w !== 'string' || !w.trim())) {
          errors.push(tEn('perr.ruleWhen', { at }))
        }
        if (!r.then || typeof r.then !== 'string') errors.push(tEn('perr.required', { at, field: 'then' }))
        if (r.outcome !== undefined && !OUTCOMES.includes(r.outcome)) {
          errors.push(tEn('perr.badOutcome', { at, value: r.outcome, allowed: OUTCOMES.join(' / ') }))
        }
        for (const id of list(r.stageIds)) {
          if (!stageIds.has(id)) errors.push(tEn('perr.badRef', { at, field: 'stageIds', kind: 'stage', id }))
        }
        for (const id of list(r.sourceIds)) {
          if (!sourceIds.has(id)) errors.push(tEn('perr.badRef', { at, field: 'sourceIds', kind: 'source', id }))
        }
        if (r.endId !== undefined) {
          if (!byId.has(r.endId)) errors.push(tEn('perr.badRef', { at, field: 'endId', kind: 'node', id: r.endId }))
          else if (byId.get(r.endId).kind !== 'end') errors.push(tEn('perr.ruleEndNotEnd', { at, id: r.endId }))
        }
      })
    }
  }

  // ── edges ───────────────────────────────────────────────
  const out = new Map()
  const inn = new Map()
  for (const id of byId.keys()) {
    out.set(id, [])
    inn.set(id, [])
  }
  const seenEdge = new Set()
  rawEdges.forEach((e, i) => {
    if (!isObj(e)) {
      errors.push(tEn('perr.notObject', { at: `edges[${i}]` }))
      return
    }
    const at = `edges[${i}]`
    const from = e.from
    const to = e.to
    if (!byId.has(from)) errors.push(tEn('perr.badFrom', { at, id: from }))
    if (!byId.has(to)) errors.push(tEn('perr.badTo', { at, id: to }))
    if (from !== undefined && from === to) errors.push(tEn('perr.selfLoop', { at, id: from }))
    if (!byId.has(from) || !byId.has(to)) return

    const key = `${from}|${to}|${e.condition ?? ''}`
    if (seenEdge.has(key)) {
      errors.push(tEn('perr.duplicateEdge', { at, from, to }))
    }
    seenEdge.add(key)
    out.get(from).push({ ...e, index: i })
    inn.get(to).push({ ...e, index: i })
  })

  // The diagram's structural rules (reachability and the like) only mean
  // anything once every reference holds
  if (errors.length) return errors

  // ── entry / reachability / end ──────────────────────────
  // An end reached only through a rule has no incoming edge, yet it is not an entry: the rule
  // is what leads there. It counts as reached.
  const ruleEnds = ruleEndIds(spec)
  // A note takes no part in the flow: it needs no incoming edge and is never unreachable
  const isNote = (id) => byId.get(id).kind === 'note'
  const sources = [...byId.keys()].filter((id) => inn.get(id).length === 0 && !ruleEnds.has(id) && !isNote(id))
  if (sources.length === 0) {
    // With no entry, the later rules (reachability, ends) cannot be computed at
    // all, and there is no point flooding the output with them
    errors.push(tEn('perr.noEntry'))
    return errors
  }
  // The entries are the start nodes. A node with no incoming edge that is not a start is not a
  // second way in: it floats beside the flow (issue #18: "resignation" written as a chain of
  // nodes rendered as an island above the real start, and the whole diagram read as starting
  // there). Data with no start node at all keeps its first such node as the entry.
  const starts = sources.filter((id) => byId.get(id).kind === 'start')
  const entries = starts.length ? starts : [sources[0]]
  const orphans = sources.filter((id) => !entries.includes(id))

  const flood = (from) => {
    const seen = new Set()
    const stack = [...from]
    while (stack.length) {
      const cur = stack.pop()
      if (seen.has(cur)) continue
      seen.add(cur)
      for (const e of out.get(cur)) stack.push(e.to)
    }
    return seen
  }
  const reach = flood([...entries, ...ruleEnds])
  for (const id of orphans) errors.push(tEn('perr.orphan', { id, label: byId.get(id).label }))
  // What hangs off a floating node is not reported once more, node by node: fixing the one
  // above fixes them all
  const hanging = flood(orphans)
  for (const id of byId.keys()) {
    if (!reach.has(id) && !hanging.has(id) && !isNote(id)) {
      errors.push(tEn('perr.unreachable', { id }))
    }
  }

  if (![...byId.values()].some((n) => n.kind === 'end')) {
    errors.push(tEn('perr.noEnd'))
  }
  for (const n of byId.values()) {
    if (n.kind === 'end' || n.kind === 'note') continue
    if (out.get(n.id).length === 0) {
      errors.push(tEn('perr.deadEnd', { id: n.id, label: n.label }))
    }
  }

  // ── decision points ─────────────────────────────────────
  for (const n of byId.values()) {
    if (n.kind !== 'decision') continue
    const outs = out.get(n.id)
    if (outs.length < 2) {
      errors.push(tEn('perr.decisionTooFewOut', { id: n.id, n: outs.length }))
    }
    for (const e of outs) {
      if (!e.condition) {
        errors.push(tEn('perr.decisionNoCondition', { id: n.id, index: e.index, to: e.to }))
      }
    }
  }

  // ── the main line ───────────────────────────────────────
  const mains = new Map()
  for (const [from, list_] of out) {
    const marked = list_.filter((e) => e.main === true)
    if (marked.length > 1) {
      errors.push(tEn('perr.tooManyMain', { id: from, n: marked.length }))
    }
    if (marked.length === 1) mains.set(from, marked[0])
  }
  if (mains.size > 0) {
    const seen = new Set()
    let cur = entries[0]
    let broken = false
    for (;;) {
      seen.add(cur)
      if (byId.get(cur)?.kind === 'end') break
      const next = mains.get(cur)?.to
      // Two ways to break: no main outgoing edge at this point in the chain, or
      // the main edge walks into a cycle
      if (next === undefined || seen.has(next)) {
        broken = true
        break
      }
      cur = next
    }
    if (broken) {
      errors.push(tEn('perr.mainBroken', { id: cur }))
    }
  }

  return errors
}

/**
 * Hints (they do not stop rendering). Kept apart from errors: these are "worth a
 * look", not wrong data.
 * See spec/procedure/schema-draft.md §5, Rules 18 and 19.
 */
export function hintsOfProcedure(spec) {
  const hints = []
  if (!isObj(spec) || !Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) return hints

  const byId = new Map(list(spec.nodes).filter(isObj).map((n) => [n.id, n]))
  const out = new Map()
  const inn = new Map()
  for (const id of byId.keys()) {
    out.set(id, [])
    inn.set(id, [])
  }
  for (const e of list(spec.edges).filter(isObj)) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    out.get(e.from).push(e)
    inn.get(e.to).push(e)
  }

  // Rule 18: the stage order contradicts the direction of the flow
  const order = new Map(list(spec.stages).filter(isObj).map((s, i) => [s.id, i]))
  for (const e of list(spec.edges).filter(isObj)) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    if (order.has(a.stageId) && order.has(b.stageId) && order.get(a.stageId) > order.get(b.stageId)) {
      hints.push(
        tEn('phint.stageBackwards', {
          from: e.from,
          fromStage: a.stageId,
          to: e.to,
          toStage: b.stageId,
        }),
      )
    }
  }

  // Rule 19: a diamond on the main line has no edge marked main (a lateral
  // decision hanging off the main line does not count)
  for (const n of byId.values()) {
    if (n.kind !== 'decision') continue
    const onSpine = inn.get(n.id).some((e) => e.main === true)
    const hasMainOut = out.get(n.id).some((e) => e.main === true)
    if (onSpine && out.get(n.id).length >= 2 && !hasMainOut) {
      hints.push(tEn('phint.decisionOnSpine', { id: n.id, label: n.label }))
    }
  }

  // Rule 21 (a hint): several entries. Validation only requires "at least one",
  // but a contract flow usually has a single entry; the extra entries are placed
  // together on layer 0, which usually means the data is wrong.
  // **A note is not an entry**: a side note is an annotation hung on the diagram
  // and takes no part in the flow anyway.
  const ruleEnds = ruleEndIds(spec)
  const entries = [...byId.keys()].filter(
    (id) => inn.get(id).length === 0 && byId.get(id).kind === 'start' && !ruleEnds.has(id),
  )
  if (entries.length > 1) {
    hints.push(tEn('phint.multipleEntries', { n: entries.length, ids: entries.join(', ') }))
  }
  return hints
}
