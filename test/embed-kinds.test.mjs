// What the embed gives a host that draws its own kind picker (issue 210): a sketch and a name for every kind there is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

// the kinds of every type, once the components are registered (the same import the embed's entry makes)
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { kindIcon, kindLabel, kindsOf } = await server.ssrLoadModule('/src/embed/index.js')
const { listKinds } = await server.ssrLoadModule('/src/core/registry.js')
const TYPES = ['fact', 'procedure', 'relationship', 'justification']
const allKinds = [...new Set(TYPES.flatMap((type) => kindsOf(type)))]
test.after(() => server.close())

test('every kind of every type has a sketch and a name in both languages', () => {
  assert.ok(allKinds.length >= 12, `kinds found: ${allKinds.join(', ')}`)
  for (const kind of allKinds) {
    const svg = kindIcon(kind)
    assert.match(svg ?? '', /^<svg [^>]*viewBox="0 0 80 48"/, `${kind} has a sketch`)
    assert.ok(kindLabel(kind, 'zh') && kindLabel(kind, 'zh') !== kindLabel(kind, 'en'), `${kind} has a Chinese name that is not the English one`)
    assert.ok(kindLabel(kind, 'en'), `${kind} has an English name`)
  }
})

test('the sketch takes its colours from the host: variables, not fixed colours', () => {
  const svg = kindIcon(allKinds[0])
  assert.match(svg, /var\(--antu-text-3\)/)
  assert.doesNotMatch(svg, /#[0-9a-f]{3,6}\b/i)
})

test('an unknown kind, or something that is not a kind, gives null', () => {
  assert.equal(kindIcon('no-such-kind'), null)
  assert.equal(kindLabel('no-such-kind', 'en'), null)
  assert.equal(kindIcon(undefined), null)
  assert.equal(kindLabel(42, 'zh'), null)
  assert.equal(kindLabel(allKinds[0], 'fr'), kindLabel(allKinds[0], 'en'), 'another language gives English')
})

test('kindsOf agrees with the registry', () => {
  for (const type of TYPES) assert.deepEqual(kindsOf(type), listKinds(type).map((k) => k.kind))
})
