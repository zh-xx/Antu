// @ts-check
// ============================================================
//  stackedStages.js — Mainline-first stacked stage bands (issue 190)
//
//  After a single straight-spine mainline layout, wrap stages as
//  non-overlapping bands along the flow axis (floors when vertical,
//  vertical strips when horizontal). Bands follow contiguous spine
//  *runs* (a stage revisited later on the trunk gets another band), so
//  FLOOR_GAP never pulls an earlier trunk node below a later one.
// ============================================================

import { STAGE_PAD_TOP, STAGE_PAD, PAD } from './metrics.js'

/** Room between consecutive stage bands: end pad + inter-floor gap + title pad. */
export const FLOOR_GAP = 72

/** Keep stage chrome (border + title) this far inside the canvas. */
const OUTER_MIN = 16

/**
 * Order stages by first spine encounter; off-spine stages insert just after the
 * spine stage that feeds them (same rule as the old mainline column fold).
 * @param {Array<{ id: string, label?: string }>} stagesList
 * @param {string[]} spineIds
 * @param {Array<{ id: string, stageId?: string }>} nodes
 * @param {Array<{ from: string, to: string }>} [groups]
 */
export function orderStagesBySpine(stagesList, spineIds, nodes, groups = []) {
  const stageOf = new Map(nodes.map((n) => [n.id, n.stageId]))
  const byIdStage = new Map(stagesList.map((st) => [st.id, st]))
  const seen = new Set()
  /** @type {typeof stagesList} */
  const ordered = []
  for (const id of spineIds) {
    const sid = stageOf.get(id)
    if (!sid || seen.has(sid)) continue
    const st = byIdStage.get(sid)
    if (!st) continue
    seen.add(sid)
    ordered.push(st)
  }
  const off = stagesList.filter((st) => !seen.has(st.id))
  for (const st of off) {
    let insertAt = ordered.length
    for (const g of groups) {
      if (stageOf.get(g.to) !== st.id) continue
      const fromSt = stageOf.get(g.from)
      const idx = ordered.findIndex((s) => s.id === fromSt)
      if (idx >= 0) {
        insertAt = Math.min(insertAt, idx + 1)
        break
      }
    }
    ordered.splice(insertAt, 0, st)
    seen.add(st.id)
  }
  return ordered
}

/**
 * Contiguous same-stage runs along the spine, plus hang members assigned to the
 * spatially nearest matching run. Off-spine-only stages become their own runs.
 * @param {Map<string, { x: number, y: number, w: number, h: number }>} placed
 * @param {Array<{ id: string, stageId?: string }>} nodes
 * @param {Array<{ id: string, label?: string }>} stages
 * @param {string[]} spine
 * @param {Array<{ from: string, to: string }>} groups
 * @param {boolean} vertical
 */
