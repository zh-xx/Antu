// ============================================================
//  src/renderers/fact/timeline/grid.js — the single source of truth for fact layout
//
//  Turns a fact spec into "which row and which column each event falls in".
//  The validation layer (validate.js) and the rendering layer (the fact renderer) both call it,
//  guaranteeing that "the rules checked" and "what is drawn" use one and the same logic.
//
//  Rules in spec/fact/timeline-rules.md:
//   - row = slot (index into the slots array)
//   - column = side × party: each party on side 1, the axis, each party on side 2
//   - what the groups split depends on how many parties the diagram has:
//       0 or 1 party   the groups split the events (groupId on the event decides the side)
//       2 or more      the groups split the parties (groupId on each party); an event goes where
//                      its parties put it: one party → that party's side and column, else the axis
//   - distance follows the order of parties within a side
//   - there are no views: one diagram, one placement
// ============================================================

import { SUMMARY_MAX, SUMMARY_MAX_EM, textEm } from '../cardGeometry.js'
import { tEn } from '../../../core/i18n.js'

export const SIDE = { SIDE1: 'side1', AXIS: 'axis', SIDE2: 'side2' }

/** Group limit: the axis has only two sides plus the middle, three positions */
const MAX_GROUPS = 3

/**
 * The group an event is drawn under, for the ways of drawing that have one lane or colour per group
 * (the time scale, the chronicle). With 0 or 1 party it is the event's own `groupId`; with 2 or more,
 * the groups belong to the parties: one party → that party's group, several or none → the 3rd group
 * (the axis), or null when there is none. The same rule as the timeline's sides (buildGrid below).
 * @returns {(event) => string | null}
 */
export function groupOfEvent(spec) {
  const actors = (Array.isArray(spec?.actors) ? spec.actors : []).filter((a) => isPlainObject(a) && a.id)
  if (new Set(actors.map((a) => a.id)).size < 2) return (e) => e?.groupId ?? null
  const groupOf = new Map(actors.map((a) => [a.id, a.groupId]))
  const axis = (Array.isArray(spec?.groups) ? spec.groups[2]?.id : null) ?? null
  return (e) => {
    const ids = Array.isArray(e?.actorIds) ? e.actorIds : []
    return (ids.length === 1 && groupOf.get(ids[0])) || axis
  }
}

const ISO_RE = /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2})?)?)?)?)?$/

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

const SIDE_BY_GROUP_INDEX = [SIDE.SIDE1, SIDE.SIDE2, SIDE.AXIS]

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Compute the grid of a fact spec.
 * @returns {{ errors: string[], columns: Array<{ key, side, actorId?, actorName?, groupIndex? }>,
 *   rows: Array<{ index, cells: Map<string, object> }>, placements: Map<string, { row, col, key }>,
 *   axisColumnIndex: number, actorById: Map, groupById: Map, groupIndexById: Map, sourceById: Map,
 *   eventCount: number }}
 */
