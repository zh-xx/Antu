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
const MIN_GAP = 140
const PILL_MARGIN = 14
const CARD_CLEAR = 108

/** How wide a label's pill is (CJK wider than Latin; the page's pill has 9px of padding each side and wraps at 220) */
const rawPillW = (text) => 20 + [...text].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 12.5 : 7.4), 0)
export const pillW = (text) => Math.min(220, rawPillW(text))
/** How tall a label's pill is: one line is 22, and each further line (a label wider than 220 wraps) is 18 more */
export const pillH = (text) => 22 + 18 * (Math.max(1, Math.ceil(rawPillW(text) / 220 - 1e-9)) - 1)

/**
 * Where each party stands, as a half-column (`pos`, even for the shortest chain, so its parties are every
 * other position) and a row (`row`, 0 for the shortest chain). The shortest chain is the main line, left to
 * right with nothing between its parties; a party only a longer chain passes stands above or below it, half
 * a column over, so the picture is a diamond (or a few of them) and not one long row. The first longer chain
 * goes below, the next above, and so on; a run of parties that follows a party already off the line goes one
 * row further out. A run of k parties needs 2k positions between its neighbours; the parties after are
 * moved right to make room, so the line only stretches where the chains need it.
 * @returns { pos: Map<id, number>, row: Map<id, number> }
 */
