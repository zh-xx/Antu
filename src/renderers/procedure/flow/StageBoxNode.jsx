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

import { memo } from 'react'
import { STAGE_PAINT, STAGE_LIT_PAINT } from './palette.js'
import { STAGE_TITLE_FONT, STAGE_PAD } from './metrics.js'

const StageBoxNode = memo(function StageBoxNode({ data }) {
  const { boxes, width, height, lit = [] } = data
  // A stage the rule being looked at applies in (a row of the rule table under the mouse)
  const paintOf = (b) => (lit.includes(b.stageId) ? STAGE_LIT_PAINT : STAGE_PAINT)

  return (
    <div className="antu-pstages">
      <svg className="antu-pstages-svg" width={width} height={height} aria-hidden="true">
        {boxes.map((b) => (
          <rect
            key={b.stageId}
            className="antu-pstage-box"
            x={b.x + 0.5}
            y={b.y + 0.5}
            width={Math.max(0, b.w - 1)}
            height={Math.max(0, b.h - 1)}
            rx={10}
            fill={paintOf(b).fill}
            stroke={paintOf(b).stroke}
            strokeWidth={lit.includes(b.stageId) ? 1.5 : 1}
          />
        ))}
      </svg>
      {boxes.map((b) => (
        <span
          key={b.stageId}
          className="antu-pstage-name"
          title={b.label}
          style={{
            left: b.x + STAGE_PAD - 2,
            top: b.y + 7,
            maxWidth: Math.max(0, b.w - STAGE_PAD * 2),
            fontSize: STAGE_TITLE_FONT,
            color: paintOf(b).title,
          }}
        >
          {b.label}
        </span>
      ))}
    </div>
  )
})

export default StageBoxNode
