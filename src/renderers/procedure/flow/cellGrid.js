// @ts-check
// ============================================================
//  cellGrid.js — Mainline flow uniform cell grid (issue 190)
//
//  Pure geometry: column placement on the cross axis, tier rows on the along axis,
//  and snapping stage bands to row borders after layout.
// ============================================================

const MIN_GAP = 112
const TIER_PAD = 24
const STAGE_GAP = 4

/**
 * @param {number | { w?: number, h?: number }} box
 * @returns {number}
 */
function boxCrossWidth(box) {
  if (typeof box === 'number') return box
  if (box && typeof box === 'object') {
    if (typeof box.w === 'number') return box.w
    if (typeof box.h === 'number') return box.h
  }
  return 0
}

/**
 * Uniform column span on the cross axis: every column is at least the widest box plus gap.
 * @param {Array<number | { w?: number, h?: number }>} boxes
 * @param {number} [minGap]
 */
export function computeUniformCellCross(boxes, minGap = MIN_GAP) {
  let maxW = 0
  for (const b of boxes) maxW = Math.max(maxW, boxCrossWidth(b))
  return Math.ceil(maxW + Math.max(minGap, MIN_GAP))
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} r
 * @param {boolean} vertical
 */
function crossOf(r, vertical) {
  if (vertical) return { c0: r.x, c1: r.x + r.w, cm: r.x + r.w / 2, span: r.w }
  return { c0: r.y, c1: r.y + r.h, cm: r.y + r.h / 2, span: r.h }
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} r
 * @param {boolean} vertical
 */
function alongOf(r, vertical) {
  if (vertical) return { a0: r.y, a1: r.y + r.h, am: r.y + r.h / 2 }
  return { a0: r.x, a1: r.x + r.w, am: r.x + r.w / 2 }
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} b
 * @param {boolean} vertical
 */
function boxCrossAlong(b, vertical) {
  if (vertical) return { c0: b.x, c1: b.x + b.w, a0: b.y, a1: b.y + b.h }
  return { c0: b.y, c1: b.y + b.h, a0: b.x, a1: b.x + b.w }
}

/**
 * @param {ReturnType<typeof crossOf>} a
 * @param {ReturnType<typeof crossOf>} b
 */
function crossOverlaps(a, b) {
  return a.c0 < b.c1 - 0.5 && b.c0 < a.c1 - 0.5
}

/**
 * Map each node centre onto an integer column lattice when layout already used uniform pitch.
 * @param {Array<{ cross: ReturnType<typeof crossOf>, col: number }>} items
 * @param {number} cellCross
 */
function assignColumnsLattice(items, cellCross) {
  if (!items.length) return 1
  const ref = Math.min(...items.map((it) => it.cross.cm))
  let origin = ref - cellCross / 2
  for (const it of items) {
    it.col = Math.round((it.cross.cm - origin) / cellCross - 0.5)
  }
  let sum = 0
  for (const it of items) {
    sum += it.cross.cm - (it.col + 0.5) * cellCross
  }
  origin = sum / items.length
  for (const it of items) {
    it.col = Math.round((it.cross.cm - origin) / cellCross - 0.5)
  }
  const minCol = Math.min(...items.map((it) => it.col))
  for (const it of items) it.col -= minCol
  return Math.max(0, ...items.map((i) => i.col)) + 1
}

/**
 * Colour cross-overlapping nodes into columns (same column ⇒ stacked along-axis only).
 * @param {Array<{ cross: ReturnType<typeof crossOf>, col: number }>} items
 */
function assignColumns(items) {
  const sorted = [...items].sort((a, b) => a.cross.cm - b.cross.cm)
  for (const it of sorted) {
    let col = 0
    for (;;) {
      const taken = sorted.filter((o) => o !== it && o.col === col)
      if (!taken.some((o) => crossOverlaps(o.cross, it.cross))) break
      col += 1
    }
    it.col = col
  }
  return Math.max(0, ...items.map((i) => i.col)) + 1
}

/**
 * @param {Array<{ cross: ReturnType<typeof crossOf>, col: number }>} items
 * @param {number} cellCross
 */
