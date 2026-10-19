// The pure preference helpers (src/shell/prefs.js, issues 235 and 236): the content key that names one diagram, the
// per-diagram maps read and written one entry at a time, and the "restore this diagram's defaults" clear. No
// browser: a small in-memory store stands in for localStorage and for a host's store.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PER_DIAGRAM_PREF_NAMES,
  clearSpecPrefs,
  hasSpecPrefs,
  memoryPrefs,
  readSpecPref,
  specKeyOf,
  specMapOf,
  writeSpecPref,
} from '../src/shell/prefs.js'

/** A store that records every write, so "one write" can be asserted */
function spyStore(initial = {}) {
  let held = structuredClone(initial)
  const writes = []
  return {
    read: () => held,
    write(patch) {
      writes.push(patch)
      held = { ...held, ...patch }
    },
    writes,
    held: () => held,
  }
}

const fact = (title, summary) => ({
  type: 'fact',
  title,
  slots: [{ events: [{ id: 'e-1', label: summary, actorIds: [] }] }],
})

test('specKeyOf: same content, same key; same title with other content, another key', () => {
  const a = fact('A case', 'one')
  const b = fact('A case', 'one')
  const c = fact('A case', 'another')
  assert.equal(specKeyOf(a), specKeyOf(a), 'stable for one object')
  assert.equal(specKeyOf(a), specKeyOf(b), 'the same content gives the same key')
  assert.notEqual(specKeyOf(a), specKeyOf(c), 'same title, different content: different key')
  assert.notEqual(specKeyOf(fact('', 'one')), specKeyOf(fact('', 'two')), 'an empty title still separates content')
  assert.match(specKeyOf(a), /^A case#[0-9a-z]+$/, 'title, #, base-36 hash')
})

test('specKeyOf: anything that is not an object has no key', () => {
  for (const value of [null, undefined, '', 'title', 0, 42, true, [], () => {}]) {
    assert.equal(specKeyOf(value), '', String(value))
  }
})

test('specMapOf: an old scalar or flat value is read as no map at all', () => {
  assert.deepEqual(specMapOf(true), {})
  assert.deepEqual(specMapOf('curved'), {})
  assert.deepEqual(specMapOf(null), {})
  assert.deepEqual(specMapOf([1, 2]), {})
  assert.deepEqual(specMapOf({ sources: true, summary: true }, 'fields'), {}, 'the old flat fields object is not a per-diagram map')
  assert.deepEqual(specMapOf({ 'a#1': 1 }, 'fields'), { 'a#1': 1 })
  assert.deepEqual(specMapOf({ a: 1 }), { a: 1 })
  assert.deepEqual(specMapOf({}), {})
})

test('readSpecPref/writeSpecPref: the map is re-read at every write, so entries do not overwrite one another', () => {
  const store = memoryPrefs()
  const keyA = specKeyOf(fact('A', 'one'))
  const keyB = specKeyOf(fact('B', 'two'))
  writeSpecPref(store, 'orientations', keyA, 'vertical')
  writeSpecPref(store, 'orientations', keyB, 'horizontal')
  assert.deepEqual(store.read().orientations, { [keyA]: 'vertical', [keyB]: 'horizontal' })
  assert.equal(readSpecPref(store, 'orientations', keyA), 'vertical')
  assert.equal(readSpecPref(store, 'orientations', keyB), 'horizontal')
  assert.equal(readSpecPref(store, 'orientations', 'no#such'), undefined)
})

test('writeSpecPref: undefined and null forget the entry, leaving the other diagrams alone', () => {
  const store = memoryPrefs()
  const keyA = specKeyOf(fact('A', 'one'))
  const keyB = specKeyOf(fact('B', 'two'))
  writeSpecPref(store, 'staggers', keyA, false)
  writeSpecPref(store, 'staggers', keyB, true)
  writeSpecPref(store, 'staggers', keyA, undefined)
  assert.deepEqual(store.read().staggers, { [keyB]: true })
  writeSpecPref(store, 'staggers', keyB, null)
  assert.deepEqual(store.read().staggers, {})
})

test('the five converted keys ignore their old global shape', () => {
  const key = specKeyOf(fact('A', 'one'))
  const store = spyStore({
    headerFolded: true,
    dockFolded: false,
    linkStyle: 'curved',
    showGrid: true,
    fields: { sources: true, actors: false, summary: true },
  })
  for (const name of ['headerFolded', 'dockFolded', 'linkStyle', 'showGrid', 'fields']) {
    assert.equal(readSpecPref(store, name, key), undefined, `${name}: the old value is not this diagram's`)
  }
  // A first write under the new shape replaces the old scalar with a map; nothing is migrated.
  writeSpecPref(store, 'linkStyle', key, 'straight')
  writeSpecPref(store, 'fields', key, { summary: false })
  assert.deepEqual(store.held().linkStyle, { [key]: 'straight' })
  assert.deepEqual(store.held().fields, { [key]: { summary: false } })
  assert.equal(store.held().headerFolded, true, 'the other old-shaped values are left where they are')
})

test('hasSpecPrefs: true when any per-diagram map holds this diagram', () => {
  const key = specKeyOf(fact('A', 'one'))
  const store = memoryPrefs()
  assert.equal(hasSpecPrefs(store, key), false)
  writeSpecPref(store, 'showGrid', key, true)
  assert.equal(hasSpecPrefs(store, key), true)
  assert.equal(hasSpecPrefs(store, specKeyOf(fact('B', 'two'))), false)
})

test('hasSpecPrefs/clearSpecPrefs: the way-of-drawing suffix belongs to the diagram too', () => {
  const key = specKeyOf(fact('A', 'one'))
  const store = spyStore({
    relationshipCompanies: { [`${key}:equity`]: 'c-1', [`${key}:authority`]: 'c-2', 'other#key:equity': 'c-3' },
  })
  assert.equal(hasSpecPrefs(store, key), true)
  clearSpecPrefs(store, key)
  assert.deepEqual(store.held().relationshipCompanies, { 'other#key:equity': 'c-3' })
})

test('clearSpecPrefs: removes the key from every map with one write, and leaves the global choices alone', () => {
  const key = specKeyOf(fact('A', 'one'))
  const other = 'other#key'
  const store = spyStore({
    theme: 'legal',
    lang: 'zh',
    kinds: { [key]: 'chronicle', [other]: 'timeline' },
    orientations: { [key]: 'vertical', [other]: 'horizontal' },
    staggers: { [key]: false },
    flowFieldsByDiagram: { [key]: { rules: true } },
    procedureRouteFieldsByDiagram: { [key]: { labels: false } },
    justificationLabels: { [key]: false },
    justificationFolded: { [key]: [] },
    justificationMerged: { [key]: true },
    scaleByParty: { [key]: true },
    relationshipCentres: { [key]: 'e-1' },
    relationshipCompanies: { [`${key}:equity`]: 'c-1' },
    relationshipFieldsByDiagram: { [key]: { labels: false } },
    relationshipPaths: { [key]: { from: 'a', to: 'b' } },
    headerFolded: { [key]: true },
    dockFolded: { [key]: true },
    linkStyle: { [key]: 'curved' },
    showGrid: { [key]: true },
    fields: { [key]: { summary: false } },
  })
  assert.equal(store.writes.length, 0)
  clearSpecPrefs(store, key)
  assert.equal(store.writes.length, 1, 'one write for the whole clear')
  const saved = store.held()
  assert.equal(saved.theme, 'legal')
  assert.equal(saved.lang, 'zh')
  assert.deepEqual(saved.kinds, { [other]: 'timeline' })
  assert.deepEqual(saved.orientations, { [other]: 'horizontal' })
  assert.deepEqual(saved.relationshipCompanies, {})
  for (const name of PER_DIAGRAM_PREF_NAMES) {
    const map = saved[name] || {}
    assert.equal(Object.keys(map).some((entry) => entry === key || entry.startsWith(`${key}:`)), false, `${name} still holds the key`)
  }
})

test('the per-diagram list is every map, and never the theme or the language', () => {
  for (const name of ['kinds', 'orientations', 'staggers', 'flowFieldsByDiagram', 'procedureRouteFieldsByDiagram',
    'justificationLabels', 'justificationFolded', 'justificationMerged', 'scaleByParty', 'relationshipCentres',
    'relationshipCompanies', 'relationshipFieldsByDiagram', 'relationshipPaths',
    'headerFolded', 'dockFolded', 'linkStyle', 'showGrid', 'fields']) {
    assert.ok(PER_DIAGRAM_PREF_NAMES.includes(name), `${name} is missing`)
  }
  assert.equal(PER_DIAGRAM_PREF_NAMES.includes('theme'), false)
  assert.equal(PER_DIAGRAM_PREF_NAMES.includes('lang'), false)
})
