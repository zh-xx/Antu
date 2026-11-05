// The pure contract of the view state (src/shell/viewState.js, issue 200): the precedence a host's
// `initial`/`locked`/`persist` and the reader's own changes resolve through, every validation message, and the
// store wrapper that keeps a refused write in memory. What needs a browser is in tools/verify/embed.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PERSIST_KEY_NAME,
  PERSIST_NAMES,
  getPath,
  normalizeInitial,
  persistAllows,
  persistProblem,
  persistingStore,
  presetAt,
  resolveView,
  viewStateProblem,
} from '../src/shell/viewState.js'

test('precedence, highest first: locked > reader change > initial > preset > stored > fallback', () => {
  const all = { locked: 'L', touched: true, initial: 'I', preset: 'P', stored: 'S', fallback: 'F' }
  assert.equal(resolveView(all), 'L', 'locked beats everything')
  assert.equal(resolveView({ ...all, locked: undefined }), 'S', 'a reader change in this mount beats initial')
  assert.equal(resolveView({ ...all, locked: undefined, touched: false }), 'I', 'initial beats preset')
  assert.equal(resolveView({ ...all, locked: undefined, touched: false, initial: undefined }), 'P', 'preset beats stored')
  assert.equal(resolveView({ ...all, locked: undefined, touched: false, initial: undefined, preset: undefined }), 'S', 'stored beats fallback')
  assert.equal(resolveView({ locked: undefined, touched: false, initial: undefined, preset: undefined, stored: undefined, fallback: 'F' }), 'F')
  assert.equal(resolveView({ locked: false, touched: true, initial: true, stored: true }), false, 'a locked false is a lock, not "no lock"')
  assert.equal(resolveView({ touched: true, stored: undefined, fallback: 'F' }), undefined, 'touched and nothing kept: the reader set nothing')
  assert.equal(resolveView(), undefined, 'nothing at all')
})

test('getPath reads a dotted path and gives undefined for what is missing', () => {
  assert.equal(getPath({ shell: { dockFolded: true } }, 'shell.dockFolded'), true)
  assert.equal(getPath({ a: { b: { c: 3 } } }, 'a.b.c'), 3)
  assert.equal(getPath({}, 'a.b'), undefined)
  assert.equal(getPath(null, 'a'), undefined)
  assert.deepEqual(getPath({ a: { b: 1 } }, 'a'), { b: 1 })
})

test('presetAt maps a view path to the preset shape the viewer page uses', () => {
  assert.equal(presetAt({ fields: { states: false } }, 'view.flow.states'), false)
  assert.equal(presetAt({ orientation: 'horizontal' }, 'view.flow.orientation'), 'horizontal')
  assert.equal(presetAt({ linkStyle: 'curved' }, 'view.flow.linkStyle'), 'curved')
  assert.equal(presetAt({ fields: { labels: false } }, 'view.route.labels'), false)
  assert.equal(presetAt({ fields: { states: true } }, 'view.route.states'), true)
  assert.equal(presetAt({ fields: { summary: false }, orientation: 'vertical', stagger: false, byParty: true }, 'view.fact.summary'), false)
  assert.equal(presetAt({ orientation: 'horizontal' }, 'view.fact.orientation'), 'horizontal')
  assert.equal(presetAt({ stagger: false }, 'view.fact.stagger'), false)
  assert.equal(presetAt({ byParty: true }, 'view.fact.byParty'), true)
  assert.equal(presetAt({ fields: { labels: false }, linkStyle: 'straight' }, 'view.relationship.labels'), false)
  assert.equal(presetAt({ linkStyle: 'straight' }, 'view.relationship.linkStyle'), 'straight')
  assert.equal(presetAt(null, 'view.flow.states'), undefined)
  assert.equal(presetAt({ fields: {} }, 'shell.dockFolded'), undefined, 'a fold is not a preset')
})

