// ============================================================
//  src/renderers/fact/timeline/rules.js — validation for fact
//
//  This file **answers only "is the data correct"**: it does not lay out, does
//  not compute coordinates, does not build a grid.
//
//  Why a layer of its own: on the fact side validation and layout used to be
//  stirred together in timeline/grid.js, so "the data is wrong" and "this version
//  will not fit" came out as the same sentence and the reader could not tell
//  whether to fix the data or split the diagram (issue #26). procedure separated
//  them from day one: the rules are in this file, the placement is in grid.js.
//
//  `analyzeFact` also hands the field tables (the actor/group/source maps and each
//  event's side) to grid.js, so the checks were **extracted** rather than copied:
//  grid.js only adds the failures that need cell occupancy or column capacity.
//
//  Plain JS, no React, so the Node side (MCP) and the unit tests can import it
//  directly.
// ============================================================

import { SUMMARY_MAX, SUMMARY_MAX_EM, textEm } from '../cardGeometry.js'
import { tEn } from '../../../core/i18n.js'

/** The three sides of the timeline. Kept here because the data decides them; grid.js reads them. */
export const SIDE = { SIDE1: 'side1', AXIS: 'axis', SIDE2: 'side2' }

const SIDE_BY_GROUP_INDEX = [SIDE.SIDE1, SIDE.SIDE2, SIDE.AXIS]

const ISO_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$/

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Which of two ISO times comes first.
 * Compare only up to the length the two share: ISO 8601 strings compare as times when compared
 * lexicographically, but the precision may differ (one to the second, one only to the day), and
 * comparing just the shared part avoids a false verdict. For example "2017-05-02" and
 * "2017-05-02T09:24:16" share the same prefix, so neither counts as earlier.
 */
function isBefore(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const n = Math.min(a.length, b.length)
  return a.slice(0, n) < b.slice(0, n)
}

/**
 * Read a fact spec into the tables validation and layout both need, collecting
 * **data errors only** (bad fields, duplicate ids, dangling references, invalid
 * dates, a group/party contradiction…).
 *
 * It assigns no row, no column and no coordinate: `flat` is only the events in
 * order with the side their own fields put them on. Capacity failures (more than
 * three groups, two events in one cell) are grid.js's job.
 *
 * @returns {{ errors: string[], actors: object[], groups: object[], sources: object[],
 *   slots: unknown, actorById: Map, groupById: Map, groupIndexById: Map, sourceById: Map,
 *   byActor: boolean, sideOfActor: Map<string, string>,
 *   seenActorsOnSide: { side1: Set<string>, side2: Set<string> },
 *   flat: Array<{ slotIndex: number, event: object, side: string, actorId: string|null }> }}
 */
