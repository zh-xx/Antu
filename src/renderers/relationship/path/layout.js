// ============================================================
//  src/renderers/relationship/path/layout.js — the relation path (issue #93): how two parties are tied
//
//  The eighth way of drawing a relationship diagram, from the same JSON as the graph. Pick a start party A
//  and an end party B: the shortest chains of relations that tie them are drawn left to right, A on the
//  left. "How are these two connected?" is a different question from "who is around this party" (the focus
//  view), and the answer is a few chains, not a picture of everything.
//
//    walking   the direction of a relation is ignored when looking for a chain (a holder and what it holds
//              are tied), but each line keeps its own arrowhead, so the chain still says who holds whom
//    which     the shortest chains first, at most 3 (ties broken by the order the relations are written);
//              a chain may not pass a party twice. How many more there are is said under the picture
//    default   A and B are the two parties furthest apart (the ends of the longest shortest chain), so the
//              view is never empty; the reader picks others
//    under     each drawn chain written out as text, then the parties and relations on no drawn chain, so
//              every relation is on the page once
//
//  If A and B are not tied at all, the view says so. Any valid JSON draws. Pure JS, so Node computes the same
//  geometry for antu_layout and the tests check every example.
// ============================================================

import { validateRelationship, hintsOfRelationship, isDirected } from '../graph/rules.js'
import { sectionWriter, SECTION_GAP } from '../sections.js'
import { PAD, SCALE_HINT_ENTITIES } from '../graph/metrics.js'
import { makePartyData } from '../partyData.js'
import { tEn } from '../../../core/i18n.js'

export const MAX_CHAINS = 3
/** Chains longer than the shortest by more than this are not looked for */
const SLACK = 3
/** The search stops after this many chains found (a very tangled case); the count then says "at least" */
const SEARCH_CAP = 5000
const MIN_CONTENT_W = 760
const MIN_BOX_W = 150
/** Between two columns at the least; wider when a label has to sit on the line */
const MIN_GAP = 110
const PILL_MARGIN = 14
/** How far a bent line runs from its box before it turns, and the step between lines that turn side by side */
const TURN = 16
const TURN_STEP = 8
const CARD_CLEAR = 108

/** How wide a label's pill is (CJK wider than Latin; the page's pill has 9px of padding each side and wraps at 220) */
export const pillW = (text) => Math.min(220, 20 + [...text].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 12.5 : 7.4), 0))

/**
 * Which column each party of each chain stands in: the two ends in the first and the last, the parties between
 * in the columns in between, and a party that two chains pass in the same column in both, so the rows read as
 * one picture. The longest chain sets the columns; a party another chain adds takes a free column in its place
 * between its neighbours; when that cannot be done in order, that row is spaced on its own.
 * @returns number[][]  per chain, the column of each of its parties
 */
export function columnsOf(chains) {
  if (!chains.length) return []
  const mid = Math.max(...chains.map((c) => c.nodes.length - 2))
  const last = mid + 1
  const colOf = new Map()
  const result = []
  const order = chains.map((c, i) => i).sort((a, b) => chains[b].nodes.length - chains[a].nodes.length || a - b)
  for (const ci of order) {
    const nodes = chains[ci].nodes
    const k = nodes.length - 2
    const interior = nodes.slice(1, -1)
    // The columns the parties already have, then the gaps between them filled evenly
    let cols = interior.map((id) => colOf.get(id) ?? null)
    const known = cols.filter((v) => v !== null)
    let ok = known.every((v, i) => i === 0 || v > known[i - 1]) && known.every((v) => v >= 1 && v <= last - 1)
    if (ok) {
      let i = 0
      while (i < k && ok) {
        if (cols[i] !== null) {
          i += 1
          continue
        }
        let j = i
        while (j < k && cols[j] === null) j += 1
        const lo = i === 0 ? 0 : cols[i - 1]
        const hi = j === k ? last : cols[j]
        const room = hi - lo - 1
        const count = j - i
        if (room < count) {
          ok = false
          break
        }
        for (let n = 0; n < count; n += 1) cols[i + n] = lo + 1 + Math.floor((n * room) / count)
        i = j
      }
    }
    if (!ok) cols = interior.map((_, i) => 1 + Math.floor((i * (last - 1)) / Math.max(1, k)))
    // Strictly increasing whatever happened above
    for (let i = 0; i < k; i += 1) cols[i] = Math.min(Math.max(cols[i], i === 0 ? 1 : cols[i - 1] + 1), last - (k - i))
    interior.forEach((id, i) => {
      if (!colOf.has(id)) colOf.set(id, cols[i])
    })
    result[ci] = [0, ...cols, last]
  }
  return result
}

