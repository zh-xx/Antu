// ============================================================
//  src/renderers/fact/timeline/grid.js — fact placement (the layout side)
//
//  Turns a fact spec into "which row and which column each event falls in".
//  **The data checks are in rules.js** (issue #26): this file asks that layer for
//  the field tables, then reports only what needs cell occupancy or column
//  capacity — more than three groups, two events in one cell.
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

import { tEn } from '../../../core/i18n.js'
import { analyzeFact, SIDE } from './rules.js'

export { SIDE }

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
  // The rule layer reads the spec and collects **data** errors; this file keeps only the placement
  // failures in its own `errors`, so validate and layout no longer return one mixed list (issue #26).
  // The renderer's entry point (layout.js) asks both layers, so it still reports every problem.
  const analysis = analyzeFact(spec)
  const {
    actors,
    groups,
    slots,
    actorById,
    groupById,
    groupIndexById,
    sourceById,
    byActor,
    sideOfActor,
    seenActorsOnSide,
    flat,
  } = analysis
  const errors = []

  const empty = {
    errors,
    byActor,
    sideLabels: { [SIDE.SIDE1]: '', [SIDE.SIDE2]: '', [SIDE.AXIS]: '' },
    columns: [],
    rows: [],
    placements: new Map(),
    axisColumnIndex: 0,
    actorById,
    groupById,
    groupIndexById,
    sourceById,
    eventCount: 0,
  }

  // ---------- capacity: the axis has only two sides plus the middle ----------
  if (groups.length > MAX_GROUPS) {
    errors.push(tEn('err.tooManyGroups', { at: 'groups', max: MAX_GROUPS, actual: groups.length }))
  }

  // Without an array of slots there is nowhere to place anything; the data error is already reported.
  if (!Array.isArray(slots)) return empty

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
    if (ids.length || !byActor)
      return ids.map((actorId) => ({
        key: `${side}:${actorId}`,
        side,
        actorId,
        actorName: actorById.get(actorId)?.name,
        named,
      }))
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
    if (col === undefined) return // bad data, already reported by rules.js

    eventCount += 1
    const row = rows[slotIndex]
    if (row.cells.has(key)) {
      const other = row.cells.get(key)
      errors.push(tEn('err.oneEventPerCell', { at: `slots[${slotIndex}]`, a: other.id, b: event.id }))
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