export function analyzeFact(spec) {
  const errors = []
  const actors = Array.isArray(spec?.actors) ? spec.actors : []
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const sources = Array.isArray(spec?.sources) ? spec.sources : []
  const slots = spec?.slots

  const actorById = new Map()
  const groupById = new Map()
  const groupIndexById = new Map()
  const sourceById = new Map()
  const sideOfActor = new Map()
  const seenActorsOnSide = { [SIDE.SIDE1]: new Set(), [SIDE.SIDE2]: new Set() }

  /** Flattened events: { slotIndex, event, side, actorId|null } */
  const flat = []

  const analysis = {
    errors,
    actors,
    groups,
    sources,
    slots,
    actorById,
    groupById,
    groupIndexById,
    sourceById,
    byActor: false,
    sideOfActor,
    seenActorsOnSide,
    flat,
  }

  if (!isPlainObject(spec)) {
    errors.push(tEn('err.specNotObject'))
    return analysis
  }

  // ---------- party list ----------
  actors.forEach((a, i) => {
    if (!isPlainObject(a)) {
      errors.push(tEn('err.notObject', { at: `actors[${i}]` }))
      return
    }
    if (!a.id) {
      errors.push(tEn('err.required', { at: `actors[${i}]`, field: 'id' }))
      return
    }
    if (actorById.has(a.id)) errors.push(tEn('err.duplicateId', { at: `actors[${i}]`, id: a.id }))
    actorById.set(a.id, a)
    if (!a.name) errors.push(tEn('err.required', { at: `actors[${i}] (${a.id})`, field: 'name' }))
  })

  // ---------- views: gone in placement rules v1 (spec/fact/timeline-rules.md) ----------
  if (spec.views !== undefined) errors.push(tEn('err.viewsRemoved'))

  // ---------- group list ----------
  // The count limit (MAX_GROUPS) is a placement limit, so grid.js reports it, not this layer.
  groups.forEach((g, i) => {
    if (!isPlainObject(g)) {
      errors.push(tEn('err.notObject', { at: `groups[${i}]` }))
      return
    }
    if (!g.id) {
      errors.push(tEn('err.required', { at: `groups[${i}]`, field: 'id' }))
      return
    }
    if (groupIndexById.has(g.id)) errors.push(tEn('err.duplicateId', { at: `groups[${i}]`, id: g.id }))
    groupById.set(g.id, g)
    groupIndexById.set(g.id, i)
    if (!g.label) errors.push(tEn('err.required', { at: `groups[${i}] (${g.id})`, field: 'label' }))
  })

  // ---------- which side each party is on (2 or more parties) ----------
  // With two or more parties the groups split the parties: each names its own side, and an event
  // is placed by its parties. With one party (or none) there is no "who is on which side"; the
  // groups split the events instead, and a party carries no group.
  const byActorNow = actorById.size >= 2
  analysis.byActor = byActorNow
  actors.forEach((a, i) => {
    if (!isPlainObject(a) || !a.id) return
    const at = `actors[${i}] (${a.id})`
    const has = a.groupId !== undefined && a.groupId !== null && a.groupId !== ''
    if (!byActorNow) {
      if (has) errors.push(tEn('err.actorGroupOneParty', { at }))
      return
    }
    if (!has) {
      errors.push(tEn('err.actorNeedsGroup', { at, n: actorById.size }))
      return
    }
    if (!groupIndexById.has(a.groupId)) {
      errors.push(tEn('err.missingRef', { at, field: 'groupId', kind: 'group', id: a.groupId }))
      return
    }
    const gi = groupIndexById.get(a.groupId)
    if (gi > 1) {
      errors.push(tEn('err.actorGroupNotSide', { at, groupId: a.groupId }))
      return
    }
    sideOfActor.set(a.id, gi === 0 ? SIDE.SIDE1 : SIDE.SIDE2)
  })

  // ---------- source table ----------
  sources.forEach((s, i) => {
    if (!isPlainObject(s)) {
      errors.push(tEn('err.notObject', { at: `sources[${i}]` }))
      return
    }
    if (!s.id) {
      errors.push(tEn('err.required', { at: `sources[${i}]`, field: 'id' }))
      return
    }
    if (sourceById.has(s.id)) errors.push(tEn('err.duplicateId', { at: `sources[${i}]`, id: s.id }))
    sourceById.set(s.id, s)
    if (!s.type) errors.push(tEn('err.required', { at: `sources[${i}] (${s.id})`, field: 'type' }))
    if (!s.name) errors.push(tEn('err.required', { at: `sources[${i}] (${s.id})`, field: 'name' }))
  })

  // ---------- slots ----------
  if (!Array.isArray(slots)) {
    errors.push(tEn('err.slotNotArray'))
    return analysis
  }
  if (slots.length === 0) errors.push(tEn('err.slotsEmpty'))

  const eventIds = new Set()

  slots.forEach((slot, si) => {
    const at = `slots[${si}]`
    if (!isPlainObject(slot)) {
      errors.push(tEn('err.slotShape', { at }))
      return
    }
    if (!Array.isArray(slot.events)) {
      errors.push(tEn('err.eventsNotArray', { at }))
      return
    }
    if (slot.events.length === 0) errors.push(tEn('err.slotEventsEmpty', { at }))

    slot.events.forEach((e, ei) => {
      const eAt = `${at}.events[${ei}]${e?.id ? ` (${e.id})` : ''}`
      if (!isPlainObject(e)) {
        errors.push(tEn('err.notObject', { at: eAt }))
        return
      }
      if (!e.id) errors.push(tEn('err.required', { at: eAt, field: 'id' }))
      else if (eventIds.has(e.id)) errors.push(tEn('err.duplicateId', { at: eAt, id: e.id }))
      else eventIds.add(e.id)

      // date is optional (#50): the order is the slots array and date is only shown, so an event the material gives no
      // date for is left without one (the card says the date is unknown) rather than given a made-up one. Once
      // written, it must be valid.
      if (e.date && !ISO_RE.test(e.date)) {
        errors.push(tEn('err.badDate', { at: eAt, field: 'date', value: e.date }))
      }
      if (!e.label) errors.push(tEn('err.required', { at: eAt, field: 'label' }))

      // dateEnd is optional, but once written it must be valid, or the time line on the card shows garbage
      if (e.dateEnd !== undefined && e.dateEnd !== null) {
        if (typeof e.dateEnd !== 'string' || !ISO_RE.test(e.dateEnd)) {
          errors.push(tEn('err.badDate', { at: eAt, field: 'dateEnd', value: e.dateEnd }))
        } else if (!e.date) {
          errors.push(tEn('err.dateEndNeedsDate', { at: eAt }))
        } else if (isBefore(e.dateEnd, e.date)) {
          errors.push(tEn('err.dateEndBeforeDate', { at: eAt, end: e.dateEnd, start: e.date }))
        }
      }

      // summary is one supplementary line on the card; more than one line does not fit
      if (e.summary !== undefined && e.summary !== null) {
        if (typeof e.summary !== 'string') {
          errors.push(tEn('err.mustBeString', { at: eAt, field: 'summary' }))
        } else if (textEm(e.summary) > SUMMARY_MAX_EM) {
          // Judged by **drawn width**, not by character count: an English sentence has nearly
          // twice the characters of the Chinese one, so counting characters would reject valid
          // text (see textEm in cardGeometry.js).
          errors.push(
            tEn('err.summaryTooLong', {
              at: eAt,
              max: SUMMARY_MAX,
              actual: Math.ceil(textEm(e.summary)),
            }),
          )
        }
      }

      const ids = Array.isArray(e.actorIds) ? e.actorIds : []
      ids.forEach((id) => {
        if (!actorById.has(id)) errors.push(tEn('err.missingRef', { at: eAt, field: 'actorIds', kind: 'actor', id }))
      })
      const eventGroup = e.groupId !== undefined && e.groupId !== null && e.groupId !== ''
      if (byActorNow && eventGroup) errors.push(tEn('err.eventGroupWithParties', { at: eAt }))
      else if (eventGroup && !groupIndexById.has(e.groupId)) {
        errors.push(tEn('err.missingRef', { at: eAt, field: 'groupId', kind: 'group', id: e.groupId }))
      }
      const srcIds = Array.isArray(e.sourceIds) ? e.sourceIds : []
      srcIds.forEach((id) => {
        if (!sourceById.has(id)) errors.push(tEn('err.missingRef', { at: eAt, field: 'sourceIds', kind: 'source', id }))
      })

      // ---------- side ----------
      //   2 or more parties in the diagram: the event's parties decide. One party → that party's
      //     side; several (across the sides or on one side together) or none → the axis
      //   0 or 1 party: groupId decides, the 1st group side 1, the 2nd side 2, the 3rd or none the axis
      const gi = eventGroup ? groupIndexById.get(e.groupId) : undefined
      let side
      let actorId = null

      if (byActorNow) {
        if (ids.length === 1 && sideOfActor.has(ids[0])) {
          side = sideOfActor.get(ids[0])
          actorId = ids[0]
        } else {
          side = SIDE.AXIS
        }
      } else if (ids.length >= 2) {
        side = SIDE.AXIS // several parties → the axis automatically
        if (gi === 0 || gi === 1) {
          errors.push(tEn('err.multiActorNeedsAxis', { at: eAt, n: ids.length, groupId: e.groupId }))
        }
      } else if (!eventGroup) {
        side = SIDE.AXIS // no group written → the axis
      } else if (gi === undefined) {
        return // unknown group, already reported above
      } else {
        side = SIDE_BY_GROUP_INDEX[gi] ?? SIDE.AXIS // the 3rd group and beyond → the axis
      }

      if (!byActorNow && side !== SIDE.AXIS && ids.length !== 1) {
        errors.push(tEn('err.groupNeedsOneActor', { at: eAt, groupId: e.groupId, n: ids.length }))
        return
      }

      if (!byActorNow && side !== SIDE.AXIS && ids.length === 1) actorId = ids[0]
      if (actorId && actorById.has(actorId)) seenActorsOnSide[side].add(actorId)

      flat.push({ slotIndex: si, event: e, side, actorId })
    })
  })

  return analysis
}

/**
 * Validate a fact spec, returning an array of data errors (an empty array =
 * pass). Every error carries the field path, so the agent can correct it directly.
 *
 * Capacity/placement failures are **not** here: they belong to grid.js (issue #26).
 */
export function validateFact(spec) {
  return analyzeFact(spec).errors
}
