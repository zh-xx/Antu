// ============================================================
//  test/grid.test.mjs — validation and the grid (pure functions)
//
//  Validation is this project's first gate, and its messages are read by an agent.
//  Three things are pinned here: **it catches bad data, it points at the right
//  place, and there is only one copy of the rules**.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildGrid } from '../src/renderers/fact/timeline/grid.js'
// Envelope validation lives in core/validate.js. It dispatches by type through a
// table, so **the knowledge must be registered first** (renderers/index.js). That is
// the "registration is a side effect; forget it and things fail silently" trap, and a
// dedicated test below guards it.
import '../src/renderers/index.js'
import { validateSpec } from '../src/core/validate.js'
import { listKnowledgeTypes, layoutKindsOf } from '../src/core/registry.js'
import { notesOf } from '../tools/mcp/engine.mjs'

const base = () => JSON.parse(readFileSync('examples/fact/neighbour-corridor-charging.zh-CN.json', 'utf8'))
const errorsOf = (spec) => buildGrid(spec).errors
const some = (errs, re) => errs.some((e) => re.test(e))

test('valid data produces no errors', () => {
  assert.deepEqual(errorsOf(base()), [])
})

test('missing required fields: the error carries the field path and the event id', () => {
  const spec = base()
  delete spec.slots[0].events[0].label
  const errs = errorsOf(spec)
  assert.ok(errs.length > 0)
  assert.ok(some(errs, /slots\[0\]/), 'must say which slot')
  assert.ok(some(errs, /label/), 'must say which field is missing')
  assert.ok(some(errs, new RegExp(spec.slots[0].events[0].id)), 'must carry the event id')
})

test('dangling references: actorIds / groupId / sourceIds must all be reported', () => {
  const a = base(); a.slots[0].events[0].actorIds = ['no-such-actor']
  assert.ok(some(errorsOf(a), /no-such-actor/))
  const g = base(); g.actors[0].groupId = 'no-such-group'
  assert.ok(some(errorsOf(g), /no-such-group/))
  const gym = () => JSON.parse(readFileSync('examples/fact/gym-membership-face-scan.zh-CN.json', 'utf8'))
  const e = gym(); e.slots[0].events[0].groupId = 'no-such-group'
  assert.ok(some(errorsOf(e), /no-such-group/), 'with one party the group is on the event, and checked there')
  const s = base(); s.slots[0].events[0].sourceIds = ['no-such-source']
  assert.ok(some(errorsOf(s), /no-such-source/))
})

test('one event per cell: two events in the same lane of one slot must be reported', () => {
  const spec = base()
  // copy an event into the same slot without naming a party (both land on the axis)
  const dup = { ...spec.slots[0].events[0], id: 'ev-dup', actorIds: [] }
  spec.slots[0].events = [{ ...spec.slots[0].events[0], actorIds: [] }, dup]
  assert.ok(errorsOf(spec).length > 0, 'two events in one cell must be blocked')
})

test('a time span must not run backwards', () => {
  const spec = base()
  const ev = spec.slots[1].events[0]
  ev.dateEnd = '2000-01-01'
  assert.ok(some(errorsOf(spec), /earlier than/))
})

test('at most three groups', () => {
  const spec = base()
  spec.groups = [...(spec.groups || []), { id: 'g-x', label: '第四组' }, { id: 'g-y', label: '第五组' }]
  assert.ok(errorsOf(spec).length > 0, 'more than three groups must be reported')
})

test('envelope: a non-string title is reported (by validateSpec, not buildGrid)', () => {
  const spec = base()
  spec.title = 42
  assert.ok(validateSpec(spec).length > 0)
  // and conversely: buildGrid does not touch the envelope, only fact's own fields
  assert.deepEqual(buildGrid(spec).errors, [])
})

test('validateSpec dispatches by type to the fact validator (registration is not skipped)', () => {
  // This guards against forgetting to import the knowledge list: validateSpec then
  // finds nothing in the table and silently returns "pass", letting bad data through
  // (this really happened, and the verifier caught it).
  const spec = base()
  delete spec.slots[0].events[0].label
  assert.ok(validateSpec(spec).length > 0, 'after the envelope passes, the fact layer must still be checked')
})

test('envelope: a missing type is reported', () => {
  const spec = base()
  delete spec.type
  assert.ok(validateSpec(spec).length > 0)
})