test('a valid view state passes at every level', () => {
  const good = {
    theme: 'legal',
    lang: 'zh',
    shell: { headerFolded: true, dockFolded: false },
    view: { flow: { states: true, conditions: false, detail: true, mainLine: false, stages: true, rules: false, orientation: 'horizontal', linkStyle: 'curved', engine: 'mainline' }, route: { labels: true, states: false } },
  }
  assert.equal(viewStateProblem(good, 'options.locked'), '')
  assert.equal(viewStateProblem({}, 'options.locked'), '')
  assert.equal(viewStateProblem(undefined, 'options.locked'), '', 'undefined is "nothing given"')
})

test('an unknown key or a wrong value names the field and what is allowed', () => {
  assert.equal(viewStateProblem({ nope: true }, 'options.locked'), 'options.locked.nope is not an option: theme, lang, shell, view')
  assert.equal(viewStateProblem({ theme: 'neon' }, 'options.locked'), 'options.locked.theme must be one of: document, modern, legal, dark')
  assert.equal(viewStateProblem({ lang: 'fr' }, 'options.locked'), 'options.locked.lang must be one of: zh, en')
  assert.equal(viewStateProblem({ shell: { headerFolded: 'yes' } }, 'options.locked'), 'options.locked.shell.headerFolded must be a boolean')
  assert.equal(viewStateProblem({ shell: { nope: true } }, 'options.locked'), 'options.locked.shell.nope is not an option: headerFolded, dockFolded')
  assert.equal(viewStateProblem({ shell: { dockFolded: 1 } }, 'options.locked'), 'options.locked.shell.dockFolded must be a boolean')
  assert.equal(viewStateProblem({ view: { flow: { states: 1 } } }, 'options.locked'), 'options.locked.view.flow.states must be a boolean')
  assert.equal(viewStateProblem({ view: { flow: { orientation: 'diagonal' } } }, 'options.locked'), 'options.locked.view.flow.orientation must be one of: vertical, horizontal')
  assert.equal(viewStateProblem({ view: { flow: { linkStyle: 'wavy' } } }, 'options.locked'), 'options.locked.view.flow.linkStyle must be one of: straight, curved')
  assert.equal(viewStateProblem({ view: { flow: { nope: true } } }, 'options.locked'), 'options.locked.view.flow.nope is not an option: states, conditions, detail, mainLine, stages, rules, orientation, linkStyle, engine')
  assert.equal(viewStateProblem({ view: { flow: { engine: 'elk' } } }, 'options.locked'), 'options.locked.view.flow.engine must be one of: current, mainline')
  assert.equal(viewStateProblem({ view: { route: { labels: 'x' } } }, 'options.locked'), 'options.locked.view.route.labels must be a boolean')
  assert.equal(viewStateProblem({ view: { route: { nope: true } } }, 'options.locked'), 'options.locked.view.route.nope is not an option: labels, states')
  assert.equal(viewStateProblem({ view: { fact: { nope: true } } }, 'options.locked'), 'options.locked.view.fact.nope is not an option: summary, actors, sources, grid, stagger, orientation, byParty')
  assert.equal(viewStateProblem({ view: { fact: { orientation: 'diagonal' } } }, 'options.locked'), 'options.locked.view.fact.orientation must be one of: vertical, horizontal')
  assert.equal(viewStateProblem({ view: { relationship: { labels: 'yes' } } }, 'options.locked'), 'options.locked.view.relationship.labels must be a boolean')
  assert.equal(viewStateProblem({ view: { flow: [] } }, 'options.locked'), 'options.locked.view.flow must be an object')
  assert.equal(viewStateProblem([], 'options.initial'), 'options.initial must be an object')
  assert.equal(viewStateProblem('x', 'options.initial'), 'options.initial must be an object')
})

test('fact and relationship view state accepts the phase-2 switches', () => {
  assert.equal(viewStateProblem({
    view: {
      fact: { summary: false, actors: true, sources: true, grid: true, stagger: false, orientation: 'horizontal', byParty: true },
      relationship: { labels: false, groups: true, orientation: 'vertical', linkStyle: 'straight' },
    },
  }, 'options.initial'), '')
})

