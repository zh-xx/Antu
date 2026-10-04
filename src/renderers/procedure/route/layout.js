// ============================================================
//  src/renderers/procedure/route/layout.js — the route map (issue #95): the main line as one line
//
//  The second way of drawing a procedure, from the same JSON as the flowchart. The flowchart reads "stage
//  columns, nodes top to bottom"; this reads "one line to the end, and where the process can go wrong or
//  loop", like a route map:
//
//    the line     the main line (marked `main`, or inferred as the flowchart does), left to right; each node
//                 on it a station: a step a circle, a decision a diamond, the start a dot, an end a square,
//                 coloured by `outcome`; its label above the line, the party's name over it
//    stages       bands behind the stations of one stage
//    hanging      each other edge out of a station: a branch of boxes hanging below it, ending at an end box
//                 (early termination), at a return (back to the line, a dashed line to the station it
//                 returns to), or cut off after a few boxes ("... and N more")
//    arcs         an edge between two stations that is not along the line: a loop back to an earlier one, or
//                 a jump ahead, drawn as an arc below the hanging branches
//    under        what is not on the picture, so that every node is accounted for: the nodes no branch
//                 reached, the branches not followed, and the number of rules (the flowchart lists them)
//
//  Any valid JSON draws. Pure JS (no ELK): Node computes the same geometry for antu_layout and the tests
//  check every example.
// ============================================================

import { validateProcedure, hintsOfProcedure, ruleEndIds } from '../flow/rules.js'
import { PAD } from '../flow/metrics.js'
import { sectionWriter, SECTION_GAP } from '../../relationship/sections.js'
import { wrapLineCount } from '../../fact/cardGeometry.js'
import { tEn } from '../../../core/i18n.js'

// ---------- geometry ----------
/** The least distance between two stations, and the width of a hanging box */
export const STATION_GAP = 128
export const HANG_W = 120
const HANG_GAP = 14
const LABEL_FONT = 12
const LABEL_LH = 15
const LABEL_MAX_LINES = 4
const ACTOR_H = 14
const BAND_TITLE_H = 30
const LINE_TOP_GAP = 26
const BOX_FONT = 11.5
const BOX_LH = 14
/** A hanging box grows with its text (English wraps into more lines than Chinese); this only stops a runaway */
const BOX_MAX_LINES = 8
const BOX_PAD = 14
const CHAIN_GAP = 26
/** How many boxes a hanging branch shows before it says "... and N more" */
export const MAX_CHAIN = 4
const ARC_STEP = 24
const SCALE = { latin: 1.3, cjk: 1.06 }
const MIN_CONTENT_W = 640

const lineCount = (text, width, font, max) => Math.min(max, Math.max(1, wrapLineCount(text, width / font, SCALE)))

/**
 * The structure: the main line and what leaves it, no geometry.
 * @returns { spine, back, hangs, arcs, drawn, edgesDrawn, notFollowed, off }
 *   hangs: [{ from, cond, boxes: [node], tail: { type: 'end' | 'return' | 'cut' | 'merge' | 'none', to?, cond?, more? } }]
 *   arcs:  [{ from, to, cond, kind: 'loop' | 'jump' }] between stations
 */