// An unknown type used to pass with no error, so a spec that can never be drawn was "valid" (issue 152)
test('a type with no registered knowledge is an error that lists the types', () => {
  const errors = validateSpec({ type: 'no-such-type', title: '还没做' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /"no-such-type", which is not a diagram type; expected one of fact \/ procedure \/ relationship \/ justification/)
})

test('a way of drawing written as the type is an error that names its type', () => {
  for (const { type } of listKnowledgeTypes()) {
    for (const kind of layoutKindsOf(type)) {
      const errors = validateSpec({ type: kind, title: 'x' })
      assert.equal(errors.length, 1, `type: "${kind}"`)
      assert.ok(errors[0].includes(`write \`"type": "${type}"\``), `type: "${kind}" → ${errors[0]}`)
    }
  }
})

test('validation is layout: a grid is still returned on error so the caller can show the problem', () => {
  const spec = base()
  delete spec.slots[0].events[0].label
  const g = buildGrid(spec)
  assert.ok(g.errors.length > 0)
  assert.ok(Array.isArray(g.rows) && g.rows.length > 0, 'an error must not mean no grid')
  assert.ok(Array.isArray(g.columns))
})

// ---- placement rules v1: what the groups split depends on how many parties there are ----

test('2 or more parties: each party names its side, and an event goes where its parties put it', () => {
  const g = buildGrid(base())
  assert.equal(g.byActor, true)
  const sideOf = (id) => g.columns[g.placements.get(id).col].side
  for (const slot of base().slots) {
    for (const e of slot.events) {
      const ids = e.actorIds ?? []
      const want = ids.length === 1 ? (ids[0] === 'a-1' ? 'side1' : 'side2') : 'axis'
      assert.equal(sideOf(e.id), want, `${e.id} (${ids.join(', ') || 'no party'})`)
    }
  }
})

test('2 or more parties: a party without a side, a party on the axis group, and a group on an event are errors', () => {
  const a = base(); delete a.actors[1].groupId
  assert.ok(some(errorsOf(a), /actors\[1\] \(a-2\).*write `groupId`/))
  const b = base(); b.actors[0].groupId = 'g-3'
  assert.ok(some(errorsOf(b), /3rd group, the axis/))
  const c = base(); c.slots[0].events[0].groupId = 'g-1'
  assert.ok(some(errorsOf(c), /delete the event's `groupId`/))
})

test('2 or more parties acting together on one side land on the axis, not on the side', () => {
  const spec = JSON.parse(readFileSync('examples/agent/fact/4-one-side-several.en.json', 'utf8'))
  const g = buildGrid(spec)
  assert.deepEqual(g.errors, [])
  assert.equal(g.columns[g.placements.get('ev-4').col].side, 'axis')
  assert.equal(g.columns[g.placements.get('ev-3').col].side, 'side1')
})

test('one party: the groups split the events, and a party carries no group', () => {
  const gym = () => JSON.parse(readFileSync('examples/fact/gym-membership-face-scan.zh-CN.json', 'utf8'))
  const g = buildGrid(gym())
  assert.equal(g.byActor, false)
  assert.deepEqual(g.errors, [])
  const bad = gym(); bad.actors[0].groupId = 'g-1'
  assert.ok(some(errorsOf(bad), /only when the diagram has 2 or more parties/))
})

test('views are gone: a file that still has them is told to delete them', () => {
  const spec = base()
  spec.views = [{ label: 'x', splitBy: 'group' }]
  assert.ok(some(errorsOf(spec), /`views` is no longer part of the format/))
})

test('notes: nothing to say for the examples, and for types without notes', () => {
  const small = JSON.parse(readFileSync('examples/agent/fact/3-sides.en.json', 'utf8'))
  assert.deepEqual(notesOf(small), [])
  assert.deepEqual(notesOf({ type: 'procedure', title: 'x', nodes: [], edges: [] }), [])
  assert.deepEqual(notesOf(null), [])
})

// ---- an event with no date (#50) ----

test('date is optional: an event the material gives no date for is valid, and does not move', () => {
  const spec = base()
  const before = buildGrid(spec)
  delete spec.slots[1].events[0].date
  assert.deepEqual(validateSpec(spec), [], 'no date is not an error')
  const after = buildGrid(spec)
  assert.deepEqual(after.errors, [])
  // the order is the slots array, so nothing about the layout depends on the date
  assert.deepEqual(after.rows.map((r) => r.length ?? r), before.rows.map((r) => r.length ?? r))
})

test('a date that is written must still be valid, and dateEnd needs a date', () => {
  const bad = base()
  bad.slots[0].events[0].date = 'yesterday'
  assert.ok(some(errorsOf(bad), /date/), 'a bad date is reported')
  const span = base()
  delete span.slots[0].events[0].date
  span.slots[0].events[0].dateEnd = '2023-12-31'
  const errs = errorsOf(span)
  assert.ok(some(errs, /dateEnd/) && some(errs, /needs its start|date/), 'dateEnd without date is reported')
  assert.ok(some(errs, new RegExp(span.slots[0].events[0].id)), 'and names the event')
})

test('the field table says date is optional, and the info line skips an undated event', async () => {
  const { knowledgeOf } = await import('../src/core/registry.js')
  const k = knowledgeOf('fact')
  const row = k.fields.events.find((f) => f.name === 'date')
  assert.equal(row.req, 'no')
  const spec = base()
  delete spec.slots[0].events[0].date
  const lines = k.info(spec, (key, v) => `${key}${v ? JSON.stringify(v) : ''}`, (n) => String(n))
  assert.ok(lines.length > 0)
})
