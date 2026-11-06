// @ts-check
// ============================================================
//  src/shell/viewState.js — how a host configures what a reader sees (issue 200, phase 2 issue 329)
//
//  A mounted diagram has switches a reader can change (theme, language, the label card fold, the dock fold,
//  every switch of the flowchart, route map, fact and relationship views). A host can, for each of them, set
//  the opening value (`initial`), force it and hide the control (`locked`), and say whether the reader's
//  changes reach the prefs store (`persist`). This file is that whole contract, pure: the shape, the
//  validation, the precedence, and the wrapper that keeps a `persist`-refused write in memory. No React, so
//  `test/view-state.test.mjs` can check all of it without a browser.
//
//  Precedence for every value, highest first:
//    locked > the reader's change made during this mount > initial > preset (viewer page only) >
//    the stored prefs > the built-in default
//  The reader's changes are told apart from the stored prefs by a per-mount set of touched paths (shell/env.js).
// ============================================================

/** The theme ids and language codes, repeated here so this pure file stays free of the theme/i18n modules */
const THEMES = ['document', 'modern', 'legal', 'dark']
const LANGS = ['zh', 'en']

/** The flowchart's switches (spec/procedure/schema-draft.md §6.2): whether the value is a boolean, or its enum */
const FLOW = {
  states: { bool: true },
  conditions: { bool: true },
  detail: { bool: true },
  mainLine: { bool: true },
  stages: { bool: true },
  rules: { bool: true },
  orientation: { enum: ['vertical', 'horizontal'] },
  linkStyle: { enum: ['straight', 'curved'] },
  // Mainline-first trial (issue 190): only diverges in columnMode; default is current (ELK)
  engine: { enum: ['current', 'mainline'] },
}

/** The route map's switches */
const ROUTE = { labels: { bool: true }, states: { bool: true } }

/**
 * Fact card / timeline / chronicle / scale switches (shared prefs `fields`, not one group per kind).
 * Orientation default for the timeline still depends on slot count in the renderer; the schema only
 * constrains the value when a host sets it.
 */
const FACT = {
  summary: { bool: true },
  actors: { bool: true },
  sources: { bool: true },
  grid: { bool: true },
  stagger: { bool: true },
  orientation: { enum: ['vertical', 'horizontal'] },
  byParty: { bool: true },
}

/** Relationship switches shared across kinds (`relationshipFieldsByDiagram`); `hiddenKinds` stays out (issue 329) */
const RELATIONSHIP = {
  labels: { bool: true },
  groups: { bool: true },
  orientation: { enum: ['vertical', 'horizontal'] },
  linkStyle: { enum: ['straight', 'curved'] },
}

/** The whole `AntuViewState` shape; a node is `{ bool }`, `{ enum }`, or `{ object }` */
const SCHEMA = {
  theme: { enum: THEMES },
  lang: { enum: LANGS },
  shell: { object: { headerFolded: { bool: true }, dockFolded: { bool: true } } },
  view: {
    object: {
      flow: { object: FLOW },
      route: { object: ROUTE },
      fact: { object: FACT },
      relationship: { object: RELATIONSHIP },
    },
  },
}

/** The names `persist` may list, one per prefs key that may be written */
export const PERSIST_NAMES = [
  'theme',
  'lang',
  'kind',
  'shell.headerFolded',
  'shell.dockFolded',
  'view.flow',
  'view.route',
  'view.fact',
  'view.relationship',
]

/**
 * Which `persist` name each prefs key belongs to. Shared maps (`orientations`, `linkStyle`) list every
 * view.* name that may authorize a write: listing any of them lets that key through (issue 329).
 * @type {Record<string, string | string[]>}
 */
export const PERSIST_KEY_NAME = {
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
}