/** Distances from one party over every relation, direction ignored: Map id -> steps */
function distancesFrom(spec, from) {
  const next = new Map(spec.entities.map((e) => [e.id, []]))
  for (const r of spec.relations) {
    next.get(r.from).push(r.to)
    next.get(r.to).push(r.from)
  }
  const dist = new Map([[from, 0]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    for (const n of next.get(queue[i])) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(queue[i]) + 1)
        queue.push(n)
      }
    }
  }
  return dist
}

/** The two parties furthest apart (written order breaks ties), so the first view always has a chain */
export function defaultEnds(spec) {
  let best = null
  for (const a of spec.entities) {
    const dist = distancesFrom(spec, a.id)
    for (const b of spec.entities) {
      if (b.id === a.id || !dist.has(b.id)) continue
      if (best === null || dist.get(b.id) > best.d) best = { from: a.id, to: b.id, d: dist.get(b.id) }
    }
  }
  return best ? { from: best.from, to: best.to } : { from: spec.entities[0].id, to: spec.entities[Math.min(1, spec.entities.length - 1)].id }
}

/** The two ends actually used: the ones asked for when the data has both (and they differ), else the default */
export function endsOf(spec, asked = {}) {
  const has = (id) => spec.entities.some((e) => e.id === id)
  if (has(asked.from) && has(asked.to) && asked.from !== asked.to) return { from: asked.from, to: asked.to }
  return defaultEnds(spec)
}

/**
 * The chains from `from` to `to`: shortest first, then in written order of their relations.
 * @returns { chains: [{ nodes: id[], rels: relation[] }], total, truncated, shortest }
 *   chains: at most MAX_CHAINS; total: how many were found (counted up to SEARCH_CAP and SLACK longer than the shortest)
 */