export function buildGrid(spec) {
  const errors = []
  const actors = Array.isArray(spec?.actors) ? spec.actors : []
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const sources = Array.isArray(spec?.sources) ? spec.sources : []
  const slots = spec?.slots

  const empty = {
    errors,
    byActor: false,
    sideLabels: { [SIDE.SIDE1]: '', [SIDE.SIDE2]: '', [SIDE.AXIS]: '' },
    columns: [],
    rows: [],
    placements: new Map(),
    axisColumnIndex: 0,
    actorById: new Map(),
    groupById: new Map(),
    groupIndexById: new Map(),
    sourceById: new Map(),
    eventCount: 0,
  }

  // ---------- party list ----------
  const actorById = new Map()
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
  if (spec?.views !== undefined) errors.push(tEn('err.viewsRemoved'))

  // ---------- group list ----------
  const groupById = new Map()
  const groupIndexById = new Map()
  if (groups.length > MAX_GROUPS) {
    errors.push(tEn('err.tooManyGroups', { at: 'groups', max: MAX_GROUPS, actual: groups.length }))
  }
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
  const byActor = actorById.size >= 2
  const sideOfActor = new Map()
  actors.forEach((a, i) => {
    if (!isPlainObject(a) || !a.id) return
    const at = `actors[${i}] (${a.id})`
    const has = a.groupId !== undefined && a.groupId !== null && a.groupId !== ''
    if (!byActor) {
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
  const sourceById = new Map()
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
    return { ...empty, actorById, groupById, groupIndexById, sourceById }
  }
  if (slots.length === 0) errors.push(tEn('err.slotsEmpty'))

  const eventIds = new Set()
  const seenActorsOnSide = { [SIDE.SIDE1]: new Set(), [SIDE.SIDE2]: new Set() }
  /** Flattened events: { slotIndex, event, side, actorId|null } */
  const flat = []

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
          errors.push(
            tEn('err.badDate', { at: eAt, field: 'dateEnd', value: e.dateEnd }),
          )
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
      if (byActor && eventGroup) errors.push(tEn('err.eventGroupWithParties', { at: eAt }))
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

      if (byActor) {
        if (ids.length === 1 && sideOfActor.has(ids[0])) {
          side = sideOfActor.get(ids[0])
          actorId = ids[0]
        } else {
          side = SIDE.AXIS
        }
      } else if (ids.length >= 2) {
        side = SIDE.AXIS // several parties → the axis automatically
        if (gi === 0 || gi === 1) {
          errors.push(
            tEn('err.multiActorNeedsAxis', { at: eAt, n: ids.length, groupId: e.groupId }),
          )
        }
      } else if (!eventGroup) {
        side = SIDE.AXIS // no group written → the axis
      } else if (gi === undefined) {
        return // unknown group, already reported above
      } else {
        side = SIDE_BY_GROUP_INDEX[gi] ?? SIDE.AXIS // the 3rd group and beyond → the axis
      }

      if (!byActor && side !== SIDE.AXIS && ids.length !== 1) {
        errors.push(
          tEn('err.groupNeedsOneActor', { at: eAt, groupId: e.groupId, n: ids.length }),
        )
        return
      }

      if (!byActor && side !== SIDE.AXIS && ids.length === 1) actorId = ids[0]
      if (actorId && actorById.has(actorId)) seenActorsOnSide[side].add(actorId)

      flat.push({ slotIndex: si, event: e, side, actorId })
    })
  })

  // ---------- build the columns ----------
  // **The order of the columns is always decided by the diagram-level actors list** (earlier
  // entries sit closer to the axis). A party has a column only on a side where it has a card of its
  // own (issue 172): with 2 or more parties, a party who only acts with others, or whom no event
  // names, used to keep an empty column, its heading drawn over nothing. With 2 or more parties a
  // side where no party has a card of its own still stands, as one thin lane under the side's title,
  // so the two camps keep their places; with one party a side it has no card on is not drawn.
  const actorOrder = actors.map((a) => (isPlainObject(a) ? a.id : null)).filter(Boolean)
  const columnsFor = (side) => actorOrder.filter((id) => seenActorsOnSide[side].has(id))
  const sideColumns = (side) => {
    const ids = columnsFor(side)
    // A side of two or more parties names the party over each column, even when only one of them is left
    const named = byActor && actorOrder.filter((id) => sideOfActor.get(id) === side).length > 1
    if (ids.length || !byActor) return ids.map((actorId) => ({ key: `${side}:${actorId}`, side, actorId, actorName: actorById.get(actorId)?.name, named }))
    return [{ key: side, side, actorId: null }]
  }

  const columns = []
  // Side 1 is laid out to the left of the axis: the earlier a party is in the list the closer it
  // sits to the axis, and columns are laid out left to right, so this has to be reversed for the
  // column next to the axis to end up rightmost.
  columns.push(...sideColumns(SIDE.SIDE1).reverse())
  const axisColumnIndex = columns.length
  columns.push({ key: SIDE.AXIS, side: SIDE.AXIS })
  columns.push(...sideColumns(SIDE.SIDE2))

  const colIndexByKey = new Map(columns.map((c, i) => [c.key, i]))

  // ---------- place the cells + collision check ----------
  const rows = slots.map((_, i) => ({ index: i, cells: new Map() }))
  const placements = new Map()
  let eventCount = 0

  flat.forEach(({ slotIndex, event, side, actorId }) => {
    const key = side === SIDE.AXIS ? SIDE.AXIS : `${side}:${actorId}`
    const col = colIndexByKey.get(key)
    if (col === undefined) return // bad data, already reported above

    eventCount += 1
    const row = rows[slotIndex]
    if (row.cells.has(key)) {
      const other = row.cells.get(key)
      errors.push(
        tEn('err.oneEventPerCell', { at: `slots[${slotIndex}]`, a: other.id, b: event.id }),
      )
    } else {
      row.cells.set(key, event)
    }
    placements.set(event.id, { row: slotIndex, col, key })
  })

  return {
    errors,
    byActor,
    sideLabels: {
      [SIDE.SIDE1]: groups[0]?.label ?? '',
      [SIDE.SIDE2]: groups[1]?.label ?? '',
      [SIDE.AXIS]: groups[2]?.label ?? '',
    },
    columns,
    rows,
    placements,
    axisColumnIndex,
    actorById,
    groupById,
    groupIndexById,
    sourceById,
    eventCount,
  }
}