test('initial still takes the old top-level headerFolded alias', () => {
  assert.equal(viewStateProblem({ headerFolded: true }, 'options.initial'), 'options.initial.headerFolded is not an option: theme, lang, shell, view')
  assert.equal(viewStateProblem({ headerFolded: true }, 'options.initial', { aliasHeaderFolded: true }), '')
  assert.equal(viewStateProblem({ headerFolded: 'yes' }, 'options.initial', { aliasHeaderFolded: true }), 'options.initial.headerFolded must be a boolean')
  assert.equal(viewStateProblem({ folded: true }, 'options.initial', { aliasHeaderFolded: true }), 'options.initial.folded is not an option: theme, lang, shell, view, headerFolded')
  assert.equal(viewStateProblem({ shell: { headerFolded: false, dockFolded: true } }, 'options.initial', { aliasHeaderFolded: true }), '')
})

test('normalizeInitial moves the alias to its full path, keeping an explicit shell value', () => {
  assert.deepEqual(normalizeInitial({ headerFolded: true }), { shell: { headerFolded: true } })
  assert.deepEqual(normalizeInitial({ headerFolded: true, shell: { dockFolded: false } }), { shell: { dockFolded: false, headerFolded: true } })
  assert.deepEqual(normalizeInitial({ headerFolded: true, shell: { headerFolded: false } }), { shell: { headerFolded: false } }, 'an explicit shell.headerFolded wins')
  assert.deepEqual(normalizeInitial({ theme: 'legal' }), { theme: 'legal' })
  assert.deepEqual(normalizeInitial({}), {})
  assert.equal(normalizeInitial(undefined), undefined)
})

const PERSIST_LIST = 'theme, lang, kind, shell.headerFolded, shell.dockFolded, view.flow, view.route, view.fact, view.relationship'

test('persist must be a boolean or a list of the allowed names', () => {
  assert.equal(persistProblem(undefined), '')
  assert.equal(persistProblem(true), '')
  assert.equal(persistProblem(false), '')
  assert.equal(persistProblem([]), '')
  assert.equal(persistProblem([...PERSIST_NAMES]), '')
  assert.equal(persistProblem(['theme', 'view.flow', 'view.fact', 'view.relationship']), '')
  assert.equal(persistProblem('yes', 'options.persist'), `options.persist must be a boolean or an array of: ${PERSIST_LIST}`)
  assert.equal(persistProblem({}, 'options.persist'), `options.persist must be a boolean or an array of: ${PERSIST_LIST}`)
  assert.equal(persistProblem(['nope'], 'options.persist'), `options.persist lists "nope", which is not one of: ${PERSIST_LIST}`)
  assert.equal(persistProblem(['theme', 1], 'options.persist'), `options.persist lists 1, which is not one of: ${PERSIST_LIST}`)
})

test('every prefs key the phase covers is mapped to a persist name', () => {
  assert.deepEqual(PERSIST_KEY_NAME, {
    theme: 'theme',
    lang: 'lang',
    kinds: 'kind',
    headerFolded: 'shell.headerFolded',
    dockFolded: 'shell.dockFolded',
    flowFieldsByDiagram: 'view.flow',
    procedureRouteFieldsByDiagram: 'view.route',
    fields: 'view.fact',
    showGrid: 'view.fact',
    staggers: 'view.fact',
    scaleByParty: 'view.fact',
    relationshipFieldsByDiagram: 'view.relationship',
    orientations: ['view.flow', 'view.fact', 'view.relationship'],
    linkStyle: ['view.flow', 'view.relationship'],
  })
  assert.ok(PERSIST_NAMES.includes('view.fact'))
  assert.ok(PERSIST_NAMES.includes('view.relationship'))
})