/** Read a dotted path; `undefined` when the object or any step is missing */
export function getPath(obj, path) {
  if (obj == null) return undefined
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

/** The value a viewer page's preset names for this path (`preset.fields.*`, `preset.orientation`, `preset.linkStyle`, …) */
export function presetAt(preset, path) {
  if (!preset) return undefined
  if (path === 'view.flow.orientation' || path === 'view.fact.orientation' || path === 'view.relationship.orientation') {
    return preset.orientation
  }
  if (path === 'view.flow.linkStyle' || path === 'view.relationship.linkStyle') return preset.linkStyle
  if (path === 'view.fact.stagger') return preset.stagger
  if (path === 'view.fact.byParty') return preset.byParty
  if (path === 'view.fact.grid') return preset.grid ?? preset.showGrid
  if (path.startsWith('view.flow.')) return getPath(preset.fields, path.slice('view.flow.'.length))
  if (path.startsWith('view.route.')) return getPath(preset.fields, path.slice('view.route.'.length))
  if (path.startsWith('view.fact.')) return getPath(preset.fields, path.slice('view.fact.'.length))
  if (path.startsWith('view.relationship.')) return getPath(preset.fields, path.slice('view.relationship.'.length))
  return undefined
}

/** Walk one schema node; '' when the value fits, else the problem that names the field and its allowed values */
function checkNode(node, value, path) {
  if (node.bool) return typeof value === 'boolean' ? '' : `${path} must be a boolean`
  if (node.enum) return node.enum.includes(value) ? '' : `${path} must be one of: ${node.enum.join(', ')}`
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path} must be an object`
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) continue
    if (!node.object[key]) return `${path}.${key} is not an option: ${Object.keys(node.object).join(', ')}`
  }
  for (const [key, child] of Object.entries(node.object)) {
    if (value[key] === undefined) continue
    const problem = checkNode(child, value[key], `${path}.${key}`)
    if (problem) return problem
  }
  return ''
}

/**
 * What is wrong with an `initial` or `locked` value ('' when nothing is). `aliasHeaderFolded` is for `initial`,
 * where the old top-level `headerFolded` (issue 165) is still accepted beside `shell.headerFolded`.
 */
export function viewStateProblem(value, name, { aliasHeaderFolded = false } = {}) {
  if (value === undefined) return ''
  if (!value || typeof value !== 'object' || Array.isArray(value)) return `${name} must be an object`
  const allowed = [...Object.keys(SCHEMA), ...(aliasHeaderFolded ? ['headerFolded'] : [])]
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) continue
    if (key === 'headerFolded' && aliasHeaderFolded) {
      if (typeof value.headerFolded !== 'boolean') return `${name}.headerFolded must be a boolean`
      continue
    }
    if (!SCHEMA[key]) return `${name}.${key} is not an option: ${allowed.join(', ')}`
  }
  for (const [key, child] of Object.entries(SCHEMA)) {
    if (value[key] === undefined) continue
    const problem = checkNode(child, value[key], `${name}.${key}`)
    if (problem) return problem
  }
  return ''
}

/** What is wrong with `persist` ('' when nothing is): a boolean, or an array of the names above */
export function persistProblem(value, name = 'options.persist') {
  if (value === undefined || typeof value === 'boolean') return ''
  if (!Array.isArray(value)) return `${name} must be a boolean or an array of: ${PERSIST_NAMES.join(', ')}`
  const badAt = value.findIndex((v) => typeof v !== 'string' || !PERSIST_NAMES.includes(v))
  if (badAt >= 0) return `${name} lists ${JSON.stringify(value[badAt])}, which is not one of: ${PERSIST_NAMES.join(', ')}`
  return ''
}

/**
 * Move `initial.headerFolded` (the issue 165 alias) to its full path, so the rest of the code reads one shape.
 * An explicit `shell.headerFolded` wins over the alias.
 */
export function normalizeInitial(initial) {
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) return initial
  if (initial.headerFolded === undefined) return initial
  const { headerFolded, ...rest } = initial
  const shell = initial.shell && typeof initial.shell === 'object' && !Array.isArray(initial.shell) ? initial.shell : {}
  return { ...rest, shell: { ...shell, headerFolded: shell.headerFolded ?? headerFolded } }
}

/** Whether `persist` lets a write of this prefs key reach the host's store */
export function persistAllows(persist, key) {
  if (persist === undefined || persist === true) return true
  if (persist === false) return false
  if (!Array.isArray(persist)) return false
  const name = PERSIST_KEY_NAME[key]
  if (name === undefined) return false
  if (Array.isArray(name)) return name.some((n) => persist.includes(n))
  return persist.includes(name)
}

/**
 * Wrap a prefs store so a write `persist` does not allow stays in an in-memory overlay instead of reaching the
 * store: the reader's change is kept while the diagram is mounted, and `read()` hands back the stored values
 * with the overlay on top.
 */
export function persistingStore(store, persist) {
  let overlay = {}
  return {
    read: () => ({ ...store.read(), ...overlay }),
    write(patch) {
      const through = {}
      for (const [key, value] of Object.entries(patch)) {
        if (persistAllows(persist, key)) through[key] = value
        else overlay = { ...overlay, [key]: value }
      }
      if (Object.keys(through).length) store.write(through)
    },
  }
}

/**
 * The precedence, in one place; every argument is a leaf value and `touched` says the reader changed it now.
 * @param {{ locked?: unknown, touched?: boolean, initial?: unknown, preset?: unknown, stored?: unknown, fallback?: unknown }} [options]
 * @returns {unknown}
 */
export function resolveView({ locked, touched = false, initial, preset, stored, fallback } = {}) {
  if (locked !== undefined) return locked
  if (touched) return stored
  if (initial !== undefined) return initial
  if (preset !== undefined) return preset
  if (stored !== undefined) return stored
  return fallback
}
