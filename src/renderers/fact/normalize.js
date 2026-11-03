// @ts-check
// ============================================================
//  src/renderers/fact/normalize.js — repair approx marks on a fact (issue 332)
//
//  A model that writes a fact gets the events right far more often than the `approx` mark:
//  `approx: true` on an event with no date. The guide is clear: approx marks an estimated or
//  inferred time, not a missing one; leave `date` out when the material gives none. That mark
//  can be cleared by code. Dates, slot order, quotes and parties are left alone.
//
//  Plain JS; it works on the copy it is given.
// ============================================================

import { tEn } from '../../core/i18n.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** A usable date is a non-empty string (validation still checks the ISO shape). */
function hasDate(event) {
  return typeof event.date === 'string' && event.date.trim() !== ''
}

/**
 * Repair approx marks of `spec` in place (the caller hands in a copy).
 * @returns {string[]} what was changed, in words an agent can read; empty when nothing was
 */
export function normalizeFact(spec) {
  if (!isObj(spec) || !Array.isArray(spec.slots)) return []
  /** @type {string[]} */
  const changes = []

  spec.slots.forEach((slot, si) => {
    if (!isObj(slot) || !Array.isArray(slot.events)) return
    slot.events.forEach((event, ei) => {
      if (!isObj(event)) return
      if (event.approx !== true) return
      if (hasDate(event)) return
      delete event.approx
      const id = typeof event.id === 'string' ? event.id : ''
      const at = id ? `slots[${si}].events[${ei}] (${id})` : `slots[${si}].events[${ei}]`
      changes.push(tEn('norm.approxCleared', { at }))
    })
  })

  return changes
}