function originForColumns(items, cellCross) {
  /** @type {number[]} */
  const candidates = []
  for (const it of items) {
    candidates.push(it.cross.cm - (it.col + 0.5) * cellCross)
    candidates.push(it.cross.c0 - it.col * cellCross)
    candidates.push(it.cross.c1 - (it.col + 1) * cellCross)
  }
  candidates.sort((a, b) => a - b)
  let best = candidates[0]
  let bestScore = Infinity
  for (const origin of candidates) {
    let ok = true
    let score = 0
    for (const it of items) {
      const lo = origin + it.col * cellCross
      const hi = origin + (it.col + 1) * cellCross
      if (!(it.cross.c0 >= lo - 0.001 && it.cross.c1 <= hi + 0.001)) {
        ok = false
        break
      }
      const center = origin + (it.col + 0.5) * cellCross
      score += Math.abs(center - it.cross.cm)
    }
    if (ok && score < bestScore) {
      bestScore = score
      best = origin
    }
  }
  if (bestScore === Infinity) {
    const minC0 = Math.min(...items.map((i) => i.cross.c0))
    const minCol = Math.min(...items.map((i) => i.col))
    best = minC0 - minCol * cellCross
  }
  return best
}

/**
 * @param {Array<{ a0: number, a1: number }>} intervals
 */
function clusterTiers(intervals) {
  if (!intervals.length) return []
  const sorted = [...intervals].sort((a, b) => a.a0 - b.a0)
  /** @type {Array<{ a0: number, a1: number }>} */
  const tiers = []
  for (const iv of sorted) {
    const last = tiers[tiers.length - 1]
    if (last && iv.a0 <= last.a1 + 0.5) {
      last.a0 = Math.min(last.a0, iv.a0)
      last.a1 = Math.max(last.a1, iv.a1)
    } else {
      tiers.push({ a0: iv.a0, a1: iv.a1 })
    }
  }
  return tiers
}

/**
 * @param {Array<{ a0: number, a1: number }>} tiers
 * @param {Array<{ a0: number, a1: number }>} stageSpans
 */
function stageMidBoundaries(tiers, stageSpans) {
  if (stageSpans.length < 2 || tiers.length < 2) return []
  const ordered = [...stageSpans].sort((a, b) => a.a0 - b.a0)
  /** @type {number[]} */
  const mids = []
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const prevEnd = ordered[i].a1
    const nextStart = ordered[i + 1].a0
    const mid = (prevEnd + nextStart) / 2
    const inGap = tiers.every((t) => mid < t.a0 - 0.5 || mid > t.a1 + 0.5) ||
      tiers.some((t, ti) => ti < tiers.length - 1 && mid > t.a1 && mid < tiers[ti + 1].a0)
    if (inGap && nextStart > prevEnd) mids.push(mid)
  }
  return mids
}

/**
 * Along-axis extent of connection ink (polyline points + condition label boxes).
 * @param {Array<{ points?: number[][], labelAt?: { x: number, y: number }, labelSize?: { width: number, height: number } }>} connections
 * @param {boolean} vertical
 * @returns {{ min: number, max: number }}
 */
function connectionAlongExtent(connections, vertical) {
  let min = Infinity
  let max = -Infinity
  const alongIdx = vertical ? 1 : 0
  for (const c of connections) {
    for (const pt of c.points ?? []) {
      const a = pt[alongIdx]
      if (!Number.isFinite(a)) continue
      min = Math.min(min, a)
      max = Math.max(max, a)
    }
    if (c.labelAt && c.labelSize) {
      const a0 = vertical ? c.labelAt.y : c.labelAt.x
      const span = vertical ? c.labelSize.height : c.labelSize.width
      if (Number.isFinite(a0) && Number.isFinite(span)) {
        min = Math.min(min, a0)
        max = Math.max(max, a0 + span)
      }
    }
  }
  return { min, max }
}

/**
 * @param {{
 *   placed: Array<{ x: number, y: number, w: number, h: number }>,
 *   connections?: Array<{ points?: number[][], labelAt?: { x: number, y: number }, labelSize?: { width: number, height: number } }>,
 *   stageBoxes?: Array<{ x: number, y: number, w: number, h: number }>,
 *   vertical: boolean,
 *   cellCross?: number,
 *   cellAlong?: number,
 * }} input
 */
