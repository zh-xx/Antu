// `normalize` (issue 163, spec/embed.md "normalize"): a procedure's main-line marks repaired by code, the content
// never touched, nothing changed when nothing is wrong. The cases are the ones a model got wrong in practice: an
// automatic renewal marked main (the line loops and never ends) and two marked edges out of one decision.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { normalize, validate } from '../tools/api/validate.mjs'
import { listKnowledgeTypes } from '../src/core/registry.js'

const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const examples = (type) =>
  ['examples', 'examples/agent'].flatMap((base) => {
    const dir = join(base, type)
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [join(dir, f), json(join(dir, f))])
  })

const MAIN_ERROR = /outgoing edges are marked main|the main line breaks/
const mainErrors = (spec) => validate(spec).errors.filter((e) => MAIN_ERROR.test(e))
const marked = (spec) => spec.edges.flatMap((e, i) => (e.main === true ? [i] : []))

const deepFreeze = (v) => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x)
    Object.freeze(v)
  }
  return v
}

/** A service contract that renews itself: the renewal edge back to "service" is the slip a model makes */
const renewal = () => ({
  type: 'procedure',
  title: 'Service contract',
  nodes: [
    { id: 's', kind: 'start', label: 'Signed' },
    { id: 'svc', kind: 'step', label: 'Service' },
    { id: 'exp', kind: 'decision', label: 'Term expires: notice given?' },
    { id: 'renew', kind: 'step', label: 'Renewed for a year' },
    { id: 'done', kind: 'end', label: 'Ended on expiry', outcome: 'positive' },
  ],
  edges: [
    { from: 's', to: 'svc', main: true },
    { from: 'svc', to: 'exp', main: true },
    { from: 'exp', to: 'renew', condition: 'no notice', main: true },
    { from: 'renew', to: 'svc', main: true },
    { from: 'exp', to: 'done', condition: 'notice given' },
  ],
})

test('the examples of every type are valid and come back unchanged, as a copy', () => {
  let checked = 0
  for (const { type } of listKnowledgeTypes()) {
    for (const [file, spec] of examples(type)) {
      const { spec: out, changes } = normalize(deepFreeze(spec))
      assert.deepEqual(changes, [], file)
      assert.deepEqual(out, spec, file)
      assert.notEqual(out, spec, `${file}: the result is a copy, not the input`)
      checked++
    }
  }
  assert.ok(checked > 40, `only ${checked} examples`)
})

test('a renewal loop marked main: the line is marked again to the end, the loop edge unmarked', () => {
  const spec = renewal()
  assert.equal(mainErrors(spec).length, 1, 'the case is broken to begin with')
  const { spec: out, changes } = normalize(deepFreeze(spec))
  assert.deepEqual(validate(out).errors, [])
  assert.deepEqual(marked(out), [0, 1, 4], 'start -> service -> expiry -> ended')
  assert.equal(out.edges[2].main, undefined, 'the renewal edge is no longer main')
  assert.equal(out.edges[3].main, undefined)
  assert.equal(changes.length, 4, changes.join('\n'))
  assert.match(changes[0], /starting at "s" and ending at "done".*main line breaks/)
  assert.ok(changes.includes('edges[4] (exp -> done): marked main'))
  assert.ok(changes.includes('edges[2] (exp -> renew): no longer marked main'))
  // the content is untouched: only `main` differs
  const strip = (s) => s.edges.map((e) => ({ ...e, main: undefined }))
  assert.deepEqual(strip(out), strip(spec))
  assert.deepEqual(out.nodes, spec.nodes)
})

test('two marked edges out of one decision: one is kept, the one that reaches the normal end', () => {
  const spec = renewal()
  spec.edges[3].main = false
  spec.edges[4].main = true // both edges out of "exp" marked
  assert.match(mainErrors(spec).join(), /nodes \(exp\): 2 outgoing edges are marked main/)
  const { spec: out, changes } = normalize(spec)
  assert.deepEqual(validate(out).errors, [])
  assert.deepEqual(marked(out), [0, 1, 4])
  assert.equal(out.edges[3].main, false, 'an explicit false is left as it is')
  assert.deepEqual(changes.slice(1), ['edges[2] (exp -> renew): no longer marked main'])
})

