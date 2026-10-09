// The entries for a host's code (issue #152, spec/embed.md), the parts that need no browser: which item a pinned
// card stands for (on every example and every kind), the stylesheet moved into a shadow root, the environment a
// mounted diagram gets, `@zh-xx/antu/validate` and `@zh-xx/antu/html`, and the declarations against the code.
// What needs a browser (mount, isolation, events, the handle) is in tools/verify/embed.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import '../src/renderers/index.js'
import { layoutOf, layoutKindsOf, listKnowledgeTypes } from '../src/core/registry.js'
import { itemOf, selectEvent, sourcesOf, PINNABLE_TYPES as PINNABLE } from '../src/core/items.js'
import { HOST_RULES, PAGE_FONT, toShadowCss } from '../src/embed/shadowCss.js'
import { embeddedEnv, isInside, standaloneEnv } from '../src/shell/env.js'
import { localPrefs } from '../src/shell/prefs.js'
import { buildHtml } from '../tools/lib/make-html.mjs'
import { validate, layout, kinds, versions } from '../tools/api/validate.mjs'
import { renderHtml } from '../tools/api/html.mjs'
import { ENTRIES, packageJson } from '../tools/build-npm.mjs'

const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
const examples = (type) =>
  ['examples', 'examples/agent'].flatMap((base) => {
    const dir = join(base, type)
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [join(dir, f), json(join(dir, f))])
  })


test('every card a reader can pin, in every kind of every example, is one item of the JSON', () => {
  let checked = 0
  for (const { type } of listKnowledgeTypes()) {
    for (const [file, spec] of examples(type)) {
      for (const kind of layoutKindsOf(type)) {
        const graph = layoutOf(type, kind)(spec, {})
        for (const n of graph.nodes ?? []) {
          if (!PINNABLE.has(n.type)) continue
          const found = itemOf(spec, n.id)
          assert.ok(found, `${file} ${kind}: the card ${n.id} names no item`)
          assert.equal(found.item.id, n.id.replace(/[@~][^@~]*$/, ''), `${file} ${kind}: ${n.id}`)
          checked += 1
        }
      }
      for (const r of spec.rules ?? []) assert.equal(itemOf(spec, `rule:${r.id}`)?.collection, 'rules', `${file}: rule ${r.id}`)
    }
  }
  assert.ok(checked > 500, `only ${checked} cards checked`)
})

test('a rule row is looked up among the rules only, and a party on a path without its mark', () => {
  const spec = { nodes: [{ id: 'x' }], rules: [{ id: 'x', sourceIds: ['s'] }], entities: [{ id: 'e-1' }], sources: [{ id: 's', loc: { clause: 5 } }] }
  assert.equal(itemOf(spec, 'x').collection, 'nodes')
  assert.equal(itemOf(spec, 'rule:x').collection, 'rules')
  assert.equal(itemOf(spec, 'e-1@r2').item.id, 'e-1')
  assert.equal(itemOf(spec, 'e-1@c1g0').item.id, 'e-1')
  assert.equal(itemOf({ entities: [{ id: 'a@b' }, { id: 'a' }] }, 'a@b').item.id, 'a@b', 'an id that holds an @ is found as it is')
  assert.equal(itemOf(spec, 'rule:nope'), null)
  assert.equal(itemOf(spec, 's'), null, 'the sources are what an item points at, not an item to pin')
  assert.deepEqual(sourcesOf(spec, spec.rules[0]), [{ id: 's', loc: { clause: 5 } }])
})

test('the select event: the item, its sources as written, or nothing', () => {
  const spec = json('examples/procedure/01-software-development-contract.zh-CN.json')
  const node = spec.nodes.find((n) => n.sourceIds?.length)
  const e = selectEvent(spec, node.id)
  assert.deepEqual(e, { type: 'select', id: node.id, collection: 'nodes', sourceIds: node.sourceIds, sources: node.sourceIds.map((id) => spec.sources.find((s) => s.id === id)) })
  assert.notEqual(e.sourceIds, node.sourceIds, 'a copy: the host must not be able to change the spec through it')
  assert.deepEqual(selectEvent(spec, null), { type: 'select', id: null, collection: null, sourceIds: [], sources: [] })
  assert.deepEqual(selectEvent(spec, '__run__3'), { type: 'select', id: '__run__3', collection: null, sourceIds: [], sources: [] })
})

test('the stylesheet in a shadow root: :root becomes :host, the host rules come last, the font is the page\'s', () => {
  const css = readFileSync('src/styles.css', 'utf8')
  const out = toShadowCss(css)
  assert.ok(!out.includes(':root'), 'a :root rule matches nothing in a shadow root')
  assert.equal(out.split(':host').length - 1, css.split(':root').length - 1 + HOST_RULES.split(':host').length - 1)
  assert.ok(out.endsWith(HOST_RULES), 'last, so it wins over .antu-app { height: 100vh }')
  assert.ok(HOST_RULES.includes(PAGE_FONT))
  assert.ok(buildHtml(undefined, { js: '', css: '' }).includes(`font-family: ${PAGE_FONT}`), 'the viewer page has the same font')
  assert.throws(() => toShadowCss('.a { color: red }'), /no :root/)
})