export function buildFlowCellGrid({ placed, connections = [], stageBoxes = [], vertical, cellCross, cellAlong }) {
  const isH = !vertical
  const placedArr =
  placed instanceof Map ? [...placed.values()] : Array.isArray(placed) ? placed : placed ? [placed] : []
  if (!placedArr.length) {
    const cc = typeof cellCross === 'number' && cellCross > 0 ? cellCross : MIN_GAP + MIN_GAP
    const ca = typeof cellAlong === 'number' && cellAlong > 0 ? cellAlong : cc
    return {
      isH,
      cellCross: cc,
      cellAlong: ca,
      originCross: 0,
      cols: 1,
      padColsLeft: 1,
      padColsRight: 1,
      rows: [{ start: 0, size: ca }],
      hasStages: false,
      stageColStart: 0,
      stageColCount: 1,
    }
  }

  const crossSpans = placedArr.map((r) => crossOf(r, vertical))
  const alongSpans = placedArr.map((r) => alongOf(r, vertical))
  const cc =
    typeof cellCross === 'number' && cellCross > 0
      ? cellCross
      : computeUniformCellCross(crossSpans.map((c) => c.span), MIN_GAP)

  /** @type {Array<{ cross: typeof crossSpans[0], col: number }>} */
  const items = crossSpans.map((cross) => ({ cross, col: 0 }))
  const cols =
    typeof cellCross === 'number' && cellCross > 0
      ? assignColumnsLattice(items, cc)
      : assignColumns(items)
  const originCross =
    typeof cellCross === 'number' && cellCross > 0
      ? items.reduce((s, it) => s + it.cross.cm - (it.col + 0.5) * cc, 0) / Math.max(1, items.length)
      : originForColumns(items, cc)

  let padColsLeft = 1
  let padColsRight = 1
  /** @type {number[]} */
  const crossCoords = []
  for (const c of connections) {
    for (const pt of c.points ?? []) {
      crossCoords.push(vertical ? pt[0] : pt[1])
    }
  }
  for (const b of stageBoxes) {
    const { c0, c1 } = boxCrossAlong(b, vertical)
    crossCoords.push(c0, c1)
  }
  for (const cr of crossCoords) {
    let grew = true
    while (grew) {
      grew = false
      if (cr < originCross - padColsLeft * cc - 0.5) {
        padColsLeft += 1
        grew = true
      }
      if (cr > originCross + cols * cc + padColsRight * cc + 0.5) {
        padColsRight += 1
        grew = true
      }
    }
  }

  const { min: minConnAlong, max: maxConnAlong } = connectionAlongExtent(connections, vertical)

  /** @type {Array<{ start: number, size: number }>} */
  let rows
  /** @type {number | undefined} */
  let cellAlongOut

  if (typeof cellAlong === 'number' && cellAlong > 0) {
    // Uniform lattice rows: snap every along-centre onto an integer row index.
    const ca = cellAlong
    /** @type {Array<{ am: number, row: number }>} */
    const alongItems = alongSpans.map((a) => ({ am: a.am, row: 0 }))
    const ref = alongItems.reduce((s, it) => s + it.am, 0) / Math.max(1, alongItems.length)
    let originAlong = ref - ca / 2
    for (const it of alongItems) {
      it.row = Math.round((it.am - originAlong) / ca - 0.5)
    }
    let sum = 0
    for (const it of alongItems) sum += it.am - (it.row + 0.5) * ca
    originAlong = sum / Math.max(1, alongItems.length)
    for (const it of alongItems) {
      it.row = Math.round((it.am - originAlong) / ca - 0.5)
    }
    let minRow = Math.min(...alongItems.map((it) => it.row))
    let maxRow = Math.max(...alongItems.map((it) => it.row))
    if (Number.isFinite(minConnAlong)) {
      minRow = Math.min(minRow, Math.floor((minConnAlong - 12 - originAlong) / ca))
    }
    if (Number.isFinite(maxConnAlong)) {
      maxRow = Math.max(maxRow, Math.ceil((maxConnAlong + 12 - originAlong) / ca) - 1)
    }
    if (!Number.isFinite(minRow) || !Number.isFinite(maxRow)) {
      minRow = 0
      maxRow = 0
    }
    rows = Array.from({ length: maxRow - minRow + 1 }, (_, i) => ({
      start: originAlong + (minRow + i) * ca,
      size: ca,
    }))
    cellAlongOut = ca
  } else {
    const tiers = clusterTiers(alongSpans)
    const stageAlong = stageBoxes.map((b) => {
      const { a0, a1 } = boxCrossAlong(b, vertical)
      return { a0, a1 }
    })
    const mids = stageMidBoundaries(tiers, stageAlong)

    const firstStageStart = stageAlong.length ? Math.min(...stageAlong.map((s) => s.a0)) : Infinity
    const lastStageEnd = stageAlong.length ? Math.max(...stageAlong.map((s) => s.a1)) : -Infinity
    const top = Math.min(
      firstStageStart,
      tiers[0].a0 - TIER_PAD,
      Number.isFinite(minConnAlong) ? minConnAlong - 14 : Infinity,
    )
    const bottom = Math.max(
      lastStageEnd,
      tiers[tiers.length - 1].a1 + TIER_PAD,
      Number.isFinite(maxConnAlong) ? maxConnAlong + 14 : -Infinity,
    )

    const rowBounds = [top]
    for (let i = 0; i < tiers.length - 1; i += 1) {
      const gap0 = tiers[i].a1
      const gap1 = tiers[i + 1].a0
      const stageMid = mids.find((m) => m > gap0 - 0.5 && m < gap1 + 0.5)
      rowBounds.push(stageMid !== undefined ? stageMid : (gap0 + gap1) / 2)
    }
    rowBounds.push(bottom)

    rows = []
    for (let i = 0; i < rowBounds.length - 1; i += 1) {
      const size = rowBounds[i + 1] - rowBounds[i]
      if (size > 0.5) rows.push({ start: rowBounds[i], size })
    }
    if (!rows.length) rows = [{ start: top, size: Math.max(TIER_PAD, bottom - top) }]
  }

  return {
    isH,
    cellCross: cc,
    ...(cellAlongOut != null ? { cellAlong: cellAlongOut } : {}),
    originCross,
    cols,
    padColsLeft,
    padColsRight,
    rows,
    hasStages: stageBoxes.length > 0,
    stageColStart: 0,
    stageColCount: cols,
  }
}

