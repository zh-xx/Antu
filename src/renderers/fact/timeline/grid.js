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
//   - the side is decided by groupId; 2 or more parties land on the axis
//   - distance follows the order of parties within a side
// ============================================================

import { SUMMARY_MAX, SUMMARY_MAX_EM, textEm } from '../cardGeometry.js'
import { tEn } from '../../../core/i18n.js'

export const SIDE = { SIDE1: 'side1', AXIS: 'axis', SIDE2: 'side2' }

/** Group limit: the axis has only two sides plus the middle, three positions */
const MAX_GROUPS = 3

/**
 * The built-in default view. Used when the data writes no `views`, and behaves exactly as
 * before views existed: split by group, no filtering by party.
 */
const DEFAULT_VIEW = { label: 'all', splitBy: 'group' }

/** Which views this data has. If none is written, one built-in view is given. */
export function viewsOf(spec) {
  const list = Array.isArray(spec?.views) ? spec.views.filter(isPlainObject) : []
  return list.length > 0 ? list : [DEFAULT_VIEW]
}

/** The list of parties a view declares for one side (deduplicated, order kept, string ids only) */
function viewActors(view, side) {
  const a = view?.[side]?.actors
  if (!Array.isArray(a)) return []
  return [...new Set(a.filter((x) => typeof x === 'string'))]
}

/** Side heading of a view: from the view when split by party, from groups when split by group */
function sideLabelsOf(view, groups) {
  if (view.splitBy === 'actor') {
    return {
      [SIDE.SIDE1]: view?.side1?.label ?? '',
      [SIDE.SIDE2]: view?.side2?.label ?? '',
      [SIDE.AXIS]: view?.axis?.label ?? '',
    }
  }
  return {
    [SIDE.SIDE1]: groups[0]?.label ?? '',
    [SIDE.SIDE2]: groups[1]?.label ?? '',
    [SIDE.AXIS]: groups[2]?.label ?? '',
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
export function buildGrid(spec, view) {
  const effectiveView = isPlainObject(view) ? view : viewsOf(spec)[0]
  const byActor = effectiveView.splitBy === 'actor'
  const in1 = viewActors(effectiveView, 'side1')
  const in2 = viewActors(effectiveView, 'side2')

  const errors = []
  const actors = Array.isArray(spec?.actors) ? spec.actors : []
  const groups = Array.isArray(spec?.groups) ? spec.groups : []
  const sources = Array.isArray(spec?.sources) ? spec.sources : []
  const slots = spec?.slots

  const empty = {
    errors,
    view: effectiveView,
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

  // ---------- view list ----------
  // Only the structure is validated (whether references exist, whether the two sides overlap);
  // which view is selected does not matter here. Whether an event fits depends on the current
  // view, and that is judged below.
  if (spec?.views !== undefined && spec?.views !== null) {
    if (!Array.isArray(spec.views)) {
      errors.push(tEn('err.viewsNotArray'))
    } else {
      spec.views.forEach((v, vi) => {
        const vAt = `views[${vi}]`
        if (!isPlainObject(v)) {
          errors.push(tEn('err.notObject', { at: vAt }))
          return
        }
        if (!v.label) errors.push(tEn('err.required', { at: vAt, field: 'label' }))
        if (v.splitBy !== 'actor' && v.splitBy !== 'group') {
          errors.push(
            tEn('err.badSplitBy', { at: vAt, value: v.splitBy }),
          )
        }
        if (v.splitBy === 'actor') {
          const a1 = viewActors(v, 'side1')
          const a2 = viewActors(v, 'side2')
          ;[...a1, ...a2].forEach((id) => {
            if (!actorById.has(id)) errors.push(tEn('err.missingRef', { at: vAt, field: 'side', kind: 'actor', id }))
          })
          const both = a1.filter((id) => a2.includes(id))
          if (both.length > 0) {
            errors.push(tEn('err.bothSides', { at: vAt, names: both.join(', ') }))
          }
        }
      })
    }
  }

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
      if (e.groupId && !groupIndexById.has(e.groupId)) {
        errors.push(tEn('err.missingRef', { at: eAt, field: 'groupId', kind: 'group', id: e.groupId }))
      }
      const srcIds = Array.isArray(e.sourceIds) ? e.sourceIds : []
      srcIds.forEach((id) => {
        if (!sourceById.has(id)) errors.push(tEn('err.missingRef', { at: eAt, field: 'sourceIds', kind: 'source', id }))
      })

      // ---------- side ----------
      // Two ways of looking at it:
      //   by party (view): whoever did it goes on their side; crossing both sides, or several
      //     parties on one side acting together, lands on the axis
      //   by group (data): groupId points at a group and the event goes to that side; 2 or more
      //     parties land on the axis
      const gi = e.groupId ? groupIndexById.get(e.groupId) : undefined
      let side
      let actorId = null

      if (byActor) {
        // When a view declares parties, only events involving them are shown (an event with no
        // party is an objective fact and is shown as usual).
        // When both sides of the view are empty ("chronology only") nothing is filtered and
        // everything lands on the axis.
        const inScope = [...in1, ...in2]
        if (
          inScope.length > 0 &&
          ids.length > 0 &&
          !ids.some((id) => inScope.includes(id))
        ) {
          return
        }
        if (ids.length === 1 && in1.includes(ids[0])) {
          side = SIDE.SIDE1
          actorId = ids[0]
        } else if (ids.length === 1 && in2.includes(ids[0])) {
          side = SIDE.SIDE2
          actorId = ids[0]
        } else {
        side = SIDE.AXIS // no party, crossing both sides, or several parties on one side acting together
        }
      } else if (ids.length >= 2) {
        side = SIDE.AXIS // several parties → the axis automatically
        if (gi === 0 || gi === 1) {
          errors.push(
            tEn('err.multiActorNeedsAxis', { at: eAt, n: ids.length, groupId: e.groupId }),
          )
        }
      } else if (e.groupId === undefined || e.groupId === null || e.groupId === '') {
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
  // entries sit closer to the axis), in both modes. A view only answers "who is on which side",
  // never "who is inside and who is outside": one meaning, said in one place.
  // When split by party, a column with no event is kept (an empty column is itself information:
  // this party did nothing in this kind of matter); when split by group, the columns are the
  // parties that appeared on that side.
  const actorOrder = actors.map((a) => (isPlainObject(a) ? a.id : null)).filter(Boolean)
  const columnsFor = (side) =>
    byActor
      ? actorOrder.filter((id) => viewActors(effectiveView, side).includes(id))
      : actorOrder.filter((id) => seenActorsOnSide[side].has(id))

  const columns = []
  // Side 1 is laid out to the left of the axis: the earlier a party is in the list the closer it
  // sits to the axis, and columns are laid out left to right, so this has to be reversed for the
  // column next to the axis to end up rightmost.
  columnsFor(SIDE.SIDE1)
    .reverse()
    .forEach((actorId) => {
      columns.push({ key: `${SIDE.SIDE1}:${actorId}`, side: SIDE.SIDE1, actorId, actorName: actorById.get(actorId)?.name })
    })
  const axisColumnIndex = columns.length
  columns.push({ key: SIDE.AXIS, side: SIDE.AXIS })
  columnsFor(SIDE.SIDE2).forEach((actorId) => {
    columns.push({ key: `${SIDE.SIDE2}:${actorId}`, side: SIDE.SIDE2, actorId, actorName: actorById.get(actorId)?.name })
  })

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
    view: effectiveView,
    sideLabels: sideLabelsOf(effectiveView, groups),
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