export function classifyRoute(spec) {
  const nodes = spec.nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = nodes.map((n) => n.id)
  const outE = new Map(ids.map((id) => [id, []]))
  const inE = new Map(ids.map((id) => [id, []]))
  spec.edges.forEach((e, index) => {
    outE.get(e.from).push({ ...e, index })
    inE.get(e.to).push({ ...e, index })
  })
  // Back edges: the same walk as the flowchart's (an edge into a node still on the path)
  const back = new Set()
  const color = new Map()
  const walk = (u) => {
    color.set(u, 1)
    for (const e of outE.get(u)) {
      const c = color.get(e.to) ?? 0
      if (c === 1) back.add(e.index)
      else if (c === 0) walk(e.to)
    }
    color.set(u, 2)
  }
  const starters = [...ids.filter((id) => inE.get(id).length === 0), ...ids]
  for (const id of starters) if ((color.get(id) ?? 0) === 0) walk(id)

  // The main line: the flowchart's rule, so both views agree on what is the line
  const ruleEnds = new Set([...ruleEndIds(spec)].filter((id) => byId.has(id) && inE.get(id).length === 0))
  const entries = ids.filter((id) => inE.get(id).length === 0 && !ruleEnds.has(id))
  const spine = []
  {
    let cur = entries[0] ?? ids[0]
    const guard = new Set()
    while (cur !== undefined && !guard.has(cur)) {
      guard.add(cur)
      spine.push(cur)
      if (byId.get(cur).kind === 'end') break
      const outs = outE.get(cur)
      const pick = outs.find((e) => e.main === true) ?? outs.find((e) => !e.condition && !guard.has(e.to)) ?? outs.find((e) => !guard.has(e.to))
      cur = pick?.to
    }
  }
  const at = new Map(spine.map((id, i) => [id, i]))

  const drawn = new Set(spine)
  const hangs = []
  const arcsByPair = new Map()
  let edgesDrawn = 0
  let notFollowed = 0
  const used = new Set() // edge indexes accounted for

  for (const u of spine) {
    for (const e of outE.get(u)) {
      if (used.has(e.index)) continue
      const iu = at.get(u)
      if (at.has(e.to)) {
        used.add(e.index)
        edgesDrawn += 1
        if (at.get(e.to) === iu + 1 && (spine[iu + 1] === e.to)) continue // along the line
        const kind = at.get(e.to) <= iu ? 'loop' : 'jump'
        const key = `${u}|${e.to}`
        if (!arcsByPair.has(key)) arcsByPair.set(key, { from: u, to: e.to, kind, conds: [] })
        if (e.condition) arcsByPair.get(key).conds.push(e.condition)
        continue
      }
      // A branch: follow the first way on from the first box until it reaches the line, an end or a node already drawn
      used.add(e.index)
      edgesDrawn += 1
      const boxes = []
      let cur = e.to
      let tail = { type: 'none' }
      const seen = new Set()
      for (;;) {
        if (at.has(cur)) {
          tail = { type: 'return', to: cur }
          break
        }
        if (drawn.has(cur) && !boxes.some((b) => b.id === cur) && byId.get(cur).kind !== 'end') {
          tail = { type: 'merge', to: cur }
          break
        }
        if (seen.has(cur)) {
          tail = { type: 'merge', to: cur }
          break
        }
        seen.add(cur)
        if (boxes.length >= MAX_CHAIN) {
          tail = { type: 'cut', more: 1 }
          break
        }
        boxes.push(byId.get(cur))
        if (byId.get(cur).kind !== 'end') drawn.add(cur)
        else drawn.add(cur)
        if (byId.get(cur).kind === 'end') {
          tail = { type: 'end' }
          break
        }
        const outs = outE.get(cur)
        if (!outs.length) break
        const [first, ...others] = outs
        used.add(first.index)
        edgesDrawn += 1
        for (const o of others) {
          used.add(o.index)
          notFollowed += 1
        }
        cur = first.to
      }
      if (tail.type === 'cut') {
        // Count what the branch still has after the last box shown, so the picture says "... and N more"
        const rest = new Set()
        const stack = [cur]
        while (stack.length) {
          const x = stack.pop()
          if (rest.has(x) || at.has(x) || drawn.has(x)) continue
          rest.add(x)
          for (const o of outE.get(x)) stack.push(o.to)
        }
        tail.more = rest.size
        for (const x of rest) drawn.add(x)
      }
      hangs.push({ from: u, cond: e.condition ?? '', boxes, tail })
    }
  }
  const arcs = [...arcsByPair.values()].map((a) => ({ from: a.from, to: a.to, kind: a.kind, cond: a.conds.join(' / ') }))
  const off = nodes.filter((n) => !drawn.has(n.id))
  return { spine, back, hangs, arcs, drawn, edgesDrawn, notFollowed, off, ruleEnds, edgeCount: spec.edges.length }
}

