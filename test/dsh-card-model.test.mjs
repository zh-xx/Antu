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
