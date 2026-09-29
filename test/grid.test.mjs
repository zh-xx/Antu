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
import { notesOf } from '../tools/mcp/engine.mjs'

const base = () => JSON.parse(readFileSync('examples/fact/elevator-smoking-case.zh-CN.json', 'utf8'))
const errorsOf = (spec) => buildGrid(spec).errors
const some = (errs, re) => errs.some((e) => re.test(e))

test('valid data produces no errors', () => {
  assert.deepEqual(errorsOf(base()), [])
})

test('missing required fields: the error carries the field path and the event id', () => {
  const spec = base()
  delete spec.slots[0].events[0].date
  const errs = errorsOf(spec)
  assert.ok(errs.length > 0)
  assert.ok(some(errs, /slots\[0\]/), 'must say which slot')
  assert.ok(some(errs, /date/), 'must say which field is missing')
  assert.ok(some(errs, new RegExp(spec.slots[0].events[0].id)), 'must carry the event id')
})

test('dangling references: actorIds / groupId / sourceIds must all be reported', () => {
  const a = base(); a.slots[0].events[0].actorIds = ['no-such-actor']
  assert.ok(some(errorsOf(a), /no-such-actor/))
  const g = base(); g.slots[1].events[0].groupId = 'no-such-group'
  assert.ok(some(errorsOf(g), /no-such-group/))
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
  delete spec.slots[0].events[0].date
  assert.ok(validateSpec(spec).length > 0, 'after the envelope passes, the fact layer must still be checked')
})

test('envelope: a missing type is reported', () => {
  const spec = base()
  delete spec.type
  assert.ok(validateSpec(spec).length > 0)
})

test('a type with no registered knowledge is not validated (only fact exists, so empty)', () => {
  assert.deepEqual(validateSpec({ type: 'relationship', title: '还没做' }), [])
})

test('validation is layout: a grid is still returned on error so the caller can show the problem', () => {
  const spec = base()
  delete spec.slots[0].events[0].date
  const g = buildGrid(spec)
  assert.ok(g.errors.length > 0)
  assert.ok(Array.isArray(g.rows) && g.rows.length > 0, 'an error must not mean no grid')
  assert.ok(Array.isArray(g.columns))
})

test('a view that does not fit is not an error but is named (#25)', () => {
  // The elevator case has a view whose events collide in one lane. By design such a view is left out of
  // the view dropdown rather than rejected, so validation passes. But "passed" used to be all an
  // author heard, and a view that could never be drawn went unseen.
  const spec = base()
  assert.deepEqual(validateSpec(spec), [], 'a view that does not fit must not turn into an error')
  const notes = notesOf(spec)
  assert.equal(notes.length, 1, `expected the one view that does not fit, got ${JSON.stringify(notes)}`)
  assert.match(notes[0], /view "[^"]+" does not fit/)
  assert.match(notes[0], /will not appear in the view dropdown/)
  assert.match(notes[0], /slots\[0\]/, 'the reason from the layout is carried along')
})

test('notes: nothing to say for data whose views all fit, and for types without notes (#25)', () => {
  const small = JSON.parse(readFileSync('examples/agent/fact/4-views.en.json', 'utf8'))
  assert.deepEqual(notesOf(small), [], 'the small agent examples are written so that every view fits')
  assert.deepEqual(notesOf({ type: 'procedure', title: 'x', nodes: [], edges: [] }), [])
  assert.deepEqual(notesOf(null), [])
})