function buildStageRuns(placed, nodes, stages, spine, groups, vertical) {
  const stageOf = new Map(nodes.map((n) => [n.id, n.stageId]))
  const byIdStage = new Map(stages.map((st) => [st.id, st]))
  const spineSet = new Set(spine)
  const along0 = (r) => (vertical ? r.y : r.x)
  const alongMid = (r) => (vertical ? r.y + r.h / 2 : r.x + r.w / 2)

  /** @type {Array<{ stageId: string, label: string, memberIds: string[] }>} */
  const runs = []
  for (const id of spine) {
    if (!placed.has(id)) continue
    const sid = stageOf.get(id)
    if (!sid) continue
    const st = byIdStage.get(sid)
    if (!st) continue
    const last = runs[runs.length - 1]
    if (last && last.stageId === sid) last.memberIds.push(id)
    else runs.push({ stageId: sid, label: st.label ?? '', memberIds: [id] })
  }

  /** @type {Map<string, number[]>} stageId → run indices */
  const runsOf = new Map()
  runs.forEach((r, i) => {
    const list = runsOf.get(r.stageId)
    if (list) list.push(i)
    else runsOf.set(r.stageId, [i])
  })

  const runAlongSpan = (run) => {
    let a0 = Infinity
    let a1 = -Infinity
    for (const id of run.memberIds) {
      const r = placed.get(id)
      if (!r) continue
      a0 = Math.min(a0, along0(r))
      a1 = Math.max(a1, vertical ? r.y + r.h : r.x + r.w)
    }
    return { a0, a1, mid: (a0 + a1) / 2 }
  }

  // Hang / off-spine members → nearest run of the same stage (else new run).
  for (const id of placed.keys()) {
    if (spineSet.has(id)) continue
    const sid = stageOf.get(id)
    if (!sid || !byIdStage.has(sid)) continue
    const r = placed.get(id)
    if (!r) continue
    const idxs = runsOf.get(sid) ?? []
    if (!idxs.length) {
      const st = byIdStage.get(sid)
      if (!st) continue
      const run = { stageId: sid, label: st.label ?? '', memberIds: [id] }
      // Insert after the spine stage that feeds this stage (same as orderStagesBySpine off).
      let insertAt = runs.length
      for (const g of groups) {
        if (stageOf.get(g.to) !== sid) continue
        const fromSt = stageOf.get(g.from)
        const fromRun = runs.findIndex((x) => x.stageId === fromSt)
        if (fromRun >= 0) {
          insertAt = Math.min(insertAt, fromRun + 1)
          break
        }
      }
      runs.splice(insertAt, 0, run)
      // Rebuild index map after splice.
      runsOf.clear()
      runs.forEach((rr, i) => {
        const list = runsOf.get(rr.stageId)
        if (list) list.push(i)
        else runsOf.set(rr.stageId, [i])
      })
      continue
    }
    const mid = alongMid(r)
    let best = idxs[0]
    let bestDist = Infinity
    for (const i of idxs) {
      const span = runAlongSpan(runs[i])
      const dist =
        mid >= span.a0 && mid <= span.a1 ? 0 : Math.min(Math.abs(mid - span.a0), Math.abs(mid - span.a1))
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    runs[best].memberIds.push(id)
  }

  return runs.filter((run) => run.memberIds.some((id) => placed.has(id)))
}

/**
 * @param {number[]} p
 * @param {number[]} q
 * @param {0|1} along
 */
function sameAlong(p, q, along) {
  return Math.abs(p[along] - q[along]) < 0.5
}

/**
 * Shift one endpoint of an orthogonal polyline along the flow axis by `da`,
 * keeping every segment axis-aligned and ports attached.
 * @param {number[][]} points
 * @param {'from'|'to'} end
 * @param {number} da
 * @param {0|1} along
 * @param {0|1} cross
 */
function shiftEndpointOrtho(points, end, da, along, cross) {
  if (!points?.length) return
  if (end === 'to') {
    const last = points.length - 1
    const perp = last >= 1 && sameAlong(points[last], points[last - 1], along)
    points[last][along] += da
    if (!perp) return
    if (last >= 2) {
      points[last - 1][along] += da
      return
    }
    const bend = /** @type {number[]} */ ([0, 0])
    bend[cross] = points[last][cross]
    bend[along] = points[0][along]
    points.splice(1, 0, bend)
    return
  }
  const perp = points.length >= 2 && sameAlong(points[0], points[1], along)
  points[0][along] += da
  if (!perp) return
  if (points.length >= 3) {
    points[1][along] += da
    return
  }
  const bend = /** @type {number[]} */ ([0, 0])
  bend[cross] = points[0][cross]
  bend[along] = points[1][along]
  points.splice(1, 0, bend)
}

/**
 * Apply stacked stage bands on a finished Mainline-first layout (real coordinates).
 * Mutates `placed`, `connections`, and `size` in place.
 *
 * @param {{
 *   placed: Map<string, { x: number, y: number, w: number, h: number }>,
 *   connections: Array<{
 *     from: string,
 *     to: string,
 *     points: number[][],
 *     labelAt?: { x: number, y: number } | null,
 *     labelSize?: { width: number, height: number } | null,
 *   }>,
 *   size: { width: number, height: number },
 *   nodes: Array<{ id: string, stageId?: string }>,
 *   stages: Array<{ id: string, label?: string }>,
 *   spine: string[],
 *   vertical: boolean,
 *   groups?: Array<{ from: string, to: string }>,
 * }} args
 * @returns {{ stageBoxes: Array<{ stageId: string, label: string, x: number, y: number, w: number, h: number }> }}
 */
export function applyStackedStageBands({
  placed,
  connections,
  size,
  nodes,
  stages,
  spine,
  vertical,
  groups = [],
}) {
  const along = /** @type {0|1} */ (vertical ? 1 : 0)
  const cross = /** @type {0|1} */ (vertical ? 0 : 1)
  const padStart = vertical ? STAGE_PAD_TOP : STAGE_PAD

  const runs = buildStageRuns(placed, nodes, stages, spine, groups, vertical)
  if (runs.length === 0) return { stageBoxes: [] }

  const along0 = (r) => (vertical ? r.y : r.x)
  const along1 = (r) => (vertical ? r.y + r.h : r.x + r.w)
  const cross0 = (r) => (vertical ? r.x : r.y)
  const cross1 = (r) => (vertical ? r.x + r.w : r.y + r.h)

  /**
   * @param {number} daAlong
   * @param {number} daCross
   * @param {Iterable<string> | null} onlyIds null = all placed
   */
  const shiftWorld = (daAlong, daCross, onlyIds = null) => {
    if (daAlong === 0 && daCross === 0) return
    const set = onlyIds ? new Set(onlyIds) : null
    for (const [id, r] of placed) {
      if (set && !set.has(id)) continue
      if (vertical) {
        r.y += daAlong
        r.x += daCross
      } else {
        r.x += daAlong
        r.y += daCross
      }
    }
    for (const c of connections) {
      const fromIn = !set || set.has(c.from)
      const toIn = !set || set.has(c.to)
      if (fromIn && toIn) {
        for (const p of c.points) {
          p[along] += daAlong
          p[cross] += daCross
        }
        if (c.labelAt) {
          if (vertical) {
            c.labelAt.y += daAlong
            c.labelAt.x += daCross
          } else {
            c.labelAt.x += daAlong
            c.labelAt.y += daCross
          }
        }
        continue
      }
      if (!fromIn && !toIn) continue
      if (daCross !== 0) {
        for (const p of c.points) p[cross] += daCross
        if (c.labelAt) {
          if (vertical) c.labelAt.x += daCross
          else c.labelAt.y += daCross
        }
      }
      if (daAlong === 0) continue
      if (fromIn && !toIn) shiftEndpointOrtho(c.points, 'from', daAlong, along, cross)
      if (toIn && !fromIn) shiftEndpointOrtho(c.points, 'to', daAlong, along, cross)
      c.labelAt = null
    }
  }

  // --- Outer padding --------------------------------------------------------
  let minA = Infinity
  let minC = Infinity
  for (const r of placed.values()) {
    minA = Math.min(minA, along0(r))
    minC = Math.min(minC, cross0(r))
  }
  for (const c of connections) {
    for (const p of c.points) {
      minA = Math.min(minA, p[along])
      minC = Math.min(minC, p[cross])
    }
  }
  const needAlong = OUTER_MIN + padStart - minA
  const needCross = OUTER_MIN + STAGE_PAD - minC
  if (needAlong > 0 || needCross > 0) {
    shiftWorld(Math.max(0, needAlong), Math.max(0, needCross), null)
  }

  // --- Separate consecutive runs --------------------------------------------
  // Drive gaps from *all* members so stage boxes can stay non-overlapping and
  // still wrap hangs. Runs follow spine order, so later-run spine nodes only
  // move down — never above an earlier-run trunk node they already followed.
  for (let si = 0; si < runs.length - 1; si += 1) {
    const prevIds = runs.slice(0, si + 1).flatMap((r) => r.memberIds)
    const nextIds = runs.slice(si + 1).flatMap((r) => r.memberIds)
    if (!prevIds.length || !nextIds.length) continue

    let prevEnd = -Infinity
    for (const id of prevIds) {
      const r = placed.get(id)
      if (r) prevEnd = Math.max(prevEnd, along1(r))
    }
    let nextStart = Infinity
    for (const id of nextIds) {
      const r = placed.get(id)
      if (r) nextStart = Math.min(nextStart, along0(r))
    }
    if (!(nextStart < prevEnd + FLOOR_GAP)) continue
    const da = prevEnd + FLOOR_GAP - nextStart
    shiftWorld(da, 0, nextIds)
  }

  // --- Stage boxes: shared cross span, tight along wrap per run -------------
  let minC2 = Infinity
  let maxC = -Infinity
  for (const r of placed.values()) {
    minC2 = Math.min(minC2, cross0(r))
    maxC = Math.max(maxC, cross1(r))
  }
  for (const c of connections) {
    for (const p of c.points) {
      minC2 = Math.min(minC2, p[cross])
      maxC = Math.max(maxC, p[cross])
    }
  }
  const bandC0 = minC2 - STAGE_PAD
  const bandCross = maxC + STAGE_PAD - bandC0

  /** @type {Array<{ stageId: string, label: string, x: number, y: number, w: number, h: number }> } */
  const stageBoxes = []
  for (const run of runs) {
    let a0 = Infinity
    let a1 = -Infinity
    for (const id of run.memberIds) {
      const r = placed.get(id)
      if (!r) continue
      a0 = Math.min(a0, along0(r))
      a1 = Math.max(a1, along1(r))
    }
    if (!Number.isFinite(a0)) continue
    const boxA0 = a0 - padStart
    const boxA1 = a1 + STAGE_PAD
    if (vertical) {
      stageBoxes.push({
        stageId: run.stageId,
        label: run.label,
        x: bandC0,
        y: boxA0,
        w: bandCross,
        h: boxA1 - boxA0,
      })
    } else {
      stageBoxes.push({
        stageId: run.stageId,
        label: run.label,
        x: boxA0,
        y: bandC0,
        w: boxA1 - boxA0,
        h: bandCross,
      })
    }
  }

  // --- Canvas size ----------------------------------------------------------
  let width = 0
  let height = 0
  for (const b of stageBoxes) {
    width = Math.max(width, b.x + b.w + PAD)
    height = Math.max(height, b.y + b.h + PAD)
  }
  for (const r of placed.values()) {
    width = Math.max(width, r.x + r.w + PAD)
    height = Math.max(height, r.y + r.h + PAD)
  }
  for (const c of connections) {
    for (const [x, y] of c.points) {
      width = Math.max(width, x + PAD)
      height = Math.max(height, y + PAD)
    }
  }
  size.width = Math.max(size.width, width)
  size.height = Math.max(size.height, height)

  return { stageBoxes }
}
