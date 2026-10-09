// ============================================================
//  src/renderers/fact/partyNotes.js — a party that no event names
//
//  Issue 172: a party listed in `actors` that no event names in its `actorIds` is on no card and has no column,
//  so it is nowhere in the picture, and validation used to say nothing. A note, not an error.
// ============================================================

import { tEn } from '../../core/i18n.js'

/**
 * A party that no event names (issue 172): it is nowhere in the picture, and nothing told the writer.
 * Most often the events it did were written without it in `actorIds`. A note, not an error: a party may be
 * listed only to be named (the overlay, the parties list).
 */
export function partyNotes(spec) {
  const actors = Array.isArray(spec?.actors) ? spec.actors : []
  const named = new Set()
  for (const slot of Array.isArray(spec?.slots) ? spec.slots : []) {
    for (const event of Array.isArray(slot?.events) ? slot.events : []) {
      for (const id of Array.isArray(event?.actorIds) ? event.actorIds : []) named.add(id)
    }
  }
  return actors
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a && typeof a.id === 'string' && !named.has(a.id))
    .map(({ a, i }) => tEn('note.partyNoEvent', { at: `actors[${i}]`, id: a.id, name: a.name ?? a.id }))
}