test('a mounted diagram keeps its preferences to itself unless the host says otherwise', () => {
  const a = embeddedEnv()
  const b = embeddedEnv()
  a.prefs.write({ theme: 'legal' })
  a.lang.write('zh')
  assert.deepEqual(a.prefs.read(), { theme: 'legal', lang: 'zh' })
  assert.deepEqual(b.prefs.read(), {}, 'two diagrams on a page do not share')
  assert.equal(a.lang.read(), 'zh')
  assert.equal(embeddedEnv({ prefs: 'local' }).prefs, localPrefs)
  const store = { read: () => ({ kinds: { t: 'route' } }), write: () => {} }
  assert.equal(embeddedEnv({ prefs: store }).prefs, store)
  assert.equal(a.embedded, true)
  assert.equal(a.preset, null, 'a mounted diagram has no preset')
  assert.equal(standaloneEnv().embedded, false)
  assert.deepEqual(standaloneEnv({ preset: { kind: 'route' } }).preset, { kind: 'route' })
})

test('a command sent before anything answers it is held, the last of each name, and run when it comes', () => {
  const { commands } = embeddedEnv()
  const got = []
  assert.equal(commands.run('setKind', 'flow'), undefined)
  commands.run('setKind', 'route')
  const off = commands.on('setKind', (k) => {
    got.push(k)
    return `ok:${k}`
  })
  assert.deepEqual(got, ['route'])
  assert.equal(commands.run('setKind', 'flow'), 'ok:flow')
  off()
  commands.run('setKind', 'x')
  assert.deepEqual(got, ['route', 'flow'], 'nothing runs after the handler is gone')
})

test('inside or outside: by the composed path, which sees through a shadow root', () => {
  const el = { contains: () => false }
  assert.equal(isInside(el, { composedPath: () => [{}, el, {}], target: {} }), true)
  assert.equal(isInside(el, { composedPath: () => [{}, {}], target: {} }), false)
  assert.equal(isInside({ contains: (t) => t === 1 }, { target: 1 }), true, 'without a path, contains()')
  assert.equal(isInside(null, { target: 1 }), false)
})

test('@zh-xx/antu/validate: the checks, notes and geometry of the command line, as data', () => {
  const spec = json('examples/procedure/02-purchase-contract.zh-CN.json')
  assert.deepEqual(validate(spec), { ok: true, errors: [], notes: [] })
  const broken = { ...spec, nodes: [{ ...spec.nodes[0], kind: 'bogus' }, ...spec.nodes.slice(1)] }
  const v = validate(broken)
  assert.equal(v.ok, false)
  assert.match(v.errors[0], /^nodes\[0\] \(n-1\): `kind`/, 'an error names its field')
  const l = layout(spec, { kind: 'route' })
  assert.equal(l.ok, true)
  assert.equal(l.kind, 'route')
  assert.ok(l.text.length > 20)
  assert.equal(layout(spec, { kind: 'timeline' }).ok, false)
  assert.deepEqual(layout(broken).errors, v.errors)
  assert.deepEqual(kinds().procedure, ['flow', 'route'])
  assert.deepEqual(Object.keys(kinds()).sort(), listKnowledgeTypes().map((t) => t.type).sort())
  assert.ok(versions().types.length === listKnowledgeTypes().length)
})

test('@zh-xx/antu/html: the page render writes, refused where render refuses', () => {
  const spec = json('examples/procedure/02-purchase-contract.zh-CN.json')
  const html = renderHtml(spec, { kind: 'route', theme: 'legal' })
  assert.match(html, /^<!DOCTYPE html>/)
  assert.ok(html.includes('"defaultKind":"route"') && html.includes('"theme":"legal"'), 'the kind it opens in and the fixed theme')
  assert.ok(html.includes(JSON.stringify(spec.title)))
  assert.throws(() => renderHtml({ type: 'procedure' }), (e) => Array.isArray(e.errors) && e.errors.length > 0)
  assert.throws(() => renderHtml(spec, { kind: 'timeline' }), /not a kind of procedure/)
  assert.throws(() => renderHtml(spec, { theme: 'neon' }), /theme/)
})

test('a way of drawing written as the type is refused by every entry, alike (review of #153)', () => {
  const asKind = { type: 'flow', title: 'kind as type' }
  const v = validate(asKind)
  assert.equal(v.ok, false)
  assert.match(v.errors[0], /write `"type": "procedure"`/)
  assert.equal(layout(asKind).ok, false)
  assert.throws(() => renderHtml(asKind), (e) => e.errors?.[0] === v.errors[0])
  assert.match(validate({ type: 'nope' }).errors[0], /not a diagram type; expected one of fact \/ procedure \/ relationship \/ justification/)
})

/** The functions a module exports, read from its text (the embed entry imports JSX and a stylesheet, which Node cannot) */
const exportedNames = (text) =>
  [...text.matchAll(/^export (?:async )?function (\w+)/gm), ...text.matchAll(/^export \{ ([\w, ]+) \}/gm)].flatMap((m) => m[1].split(',').map((s) => s.trim())).sort()

test('the declarations name every function each entry exports, and nothing else', () => {
  const code = { './embed': 'src/embed/index.js', './validate': 'tools/api/validate.mjs', './html': 'tools/api/html.mjs' }
  for (const e of ENTRIES) {
    const declared = [...readFileSync(e.src, 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => m[1]).sort()
    assert.deepEqual(declared, exportedNames(readFileSync(code[e.path], 'utf8')), `${e.path}: ${e.src}`)
  }
})

test('the package exports the three entries and its package.json, nothing else', () => {
  const { exports } = packageJson()
  assert.deepEqual(Object.keys(exports).sort(), ['./embed', './html', './package.json', './validate'])
  for (const e of ENTRIES) assert.deepEqual(exports[e.path], { types: `./${e.types}`, default: `./${e.file}` })
})
