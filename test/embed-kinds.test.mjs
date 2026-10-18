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

// The variables a host has to set: the doc says exactly these (spec/embed.md, antu-embed.d.ts). A sketch that reached for a fourth
// one, or painted a fixed colour, would show up wrong in a dark host.
const DOCUMENTED = ['--antu-text-3', '--antu-line', '--antu-bg']

test('every sketch takes its colours from the host: only the documented variables, no fixed colour of its own', () => {
  const used = new Set()
  for (const kind of allKinds) {
    const svg = kindIcon(kind)
    for (const m of svg.matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1])
    // a colour may only appear as the fallback inside a var(...)
    assert.doesNotMatch(svg.replace(/var\(--[a-z0-9-]+(, *[^)]*)?\)/g, ''), /#[0-9a-f]{3,6}\b|rgba?\(/i, `${kind} paints a fixed colour`)
  }
  assert.deepEqual([...used].sort(), [...DOCUMENTED].sort(), 'the variables the sketches use are the ones the doc names')
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
