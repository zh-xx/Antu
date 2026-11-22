// @ts-check
// ============================================================
//  src/renderers/procedure/flow/StageBoxNode.jsx — stage boxes (a decoration node)
//
//  Draws the boxes ELK laid out for the stages (`stageBoxes`, one compound node per stage):
//  a light filled rectangle round the stage's nodes, its name in the top-left corner. The
//  boxes never overlap and always contain their nodes: ELK places them as ordinary nodes of
//  the root graph, so nothing here has to resolve collisions.
//
//  Paint is written as attributes and inline styles, so the exported image carries it
//  (see palette.js).
// ============================================================

import { memo, Fragment } from 'react'
import { stagePaint } from './palette.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

/**
 * @typedef {{
 *   stageId: string,
 *   label: string,
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 * }} StageBox
 * @typedef {{
 *   boxes: StageBox[],
 *   width: number,
 *   height: number,
 *   lit?: string[],
 * }} StageBoxNodeData
 * @type {(props: { id?: string, data: StageBoxNodeData }) => import('react').ReactNode}
 */
const StageBoxNode = memo(function StageBoxNode({ data }) {
  const { theme } = useTheme()
  const { boxes, width, height, lit = [] } = data
  // Detect horizontal strips vs vertical stacked stage bands so dividers orient along the seam axis.
  const isHorizontal =
    boxes.length >= 2 && Math.abs(boxes[1].x - boxes[0].x) > Math.abs(boxes[1].y - boxes[0].y)
  const ordered = [...boxes].sort((a, b) => (isHorizontal ? a.x - b.x : a.y - b.y))
  const indexById = new Map(ordered.map((b, i) => [b.stageId, i]))
  const maxEnd = boxes.length
    ? Math.max(...boxes.map((b) => (isHorizontal ? b.x + b.w : b.y + b.h)))
    : 0
  const paintOf = (b, idx) => stagePaint(theme, lit.includes(b.stageId), idx)

  return (
    <div className="antu-pstages">
      <svg className="antu-pstages-svg" width={width} height={height} aria-hidden="true">
        {boxes.map((b, idx) => {
          const isLit = lit.includes(b.stageId)
          const p = paintOf(b, indexById.get(b.stageId) ?? idx)
          const isLast = (isHorizontal ? b.x + b.w : b.y + b.h) >= maxEnd - 1
          return (
            <Fragment key={b.stageId}>
              <rect
                className="antu-pstage-box"
                x={b.x + 0.5}
                y={b.y + 0.5}
                width={Math.max(0, b.w - 1)}
                height={Math.max(0, b.h - 1)}
                rx={4}
                fill={p.bandFill}
                stroke={isLit ? p.stroke : 'none'}
                strokeWidth={isLit ? 1.5 : 0}
              />
              {isHorizontal ? (
                <>
                  <line x1={b.x + 0.5} y1={b.y} x2={b.x + 0.5} y2={b.y + b.h} stroke={p.divider} strokeWidth={1} />
                  {isLast && (
                    <line
                      x1={b.x + b.w - 0.5}
                      y1={b.y}
                      x2={b.x + b.w - 0.5}
                      y2={b.y + b.h}
                      stroke={p.divider}
                      strokeWidth={1}
                    />
                  )}
                </>
              ) : (
                <>
                  <line x1={b.x} y1={b.y + 0.5} x2={b.x + b.w} y2={b.y + 0.5} stroke={p.divider} strokeWidth={1} />
                  {isLast && (
                    <line
                      x1={b.x}
                      y1={b.y + b.h - 0.5}
                      x2={b.x + b.w}
                      y2={b.y + b.h - 0.5}
                      stroke={p.divider}
                      strokeWidth={1}
                    />
                  )}
                </>
              )}
            </Fragment>
          )
        })}
      </svg>
      {boxes.map((b, idx) => {
        const orderIdx = indexById.get(b.stageId) ?? idx
        const p = paintOf(b, orderIdx)
        const num = String(orderIdx + 1).padStart(2, '0')
        return (
          <span
            key={b.stageId}
            className="antu-pstage-name"
            title={b.label}
            style={{
              left: isHorizontal ? b.x + 1 : b.x,
              top: isHorizontal ? b.y : b.y + 1,
              maxWidth: Math.max(0, b.w - 12),
              background: p.bookmarkBg ?? p.fill,
              color: p.bookmarkFg ?? p.title,
              clipPath: 'polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            }}
          >
            <span className="antu-pstage-num">{num}</span>
            <span className="antu-pstage-label">{b.label}</span>
          </span>
        )
      })}
    </div>
  )
})

export default StageBoxNode
