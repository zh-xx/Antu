// ============================================================
//  src/renderers/relationship/useSpecPref.js — a choice remembered for one diagram (shared)
//
//  Every way of drawing a relationship diagram remembers a few choices per diagram (which kinds are hidden, the
//  labels, the centre, the company, the two ends of a path), in the same place, as a map from the diagram's
//  content key to the choice (shell/prefs.js). This is that one way of reading and writing it:
//    · the map is read again at every write, so two diagrams on one page (the embed) never write back a copy
//      of the other's choices that has gone stale;
//    · a preview's preset only gives the choice its first value (`initial`): the controls still work after it.
// ============================================================

import { useState } from 'react'

import { usePrefs } from '../../shell/env.js'
import { readSpecPref, writeSpecPref } from '../../shell/prefs.js'

/**
 * @param name     the key in the remembered choices ('relationshipFieldsByDiagram', 'relationshipCentres', ...)
 * @param key      the diagram's content key (or that key and the way of drawing it); shell/prefs.js `specKeyOf`
 * @param initial  (stored) => the first value; the default is what was remembered
 * @returns [value, set(next)]  next null or undefined forgets the choice
 */
export function useSpecPref(name, key, initial = (stored) => stored) {
  const prefs = usePrefs()
  const [value, setValue] = useState(() => initial(readSpecPref(prefs, name, key)))
  const set = (next) => {
    setValue(next)
    writeSpecPref(prefs, name, key, next)
  }
  return [value, set]
}
