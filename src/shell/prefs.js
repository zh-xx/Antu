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
// ============================================================

/** The storage key. Only here. */
export const PREFS_KEY = 'antu.prefs'

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