export function findChains(spec, from, to) {
  const dist = distancesFrom(spec, to)
  if (!dist.has(from)) return { chains: [], total: 0, truncated: false, shortest: 0 }
  const shortest = dist.get(from)
  const adj = new Map(spec.entities.map((e) => [e.id, []]))
  spec.relations.forEach((r, i) => {
    adj.get(r.from).push({ r, i, other: r.to })
    adj.get(r.to).push({ r, i, other: r.from })
  })
  const found = []
  let truncated = false
  const walk = (id, nodes, rels, seen) => {
    if (found.length >= SEARCH_CAP) {
      truncated = true
      return
    }
    if (id === to) {
      found.push({ nodes: [...nodes], rels: [...rels] })
      return
    }
    // Stay within reach of the end: the steps left must cover the distance still to go
    for (const { r, other } of adj.get(id)) {
      if (seen.has(other)) continue
      if (rels.length + 1 + (dist.get(other) ?? Infinity) > shortest + SLACK) continue
      seen.add(other)
      nodes.push(other)
      rels.push(r)
      walk(other, nodes, rels, seen)
      rels.pop()
      nodes.pop()
      seen.delete(other)
    }
  }
  walk(from, [from], [], new Set([from]))
  const order = new Map(spec.relations.map((r, i) => [r.id, i]))
  found.sort((a, b) => a.rels.length - b.rels.length || a.rels.map((r) => order.get(r.id)).join(',').localeCompare(b.rels.map((r) => order.get(r.id)).join(','), undefined, { numeric: true }))
  // Two chains over the same relations (the same chain met twice) are one
  const seenKeys = new Set()
  const unique = found.filter((c) => {
    const key = c.rels.map((r) => r.id).sort().join('|')
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
  return { chains: unique.slice(0, MAX_CHAINS), total: unique.length, truncated, shortest }
}

export function buildPathGraph(spec, fields = {}) {
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
  const nameOf = (id) => entityById.get(id).label
  const ends = endsOf(spec, fields)
  const found = findChains(spec, ends.from, ends.to)

  // One picture: the two ends and every party on a drawn chain stand once. The shortest chain runs along the
  // top row; a party only a longer chain passes stands on a row of its own below, and the lines leave one
  // party and enter another at their own heights, so no two share a stretch (columnsOf gives the columns).
  const chains = found.chains
  const shortestLen = chains[0]?.rels.length ?? 0
  const cols = columnsOf(chains)
  const nCols = chains.length ? Math.max(...cols.flat()) + 1 : 0
  const boxW = Math.max(MIN_BOX_W, ...[...new Set(chains.flatMap((c) => c.nodes))].map((id) => party.sizes.get(id).w))
  const rowH = chains.length ? Math.max(...[...new Set(chains.flatMap((c) => c.nodes))].map((id) => party.sizes.get(id).h)) : 0

  // Each party's column (the first chain, longest first, that places it) and row (the first chain, shortest
  // first, that has it; a free row when another party already holds that column on that row)
  const colOf = new Map()
  chains
    .map((c, ci) => ci)
    .sort((x, y) => chains[y].nodes.length - chains[x].nodes.length || x - y)
    .forEach((ci) => chains[ci].nodes.forEach((id, i) => colOf.has(id) || colOf.set(id, cols[ci][i])))
  const rowOf = new Map()
  const taken = new Set()
  let rows = 0
  chains.forEach((c, ci) => {
    let own = null
    for (const id of c.nodes) {
      if (rowOf.has(id)) continue
      let r = ci === 0 ? 0 : own ?? Math.max(1, rows)
      while (taken.has(`${colOf.get(id)}:${r}`)) r += 1
      own = r
      rowOf.set(id, r)
      taken.add(`${colOf.get(id)}:${r}`)
      rows = Math.max(rows, r + 1)
    }
  })

  // The hops of every chain, once each (a relation two chains share is one line); heavy when a shortest chain has it
  const hops = []
  const hopOf = new Map()
  chains.forEach((c) =>
    c.rels.forEach((r, i) => {
      const heavy = c.rels.length === shortestLen
      if (hopOf.has(r.id)) {
        if (heavy) hopOf.get(r.id).heavy = true
        return
      }
      const hop = { r, a: c.nodes[i], b: c.nodes[i + 1], heavy }
      hopOf.set(r.id, hop)
      hops.push(hop)
    }),
  )
  for (const h of hops) {
    h.ca = colOf.get(h.a)
    h.cb = colOf.get(h.b)
    h.forward = h.cb > h.ca
    h.pw = pillW(textOf(h.r))
  }

  // The heights a party's lines use on its right and its left side, top to bottom in the order of the other end
  const side = (pick, key, cmp) => {
    const m = new Map()
    for (const h of hops.filter(pick)) {
      const id = h[key]
      if (!m.has(id)) m.set(id, [])
      m.get(id).push(h)
    }
    for (const list of m.values()) list.sort(cmp)
    return m
  }
  const other = (key) => (h) => [rowOf.get(h[key === 'a' ? 'b' : 'a']), colOf.get(h[key === 'a' ? 'b' : 'a'])]
  const byOther = (key) => (x, y) => {
    const [rx, cx] = other(key)(x)
    const [ry, cy2] = other(key)(y)
    return rx - ry || cx - cy2
  }
  const leaving = side((h) => h.forward, 'a', byOther('a'))
  const entering = side((h) => h.forward, 'b', byOther('b'))
  const PORT_STEP = Math.max(6, Math.min(14, (rowH - 16) / 3))
  const portIndex = (m, id, hop) => ({ i: m.get(id).indexOf(hop), n: m.get(id).length })
  const portY = (id, i, n) => rowY(rowOf.get(id)) + rowH / 2 + (i - (n - 1) / 2) * PORT_STEP
  const ROW_STEP = rowH + 64
  const rowY = (r) => PAD + CARD_CLEAR + r * ROW_STEP

  // Which side of the gap a bent line turns in: next to its first box, unless the row it would run along
  // there is taken by a party between; then next to its last box. A straight line has no turn.
  const occupied = (r, c0, c1) => [...colOf].some(([id, c]) => rowOf.get(id) === r && c > c0 && c < c1)
  for (const h of hops.filter((x) => x.forward)) {
    const ra = rowOf.get(h.a)
    const rb = rowOf.get(h.b)
    const la = portIndex(leaving, h.a, h)
    const lb = portIndex(entering, h.b, h)
    h.ya = portY(h.a, la.i, la.n)
    h.yb = portY(h.b, lb.i, lb.n)
    h.straight = Math.abs(h.ya - h.yb) < 0.5
    h.near = !h.straight && occupied(rb, h.ca, h.cb) && !occupied(ra, h.ca, h.cb) ? 'b' : 'a'
    h.la = la
    h.lb = lb
  }
  // A turn's distance from its box: lines that fan out of (or into) one box turn in an order that does not cross.
  // Those that go up from a box, or come into it from above, turn nearest the top one; the others nearest the bottom one.
  const turnOffsets = (groups, key) => {
    for (const list of groups.values()) {
      const turning = list.filter((h) => !h.straight && h.near === key)
      const above = turning.filter((h) => (key === 'a' ? h.yb < h.ya : h.ya < h.yb))
      const below = turning.filter((h) => !above.includes(h))
      above.forEach((h, i) => (h.turn = TURN + TURN_STEP * i))
      below.forEach((h, i) => (h.turn = TURN + TURN_STEP * (below.length - 1 - i)))
    }
  }
  turnOffsets(leaving, 'a')
  turnOffsets(entering, 'b')
  for (const h of hops.filter((x) => x.forward)) h.turn ??= TURN
  // Turns in one gap of the same side that would run along the same stretch (two boxes in a column, each with a
  // line turning there) are moved apart, outwards, until none shares a stretch
  for (const near of ['a', 'b']) {
    const byGap = new Map()
    for (const h of hops.filter((x) => x.forward && !x.straight && x.near === near)) {
      const k = near === 'a' ? h.ca : h.cb - 1
      if (!byGap.has(k)) byGap.set(k, [])
      byGap.get(k).push(h)
    }
    for (const list of byGap.values()) {
      const placed = []
      list.sort((u, v) => u.turn - v.turn || u.ya - v.ya)
      for (const h of list) {
        const lo = Math.min(h.ya, h.yb)
        const hi = Math.max(h.ya, h.yb)
        while (placed.some((o) => o.turn === h.turn && Math.min(hi, Math.max(o.ya, o.yb)) - Math.max(lo, Math.min(o.ya, o.yb)) > 0.5)) h.turn += TURN_STEP
        placed.push(h)
      }
    }
  }

  // The gap after column k holds what is written there: the labels on the lines that end at column k + 1
  // (or leave column k, when the turn is next to the last box), side by side, and the room for their turns
  const gap = Array.from({ length: Math.max(0, nCols - 1) }, () => MIN_GAP)
  const slots = Array.from({ length: Math.max(0, nCols - 1) }, () => [])
  for (const h of hops.filter((x) => x.forward)) {
    const k = h.near === 'b' ? h.ca : h.cb - 1
    slots[k].push(h)
  }
  slots.forEach((list, k) => {
    list.sort((x, y) => (x.near === 'b' ? x.ya : x.yb) - (y.near === 'b' ? y.ya : y.yb))
    const turns = Math.max(0, ...list.map((h) => h.turn ?? TURN))
    // When boxes lie between a line's two ends in the long row, that stretch runs over empty cells: no room needed there
    gap[k] = Math.max(gap[k], turns + list.reduce((n, h) => n + h.pw + 2 * PILL_MARGIN, 0))
  })
  const colX = [PAD]
  for (let k = 0; k < gap.length; k += 1) colX.push(colX[k] + boxW + gap[k])
  const contentRight = nCols ? colX[nCols - 1] + boxW : PAD
  const contentW = Math.max(contentRight - PAD, MIN_CONTENT_W - PAD * 2)
  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  const drawn = new Set()
  const drawnRels = new Set()
  const firstChain = chains[0]
  const endId = (id) => id === firstChain?.nodes[0] || id === firstChain?.nodes[firstChain.nodes.length - 1]
  for (const id of colOf.keys()) {
    drawn.add(id)
    nodes.push({
      id,
      type: 'rnode',
      position: { x: colX[colOf.get(id)], y: rowY(rowOf.get(id)) },
      data: { ...party.dataOf(entityById.get(id), { layer: 0, hintKey: 'rel.previewHint', vertical: false, end: endId(id) }), w: boxW, h: rowH, textW: boxW - 28 },
    })
  }
  const bottom = chains.length ? rowY(rows - 1) + rowH : PAD + CARD_CLEAR
  for (const h of hops) {
    drawnRels.add(h.r.id)
    const arrow = !isDirected(h.r) ? 'none' : h.r.from === h.a ? 'end' : 'start'
    const link = { kind: h.r.kind, ink: true, back: false, via: [], arrow, width: h.heavy ? 2.6 : 1.4 }
    const pill = { text: textOf(h.r), kind: h.r.kind, ink: true, back: false, relId: h.r.id }
    const xa = colX[h.ca] + boxW
    const xb = colX[h.cb ?? 0]
    if (h.forward) {
      const k = h.near === 'b' ? h.ca : h.cb - 1
      const list = slots[k]
      // Labels side by side on the stretch next to the end (or the start) of the line, in the order of their heights
      const i = list.indexOf(h)
      const before = list.slice(0, i).reduce((n, o) => n + o.pw + 2 * PILL_MARGIN, 0)
      const from = h.near === 'b' ? colX[k] + boxW : colX[k + 1] - list.reduce((n, o) => n + o.pw + 2 * PILL_MARGIN, 0)
      const labelX = from + before + PILL_MARGIN + h.pw / 2
      if (h.straight) link.d = `M ${xa} ${h.ya} L ${xb} ${h.yb}`
      else if (h.near === 'a') {
        const jx = xa + h.turn
        link.d = `M ${xa} ${h.ya} L ${jx} ${h.ya} L ${jx} ${h.yb} L ${xb} ${h.yb}`
      } else {
        const jx = xb - h.turn
        link.d = `M ${xa} ${h.ya} L ${jx} ${h.ya} L ${jx} ${h.yb} L ${xb} ${h.yb}`
      }
      layer.links.push(link)
      layer.pills.push({ ...pill, x: labelX, y: h.near === 'b' ? h.ya : h.yb })
    } else {
      // Against the reading, or in one column: out of the top or bottom edge and round, into the edge of the other
      const ra = rowOf.get(h.a)
      const rb = rowOf.get(h.b)
      const cxa = colX[h.ca] + boxW / 2
      const cxb = colX[h.cb] + boxW / 2
      const down = rb > ra
      if (h.ca === h.cb) {
        const y1 = down ? rowY(ra) + rowH : rowY(ra)
        const y2 = down ? rowY(rb) : rowY(rb) + rowH
        link.d = `M ${cxa} ${y1} L ${cxb} ${y2}`
        layer.links.push(link)
        layer.pills.push({ ...pill, x: cxa, y: (y1 + y2) / 2 })
      } else {
        const y1 = down ? rowY(ra) + rowH : rowY(ra)
        const y2 = down ? rowY(rb) : rowY(rb) + rowH
        const chan = down ? rowY(ra) + rowH + 22 : rowY(ra) - 22
        const chan2 = ra === rb ? rowY(ra) - 22 : chan
        const yy1 = ra === rb ? rowY(ra) : y1
        const yy2 = ra === rb ? rowY(rb) : y2
        link.d = `M ${cxa} ${yy1} L ${cxa} ${chan2} L ${cxb} ${chan2} L ${cxb} ${yy2}`
        layer.links.push(link)
        layer.pills.push({ ...pill, x: (cxa + cxb) / 2, y: chan2 })
      }
    }
  }
  let y = chains.length ? bottom + SECTION_GAP : PAD + CARD_CLEAR
  if (chains.length) {
    layer.texts.push({ x: PAD, y: y - SECTION_GAP + 14, w: contentW, main: t(chains.length > 1 ? 'rel.path.legend' : 'rel.path.legendOne', { n: shortestLen }), tone: 'note' })
    y += 24
  }
  const more = found.total - chains.length
  if (chains.length && (more > 0 || found.truncated)) {
    layer.texts.push({ x: PAD, y: y - SECTION_GAP + 14, w: contentW, main: t('rel.path.more', { n: more, atLeast: found.truncated ? 1 : 0 }), tone: 'note' })
    y += 24
  }

  const sections = sectionWriter(layer, contentW, y)
  const sep = t('rel.equity.sep')
  if (!chains.length) sections.empty(t('rel.path.noChain', { a: nameOf(ends.from), b: nameOf(ends.to) }), t('rel.path.noChainHint'))
  const off = entities.filter((e) => !drawn.has(e.id))
  const offRels = relations.filter((r) => !drawnRels.has(r.id))
  if (off.length) sections.section(t('rel.path.off', { n: off.length }), [{ main: off.map((e) => e.label).join(sep) }])
  if (offRels.length) {
    sections.section(
      t('rel.path.offRels', { n: offRels.length }),
      offRels.map((r) => ({ main: `${textOf(r)}${t('rel.equity.colon')}${nameOf(r.from)} → ${nameOf(r.to)}` })),
    )
  }
  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height
  nodes.unshift({
    id: '__path__',
    type: 'lineLayer',
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
    from: ends.from,
    to: ends.to,
    defaultEnds: defaultEnds(spec),
    chains: chains.length,
    totalChains: found.total,
    truncated: found.truncated,
    shortest: found.shortest,
    drawnParties: drawn.size,
    off: off.length,
    offRels: offRels.length,
    size: { width: Math.ceil(layer.width), height },
    stats: { entities: entities.length, relations: relations.length, groups: spec.groups?.length ?? 0, kinds },
  }
}