/**
 * Snap a cross-axis span onto exact column boundaries.
 * Expands past `[0, cols)` by whole columns only when content extends outside the content grid.
 * @param {number} c0
 * @param {number} c1
 * @param {number} originCross
 * @param {number} cellCross
 * @param {number} cols
 */
function snapCrossSpanToColumns(c0, c1, originCross, cellCross, cols) {
  let colStart = Math.floor((c0 - originCross) / cellCross + 1e-9)
  let colEnd = Math.ceil((c1 - originCross) / cellCross - 1e-9)
  if (colEnd <= colStart) colEnd = colStart + 1
  // Prefer covering the content grid when members sit inside it.
  if (c0 >= originCross - 0.5 && c1 <= originCross + cols * cellCross + 0.5) {
    colStart = Math.min(colStart, 0)
    colEnd = Math.max(colEnd, cols)
  }
  return {
    colStart,
    colEnd,
    cross0: originCross + colStart * cellCross,
    cross1: originCross + colEnd * cellCross,
  }
}

/**
 * @param {Array<{ x: number, y: number, w: number, h: number, stageId?: string }>} stageBoxes
 * @param {ReturnType<typeof buildFlowCellGrid>} cellGrid
 * @param {Array<{ x: number, y: number, w: number, h: number }>} placed
 * @param {boolean} vertical
 */
