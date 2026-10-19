// ============================================================
//  src/shell/prefs.js —— reading and writing local preferences
//
//  Why a file of its own: the rule **"store only what the user actually changed"**
//  used to live in App, while the places that use preferences (card fields,
//  orientation, grid lines, rendering kind) are split between the shell and the
//  renderers. Collected here, the key name and the "only what changed" rule exist once.
//
//  Key rule: write only the items passed in; never write the whole set of defaults
//  on entry. Once written, that record overrides the defaults in code, and later
//  changes to a default take effect for nobody.
//
//  What is remembered for one diagram is keyed by **its content**, not its title
//  (issue 236): two diagrams that share a title, or have none, must not share a
//  record, and a diagram whose content changes is a different diagram. `specKeyOf`
//  is that key, and the maps below hold one record per key. The theme and the
//  interface language are the only global choices, and never go through these maps.
//
//  Components do not call these directly: they ask `usePrefs()` (shell/env.js), which is this localStorage
//  store on the viewer page and the host's choice in a mounted diagram (issue 152).
// ============================================================

/** The storage key. Only here. */
export const PREFS_KEY = 'antu.prefs'

/**
 * Every prefs key that is a map from a diagram key to its choice. `theme` is not here (it is global), and
 * neither is `lang` (it has its own key, core/i18n.js). Restoring a diagram's defaults walks this list.
 */
export const PER_DIAGRAM_PREF_NAMES = [
  // the label card tells which kind each diagram opens in
  'kinds',
  // choices a renderer keeps for one diagram
  'orientations',
  'staggers',
  'flowFieldsByDiagram',
  'procedureRouteFieldsByDiagram',
  'justificationLabels',
  'justificationFolded',
  'justificationMerged',
  'scaleByParty',
  'relationshipCentres',
  'relationshipCompanies',
  'relationshipFieldsByDiagram',
  'relationshipPaths',
  // the five that used to be one global scalar for every diagram
  'headerFolded',
  'dockFolded',
  'linkStyle',
  'showGrid',
  'fields',
]

/** A plain object, not an array or a scalar: the only shape a per-diagram map (or an entry in one) may have */
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The map stored under one prefs name, or `{}` when what is stored is not a per-diagram map any more. The old
 * shape of `headerFolded`, `dockFolded`, `linkStyle` and `showGrid` was a boolean or a string, and `fields` was one
 * flat object for every diagram: those are read as "nothing stored" and are simply ignored once (no migration).
 * A key written by `specKeyOf` contains '#', which tells the new `fields` map apart from that old flat object.
 */
export function specMapOf(value, name = '') {
  if (!isPlainObject(value)) return {}
  const keys = Object.keys(value)
  if (name === 'fields' && keys.length && !keys.every((key) => key.includes('#'))) return {}
  return value
}

/** FNV-1a, 32 bits, in base 36: synchronous, stable, and short enough to sit in a prefs key */
function hashOf(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The key that remembers one diagram's choices: its title and a hash of its whole content. Same content gives
 * the same key; the same title with different content gives another; anything that is not an object gives ''.
 */
export function specKeyOf(spec) {
  if (!isPlainObject(spec)) return ''
  let text
  try {
    text = JSON.stringify(spec)
  } catch {
    /* a circular object is not a spec */
    return ''
  }
  if (typeof text !== 'string') return ''
  const title = typeof spec.title === 'string' ? spec.title : ''
  return `${title}#${hashOf(text)}`
}

/** Whether an entry in a map belongs to `key`: the key itself, or the key plus the way of drawing it */
const entryMatches = (entry, key) => entry === key || entry.startsWith(`${key}:`)

/** The value remembered for one diagram, or undefined when nothing (or an old-shaped value) is stored */
export function readSpecPref(store, name, key) {
  return specMapOf(store.read()[name], name)[key]
}

/** Remember one diagram's choice. The map is read again here, so two diagrams never write back a stale copy. */
export function writeSpecPref(store, name, key, value) {
  const map = { ...specMapOf(store.read()[name], name) }
  if (value === undefined || value === null) delete map[key]
  else map[key] = value
  store.write({ [name]: map })
}

/** Whether any per-diagram map has a record for `key` (the key itself, or one of its ways of drawing) */
export function hasSpecPrefs(store, key) {
  const all = store.read()
  return PER_DIAGRAM_PREF_NAMES.some((name) => Object.keys(specMapOf(all[name], name)).some((entry) => entryMatches(entry, key)))
}

/** Forget one diagram's choices in every per-diagram map, with one write; `theme` (and the language) stay. */
export function clearSpecPrefs(store, key) {
  const all = store.read()
  const patch = {}
  for (const name of PER_DIAGRAM_PREF_NAMES) {
    const map = specMapOf(all[name], name)
    const kept = Object.keys(map).filter((entry) => !entryMatches(entry, key))
    if (kept.length !== Object.keys(map).length) {
      patch[name] = Object.fromEntries(kept.map((entry) => [entry, map[entry]]))
    }
  }
  store.write(patch)
}

export function readPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    /* private mode, or the data is corrupt: treat it as having no preferences */
    return {}
  }
}

/** Overrides only the items passed in; the rest stay as they are */
export function writePrefs(patch) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }))
  } catch {
    /* writing fails in private mode; ignoring it is enough */
  }
}

/** The viewer page's store: localStorage, under PREFS_KEY */
export const localPrefs = { read: readPrefs, write: writePrefs }

/** A store that keeps the preferences while the diagram is mounted and writes nothing anywhere */
export function memoryPrefs() {
  let held = {}
  return {
    read: () => held,
    write: (patch) => {
      held = { ...held, ...patch }
    },
  }
}
