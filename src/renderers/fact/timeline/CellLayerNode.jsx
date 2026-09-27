// ============================================================
//  src/renderers/fact/timeline/CellLayerNode.jsx — the cell layer (a decoration node)
//
//  Draws the underlying rectangles cell by cell (dashed), so that "the whole diagram is pieced
//  together from rectangles" can be seen. Hidden by default, controlled by a switch in the dock.
//
//  Two points:
//   1. Drawn with SVG rather than CSS dashed borders: a CSS dash length cannot be changed, and
//      once zoomed the dashes easily become so dense that they no longer read as dashed.
//   2. Line width and dash spacing are **compensated in reverse** for the current zoom: at 0.5×
//      the line keeps the same thickness and density on screen and does not smear into a solid line.
//
//  One extra empty column is drawn on each side (PAD_COLS), showing the margin of the coordinate
//  system too.
// ============================================================

import { memo } from 'react'
import { useStore } from '@xyflow/react'

/** How many empty lanes to draw on each side of the content */
const PAD_COLS = 1

const CellLayerNode = memo(function CellLayerNode({ data }) {
  const { cols, rows, cellW, cellH, originX, originY, isH } = data

  const zoom = useStore((s) => s.transform[2]) || 1
  const k = 1 / zoom // reverse compensation factor

  // Line width on screen: slightly thinner than the card border, so it does not steal attention
  const SCREEN_STROKE = 0.8
  const stroke = SCREEN_STROKE * k

  // Two extra lanes along the lane axis, showing the margin of the coordinate system.
  // When vertical a lane is a column (one more on each side); when horizontal a lane is a row
  // (one more above and below).
  const totalLanes = cols + PAD_COLS * 2
  const width = isH ? originX + rows * cellW : totalLanes * cellW
  const height = isH ? totalLanes * cellH : originY + rows * cellH

  const rects = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < totalLanes; c += 1) {
      // Vertical: slots run vertically and lanes horizontally; horizontal: the two are swapped
      const x = (isH ? originX + r * cellW : c * cellW) + stroke / 2
      const y = (isH ? c * cellH : originY + r * cellH) + stroke / 2
      rects.push(
        <rect
          key={`${r}-${c}`}
          className="antu-cell"
          x={x}
          y={y}
          width={cellW - stroke}
          height={cellH - stroke}
          strokeWidth={stroke}
          strokeDasharray={`${11 * k} ${7 * k}`}
        />,
      )
    }
  }

  return (
    <svg
      className="antu-cells"
      style={{
        left: isH ? 0 : -PAD_COLS * cellW,
        top: isH ? -PAD_COLS * cellH : 0,
        width,
        height,
      }}
    >
      {rects}
    </svg>
  )
})

export default CellLayerNode