test('the path keeps to the edges already marked, even when another is shorter', () => {
  const spec = {
    type: 'procedure',
    title: 'Two ways',
    nodes: [
      { id: 's', kind: 'start', label: 'Start' },
      { id: 'd', kind: 'decision', label: 'Which?' },
      { id: 'a', kind: 'step', label: 'Long way, one' },
      { id: 'b', kind: 'step', label: 'Long way, two' },
      { id: 'x', kind: 'step', label: 'Dead loop' },
      { id: 'q', kind: 'step', label: 'Short way' },
      { id: 'e', kind: 'end', label: 'Done', outcome: 'positive' },
    ],
    edges: [
      { from: 's', to: 'd', main: true },
      { from: 'd', to: 'q', condition: 'short' },
      { from: 'q', to: 'e' },
      { from: 'd', to: 'a', condition: 'long', main: true },
      { from: 'a', to: 'b', main: true },
      { from: 'b', to: 'x', main: true },
      { from: 'x', to: 'b' },
      { from: 'b', to: 'e' },
    ],
  }
  assert.equal(mainErrors(spec).length, 1)
  const { spec: out } = normalize(spec)
  assert.deepEqual(validate(out).errors, [])
  assert.deepEqual(marked(out), [0, 3, 4, 7], 'start -> which -> long one -> long two -> done')
})

test('the normal end is the positive one, even when a negative end is nearer', () => {
  const spec = renewal()
  spec.nodes.push({ id: 'term', kind: 'end', label: 'Terminated', outcome: 'negative' })
  spec.edges.push({ from: 'svc', to: 'term', condition: 'breach', main: true }) // nearer: already marked
  const { spec: out } = normalize(spec)
  assert.deepEqual(validate(out).errors, [])
  assert.equal(out.edges.at(-1).main, undefined, 'not to the negative end, though it costs less')
  assert.equal(out.edges[4].main, true)

  // with no positive end, any end will do
  for (const n of spec.nodes) delete n.outcome
  const { spec: any, changes } = normalize(spec)
  assert.deepEqual(validate(any).errors, [])
  assert.ok(changes.length > 0)
})

test('nothing changes when no end can be reached, or there is nothing to repair', () => {
  const spec = renewal()
  spec.edges.pop() // the only way to the end
  spec.nodes.pop()
  spec.nodes.push({ id: 'done', kind: 'end', label: 'Floating end' })
  const before = JSON.parse(JSON.stringify(spec))
  const { spec: out, changes } = normalize(spec)
  assert.deepEqual(changes, [])
  assert.deepEqual(out, before)
  assert.ok(validate(out).errors.length > 0, 'validation still reports it')

  const unmarked = renewal()
  for (const e of unmarked.edges) delete e.main
  assert.deepEqual(normalize(unmarked).changes, [], 'no marks at all is not broken')

  for (const odd of [null, 3, 'x', [], {}, { type: 'nope' }, { type: 'procedure' }, { type: 'procedure', nodes: [], edges: 'x' }]) {
    const { spec: same, changes: none } = normalize(odd)
    assert.deepEqual(none, [], JSON.stringify(odd))
    assert.deepEqual(same, odd)
  }
})

test('edges that name no node take no part, and validation still reports them', () => {
  const spec = renewal()
  spec.edges.push({ from: 'svc', to: 'ghost', main: true })
  const { spec: out } = normalize(spec)
  assert.equal(out.edges.at(-1).main, true, 'left for validation to report')
  assert.deepEqual(mainErrors(out), [])
  assert.ok(validate(out).errors.some((e) => e.includes('ghost')))
})

test('marks broken at random on every procedure example are always repaired', () => {
  // a small seeded generator, so a failure can be run again
  let seed = 163
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  let broken = 0
  for (const [file, spec] of examples('procedure')) {
    for (let round = 0; round < 30; round++) {
      const s = JSON.parse(JSON.stringify(spec))
      for (const e of s.edges) if (rand() < 0.3) e.main = !e.main
      if (!mainErrors(s).length) continue
      broken++
      const { spec: out, changes } = normalize(s)
      assert.deepEqual(mainErrors(out), [], `${file} round ${round}`)
      assert.ok(changes.length > 1, `${file} round ${round}: the changes are listed`)
      assert.deepEqual(validate(out).errors, [], `${file} round ${round}: nothing else was broken`)
    }
  }
  assert.ok(broken > 100, `only ${broken} broken cases`)
})
