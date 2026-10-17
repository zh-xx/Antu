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
  antuAddress,
  antuDiagramsDefinition,
  antuDiagramsStart,
  antuDiagramsUpdate,
  diagramFromRecords,
  isAntuRenderName,
  isAppendSurfaceEvent,
  mountOptions,
  parseAntuAddress,
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

test('antu resource address: session and subagent forms round trip, ids are encoded', () => {
  const session = { kind: 'session', sessionId: 'session/one ?' }
  const sessionAddress = antuAddress({ session, callId: 'call #1' })
  assert.equal(sessionAddress, 'dsh-resource://antu/session%2Fone%20%3F/call%20%231')
  assert.deepEqual(parseAntuAddress(sessionAddress), { session, callId: 'call #1' })

  const child = {
    kind: 'subagent',
    parentSessionId: 'parent/1',
    childSessionId: 'child 2',
    mode: 'continuable',
  }
  const childAddress = antuAddress({ session: child, callId: 'call/2' })
  assert.equal(childAddress, 'dsh-resource://antu/subagent/parent%2F1/child%202/continuable/call%2F2')
  assert.deepEqual(parseAntuAddress(childAddress), { session: child, callId: 'call/2' })

  // Plain ids stay readable, the same shape as the plan plugin's addresses.
  assert.equal(
    antuAddress({ session: { kind: 'session', sessionId: 's1' }, callId: 'c1' }),
    'dsh-resource://antu/s1/c1',
  )
})

test('parseAntuAddress: every malformed address is undefined', () => {
  for (const address of [
    undefined,
    null,
    '',
    'not an address',
    'https://antu/s/c',
    'sidebar://antu/s/c',
    'dsh-resource://plan/s/c',
    'dsh-resource://antu/s',
    'dsh-resource://antu/',
    'dsh-resource://antu/s/',
    'dsh-resource://antu//c',
    'dsh-resource://antu/a/b/c',
    'dsh-resource://antu/s/c?x=1',
    'dsh-resource://antu/s/c#frag',
    'dsh-resource://antu/s/%E0%A4%A',
    'dsh-resource://antu/subagent/p/c/sideways/k',
    'dsh-resource://antu/subagent/p/c/one-shot',
    'dsh-resource://antu/subagent/p/c/one-shot/k/extra',
  ]) {
    assert.equal(parseAntuAddress(address), undefined, String(address))
  }
})

test('diagramFromRecords: reads the call, then its path from meta or the Written: line', () => {
  const spec = { type: 'fact', title: '  案情  ' }
  const records = [
    { event: callEvent(1, 'c1', { spec, kind: 'scale', theme: 'legal' }) },
    {
      event: resultEvent(1, 'c1', {
        content: [{ type: 'text', text: 'Written: /w/text.html' }],
        meta: { path: '/w/meta.html' },
      }),
    },
  ]
  assert.deepEqual(diagramFromRecords(records, 'c1'), {
    callId: 'c1',
    spec,
    kind: 'scale',
    theme: 'legal',
    title: '案情',
    path: '/w/meta.html',
    failure: null,
  })

  // meta may arrive on the event (DSH 0.2.0-rc.2) rather than on the message.
  const onEvent = [
    { event: callEvent(1, 'c1', { spec }) },
    { event: resultEvent(1, 'c1', {}, { meta: { path: '/w/on-event.html' } }) },
  ]
  assert.equal(diagramFromRecords(onEvent, 'c1').path, '/w/on-event.html')

  // No result yet: the call is still a diagram, but has no path.
  const waiting = diagramFromRecords([{ event: callEvent(1, 'c1', { spec, kind: 'scale' }) }], 'c1')
  assert.equal(waiting.path, null)
  assert.equal(waiting.failure, null)
  assert.equal(waiting.kind, 'scale')
})

test('diagramFromRecords: a failure is the quiet line the card shows', () => {
  const failed = [
    { event: callEvent(1, 'c1', { spec: { type: 'fact' } }) },
    { event: resultEvent(1, 'c1', { meta: { ok: false, reason: 'EPERM', errors: ['a', 'b'] } }) },
  ]
  const value = diagramFromRecords(failed, 'c1')
  assert.equal(value.failure, 'EPERM: a (+1 more)')
  assert.equal(value.path, null)

  const errored = [
    { event: callEvent(1, 'c1', { spec: { type: 'fact' } }) },
    { event: resultEvent(1, 'c1', { isError: true }) },
  ]
  assert.equal(diagramFromRecords(errored, 'c1').failure, 'Render failed')
})

test('diagramFromRecords: other tools, other call ids and malformed arguments give undefined', () => {
  assert.equal(diagramFromRecords(undefined, 'c1'), undefined)
  assert.equal(diagramFromRecords([], 'c1'), undefined)
  assert.equal(diagramFromRecords([{ event: callEvent(1, 'c1', { spec: {} }, 'write') }], 'c1'), undefined)
  assert.equal(diagramFromRecords([{ event: callEvent(1, 'c2', { spec: {} }) }], 'c1'), undefined)
  assert.equal(diagramFromRecords([{ event: callEvent(1, 'c1', '{"spec":') }], 'c1'), undefined)
  assert.equal(diagramFromRecords([{ event: callEvent(1, 'c1', {}) }], 'c1'), undefined)
  assert.equal(diagramFromRecords([{ event: { type: 'tool/result', data: {} } }], 'c1'), undefined)

  // The stopgap MCP wire name is the same call, with the MCP fallback title.
  const mcp = diagramFromRecords([{ event: callEvent(1, 'c9', { spec: { type: 'fact' } }, 'mcp__antu__antu_render') }], 'c9')
  assert.equal(mcp.title, 'Antu (MCP)')
  assert.equal(mcp.kind, undefined)
})

test('mountOptions: passes the language only when it is one Antu speaks', () => {
  assert.equal(mountOptions({ lang: 'zh' }).lang, 'zh')
  assert.equal(mountOptions({ lang: 'en' }).lang, 'en')
  assert.equal('lang' in mountOptions({ lang: 'ja' }), false)
  assert.equal('lang' in mountOptions({}), false)
})
