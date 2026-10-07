// Every way of drawing a type is a diagram with a version, a status and the release it came in, and every type has
// a record of the changes to its format. The rules are in spec/versioning.md ("Managing a type", "The diagrams").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import '../src/renderers/index.js'
import { listKnowledgeTypes, knowledgeOf, diagramsOf, layoutKindsOf, registerKnowledge, DIAGRAM_STATUSES } from '../src/core/registry.js'

const release = JSON.parse(readFileSync('package.json', 'utf8')).version
const parts = (v) => v.split('.').map(Number)
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

for (const { type } of listKnowledgeTypes()) {
  test(`${type}: each way of drawing is listed as a diagram, in the order of its layouts`, () => {
    assert.deepEqual(diagramsOf(type).map((d) => d.kind), layoutKindsOf(type))
    for (const d of diagramsOf(type)) {
      assert.ok(Number.isInteger(d.version) && d.version >= 1, `${type}/${d.kind}: version`)
      assert.ok(DIAGRAM_STATUSES.includes(d.status), `${type}/${d.kind}: status`)
      assert.ok(!newer(d.since, release), `${type}/${d.kind}: came in ${d.since}, newer than the release ${release}`)
    }
  })

  test(`${type}: its guide for agents names each of its diagrams`, () => {
    const guide = readFileSync(`spec/agent/${type}/guide.md`, 'utf8')
    for (const d of diagramsOf(type)) {
      // the first (default) way may go without a name; the others are chosen by name
      if (d.kind === layoutKindsOf(type)[0]) continue
      assert.ok(guide.includes(`"${d.kind}"`), `spec/agent/${type}/guide.md does not name "${d.kind}" (the value of kind)`)
    }
  })

  test(`${type}: the record of changes to its format has a section for the generation it is at`, () => {
    const file = `spec/${type}/changes.md`
    assert.ok(existsSync(file), `${file} is missing`)
    assert.match(readFileSync(file, 'utf8'), new RegExp(`^## Generation ${knowledgeOf(type).specVersion}\\b`, 'm'), `${file} has no "## Generation ${knowledgeOf(type).specVersion}"`)
  })
}

test('a type whose layouts and diagrams do not match cannot be registered', () => {
  const base = { validate: () => [], describe: () => '', specVersion: 1 }
  assert.throws(() => registerKnowledge('x1', { ...base, layouts: { a: () => ({}) } }), /no entry in diagrams/)
  assert.throws(() => registerKnowledge('x2', { ...base, layouts: {}, diagrams: { a: { version: 1, status: 'stable', since: '0.1.0' } } }), /has no layout/)
  assert.throws(() => registerKnowledge('x3', { ...base, layouts: { a: () => ({}) }, diagrams: { a: { version: 0, status: 'stable', since: '0.1.0' } } }), /whole number/)
  assert.throws(() => registerKnowledge('x4', { ...base, layouts: { a: () => ({}) }, diagrams: { a: { version: 1, status: 'beta', since: '0.1.0' } } }), /status must be/)
  assert.throws(() => registerKnowledge('x5', { ...base, layouts: { a: () => ({}) }, diagrams: { a: { version: 1, status: 'stable', since: 'v1' } } }), /since must be/)
})
