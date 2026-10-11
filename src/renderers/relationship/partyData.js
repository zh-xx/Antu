// ============================================================
//  src/renderers/relationship/partyData.js — what the graph's EntityNode needs about one party
//
//  The entity box (graph/EntityNode.jsx) is shared by every relationship kind, and it draws from one data
//  shape: the entity, its size, its group's name, its sources, and what it is related to (for the overlay).
//  A kind's layout decides where a box stands; this says what is in it, so the kinds cannot come to say it
//  differently.
// ============================================================

import { isDirected } from './graph/rules.js'
import { labelOf } from './graph/labelOf.js'
import { sizeOf } from './graph/metrics.js'
import { tEn } from '../../core/i18n.js'

/**
 * @param spec a valid relationship spec
 * @param t    the interface language's translate function (the default text on a relation with no label)
 * @returns { labelTexts, sizes, dataOf }
 *   labelTexts  the text each relation shows, in the order of spec.relations
 *   sizes       Map entity id -> { w, h, textW }
 *   dataOf(entity, extra)  the `data` of an entity node; `extra` is merged over it (layer, centre, ...)
 */
export function makePartyData(spec, t = tEn) {
  const entities = spec.entities
  const relations = spec.relations
  const sourceById = new Map((spec.sources ?? []).map((s) => [s.id, s]))
  const groupById = new Map((spec.groups ?? []).map((g) => [g.id, g]))
  const nameOf = new Map(entities.map((e) => [e.id, e.label]))
  const labelTexts = relations.map((r) => labelOf(r, t))
  const sizes = new Map(entities.map((e) => [e.id, sizeOf(e)]))
  const degree = new Map(entities.map((e) => [e.id, 0]))
  for (const r of relations) {
    degree.set(r.from, degree.get(r.from) + 1)
    degree.set(r.to, degree.get(r.to) + 1)
  }
  // What each party is related to: the other end and the text on the line
  const relationsOf = (id) =>
    relations
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.from === id || r.to === id)
      .map(({ r, i }) => ({
        id: r.id,
        kind: r.kind,
        directed: isDirected(r),
        out: r.from === id,
        other: nameOf.get(r.from === id ? r.to : r.from),
        text: labelTexts[i],
      }))
  const dataOf = (entity, extra = {}) => ({
    entity,
    w: sizes.get(entity.id).w,
    h: sizes.get(entity.id).h,
    textW: sizes.get(entity.id).textW,
    groupLabel: groupById.get(entity.groupId)?.label ?? '',
    sources: (entity.sourceIds ?? []).map((sid) => sourceById.get(sid)).filter(Boolean),
    sourceCount: (entity.sourceIds ?? []).filter((sid) => sourceById.has(sid)).length,
    relationCount: degree.get(entity.id),
    relations: relationsOf(entity.id),
    vertical: true,
    ...extra,
  })
  return { labelTexts, sizes, dataOf }
}
