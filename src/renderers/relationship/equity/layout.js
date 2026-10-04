// ============================================================
//  src/renderers/relationship/equity/layout.js — the equity tree (issue #91): who holds what, top to bottom
//
//  The fourth way of drawing a relationship diagram, from the same JSON as the graph. Only `equity`
//  relations are drawn as the tree: a holder above what it holds, each line carrying its `share` as a
//  pill ("not stated" where the data has none). It is an aid for reading a case, not a due-diligence
//  chart: nothing is added to what the data says, and it does not claim to be complete.
//
//    tree      the parties with an equity relation, in levels (longest path from a holder that is held by
//              no one), the order inside a level chosen to keep the lines short
//    below     "Indirect holdings": for each ultimate holder (held by no one), what it holds through
//              others, as the sum of the products along each path ("55% × 80% = 44%"); only when every
//              share on every path is stated, otherwise the row says it cannot be computed
//              "Not in the equity tree": the parties with no equity relation
//              "Other relations": every relation that is not equity, as a list
//
//  A cross-holding (a cycle) is allowed: one line of each cycle is drawn dashed, upward, and flagged,
//  and it is left out of the levels and of the products. A line that skips levels goes around the boxes
//  between: it has a waypoint in each level, placed like a thin empty box. Every relation lands in exactly one place: a
//  line of the tree or a row of the list of the rest. Any valid JSON draws (no equity at all has an
//  explicit empty state). Pure JS, so Node computes the same geometry for antu_layout and the tests
//  check every example.
// ============================================================

import { validateRelationship, hintsOfRelationship } from '../graph/rules.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { wrapLineCount } from '../../fact/cardGeometry.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
const NODE_GAP = 40
/** The width a line's waypoint takes in a level, so boxes keep clear of the line */
const WAYPOINT_W = 16
/** How far a cross-holding line runs out to the right of the boxes, and between two of them */
const BULGE = 36
const BULGE_STEP = 26
/** Between two levels: room for the lines and the pills on them */
const LEVEL_GAP = 96
const MIN_CONTENT_W = 760
const SECTION_GAP = 28
const SECTION_PAD = 20
const SECTION_HEAD_H = 34
const LINE_FONT = 12.5
const LINE_LH = 19
/** At most this many rows in the list of indirect holdings; the rest is counted */
export const MAX_INDIRECT_ROWS = 30
const SCALE = { latin: 1.2, cjk: 1.06 }

const lines = (text, width, font) => Math.max(1, wrapLineCount(text, width / font, SCALE))

/** The text of a share: "55%" (a share may be 33.5) */
export const shareText = (share) => `${Number(Number(share).toFixed(2))}%`

/**
 * The structure of the tree, no geometry.
 * @returns {
 *   edges:     the equity relations, each with `back: true` when it closes a cross-holding,
 *   ids:       the parties in the tree, in written order,
 *   level:     Map id -> level (0 = held by no one),
 *   roots:     ids of the ultimate holders (no incoming line except a back line),
 *   rest:      relations that are not equity,
 *   apart:     entities with no equity relation,
 * }
 */
