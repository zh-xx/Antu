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
import { pathClear } from './hangSpineRoute.js'

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
 * After shifting the `to` end, ensure the last run enters a face mid-point instead of
 * riding along the target box's side face.
 * @param {number[][]} points
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {0|1} along
 * @param {0|1} cross
 */
function ensureEnterFaceMid(points, box, along, cross) {
  if (!points || points.length < 2 || !box) return
  const last = points.length - 1
  const p = points[last]
  const prev = points[last - 1]
  const eps = 0.75
  const onLeft = Math.abs(p[0] - box.x) < eps && Math.abs(prev[0] - box.x) < eps
  const onRight = Math.abs(p[0] - (box.x + box.w)) < eps && Math.abs(prev[0] - (box.x + box.w)) < eps
  const onTop = Math.abs(p[1] - box.y) < eps && Math.abs(prev[1] - box.y) < eps
  const onBot = Math.abs(p[1] - (box.y + box.h)) < eps && Math.abs(prev[1] - (box.y + box.h)) < eps
  if (!onLeft && !onRight && !onTop && !onBot) return
  /** @type {number[]} */
  const mid = [0, 0]
  if (onLeft || onRight) {
    mid[0] = onLeft ? box.x : box.x + box.w
    mid[1] = box.y + box.h / 2
  } else {
    mid[0] = box.x + box.w / 2
    mid[1] = onTop ? box.y : box.y + box.h
  }
  // Last run already at mid — nothing to do.
  if (Math.hypot(p[0] - mid[0], p[1] - mid[1]) < 0.5) return
  // Insert a bend so the final segment is the short outward stub into the mid.
  const bend = /** @type {number[]} */ ([mid[0], mid[1]])
  bend[along] = prev[along]
  bend[cross] = mid[cross]
  points[last] = [mid[0], mid[1]]
  if (Math.hypot(prev[0] - bend[0], prev[1] - bend[1]) > 0.5) {
    points.splice(last, 0, bend)
  }
}

/**
 * Shift one endpoint of an orthogonal polyline along the flow axis by `da`,
 * keeping every segment axis-aligned and ports attached.
 * When a 2-point horizontal cross-stage link's target moves, prefer an L-route into
 * the target's start/end face midpoint (never ride its side border).
 * @param {number[][]} points
 * @param {'from'|'to'} end
 * @param {number} da
 * @param {0|1} along
 * @param {0|1} cross
 * @param {{ x: number, y: number, w: number, h: number } | null} [targetBox]
 * @param {Map<string, { x: number, y: number, w: number, h: number }> | null} [placed]
 * @param {string | null} [fromId]
 * @param {string | null} [toId]
 */