export function alignStageBoxesToCellGrid(stageBoxes, cellGrid, placed, vertical) {
  if (!stageBoxes.length || !cellGrid?.rows?.length) return
  const { originCross, cellCross, cols, rows } = cellGrid

  const rowBounds = rows.map((r) => r.start).concat(rows[rows.length - 1].start + rows[rows.length - 1].size)

  // Centre-in-box only: when adjacent stages sit on consecutive lattice rows, STAGE_PAD
  // chrome makes the raw bands overlap, and a loose AABB membership would pull the
  // previous stage's last node into the next band (poisoning the seam split below).
  const membersOf = (box) => {
    const { c0, c1, a0, a1 } = boxCrossAlong(box, vertical)
    return placed.filter((r) => {
      const p = boxCrossAlong(r, vertical)
      const cm = (p.c0 + p.c1) / 2
      const am = (p.a0 + p.a1) / 2
      return cm >= c0 - 0.5 && cm <= c1 + 0.5 && am >= a0 - 0.5 && am <= a1 + 0.5
    })
  }

  const alongOfBox = (b) => boxCrossAlong(b, vertical)

  let unionColStart = Infinity
  let unionColEnd = -Infinity

  for (const box of stageBoxes) {
    const members = membersOf(box)
    if (!members.length) continue
    let c0 = Infinity
    let c1 = -Infinity
    let a0 = Infinity
    let a1 = -Infinity
    for (const m of members) {
      const p = boxCrossAlong(m, vertical)
      c0 = Math.min(c0, p.c0)
      c1 = Math.max(c1, p.c1)
      a0 = Math.min(a0, p.a0)
      a1 = Math.max(a1, p.a1)
    }
    const { c0: bc0, c1: bc1, a0: ba0, a1: ba1 } = alongOfBox(box)
    const span = snapCrossSpanToColumns(
      Math.min(bc0, c0),
      Math.max(bc1, c1),
      originCross,
      cellCross,
      cols,
    )
    unionColStart = Math.min(unionColStart, span.colStart)
    unionColEnd = Math.max(unionColEnd, span.colEnd)

    const rowI0 = rowBounds.findIndex((b, i) => i < rowBounds.length - 1 && a0 >= b - 0.5 && a0 <= rowBounds[i + 1] + 0.5)
    const rowI1 = rowBounds.findIndex((b, i) => i < rowBounds.length - 1 && a1 >= b - 0.5 && a1 <= rowBounds[i + 1] + 0.5)
    const ri0 = Math.max(0, rowI0 < 0 ? 0 : rowI0)
    const ri1 = Math.max(ri0, rowI1 < 0 ? rows.length - 1 : rowI1)
    const along0 = Math.min(ba0, rowBounds[ri0])
    const along1 = Math.max(ba1, rowBounds[ri1 + 1] ?? rowBounds[rowBounds.length - 1])

    if (vertical) {
      box.x = span.cross0
      box.w = span.cross1 - span.cross0
      box.y = along0
      box.h = along1 - along0
    } else {
      box.y = span.cross0
      box.h = span.cross1 - span.cross0
      box.x = along0
      box.w = along1 - along0
    }
  }

  const byAlong = [...stageBoxes].sort((a, b) => alongOfBox(a).a0 - alongOfBox(b).a0)
  for (let i = 0; i < byAlong.length - 1; i += 1) {
    const cur = byAlong[i]
    const next = byAlong[i + 1]
    const ca = alongOfBox(cur)
    const na = alongOfBox(next)
    if (na.a0 < ca.a1 + STAGE_GAP - 0.5) {
      const mid = (ca.a1 + na.a0) / 2
      const halfGap = STAGE_GAP / 2
      const curMembers = membersOf(cur)
      const nextMembers = membersOf(next)
      const curMaxA1 = curMembers.length ? Math.max(...curMembers.map((m) => alongOfBox(m).a1)) : -Infinity
      const nextMinA0 = nextMembers.length ? Math.min(...nextMembers.map((m) => alongOfBox(m).a0)) : Infinity
      // Prefer snapping band seams onto existing row boundaries when a STAGE_GAP fits.
      let curEnd = Math.max(mid - halfGap, curMaxA1 + 8)
      let nextStart = Math.min(Math.max(curEnd + STAGE_GAP, mid + halfGap), nextMinA0 - 8)
      for (let ri = 0; ri < rowBounds.length - 1; ri += 1) {
        const seam = rowBounds[ri + 1]
        if (seam > curMaxA1 + 0.5 && seam < nextMinA0 - 0.5) {
          curEnd = seam - STAGE_GAP / 2
          nextStart = seam + STAGE_GAP / 2
          break
        }
      }
      if (vertical) {
        cur.h = Math.max(16, curEnd - cur.y)
        next.y = nextStart
        next.h = Math.max(16, na.a1 - next.y)
      } else {
        cur.w = Math.max(16, curEnd - cur.x)
        next.x = nextStart
        next.w = Math.max(16, na.a1 - next.x)
      }
    }
  }

  // Outer bands: pull first/last stage edges flush with the outer grid rows so U-loop
  // rails (and their labels) never poke past the stage box or the dashed perimeter.
  // Only grow outward — STAGE_GAP between adjacent stages stays untouched.
  if (byAlong.length && rowBounds.length >= 2) {
    const topBound = rowBounds[0]
    const botBound = rowBounds[rowBounds.length - 1]
    const first = byAlong[0]
    const last = byAlong[byAlong.length - 1]
    if (vertical) {
      if (first.y > topBound) {
        first.h += first.y - topBound
        first.y = topBound
      }
      if (last.y + last.h < botBound) last.h = botBound - last.y
    } else {
      if (first.x > topBound) {
        first.w += first.x - topBound
        first.x = topBound
      }
      if (last.x + last.w < botBound) last.w = botBound - last.x
    }
  }

  // Unify cross span onto one exact column range for every stage band.
  if (unionColStart === Infinity) {
    unionColStart = 0
    unionColEnd = cols
  }
  const cross0 = originCross + unionColStart * cellCross
  const cross1 = originCross + unionColEnd * cellCross
  const crossSpan = cross1 - cross0
  for (const b of stageBoxes) {
    if (vertical) {
      b.x = cross0
      b.w = crossSpan
    } else {
      b.y = cross0
      b.h = crossSpan
    }
  }

  cellGrid.hasStages = true
  cellGrid.stageColStart = unionColStart
  cellGrid.stageColCount = Math.max(1, unionColEnd - unionColStart)
}