export function classifyEquity(spec) {
  const edges = spec.relations.filter((r) => r.kind === 'equity').map((r) => ({ rel: r, from: r.from, to: r.to, back: false }))
  const rest = spec.relations.filter((r) => r.kind !== 'equity')
  const inTree = new Set(edges.flatMap((e) => [e.from, e.to]))
  const ids = spec.entities.map((e) => e.id).filter((id) => inTree.has(id))
  const apart = spec.entities.filter((e) => !inTree.has(e.id))

  // Find the lines that close a cycle: a depth-first walk from the holders, then from what is left
  const out = new Map(ids.map((id) => [id, []]))
  for (const e of edges) out.get(e.from).push(e)
  const hasIn = new Set(edges.map((e) => e.to))
  const state = new Map() // 1 = on the stack, 2 = done
  const walk = (id) => {
    state.set(id, 1)
    for (const e of out.get(id)) {
      if (state.get(e.to) === 1) e.back = true
      else if (!state.has(e.to)) walk(e.to)
    }
    state.set(id, 2)
  }
  for (const id of ids) if (!hasIn.has(id) && !state.has(id)) walk(id)
  for (const id of ids) if (!state.has(id)) walk(id)

  // Level: the longest path from a holder over the lines that are not back lines
  const parents = new Map(ids.map((id) => [id, []]))
  for (const e of edges) if (!e.back) parents.get(e.to).push(e.from)
  const level = new Map()
  const depth = (id) => {
    if (level.has(id)) return level.get(id)
    const ps = parents.get(id)
    const d = ps.length ? 1 + Math.max(...ps.map(depth)) : 0
    level.set(id, d)
    return d
  }
  for (const id of ids) depth(id)
  const roots = ids.filter((id) => parents.get(id).length === 0 && !hasIn.has(id))
  return { edges, ids, level, roots, rest, apart }
}

/**
 * What each ultimate holder holds through others: for every holder R held by no one and every party X
 * below it reached by at least one path of two or more lines, the total over all paths of the product of
 * the shares, and the terms. `total` is null when a share on a path is not stated.
 * @returns [{ holder, held, total, terms: string[] | null }]
 */
export function indirectHoldings(spec, parts = classifyEquity(spec)) {
  const out = new Map(parts.ids.map((id) => [id, []]))
  for (const e of parts.edges) if (!e.back) out.get(e.from).push(e)
  const rows = []
  for (const root of parts.roots) {
    // All simple paths from the root: the tree is a DAG once back lines are out, so every walk ends
    const found = new Map() // held id -> { paths: number[][] | null (unknown), multi: bool }
    const go = (id, shares, known) => {
      for (const e of out.get(id)) {
        const next = [...shares, e.rel.share]
        const ok = known && typeof e.rel.share === 'number'
        const rec = found.get(e.to) ?? { paths: [], unknown: false, long: false }
        if (!ok) rec.unknown = true
        else rec.paths.push(next)
        if (next.length >= 2) rec.long = true
        found.set(e.to, rec)
        go(e.to, next, ok)
      }
    }
    go(root, [], true)
    for (const id of parts.ids) {
      const rec = found.get(id)
      if (!rec || !rec.long) continue
      if (rec.unknown) rows.push({ holder: root, held: id, total: null, terms: null })
      else {
        const products = rec.paths.map((p) => p.reduce((acc, s) => acc * (s / 100), 1) * 100)
        const total = products.reduce((a, b) => a + b, 0)
        rows.push({ holder: root, held: id, total: Math.round(total * 100) / 100, terms: rec.paths.map((p) => p.map(shareText).join(' × ')) })
      }
    }
  }
  return rows
}

