// ============================================================
//  test/dsh-card-model.test.mjs — pure per-turn diagram logic of the DSH card
//
//  The event-to-state logic lives in tools/dsh/src/card-model.mjs so it can be
//  tested without React, a DOM, or DSH.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ANTU_DIAGRAMS_KIND,
  antuDiagramsDefinition,
  antuDiagramsStart,
  antuDiagramsUpdate,
  isAntuRenderName,
  isAppendSurfaceEvent,
  isFullViewEscape,
} from '../tools/dsh/src/card-model.mjs'

/** One `tool/call` session event; `args` is a value (stringified) or the raw string. */
const callEvent = (turn, callId, args, name = 'antu_render') => ({
  type: 'tool/call',
  seq: 1,
  data: { turn, step: 1, callId, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
})

/** One append-origin `tool/result` session event; `message` overrides the model-facing message. */
const resultEvent = (turn, callId, message = {}, data = {}) => ({
  type: 'tool/result',
  seq: 2,
  surfaceOp: 'append',
  data: { turn, step: 1, message: { source: { callId }, isError: false, content: [], ...message }, ...data },
})

/** A duck-typed element stand-in: only what isFullViewEscape reads. */
const fakeEl = (tagName = 'DIV', attrs = {}) => ({
  tagName,
  getAttribute: (name) => (name in attrs ? attrs[name] : null),
  matches: () => false,
})

/** A keydown stand-in: `path` is its composedPath (target first, ancestors after). */
const keyEvent = (path, extra = {}) => ({
  key: 'Escape',
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  composedPath: () => path,
  ...extra,
})

test('antu-diagrams: a call and its result settle to the written path', () => {
  let state = antuDiagramsStart({ data: { turn: 3 } })
  assert.deepEqual(state, { turn: 3, calls: [] })

  state = antuDiagramsUpdate(state, callEvent(3, 'c1', { spec: { type: 'fact' }, kind: 'scale' }))
  assert.equal(state.calls.length, 1)
  assert.equal(state.calls[0].callId, 'c1')
  assert.equal(state.calls[0].status, 'running')
  assert.equal(state.calls[0].path, null)
  assert.deepEqual(state.calls[0].args, { spec: { type: 'fact' }, kind: 'scale' })
  assert.equal(state.calls[0].argsRaw, '{"spec":{"type":"fact"},"kind":"scale"}')

  state = antuDiagramsUpdate(state, resultEvent(3, 'c1', { content: [{ type: 'text', text: 'Written: /w/a.html' }] }))
  assert.equal(state.calls[0].status, 'ok')
  assert.equal(state.calls[0].path, '/w/a.html')
  assert.equal(state.calls[0].failure, null)
})

test('antu-diagrams: the path comes from meta before the Written: line', () => {
  let state = antuDiagramsUpdate(antuDiagramsStart({ data: { turn: 1 } }), callEvent(1, 'c1', { spec: {} }))
  state = antuDiagramsUpdate(
    state,
    resultEvent(1, 'c1', { content: [{ type: 'text', text: 'Written: /w/text.html' }], meta: { path: '/w/meta.html' } }),
  )
  assert.equal(state.calls[0].path, '/w/meta.html')

  // DSH 0.2.0-rc.2 carries the presentation meta on the event itself, not on the message.
  state = antuDiagramsUpdate(state, callEvent(1, 'c2', { spec: {} }))
  state = antuDiagramsUpdate(state, resultEvent(1, 'c2', {}, { meta: { path: '/w/on-event.html' } }))
  assert.equal(state.calls[1].path, '/w/on-event.html')
})

test('antu-diagrams: an isError result fails with a quiet reason', () => {
  let state = antuDiagramsUpdate(antuDiagramsStart({ data: { turn: 2 } }), callEvent(2, 'c1', { spec: {} }))
  state = antuDiagramsUpdate(state, resultEvent(2, 'c1', { isError: true, content: [{ type: 'text', text: 'boom' }] }))
  assert.equal(state.calls[0].status, 'failed')
  assert.equal(state.calls[0].failure, 'Render failed')
  assert.equal(state.calls[0].path, null)
})

test('antu-diagrams: meta.ok false keeps the reason and the first error', () => {
  let state = antuDiagramsUpdate(antuDiagramsStart({ data: { turn: 4 } }), callEvent(4, 'c1', { spec: {} }))
  state = antuDiagramsUpdate(state, resultEvent(4, 'c1', { meta: { ok: false, reason: 'EPERM', errors: ['a', 'b'] } }))
  assert.equal(state.calls[0].status, 'failed')
  assert.equal(state.calls[0].failure, 'EPERM: a (+1 more)')
  assert.equal(state.calls[0].path, null)

  state = antuDiagramsUpdate(state, callEvent(4, 'c2', { spec: {} }))
  state = antuDiagramsUpdate(state, resultEvent(4, 'c2', {}, { meta: { ok: false, reason: 'too old', errors: [] } }))
  assert.equal(state.calls[1].failure, 'too old')
})

test('antu-diagrams: unrelated tools and replacement results are ignored', () => {
  const start = antuDiagramsStart({ data: { turn: 5 } })
  assert.equal(antuDiagramsUpdate(start, callEvent(5, 'c1', { path: '/w/x' }, 'write')), start)
  // A result for a call the turn never recorded is ignored too.
  assert.equal(antuDiagramsUpdate(start, resultEvent(5, 'missing', { meta: { path: '/w/x.html' } })), start)

  assert.equal(isAntuRenderName('antu_render'), true)
  assert.equal(isAntuRenderName('mcp__antu__antu_render'), true)
  assert.equal(isAntuRenderName('write'), false)
  assert.equal(isAppendSurfaceEvent({ surfaceOp: 'append' }), true)
  assert.equal(isAppendSurfaceEvent({ surfaceOp: { op: 'replace' } }), false)
  assert.equal(isAppendSurfaceEvent({}), false)

  let state = antuDiagramsUpdate(start, callEvent(5, 'c1', { spec: {} }))
  const settled = antuDiagramsUpdate(state, resultEvent(5, 'c1', { meta: { path: '/w/a.html' } }))
  const replaced = { ...resultEvent(5, 'c1', { isError: true }), surfaceOp: { op: 'replace', startSeq: 1, endSeq: 2 } }
  assert.equal(antuDiagramsUpdate(settled, replaced), settled)
})

test('antu-diagrams: two diagrams in one turn keep their call order', () => {
  let state = antuDiagramsStart({ data: { turn: 6 } })
  state = antuDiagramsUpdate(state, callEvent(6, 'c1', { spec: { type: 'fact', title: '一' } }))
  state = antuDiagramsUpdate(state, callEvent(6, 'c2', { spec: { type: 'fact', title: '二' } }))
  state = antuDiagramsUpdate(state, resultEvent(6, 'c1', { meta: { path: '/w/one.html' } }))
  state = antuDiagramsUpdate(state, resultEvent(6, 'c2', { isError: true }))
  assert.deepEqual(state.calls.map((c) => c.callId), ['c1', 'c2'])
  assert.deepEqual(state.calls.map((c) => c.status), ['ok', 'failed'])
  assert.deepEqual(state.calls.map((c) => c.path), ['/w/one.html', null])
})

test('antu-diagrams: malformed arguments keep the raw text and no parsed args', () => {
  const state = antuDiagramsUpdate(antuDiagramsStart({ data: { turn: 7 } }), callEvent(7, 'c1', '{"spec":'))
  assert.equal(state.calls[0].args, null)
  assert.equal(state.calls[0].argsRaw, '{"spec":')
})

test('antu-diagrams: the definition matches its events and publishes turn data', () => {
  assert.equal(antuDiagramsDefinition.kind, ANTU_DIAGRAMS_KIND)
  assert.deepEqual(antuDiagramsDefinition.match({ type: 'turn/start', data: { turn: 8 } }), { id: '8', role: 'start' })
  assert.deepEqual(antuDiagramsDefinition.match(callEvent(8, 'c1', {})), { id: '8', role: 'update' })
  assert.equal(antuDiagramsDefinition.match(callEvent(8, 'c1', {}, 'write')), null)
  assert.equal(antuDiagramsDefinition.match({ type: 'tool/result', data: { turn: 8 } }), null)
  assert.deepEqual(antuDiagramsDefinition.match(resultEvent(8, 'c1')), { id: '8', role: 'update' })

  const state = antuDiagramsDefinition.start({}, { event: { type: 'turn/start', data: { turn: 8 } } })
  assert.deepEqual(state, { turn: 8, calls: [] })
  const next = antuDiagramsDefinition.update({ state }, { event: callEvent(8, 'c1', { spec: {} }) })
  assert.equal(next.calls.length, 1)

  const location = antuDiagramsDefinition.buildLocationData({ state: next }, 'turn', null)
  assert.deepEqual(location, { kind: 'turn', turn: 8, key: ANTU_DIAGRAMS_KIND, value: { calls: next.calls } })
  assert.equal(antuDiagramsDefinition.buildLocationData({ state: next }, 'step', null), null)
  // Nothing changed: the previous Location value comes back by reference so React does not re-render.
  assert.equal(antuDiagramsDefinition.buildLocationData({ state: next }, 'turn', location), location)
})

test('isFullViewEscape: a bare Escape exits even when focus never entered the panel', () => {
  const panel = fakeEl()
  // The chat card's cover button keeps focus in the conversation: the panel is not in the path at all.
  const cover = fakeEl('BUTTON')
  assert.equal(isFullViewEscape(keyEvent([cover, fakeEl('BODY')]), panel), true)
  // Clicking the diagram canvas leaves focus on body (or nowhere).
  assert.equal(isFullViewEscape(keyEvent([fakeEl('BODY')]), panel), true)
  // An event with no composedPath at all still exits (duck typing).
  assert.equal(isFullViewEscape({ key: 'Escape' }, panel), true)
})

test('isFullViewEscape: only a bare Escape exits', () => {
  const panel = fakeEl()
  const outside = fakeEl('BUTTON')
  const path = [outside, fakeEl('BODY')]
  assert.equal(isFullViewEscape(keyEvent(path), panel), true)
  assert.equal(isFullViewEscape(keyEvent(path, { key: 'a' }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { ctrlKey: true }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { altKey: true }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { metaKey: true }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { shiftKey: true }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { repeat: true }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { isComposing: true }), panel), false)
  assert.equal(isFullViewEscape(keyEvent(path, { defaultPrevented: true }), panel), false)
  assert.equal(isFullViewEscape(null, panel), false)
})

test('isFullViewEscape: an editable target keeps Escape for itself', () => {
  const panel = fakeEl()
  assert.equal(isFullViewEscape(keyEvent([fakeEl('INPUT'), panel]), panel), false)
  assert.equal(isFullViewEscape(keyEvent([fakeEl('TEXTAREA'), panel]), panel), false)
  assert.equal(isFullViewEscape(keyEvent([fakeEl('SELECT'), panel]), panel), false)
  // contenteditable is seen through matches() or getAttribute()
  const matchesEditable = { matches: (selector) => selector === 'input, textarea, select, [contenteditable]' }
  assert.equal(isFullViewEscape(keyEvent([matchesEditable, panel]), panel), false)
  assert.equal(isFullViewEscape(keyEvent([fakeEl('DIV', { contenteditable: 'true' }), panel]), panel), false)
  // An explicit contenteditable="false" is not editable
  assert.equal(isFullViewEscape(keyEvent([fakeEl('DIV', { contenteditable: 'false' }), panel]), panel), true)
})

test('isFullViewEscape: an open DSH modal outside the panel keeps its Esc', () => {
  const panel = fakeEl()
  const path = [fakeEl('BUTTON'), fakeEl('BODY')]
  /** A fake Document whose querySelectorAll returns `nodes` for the two modal selectors. */
  const fakeDoc = (nodes) => ({ querySelectorAll: () => nodes })
  const modal = fakeEl('DIV', { 'aria-modal': 'true' })
  const dialog = fakeEl('DIALOG', { open: '' })

  // A confirm/settings dialog outside the panel is waiting for this Escape: the full view stays.
  assert.equal(isFullViewEscape(keyEvent(path), panel, fakeDoc([modal])), false)
  assert.equal(isFullViewEscape(keyEvent(path), panel, fakeDoc([dialog])), false)
  // No modal open: the full view still exits.
  assert.equal(isFullViewEscape(keyEvent(path), panel, fakeDoc([])), true)

  // The panel's own aria-modal/dialog node is not an outside modal: the full view still exits.
  const inside = {
    tagName: 'DIV',
    getAttribute: () => null,
    matches: () => false,
    contains: (node) => node === modal || node === dialog,
  }
  assert.equal(isFullViewEscape(keyEvent(path), inside, fakeDoc([modal, dialog])), true)

  // No doc at all (a DOM-less run, or an explicit null) behaves as before: no modal gate.
  assert.equal(isFullViewEscape(keyEvent(path), panel, null), true)
  assert.equal(isFullViewEscape(keyEvent(path), panel, undefined), true)
  // A doc stand-in without querySelectorAll is skipped too.
  assert.equal(isFullViewEscape(keyEvent(path), panel, {}), true)
})

test('isFullViewEscape: an open menu inside the panel gets the first Esc, one outside does not', () => {
  const panel = fakeEl()
  const outside = fakeEl('BUTTON')
  // aria-expanded="true" on a node before the panel (inside it): the full view stays
  assert.equal(
    isFullViewEscape(keyEvent([outside, fakeEl('DIV', { 'aria-expanded': 'true' }), panel, fakeEl('BODY')]), panel),
    false,
  )
  // role="menu" inside the panel: same
  assert.equal(isFullViewEscape(keyEvent([fakeEl('DIV', { role: 'menu' }), panel, fakeEl('BODY')]), panel), false)
  assert.equal(isFullViewEscape(keyEvent([fakeEl('DIV', { role: 'listbox' }), panel, fakeEl('BODY')]), panel), false)
  // role="dialog" is no longer a gate: DSH's own fullscreen chrome can carry it
  assert.equal(isFullViewEscape(keyEvent([fakeEl('DIV', { role: 'dialog' }), panel, fakeEl('BODY')]), panel), true)
  // The same expanded node after the panel (outside it) does not hold the full view back
  assert.equal(
    isFullViewEscape(keyEvent([outside, panel, fakeEl('DIV', { 'aria-expanded': 'true' }), fakeEl('BODY')]), panel),
    true,
  )
})
