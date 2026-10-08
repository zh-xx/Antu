// ============================================================
//  src/core/items.js — which item of the JSON a pinned card stands for (issue 152)
//
//  A host that mounts a diagram hears what the reader pins (`select`, src/embed/). What it wants is the item of
//  its own JSON and where that item comes from: a contract host scrolls its text to the clause in `loc`. The
//  renderers pin by the id of a canvas node, which is the item's id with, in some views, a mark of the view:
//  a rule row of the flowchart is `rule:<id>`, and an item a view draws more than once carries a mark and
//  where it is (`e-1@r0` on a relation path, `e-3@c1g0` in a guarantee chain, `n-1~e-2` for a copy in the
//  justification tree). Plain JS, no React, so a test checks it on every example and every kind: a view that
//  comes with a mark of its own fails there until the mark is added to VIEW_MARKS.
// ============================================================

/** How deep items are looked for: a fact's events are in `slots[].events[]`, one level down */
const MAX_DEPTH = 3

/** The marks a view puts between an item's id and where the copy stands */
const VIEW_MARKS = ['@', '~']

/**
 * The item a canvas node stands for.
 * @returns {{ collection: string, item: object } | null}  the name of the array it is in (`nodes`, `rules`,
 *          `events`, `entities`, …) and the item; null when the node is not one item (a run of events
 *          gathered on the scale, a decoration layer)
 */
export function itemOf(spec, nodeId) {
  if (!spec || typeof spec !== 'object' || nodeId == null) return null
  const raw = String(nodeId)
  const rule = raw.startsWith('rule:')
  const id = rule ? raw.slice('rule:'.length) : raw
  // the id as it is first (an id may itself hold a mark), then without the view's mark
  const found = find(spec, id, rule)
  const at = Math.max(...VIEW_MARKS.map((m) => id.lastIndexOf(m)))
  if (found || at <= 0) return found
  return find(spec, id.slice(0, at), rule)
}

function find(spec, id, rule) {
  // breadth first, so an item at the top wins over one of the same id further down
  let level = [spec]
  for (let depth = 0; depth < MAX_DEPTH && level.length; depth++) {
    const next = []
    for (const obj of level) {
      for (const [collection, list] of Object.entries(obj)) {
        if (!Array.isArray(list) || collection === 'sources') continue
        for (const x of list) {
          if (!x || typeof x !== 'object' || Array.isArray(x)) continue
          if (x.id === id && (!rule || collection === 'rules')) return { collection, item: x }
          next.push(x)
        }
      }
    }
    level = next
  }
  return null
}

/** The sources an item rests on, as written in `sources` (ids that name no source are left out) */
export function sourcesOf(spec, item) {
  const ids = Array.isArray(item?.sourceIds) ? item.sourceIds : []
  const all = Array.isArray(spec?.sources) ? spec.sources : []
  return ids.map((id) => all.find((s) => s?.id === id)).filter(Boolean)
}

/**
 * The `select` event for a pinned node, or for none (`nodeId` null: the reader closed the card).
 * `id` is the item's id when there is one, else the canvas node's.
 */
export function selectEvent(spec, nodeId) {
  if (nodeId == null) return { type: 'select', id: null, collection: null, sourceIds: [], sources: [] }
  const found = itemOf(spec, nodeId)
  if (!found) return { type: 'select', id: String(nodeId), collection: null, sourceIds: [], sources: [] }
  const { collection, item } = found
  return {
    type: 'select',
    id: item.id,
    collection,
    sourceIds: Array.isArray(item.sourceIds) ? [...item.sourceIds] : [],
    sources: sourcesOf(spec, item),
  }
}