export function placeChains(chains) {
  const pos = new Map()
  const row = new Map()
  if (!chains.length) return { pos, row }
  chains[0].nodes.forEach((id, i) => {
    pos.set(id, 2 * i)
    row.set(id, 0)
  })
  const at = (r, p) => [...pos].some(([id, q]) => row.get(id) === r && q === p)
  let side = 1
  for (let ci = 1; ci < chains.length; ci += 1) {
    const nodes = chains[ci].nodes
    let usedSide = false
    let i = 0
    while (i < nodes.length) {
      if (pos.has(nodes[i])) {
        i += 1
        continue
      }
      let j = i
      while (j < nodes.length && !pos.has(nodes[j])) j += 1
      const run = nodes.slice(i, j)
      const k = run.length
      const before = nodes[i - 1]
      const after = nodes[j]
      const a0 = pos.get(before)
      let b0 = pos.get(after)
      if (b0 > a0 && b0 - a0 < 2 * k) {
        const d = 2 * k - (b0 - a0)
        for (const [id, q] of pos) if (q >= b0) pos.set(id, q + d)
        b0 += d
      }
      const ps = b0 <= a0 ? run.map((_, n) => a0 + 1 + 2 * n) : k === 1 ? [a0 + Math.round((b0 - a0) / 2)] : run.map((_, n) => a0 + 1 + Math.round((n * (b0 - a0 - 2)) / (k - 1)))
      const off = [before, after].map((id) => row.get(id)).filter((r) => r !== 0)
      let r0
      if (off.length) {
        const far = off.reduce((m, r) => (Math.abs(r) > Math.abs(m) ? r : m))
        r0 = far + Math.sign(far)
      } else {
        r0 = side
        usedSide = true
      }
      // The nearest row from there outwards where the run fits: no box within a column of its boxes, none
      // between its first and last box, and none under the line that comes down (or up) from the main line
      const fits = (r) => {
        const dir = Math.sign(r)
        for (const q of ps) for (let d = -1; d <= 1; d += 1) if (at(r, q + d)) return false
        if (k > 1 && [...pos].some(([id, q]) => row.get(id) === r && q > ps[0] && q < ps[k - 1])) return false
        for (const m of [before, after]) {
          if (Math.abs(row.get(m)) >= Math.abs(r)) continue
          for (let rr = row.get(m) + dir; rr !== r; rr += dir) if (at(rr, pos.get(m))) return false
        }
        return true
      }
      let r = r0
      for (let tries = 0; tries < 8 && !fits(r); tries += 1) r += Math.sign(r0)
      run.forEach((id, n) => {
        pos.set(id, ps[n])
        row.set(id, r)
      })
      i = j
    }
    if (usedSide) side = -side
  }
  return { pos, row }
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

  // One picture: the two ends and every party on a drawn chain stand once. The shortest chain is the main
  // line; a party only a longer chain passes stands above or below it (placeChains). A line between two
  // parties on one row is straight, left to right; one between rows leaves the party nearer the main line by
  // its top or bottom edge and turns once into the side of the other, so lines never run along each other.
  const chains = found.chains
  const shortestLen = chains[0]?.rels.length ?? 0
  const { pos, row } = placeChains(chains)
  const ids = [...pos.keys()]
  const boxW = Math.max(MIN_BOX_W, ...ids.map((id) => party.sizes.get(id).w))
  const rowH = ids.length ? Math.max(...ids.map((id) => party.sizes.get(id).h)) : 0
  const minRow = Math.min(0, ...row.values())
  const maxRow = Math.max(0, ...row.values())
  const nPos = ids.length ? Math.max(...pos.values()) + 1 : 0
  const ROW_STEP = rowH + 88
  const rowY = (r) => PAD + CARD_CLEAR + (r - minRow) * ROW_STEP
  const PORT_STEP = Math.max(6, Math.min(14, (rowH - 16) / 3))

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
      const hop = { r, a: c.nodes[i], b: c.nodes[i + 1], heavy, pw: pillW(textOf(r)) }
      hopOf.set(r.id, hop)
      hops.push(hop)
    }),
  )
  for (const h of hops) {
    const [pa, pb, ra, rb] = [pos.get(h.a), pos.get(h.b), row.get(h.a), row.get(h.b)]
    if (ra === rb) {
      h.type = 'row'
      ;[h.s, h.e] = pa <= pb ? [h.a, h.b] : [h.b, h.a]
    } else if (pa === pb) {
      h.type = 'col'
      ;[h.s, h.e] = ra < rb ? [h.a, h.b] : [h.b, h.a]
    } else {
      h.type = 'bend'
      const aNear = Math.abs(ra) < Math.abs(rb) || (Math.abs(ra) === Math.abs(rb) && pa < pb)
      ;[h.s, h.e] = aNear ? [h.a, h.b] : [h.b, h.a]
      h.dir = Math.sign(row.get(h.e) - row.get(h.s))
      h.toRight = pos.get(h.e) > pos.get(h.s)
    }
  }
  // Parallel lines on one row: each at its own height, the same at both ends
  const pairs = new Map()
  for (const h of hops.filter((x) => x.type === 'row')) {
    const key = [h.s, h.e].join('|')
    if (!pairs.has(key)) pairs.set(key, [])
    pairs.get(key).push(h)
  }
  for (const list of pairs.values()) {
    list.forEach((h, i) => {
      h.y = rowY(row.get(h.s)) + rowH / 2 + (i - (list.length - 1) / 2) * PORT_STEP
      h.slotOf = list
    })
  }
  // Lines that turn into the same side of a box: each at its own height, the one whose line comes from further
  // away the lower (higher, for a box above the line), so none crosses another
  const entries = new Map()
  for (const h of hops.filter((x) => x.type === 'bend')) {
    const key = `${h.e}|${h.toRight ? 'l' : 'r'}`
    if (!entries.has(key)) entries.set(key, [])
    entries.get(key).push(h)
  }
  // A side that also has lines along the row keeps them in the middle; the lines that turn in come in above
  // them (from above) or below them (from below)
  const along = new Map()
  for (const list of pairs.values()) {
    along.set(`${list[0].s}|r`, (along.get(`${list[0].s}|r`) ?? 0) + list.length)
    along.set(`${list[0].e}|l`, (along.get(`${list[0].e}|l`) ?? 0) + list.length)
  }
  for (const [key, list] of entries) {
    const far = (h) => Math.abs(pos.get(h.s) - pos.get(h.e))
    list.sort((u, v) => (u.dir > 0 ? far(u) - far(v) : far(v) - far(u)))
    const nr = along.get(key) ?? 0
    list.forEach((h, i) => {
      const centre = rowY(row.get(h.e)) + rowH / 2
      if (!nr) h.y = centre + (i - (list.length - 1) / 2) * PORT_STEP
      else h.y = h.dir > 0 ? centre - ((nr - 1) / 2 + list.length - i) * PORT_STEP : centre + ((nr - 1) / 2 + 1 + i) * PORT_STEP
    })
  }
  // The places a line leaves a box by its top or bottom edge: the line with the longest way to go leaves
  // nearest the middle, further lines further out on the side they turn to
  const exits = new Map()
  for (const h of hops.filter((x) => x.type === 'bend')) {
    const key = `${h.s}|${h.dir}|${h.toRight ? 'r' : 'l'}`
    if (!exits.has(key)) exits.set(key, [])
    exits.get(key).push(h)
  }
  for (const list of exits.values()) {
    list.sort((u, v) => Math.abs(v.y - rowY(row.get(v.s))) - Math.abs(u.y - rowY(row.get(u.s))))
    // Spread over the width of the box (never past its edge), the one with the longest way to go nearest the middle
    const reach = boxW / 2 - 14
    list.forEach((h, i) => {
      const at = list.length === 1 ? 14 : 14 + (i * (reach - 14)) / (list.length - 1)
      h.exitAt = (h.toRight ? 1 : -1) * Math.min(at, reach)
      h.exitRank = i
    })
  }

  // The width between positions: boxes on one row keep their labels' room apart, a line that turns into the
  // side of a box needs room beside the box it leaves
  const unit = Array.from({ length: Math.max(0, nPos - 1) }, () => (boxW + MIN_GAP) / 2)
  const need = []
  for (let r = minRow; r <= maxRow; r += 1) {
    const inRow = ids.filter((id) => row.get(id) === r).sort((u, v) => pos.get(u) - pos.get(v))
    for (let n = 1; n < inRow.length; n += 1) {
      const between = hops.filter((h) => h.type === 'row' && h.s === inRow[n - 1] && h.e === inRow[n])
      const labels = [...new Set(between.map((h) => h.slotOf))].reduce((w, list) => w + list.reduce((m, h) => m + h.pw + 2 * PILL_MARGIN, 0), 0)
      need.push({ a: pos.get(inRow[n - 1]), b: pos.get(inRow[n]), w: boxW + Math.max(MIN_GAP, labels) })
    }
  }
  for (const h of hops.filter((x) => x.type === 'bend')) {
    const [p, q] = [pos.get(h.s), pos.get(h.e)]
    need.push({ a: Math.min(p, q), b: Math.max(p, q), w: boxW / 2 + 56 + Math.abs(h.exitAt) })
  }
  for (let pass = 0; pass < 40; pass += 1) {
    let changed = false
    for (const c of need) {
      let have = 0
      for (let j = c.a; j < c.b; j += 1) have += unit[j]
      if (have < c.w - 0.01) {
        for (let j = c.a; j < c.b; j += 1) unit[j] += (c.w - have) / (c.b - c.a)
        changed = true
      }
    }
    if (!changed) break
  }
  const xc = (p) => PAD + boxW / 2 + unit.slice(0, p).reduce((n, w) => n + w, 0)
  const contentRight = nPos ? xc(nPos - 1) + boxW / 2 : PAD
  const contentW = Math.max(contentRight - PAD, MIN_CONTENT_W - PAD * 2)
  const nodes = []
  const layer = { width: contentW + PAD * 2, height: 0, links: [], pills: [], empties: [], frames: [], texts: [] }
  const drawn = new Set()
  const drawnRels = new Set()
  const firstChain = chains[0]
  const endId = (id) => id === firstChain?.nodes[0] || id === firstChain?.nodes[firstChain.nodes.length - 1]
  for (const id of ids) {
    drawn.add(id)
    nodes.push({
      id,
      type: 'rnode',
      position: { x: xc(pos.get(id)) - boxW / 2, y: rowY(row.get(id)) },
      data: { ...party.dataOf(entityById.get(id), { layer: 0, hintKey: 'rel.previewHint', vertical: false, end: endId(id) }), w: boxW, h: rowH, textW: boxW - 28 },
    })
  }
  const bottom = chains.length ? rowY(maxRow) + rowH : PAD + CARD_CLEAR
  const bends = []
  for (const h of hops) {
    drawnRels.add(h.r.id)
    const arrow = !isDirected(h.r) ? 'none' : h.r.from === h.s ? 'end' : 'start'
    const link = { kind: h.r.kind, ink: true, back: false, via: [], arrow, width: h.heavy ? 2.6 : 1.4 }
    const pill = { text: textOf(h.r), kind: h.r.kind, ink: true, back: false, relId: h.r.id }
    if (h.type === 'row') {
      // Straight; the labels of parallel lines side by side between the two boxes, each on its own line
      const x1 = xc(pos.get(h.s)) + boxW / 2
      const x2 = xc(pos.get(h.e)) - boxW / 2
      const total = h.slotOf.reduce((n, o) => n + o.pw + 2 * PILL_MARGIN, 0)
      const before = h.slotOf.slice(0, h.slotOf.indexOf(h)).reduce((n, o) => n + o.pw + 2 * PILL_MARGIN, 0)
      link.d = `M ${x1} ${h.y} L ${x2} ${h.y}`
      layer.links.push(link)
      layer.pills.push({ ...pill, x: x1 + (x2 - x1 - total) / 2 + before + PILL_MARGIN + h.pw / 2, y: h.y })
    } else if (h.type === 'col') {
      const x = xc(pos.get(h.s))
      const y1 = rowY(row.get(h.s)) + rowH
      const y2 = rowY(row.get(h.e))
      link.d = `M ${x} ${y1} L ${x} ${y2}`
      layer.links.push(link)
      layer.pills.push({ ...pill, x, y: (y1 + y2) / 2 })
    } else {
      // Out of the top or bottom edge of the party nearer the main line, then into the side of the other
      const px = xc(pos.get(h.s)) + h.exitAt
      const y0 = rowY(row.get(h.s)) + (h.dir > 0 ? rowH : 0)
      const xe = xc(pos.get(h.e)) + (h.toRight ? -boxW / 2 : boxW / 2)
      link.d = `M ${px} ${y0} L ${px} ${h.y} L ${xe} ${h.y}`
      layer.links.push(link)
      const placed = { ...pill, x: px, y: y0 + h.dir * 30 }
      layer.pills.push(placed)
      bends.push({ pill: placed, link: layer.links.length - 1, h, px, y0, xe })
    }
  }
  // The labels of lines that turn: each at the spot (down the line out of the box, or along the turn) where it
  // covers no other label, no box and as few other lines as possible
  const polyline = (d) => {
    const pts = [...d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => [+m[1], +m[2]])
    return pts.slice(1).map((q, i) => [pts[i], q])
  }
  const cover = (r, [a, b]) => Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h
  const rectOf = (pl, w) => ({ x: pl.x - w / 2, y: pl.y - pillH(pl.text) / 2, w, h: pillH(pl.text) })
  const linePieces = layer.links.map((l) => polyline(l.d))
  const taken = layer.pills.filter((pl) => !bends.some((b) => b.pill === pl)).map((pl) => rectOf(pl, pillW(pl.text)))
  const boxRects = nodes.filter((n) => n.type === 'rnode').map((n) => ({ x: n.position.x, y: n.position.y, w: boxW, h: rowH }))
  for (const b of bends) {
    const w = pillW(b.pill.text)
    const { px, y0, xe, h } = b
    const spots = []
    for (const f of [0.5, 0.25, 0.75, 0.38, 0.62]) {
      const lo = y0 + h.dir * 20
      const hi = h.y - h.dir * 16
      if ((hi - lo) * h.dir >= 0) spots.push([px, lo + (hi - lo) * f])
    }
    // Or slid along the line's width: a wide label may hang to one side of its line (the line still runs through it)
    const slide = w / 2 - 14
    for (const f of [0.5, 0.25, 0.75]) {
      const lo = y0 + h.dir * 20
      const hi = h.y - h.dir * 16
      if ((hi - lo) * h.dir >= 0 && slide > 8) for (const dx of [slide, -slide]) spots.push([px + dx, lo + (hi - lo) * f])
    }
    if (Math.abs(xe - px) >= w + 12) spots.push([(px + xe) / 2, h.y])
    if (!spots.length) spots.push([px, y0 + h.dir * 30])
    let best = null
    for (const [x, yy] of spots) {
      const r = rectOf({ x, y: yy, text: b.pill.text }, w)
      const bad = taken.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h) || boxRects.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h)
      const inner = { x: r.x + 3, y: r.y + 2, w: r.w - 6, h: r.h - 4 }
      const crossing = linePieces.reduce((n, segs, i) => (i === b.link ? n : n + segs.filter((sg) => cover(inner, sg)).length), 0)
      const score = (bad ? 1000 : 0) + crossing
      if (!best || score < best.score) best = { score, x, y: yy }
      if (score === 0) break
    }
    b.pill.x = best.x
    b.pill.y = best.y
    taken.push(rectOf(b.pill, w))
  }
  let y = chains.length ? bottom + SECTION_GAP : PAD + CARD_CLEAR
  const more = found.total - chains.length
  if (chains.length && (more > 0 || found.truncated)) {
    layer.texts.push({ x: PAD, y: y - SECTION_GAP + 14, w: contentW, main: t('rel.path.more', { n: more, atLeast: found.truncated ? 1 : 0 }), tone: 'note' })
    y += 24
  }

  const sections = sectionWriter(layer, contentW, y)
  if (!chains.length) sections.empty(t('rel.path.noChain', { a: nameOf(ends.from), b: nameOf(ends.to) }), t('rel.path.noChainHint'))
  const off = entities.filter((e) => !drawn.has(e.id))
  const offRels = relations.filter((r) => !drawnRels.has(r.id))
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
