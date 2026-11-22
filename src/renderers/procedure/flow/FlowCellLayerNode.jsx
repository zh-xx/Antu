// @ts-check
// ============================================================
//  FlowCellLayerNode.jsx — mainline flow cell grid (issue 190)
//
//  Ultra-light thin solid interior seams. With stage boxes present,
//  only draw lines strictly inside each stage (StageBoxNode owns the
//  stage perimeter). Without stages, draw the full uniform lattice.
// ============================================================

import { memo } from 'react'
import { useStore } from '@xyflow/react'
import { useTheme } from '../../../theme/ThemeContext.jsx'

/**
 * @typedef {{ start: number, size: number }} FlowCellRow
 * @typedef {{
 *   isH: boolean,
 *   cellCross: number,
 *   originCross: number,
 *   cols: number,
 *   padColsLeft: number,
 *   padColsRight: number,
 *   rows: FlowCellRow[],
 *   hasStages?: boolean,
 *   stageColStart?: number,
 *   stageColCount?: number,
 *   stageBoxes?: Array<{ x: number, y: number, w: number, h: number }>,
 * }} FlowCellLayerData
 * @type {(props: { id?: string, data: FlowCellLayerData }) => import('react').ReactNode}
 */
const FlowCellLayerNode = memo(function FlowCellLayerNode({ data }) {
  const {
    isH,
    cellCross,
    originCross,
    cols,
    padColsLeft,
    padColsRight,
    rows = [],
    hasStages = false,
    stageColStart = 0,
    stageColCount,
    stageBoxes,
  } = data

  const { theme } = useTheme()
  const zoom = useStore((s) => s.transform[2]) || 1
  const k = 1 / zoom
  const strokeW = 0.85 * k
  const strokeOpacity = theme.scheme === 'dark' ? 0.6 : theme.id === 'document' ? 0.55 : 0.72
  const stroke = theme.color.line

  const col0 = hasStages ? stageColStart : -padColsLeft
  const colN = hasStages
    ? stageColStart + (typeof stageColCount === 'number' && stageColCount > 0 ? stageColCount : cols)
    : cols + padColsRight
  const totalCols = Math.max(1, colN - col0)
  const crossOrigin = originCross + col0 * cellCross
  const along0 = rows.length ? rows[0].start : 0
  const alongEnd = rows.length ? rows[rows.length - 1].start + rows[rows.length - 1].size : 0

  const across = totalCols * cellCross
  const width = isH ? alongEnd - along0 : across
  const height = isH ? across : alongEnd - along0

  /** World → local SVG coords inside this layer. */
  const toLocal = (cross, along) => {
    const lc = cross - crossOrigin
    const la = along - along0
    return isH ? { x: la, y: lc } : { x: lc, y: la }
  }

  /** @type {import('react').ReactNode[]} */
  const lines = []
  let key = 0
  const pushLine = (crossA, alongA, crossB, alongB) => {
    const a = toLocal(crossA, alongA)
    const b = toLocal(crossB, alongB)
    lines.push(
      <line
        key={key++}
        className="antu-flow-cell"
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeWidth={strokeW}
        strokeOpacity={strokeOpacity}
      />,
    )
  }

  const drawLattice = (c0, c1, a0, a1, interiorOnly) => {
    // Interior column seams (cross-axis): c = 1 .. totalCols-1 in world cross coords.
    for (let c = 1; c < totalCols; c += 1) {
      const seam = crossOrigin + c * cellCross
      if (seam <= c0 + 2 || seam >= c1 - 2) continue
      pushLine(seam, a0 + (interiorOnly ? 1 : 0), seam, a1 - (interiorOnly ? 1 : 0))
    }
    // Interior row seams.
    for (const row of rows) {
      const seam = row.start
      if (seam <= a0 + (interiorOnly ? 6 : 0) || seam >= a1 - (interiorOnly ? 6 : 0)) continue
      pushLine(c0 + (interiorOnly ? 1 : 0), seam, c1 - (interiorOnly ? 1 : 0), seam)
    }
    if (!interiorOnly) {
      // Perimeter: outer column edges + first/last along edges.
      for (const seam of [crossOrigin, crossOrigin + totalCols * cellCross]) {
        pushLine(seam, a0, seam, a1)
      }
      if (rows.length) {
        const top = rows[0].start
        const bot = rows[rows.length - 1].start + rows[rows.length - 1].size
        pushLine(c0, top, c1, top)
        pushLine(c0, bot, c1, bot)
      }
    }
  }

  if (hasStages && Array.isArray(stageBoxes) && stageBoxes.length > 0) {
    for (const b of stageBoxes) {
      const bCross0 = isH ? b.y : b.x
      const bCross1 = isH ? b.y + b.h : b.x + b.w
      const bAlong0 = isH ? b.x : b.y
      const bAlong1 = isH ? b.x + b.w : b.y + b.h
      drawLattice(bCross0, bCross1, bAlong0, bAlong1, true)
    }
  } else {
    drawLattice(crossOrigin, crossOrigin + across, along0, alongEnd, false)
  }

  return (
    <svg
      className="antu-cells"
      style={{
        left: isH ? along0 : crossOrigin,
        top: isH ? crossOrigin : along0,
        width,
        height,
      }}
    >
      {lines}
    </svg>
  )
})

export default FlowCellLayerNode