export function buildEquityGraph(spec, fields = {}) {
  const errors = validateRelationship(spec)
  const hints = hintsOfRelationship(spec)
  const empty = { errors, hints, nodes: [], edges: [], connections: [], size: { width: 0, height: 0 }, stats: { entities: 0, relations: 0, groups: 0, kinds: {} } }
  if (errors.length) return empty
  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const entities = spec.entities
  const relations = spec.relations
  if (entities.length > SCALE_HINT_ENTITIES) hints.push(tEn('rhint.tooLarge', { n: entities.length, limit: SCALE_HINT_ENTITIES }))
  const entityById = new Map(entities.map((e) => [e.id, e]))
  const party = makePartyData(spec, t)
  const textIndex = new Map(relations.map((r, i) => [r.id, i]))
  const textOf = (r) => party.labelTexts[textIndex.get(r.id)]
  const parts = classifyEquity(spec)
  const nameOf = (id) => entityById.get(id).label

  // ── levels, and the order inside each ──
  const levels = []
  for (const id of parts.ids) {
    const l = parts.level.get(id)
    ;(levels[l] ??= []).push(id)
  }
  const above = new Map(parts.ids.map((id) => [id, []]))
  const below = new Map(parts.ids.map((id) => [id, []]))
  // A line that skips levels would run behind the boxes of the levels between; it gets a waypoint in each,
  // which is ordered and placed like a (thin, empty) box, so the line goes around the real ones
  const waypoints = new Map() // relation id -> ids of its waypoints, top to bottom
  for (const e of parts.edges) {
    if (e.back) continue
    const from = parts.level.get(e.from)
    const to = parts.level.get(e.to)
    const chain = [e.from]
    for (let l = from + 1; l < to; l++) {
      const id = `~${e.rel.id}~${l}`
      levels[l].push(id)
      above.set(id, [])
      below.set(id, [])
      chain.push(id)
    }
    waypoints.set(e.rel.id, chain.slice(1))
    chain.push(e.to)
    for (let i = 0; i + 1 < chain.length; i++) {
      above.get(chain[i + 1]).push(chain[i])
      below.get(chain[i]).push(chain[i + 1])
    }
  }
  const sweep = (lvl, neighbours, pos) => {
    const key = new Map(
      lvl.map((id, i) => {
        const ns = neighbours.get(id).map((n) => pos.get(n)).filter((p) => p !== undefined)
        return [id, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i]
      }),
    )
    // Stable: ties keep the written order
    return [...lvl].sort((a, b) => key.get(a) - key.get(b))
  }
  const posOf = (lvl) => new Map(lvl.map((id, i) => [id, i]))
  for (let pass = 0; pass < 4; pass++) {
    for (let l = 1; l < levels.length; l++) levels[l] = sweep(levels[l], above, posOf(levels[l - 1]))
    for (let l = levels.length - 2; l >= 0; l--) levels[l] = sweep(levels[l], below, posOf(levels[l + 1]))
  }

  // ── x: pack each level, then pull every box toward the middle of its neighbours ──
  const w = (id) => (id.startsWith('~') ? WAYPOINT_W : party.sizes.get(id).w)
  const h = (id) => (id.startsWith('~') ? 0 : party.sizes.get(id).h)
  const centre = new Map()
  const treeW = levels.length ? Math.max(...levels.map((lvl) => lvl.reduce((s, id) => s + w(id), 0) + NODE_GAP * (lvl.length - 1))) : 0
  for (const lvl of levels) {
    let x = (treeW - (lvl.reduce((s, id) => s + w(id), 0) + NODE_GAP * (lvl.length - 1))) / 2
    for (const id of lvl) {
      centre.set(id, x + w(id) / 2)
      x += w(id) + NODE_GAP
    }
  }
  const settle = (lvl, neighbours) => {
    const want = lvl.map((id) => {
      const ns = neighbours.get(id)
      return ns.length ? ns.reduce((s, n) => s + centre.get(n), 0) / ns.length : centre.get(id)
    })
    const pos = want.slice()
    for (let i = 1; i < lvl.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + w(lvl[i - 1]) / 2 + NODE_GAP + w(lvl[i]) / 2)
    // The push can only drift right: move the whole level back by the mean of what it was pushed
    const drift = pos.reduce((s, p, i) => s + (p - want[i]), 0) / (lvl.length || 1)
    lvl.forEach((id, i) => centre.set(id, pos[i] - drift))
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let l = 1; l < levels.length; l++) settle(levels[l], above)
    for (let l = levels.length - 2; l >= 0; l--) settle(levels[l], below)
  }
  let minX = Infinity
  let maxX = -Infinity
  for (const lvl of levels) {
    for (const id of lvl) {
      minX = Math.min(minX, centre.get(id) - w(id) / 2)
      maxX = Math.max(maxX, centre.get(id) + w(id) / 2)
    }
  }
  const treeSpan = parts.ids.length ? maxX - minX : 0
  const backCount = parts.edges.filter((e) => e.back).length
  const rightRoom = backCount ? BULGE + BULGE_STEP * (backCount - 1) + 24 : 0
  const contentW = Math.max(treeSpan + rightRoom, MIN_CONTENT_W - PAD * 2)
  const shift = PAD + (contentW - treeSpan - rightRoom) / 2 - (parts.ids.length ? minX : 0)

  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  const box = new Map()
  const waypoint = new Map()
  let y = PAD
  const levelTop = []
  levels.forEach((lvl, l) => {
    levelTop[l] = y
    const rowH = Math.max(...lvl.map(h))
    for (const id of lvl) {
      const x = centre.get(id) + shift - w(id) / 2
      const top = y + (rowH - h(id)) / 2
      if (id.startsWith('~')) {
        waypoint.set(id, [x + w(id) / 2, y + rowH / 2])
        continue
      }
      box.set(id, { x, y: top, w: w(id), h: h(id) })
      nodes.push({ id, type: 'rnode', position: { x, y: top }, data: party.dataOf(entityById.get(id), { layer: l, hintKey: 'rel.previewHint' }) })
    }
    y += rowH + (l < levels.length - 1 ? LEVEL_GAP : 0)
  })

  // ── the lines and their pills ──
  const bezier = (p0, p1, p2, p3, tt) => {
    const u = 1 - tt
    return [u * u * u * p0[0] + 3 * u * u * tt * p1[0] + 3 * u * tt * tt * p2[0] + tt * tt * tt * p3[0], u * u * u * p0[1] + 3 * u * u * tt * p1[1] + 3 * u * tt * tt * p2[1] + tt * tt * tt * p3[1]]
  }
  const through = (pts) => {
    // Smooth, with vertical tangents at every point: a cubic from each point to the next
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    const segs = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const [p, q] = [pts[i], pts[i + 1]]
      const ym = (p[1] + q[1]) / 2
      segs.push([p, [p[0], ym], [q[0], ym], q])
      d += ` C ${p[0]} ${ym} ${q[0]} ${ym} ${q[0]} ${q[1]}`
    }
    return { d, segs }
  }
  // Lines that meet in one party arrive side by side along its top edge, in the order they come from, so
  // their pills do not sit on one another
  const start = (e) => {
    const wp = waypoints.get(e.rel.id) ?? []
    return wp.length ? waypoint.get(wp.at(-1))[0] : box.get(e.from).x + box.get(e.from).w / 2
  }
  const entryX = new Map()
  for (const id of parts.ids) {
    const into = parts.edges.filter((e) => !e.back && e.to === id).sort((p, q) => start(p) - start(q))
    const b = box.get(id)
    into.forEach((e, i) => entryX.set(e.rel.id, b.x + (b.w * (i + 1)) / (into.length + 1)))
  }
  let backIndex = 0
  for (const e of parts.edges) {
    const a = box.get(e.from)
    const b = box.get(e.to)
    let d
    let at
    let via = []
    if (!e.back) {
      const pts = [[a.x + a.w / 2, a.y + a.h], ...(waypoints.get(e.rel.id) ?? []).map((id) => waypoint.get(id)), [entryX.get(e.rel.id), b.y]]
      const path = through(pts)
      via = pts.slice(1, -1)
      d = path.d
      // The pill sits nearer the held end, so lines meeting in one party do not put their pills together
      at = bezier(...path.segs.at(-1), 0.68)
    } else {
      // Upward, round the right of the boxes between the two: out of the lower holder's side, into the other's side
      const lo = parts.level.get(e.to)
      const hi = parts.level.get(e.from)
      let right = 0
      for (let l = lo; l <= hi; l++) for (const id of levels[l]) if (box.has(id)) right = Math.max(right, box.get(id).x + box.get(id).w)
      const bx = right + BULGE + BULGE_STEP * backIndex++
      const p0 = [a.x + a.w, a.y + a.h / 2]
      const p3 = [b.x + b.w, b.y + b.h / 2]
      d = `M ${p0[0]} ${p0[1]} C ${bx} ${p0[1]} ${bx} ${p3[1]} ${p3[0]} ${p3[1]}`
      at = bezier(p0, [bx, p0[1]], [bx, p3[1]], p3, 0.5)
    }
    layer.links.push({ d, back: e.back, via })
    const share = typeof e.rel.share === 'number' ? shareText(e.rel.share) : t('rel.equity.noShare')
    const text = e.back ? `${share} · ${t('rel.equity.cross')}` : share
    layer.pills.push({ x: at[0], y: at[1], text, unknown: typeof e.rel.share !== 'number', back: e.back, relId: e.rel.id })
  }

  y += levels.length ? SECTION_GAP : 0
  const sectionW = contentW
  const textW = sectionW - SECTION_PAD * 2
  const section = (title, items, tone = 'plain') => {
    const top = y
    let ly = top + SECTION_HEAD_H
    for (const it of items) {
      const hh = lines(it.main, textW, LINE_FONT) * LINE_LH + (it.sub ? lines(it.sub, textW, LINE_FONT) * LINE_LH : 0)
      layer.texts.push({ x: PAD + SECTION_PAD, y: ly, w: textW, main: it.main, sub: it.sub, tone: it.tone })
      ly += hh + 6
    }
    layer.frames.push({ x: PAD, y: top, w: sectionW, h: ly - top + SECTION_PAD - 6, tone, title, titleAt: [PAD + SECTION_PAD, top + 22] })
    y = ly + SECTION_PAD - 6 + SECTION_GAP
  }

  if (!parts.edges.length) {
    layer.empties.push({ x: PAD, y, w: sectionW, h: 84, text: t('rel.equity.noEquity'), sub: t('rel.equity.noEquityHint') })
    y += 84 + SECTION_GAP
  }

  // ── indirect holdings ──
  const indirect = indirectHoldings(spec, parts)
  if (indirect.length) {
    const shown = indirect.slice(0, MAX_INDIRECT_ROWS)
    const items = shown.map((r) =>
      r.total === null
        ? { main: `${nameOf(r.holder)} → ${nameOf(r.held)}: ${t('rel.equity.notComputable')}`, tone: 'note' }
        : { main: `${nameOf(r.holder)} → ${nameOf(r.held)}: ${shareText(r.total)}`, sub: r.terms.length > 1 || r.terms[0].includes('×') ? `${r.terms.join(' + ')}` : undefined },
    )
    if (indirect.length > shown.length) items.push({ main: t('rel.equity.moreRows', { n: indirect.length - shown.length }), tone: 'note' })
    section(t('rel.equity.indirect', { n: indirect.length }), items)
  }

  // ── parties with no equity relation ──
  if (parts.apart.length && parts.edges.length) {
    section(t('rel.equity.apart', { n: parts.apart.length }), [{ main: parts.apart.map((e) => e.label).join(t('rel.equity.sep')) }])
  }

  // ── every other relation, as a list ──
  if (parts.rest.length) {
    section(
      t('rel.equity.other', { n: parts.rest.length }),
      parts.rest.map((r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })),
    )
  }
  // With no equity at all the parties are listed too, so none is missing from the page
  if (parts.apart.length && !parts.edges.length) {
    section(t('rel.equity.apart', { n: parts.apart.length }), [{ main: parts.apart.map((e) => e.label).join(t('rel.equity.sep')) }])
  }

  const height = Math.ceil(y - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__equity__',
    type: 'equityLayer',
    position: { x: 0, y: 0 },
    // Decoration layer: 1×1 for React Flow, drawn at full size inside (see fact/timeline/nodes.js cellsNode)
    width: 1,
    height: 1,
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    style: { pointerEvents: 'none' },
    data: layer,
  })

  const kinds = {}
  for (const r of relations) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  return {
    errors,
    hints,
    nodes,
    edges: [],
    connections: [],
    levels: levels.length,
    holders: parts.roots.length,
    treeParties: parts.ids.length,
    equityLines: parts.edges.length,
    noShare: parts.edges.filter((e) => typeof e.rel.share !== 'number').length,
    crossHoldings: parts.edges.filter((e) => e.back).length,
    indirect: indirect.length,
    apart: parts.apart.length,
    other: parts.rest.length,
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