export function buildRouteGraph(spec, fields = {}) {
  const errors = validateProcedure(spec)
  const hints = hintsOfProcedure(spec)
  const empty = { errors, hints, nodes: [], edges: [], connections: [], size: { width: 0, height: 0 }, stats: { nodes: 0, edges: 0, connections: 0, layers: 0, widest: 0, backEdges: 0 } }
  if (errors.length) return empty
  const t = typeof fields?.t === 'function' ? fields.t : tEn
  const nodes = spec.nodes
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const actorName = new Map((spec.actors ?? []).map((a) => [a.id, a.name]))
  const stageById = new Map((spec.stages ?? []).map((s) => [s.id, s]))
  const r = classifyRoute(spec)
  const { spine } = r

  // ── along the line: stations, and the room each station's hanging branches need ──
  const hangsOf = new Map(spine.map((id) => [id, []]))
  for (const h of r.hangs) hangsOf.get(h.from).push(h)
  const groupW = (id) => {
    const n = hangsOf.get(id).length
    return n ? n * HANG_W + (n - 1) * HANG_GAP : 0
  }
  const x = new Map()
  let cursor = PAD + STATION_GAP / 2
  spine.forEach((id, i) => {
    if (i > 0) {
      const prev = spine[i - 1]
      cursor += Math.max(STATION_GAP, groupW(prev) / 2 + groupW(id) / 2 + 24)
    }
    x.set(id, cursor)
  })
  const lastX = x.get(spine.at(-1))
  const lineW = lastX + STATION_GAP / 2 + PAD
  const width = Math.max(lineW, MIN_CONTENT_W)

  // ── across: the labels over the line decide how tall the top is ──
  const labelW = STATION_GAP - 16
  const labelInfo = new Map()
  let topBlock = 0
  for (const id of spine) {
    const n = byId.get(id)
    const lines = lineCount(n.label, labelW, LABEL_FONT, LABEL_MAX_LINES)
    const actor = (n.actorIds ?? []).map((a) => actorName.get(a)).filter(Boolean).join(t('rel.equity.sep'))
    const h = lines * LABEL_LH + (actor ? ACTOR_H : 0)
    labelInfo.set(id, { lines, actor, h })
    topBlock = Math.max(topBlock, h)
  }
  const hasStages = (spec.stages ?? []).length > 0
  const top = PAD
  const labelTop = top + (hasStages ? BAND_TITLE_H : 8)
  const lineY = labelTop + topBlock + LINE_TOP_GAP

  // ── below the line: the hanging branches, then the arcs ──
  const stations = spine.map((id) => {
    const n = byId.get(id)
    const li = labelInfo.get(id)
    return {
      id,
      kind: n.kind,
      outcome: n.outcome ?? 'neutral',
      x: x.get(id),
      y: lineY,
      label: n.label,
      detail: n.detail ?? '',
      actor: li.actor,
      labelBox: { x: x.get(id) - labelW / 2, y: lineY - 24 - li.h, w: labelW, h: li.h },
    }
  })
  const hangTop = lineY + 64
  const hangDraw = []
  let bottom = lineY + 24
  for (const id of spine) {
    const hs = hangsOf.get(id)
    const gw = groupW(id)
    hs.forEach((h, i) => {
      const cx = x.get(id) - gw / 2 + i * (HANG_W + HANG_GAP) + HANG_W / 2
      let y = hangTop
      const boxes = h.boxes.map((n) => {
        const lines = lineCount(n.label, HANG_W - 16, BOX_FONT, BOX_MAX_LINES)
        const hh = lines * BOX_LH + BOX_PAD
        const box = { id: n.id, kind: n.kind, outcome: n.outcome ?? 'neutral', label: n.label, detail: n.detail ?? '', x: cx - HANG_W / 2, y, w: HANG_W, h: hh }
        y += hh + CHAIN_GAP
        return box
      })
      let end = boxes.length ? y - CHAIN_GAP : hangTop
      let more = null
      if (h.tail.type === 'cut') {
        more = { x: cx - HANG_W / 2, y: end + CHAIN_GAP, w: HANG_W, h: 24, text: t('proc.route.more', { n: h.tail.more }) }
        end = more.y + more.h
      }
      bottom = Math.max(bottom, end)
      hangDraw.push({ from: id, cond: h.cond, cx, boxes, more, tail: h.tail, fromX: x.get(id), topY: hangTop })
    })
  }
  // Arcs run below everything that hangs: down at the outer side of the two groups, across, up. A branch that
  // returns to a station other than its own or the next one is an arc too, out of its last box, so that it
  // does not cut across the picture
  const idx = new Map(spine.map((id, i) => [id, i]))
  const arcSpecs = r.arcs.map((a) => ({ kind: a.kind, cond: a.cond, from: a.from, to: a.to, startX: x.get(a.from), start: 'station' }))
  for (const h of hangDraw) {
    if (h.tail.type !== 'return' || !h.boxes.length) continue
    if (Math.abs(idx.get(h.tail.to) - idx.get(h.from)) <= 1) continue
    const last = h.boxes.at(-1)
    arcSpecs.push({ kind: 'return', cond: '', from: h.from, to: h.tail.to, startX: last.x + last.w, startY: last.y + last.h / 2, start: 'box' })
    h.tail = { ...h.tail, asArc: true }
  }
  const arcDraw = []
  const arcBase = bottom + 36
  const sorted = [...arcSpecs].sort((a, b) => Math.abs(x.get(a.to) - a.startX) - Math.abs(x.get(b.to) - b.startX))
  sorted.forEach((a, k) => {
    const tx = x.get(a.to)
    const right = tx > a.startX
    const fromSide = right ? 1 : -1
    arcDraw.push({
      kind: a.kind,
      cond: a.cond,
      start: a.start,
      fromX: a.startX,
      fromY: a.startY,
      toX: tx,
      out: a.start === 'box' ? a.startX + 16 : a.startX + fromSide * (groupW(a.from) / 2 + 14),
      into: tx - fromSide * (groupW(a.to) / 2 + 14),
      depth: arcBase + k * ARC_STEP,
    })
  })
  const arcBottom = arcDraw.length ? arcBase + (arcDraw.length - 1) * ARC_STEP + 24 : bottom + 20
  const bandBottom = arcBottom + 8

  // ── stage bands: a run of stations of one stage ──
  const bands = []
  let runStart = null
  const stageOf = (id) => byId.get(id).stageId
  spine.forEach((id, i) => {
    const st = stageOf(id)
    const next = spine[i + 1]
    if (runStart === null) runStart = i
    if (next === undefined || stageOf(next) !== st) {
      if (st && stageById.has(st)) {
        const first = x.get(spine[runStart])
        const last = x.get(id)
        const pad = STATION_GAP / 2 - 6
        bands.push({ stageId: st, label: stageById.get(st).label, x: first - pad, w: last - first + pad * 2 })
      }
      runStart = null
    }
  })

  const nodesOut = []
  const layer = {
    width,
    height: 0,
    top,
    bandBottom,
    bands,
    lineY,
    lineFrom: x.get(spine[0]),
    lineTo: lastX,
    stations,
    hangs: hangDraw,
    arcs: arcDraw,
    links: [],
    pills: [],
    empties: [],
    frames: [],
    texts: [],
  }
  const sections = sectionWriter(layer, width - PAD * 2, bandBottom + SECTION_GAP)
  if (r.off.length) {
    sections.section(
      t('proc.route.off', { n: r.off.length }),
      r.off.map((n) => ({ main: `${n.label}${r.ruleEnds.has(n.id) ? t('proc.route.viaRule') : r.off.length ? '' : ''}`, tone: r.ruleEnds.has(n.id) ? 'note' : undefined })),
    )
  }
  if (r.notFollowed) sections.section(t('proc.route.notFollowed', { n: r.notFollowed }), [{ main: t('proc.route.notFollowedHint') }])
  const ruleCount = Array.isArray(spec.rules) ? spec.rules.length : 0
  if (ruleCount) sections.section(t('proc.route.rules', { n: ruleCount }), [{ main: t('proc.route.rulesHint') }])
  const height = Math.ceil(sections.y() - SECTION_GAP + PAD)
  layer.height = height
  nodesOut.push({
    id: '__route__',
    type: 'routeLayer',
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
  return {
    errors,
    hints,
    nodes: nodesOut,
    edges: [],
    connections: [],
    spine,
    stations: spine.length,
    hangs: r.hangs.length,
    arcs: r.arcs.length,
    loops: r.arcs.filter((a) => a.kind === 'loop').length,
    jumps: r.arcs.filter((a) => a.kind === 'jump').length,
    cut: r.hangs.filter((h) => h.tail.type === 'cut').length,
    off: r.off.length,
    notFollowed: r.notFollowed,
    edgesDrawn: r.edgesDrawn,
    edgeCount: r.edgeCount,
    rules: ruleCount,
    stagesShown: bands.length,
    size: { width: Math.ceil(width), height },
    stats: { nodes: nodes.length, edges: r.edgeCount, connections: r.edgesDrawn, layers: spine.length, widest: Math.max(0, ...[...hangsOf.values()].map((h) => h.length)) + 1, backEdges: r.arcs.filter((a) => a.kind === 'loop').length },
  }
}