function shiftEndpointOrtho(
  points,
  end,
  da,
  along,
  cross,
  targetBox = null,
  placed = null,
  fromId = null,
  toId = null,
  preferSideEnter = false,
) {
  if (!points?.length) return
  if (end === 'to') {
    const last = points.length - 1
    const wasTwo = points.length === 2
    const perp = last >= 1 && sameAlong(points[last], points[last - 1], along)
    points[last][along] += da
    if (!perp) {
      if (targetBox) ensureEnterFaceMid(points, targetBox, along, cross)
      return
    }
    // Cross-stage horizontal 2-point link: L-route into the shifted face midpoint,
    // or enter a free side face first when the trunk owns N/S (`preferSideEnter`).
    if (wasTwo && targetBox) {
      const boxA0 = along === 1 ? targetBox.y : targetBox.x
      const boxA1 = boxA0 + (along === 1 ? targetBox.h : targetBox.w)
      const faceAlong =
        da > 0 && boxA0 > points[0][along] + 0.5
          ? boxA0
          : da < 0 && boxA1 < points[0][along] - 0.5
            ? boxA1
            : null
      if (faceAlong !== null) {
        const boxC0 = cross === 0 ? targetBox.x : targetBox.y
        const boxC1 = boxC0 + (cross === 0 ? targetBox.w : targetBox.h)
        const boxCMid = (boxC0 + boxC1) / 2
        const boxAMid = (boxA0 + boxA1) / 2
        const origSideCross = points[0][cross]
        const pt = (c, a) => {
          const p = [0, 0]
          p[cross] = c
          p[along] = a
          return p
        }
        /** @param {number[][]} cand */
        const tryReplace = (cand) => {
          if (!placed || pathClear(cand, placed, fromId, toId)) {
            points.splice(0, points.length, ...cand)
            return true
          }
          return false
        }
        const tryFaceEnter = () =>
          tryReplace([[points[0][0], points[0][1]], pt(boxCMid, points[0][along]), pt(boxCMid, faceAlong)])
        const trySideEnter = () => {
          const sideCross = origSideCross <= boxCMid ? boxC0 : boxC1
          const gutters = []
          if (Math.abs(sideCross - origSideCross) >= 24) gutters.push((origSideCross + sideCross) / 2)
          gutters.push(origSideCross <= boxCMid ? boxC0 - 16 : boxC1 + 16)
          for (const g of gutters) {
            const cand = [
              [points[0][0], points[0][1]],
              pt(g, points[0][along]),
              pt(g, boxAMid),
              pt(sideCross, boxAMid),
            ]
            if (tryReplace(cand)) return true
          }
          return false
        }
        if (preferSideEnter) {
          if (trySideEnter() || tryFaceEnter()) return
        } else if (tryFaceEnter() || trySideEnter()) {
          return
        }
      }
    }
    if (last >= 2) {
      points[last - 1][along] += da
      if (targetBox) ensureEnterFaceMid(points, targetBox, along, cross)
      return
    }
    const bend = /** @type {number[]} */ ([0, 0])
    bend[cross] = points[last][cross]
    bend[along] = points[0][along]
    points.splice(1, 0, bend)
    if (targetBox) ensureEnterFaceMid(points, targetBox, along, cross)
    return
  }
  const perp = points.length >= 2 && sameAlong(points[0], points[1], along)
  points[0][along] += da
  if (!perp) return
  if (points.length === 2 && Math.abs(points[1][cross] - points[0][cross]) >= 32) {
    const midC = (points[0][cross] + points[1][cross]) / 2
    /** @type {number[]} */
    const b1 = [0, 0]
    b1[cross] = midC
    b1[along] = points[0][along]
    /** @type {number[]} */
    const b2 = [0, 0]
    b2[cross] = midC
    b2[along] = points[1][along]
    const cand = [
      [points[0][0], points[0][1]],
      b1,
      b2,
      [points[1][0], points[1][1]],
    ]
    if (!placed || pathClear(cand, placed, fromId, toId)) {
      points.splice(0, points.length, ...cand)
      return
    }
  }
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
 *   cellAlong?: number,
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
  cellAlong = 0,
}) {
  const along = /** @type {0|1} */ (vertical ? 1 : 0)
  const cross = /** @type {0|1} */ (vertical ? 0 : 1)
  const padStart = vertical ? STAGE_PAD_TOP : STAGE_PAD
  const spineSet = new Set(spine)

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
      if (fromIn && !toIn) {
        shiftEndpointOrtho(c.points, 'from', daAlong, along, cross, null, placed, c.from, c.to)
      }
      if (toIn && !fromIn) {
        const toBox = placed.get(c.to) ?? null
        const boxA = toBox ? (daAlong > 0 ? along0(toBox) : along1(toBox)) : 0
        const boxCM = toBox ? (cross0(toBox) + cross1(toBox)) / 2 : 0
        const preferSideEnter =
          (spineSet.has(c.to) && !spineSet.has(c.from)) ||
          Boolean(
            toBox &&
              connections.some((o) => {
                if (o === c || o.to !== c.to || !o.points?.length) return false
                const ep = o.points[o.points.length - 1]
                return (
                  Math.abs(ep[cross] - boxCM) < 1 &&
                  (Math.abs(ep[along] - boxA) < 1 || Math.abs(ep[along] + daAlong - boxA) < 1)
                )
              }),
          )
        shiftEndpointOrtho(c.points, 'to', daAlong, along, cross, toBox, placed, c.from, c.to, preferSideEnter)
      }
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
  let needAlong = OUTER_MIN + padStart - minA
  let needCross = OUTER_MIN + STAGE_PAD - minC
  // Keep lattice: outer pad shifts are integer multiples of cellAlong / cellCross.
  // (cellCross is not passed here; along-only quantise when cellAlong is set.)
  if (cellAlong > 0 && needAlong > 0) needAlong = Math.ceil(needAlong / cellAlong) * cellAlong
  if (needAlong > 0 || needCross > 0) {
    shiftWorld(Math.max(0, needAlong), Math.max(0, needCross), null)
  }

  // --- Separate consecutive runs --------------------------------------------
  // Drive gaps from *all* members so stage boxes can stay non-overlapping and
  // still wrap hangs. Runs follow spine order, so later-run spine nodes only
  // move down — never above an earlier-run trunk node they already followed.
  // With a uniform cellAlong lattice, only shift when adjacent stages are closer
  // than ~24px, and then by an integer multiple of cellAlong.
  const minSep = cellAlong > 0 ? 24 : FLOOR_GAP
  for (let si = 0; si < runs.length - 1; si += 1) {
    const prevIds = runs.slice(0, si + 1).flatMap((r) => r.memberIds)
    const nextRunIds = runs[si + 1].memberIds
    if (!prevIds.length || !nextRunIds.length) continue

    let prevEnd = -Infinity
    for (const id of prevIds) {
      const r = placed.get(id)
      if (r) prevEnd = Math.max(prevEnd, along1(r))
    }

    const nextRunSet = new Set(nextRunIds)
    const laterSet = new Set(runs.slice(si + 2).flatMap((r) => r.memberIds))
    /** @type {Map<string, string[]>} */
    const adj = new Map(nextRunIds.map((id) => [id, []]))
    for (const c of connections) {
      if (!nextRunSet.has(c.from) || !nextRunSet.has(c.to)) continue
      adj.get(c.from)?.push(c.to)
      adj.get(c.to)?.push(c.from)
    }
    const visited = new Set()
    /** @type {string[][]} */
    const comps = []
    for (const startId of nextRunIds) {
      if (visited.has(startId)) continue
      const comp = []
      const q = [startId]
      visited.add(startId)
      while (q.length) {
        const cur = /** @type {string} */ (q.shift())
        comp.push(cur)
        for (const nb of adj.get(cur) ?? []) {
          if (visited.has(nb)) continue
          visited.add(nb)
          q.push(nb)
        }
      }
      comps.push(comp)
    }

    for (const comp of comps) {
      let compStart = Infinity
      for (const id of comp) {
        const r = placed.get(id)
        if (r) compStart = Math.min(compStart, along0(r))
      }
      const gap = compStart - prevEnd
      if (!(gap < minSep)) continue
      let da = minSep - gap
      if (cellAlong > 0) da = Math.ceil(da / cellAlong) * cellAlong

      const compSet = new Set(comp)
      let overlapsPeer = false
      for (const cid of comp) {
        const rc = placed.get(cid)
        if (!rc) continue
        const a0 = along0(rc) + da
        const a1 = along1(rc) + da
        const c0 = cross0(rc)
        const c1 = cross1(rc)
        for (const oid of nextRunIds) {
          if (compSet.has(oid)) continue
          const ro = placed.get(oid)
          if (!ro) continue
          const o0 = along0(ro)
          const o1 = along1(ro)
          const oc0 = cross0(ro)
          const oc1 = cross1(ro)
          if (a0 < o1 - 0.5 && o0 < a1 - 0.5 && c0 < oc1 - 0.5 && oc0 < c1 - 0.5) {
            overlapsPeer = true
            break
          }
        }
        if (overlapsPeer) break
      }
      const feedsLater = connections.some((c) => compSet.has(c.from) && laterSet.has(c.to))
      if (!overlapsPeer && !feedsLater) {
        shiftWorld(da, 0, comp)
      } else {
        shiftWorld(da, 0, runs.slice(si + 1).flatMap((r) => r.memberIds))
      }
    }
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
  /** Member along-extents per run, for seam splits when chrome pads collide. */
  const runExtents = []
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
    runExtents.push({ a0, a1 })
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
  // Adjacent lattice rows leave < STAGE_PAD_TOP+STAGE_PAD between nodes; chrome pads
  // then overlap. Split the interstitial seam — do not shift nodes / insert blank rows.
  const SEAM_GAP = 4
  for (let i = 0; i < stageBoxes.length - 1; i += 1) {
    const cur = stageBoxes[i]
    const next = stageBoxes[i + 1]
    const extCur = runExtents[i]
    const extNext = runExtents[i + 1]
    if (!extCur || !extNext) continue
    const seam = (extCur.a1 + extNext.a0) / 2
    if (vertical) {
      if (next.y < cur.y + cur.h - 0.5) {
        cur.h = Math.max(16, seam - SEAM_GAP / 2 - cur.y)
        next.y = seam + SEAM_GAP / 2
        next.h = Math.max(16, extNext.a1 + STAGE_PAD - next.y)
      }
    } else if (next.x < cur.x + cur.w - 0.5) {
      cur.w = Math.max(16, seam - SEAM_GAP / 2 - cur.x)
      next.x = seam + SEAM_GAP / 2
      next.w = Math.max(16, extNext.a1 + STAGE_PAD - next.x)
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