test('persistAllows maps each prefs key to its name', () => {
  assert.equal(persistAllows(true, 'theme'), true)
  assert.equal(persistAllows(undefined, 'anything'), true)
  assert.equal(persistAllows(false, 'theme'), false)
  assert.equal(persistAllows(['theme'], 'theme'), true)
  assert.equal(persistAllows(['theme'], 'lang'), false)
  assert.equal(persistAllows(['view.flow'], 'flowFieldsByDiagram'), true)
  assert.equal(persistAllows(['view.flow'], 'orientations'), true, 'shared orientations: any listed view.* name allows')
  assert.equal(persistAllows(['view.fact'], 'orientations'), true)
  assert.equal(persistAllows(['view.relationship'], 'orientations'), true)
  assert.equal(persistAllows(['view.route'], 'orientations'), false)
  assert.equal(persistAllows(['view.flow'], 'linkStyle'), true)
  assert.equal(persistAllows(['view.relationship'], 'linkStyle'), true)
  assert.equal(persistAllows(['view.fact'], 'linkStyle'), false, 'fact has no link style')
  assert.equal(persistAllows(['view.flow'], 'procedureRouteFieldsByDiagram'), false)
  assert.equal(persistAllows(['view.route'], 'procedureRouteFieldsByDiagram'), true)
  assert.equal(persistAllows(['view.fact'], 'fields'), true)
  assert.equal(persistAllows(['view.fact'], 'staggers'), true)
  assert.equal(persistAllows(['view.relationship'], 'relationshipFieldsByDiagram'), true)
  assert.equal(persistAllows(['view.flow'], 'fields'), false)
  assert.equal(persistAllows(['theme'], 'unknownKey'), false, 'a key with no name is not allowed')
})

test('a persisting store keeps a refused write in an overlay and lets the allowed ones through', () => {
  const writes = []
  const store = { read: () => ({ theme: 'document', lang: 'en' }), write: (patch) => writes.push(patch) }

  const off = persistingStore(store, false)
  off.write({ theme: 'legal' })
  assert.deepEqual(writes, [], 'persist false writes nothing to the store')
  assert.deepEqual(off.read(), { theme: 'legal', lang: 'en' }, 'the overlay is read back on top')

  const some = persistingStore(store, ['theme'])
  some.write({ theme: 'legal', lang: 'zh' })
  assert.deepEqual(writes, [{ theme: 'legal' }], 'only the allowed key reaches the store')
  assert.deepEqual(some.read(), { theme: 'document', lang: 'zh' }, 'the allowed write went to the store (the spy does not change its read); the refused one comes from the overlay')

  const flow = persistingStore(store, ['view.flow'])
  flow.write({ orientations: { t: 'horizontal' }, procedureRouteFieldsByDiagram: { 'proc:t': { labels: false } }, linkStyle: 'curved' })
  assert.deepEqual(writes.at(-1), { orientations: { t: 'horizontal' }, linkStyle: 'curved' }, 'flow keys go together, route ones do not')
  assert.deepEqual(flow.read().procedureRouteFieldsByDiagram, { 'proc:t': { labels: false } })

  const none = persistingStore(store, [])
  none.write({ kinds: { t: 'route' } })
  assert.equal(writes.length, 2, 'an empty list allows nothing')
  assert.deepEqual(none.read().kinds, { t: 'route' })

  const all = persistingStore(store, true)
  all.write({ headerFolded: true })
  assert.deepEqual(writes.at(-1), { headerFolded: true }, 'true lets every write through')

  const mixed = persistingStore(store, ['theme'])
  mixed.write({ lang: 'zh' })
  mixed.write({ theme: 'legal' })
  assert.deepEqual(mixed.read(), { theme: 'document', lang: 'zh' }, 'the overlay sits on top of whatever the store now holds')

  const factOnly = persistingStore(store, ['view.fact'])
  factOnly.write({ fields: { 't#1': { summary: false } }, relationshipFieldsByDiagram: { 'r#1': { labels: false } }, orientations: { t: 'horizontal' } })
  assert.deepEqual(writes.at(-1), { fields: { 't#1': { summary: false } }, orientations: { t: 'horizontal' } }, 'fact persist keeps fields and shared orientations; relationship fields stay in the overlay')
  assert.deepEqual(factOnly.read().relationshipFieldsByDiagram, { 'r#1': { labels: false } })
})
