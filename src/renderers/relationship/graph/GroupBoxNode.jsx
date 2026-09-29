// ============================================================
//  src/renderers/relationship/graph/GroupBoxNode.jsx — the camps' boxes (a decoration node)
//
//  Draws the boxes layout.js worked out for the groups (`groupBoxes`): a light filled rectangle
//  round a camp's entities, its name in the top-left corner. The boxes never overlap and always
//  contain their own members (layout.js sets the camps side by side), so nothing here has to
//  resolve collisions. Paint goes on as attributes and inline styles, so the exported image
//  carries it (palette.js).
// ============================================================

import { memo } from 'react'
import { GROUP_PAINT } from './palette.js'
import { GROUP_PAD, GROUP_TITLE_FONT } from './metrics.js'

const GroupBoxNode = memo(function GroupBoxNode({ data }) {
  const { boxes, width, height } = data
  return (
    <div className="antu-rgroups">
      <svg className="antu-rgroups-svg" width={width} height={height} aria-hidden="true">
        {boxes.map((b) => (
          <rect
            key={b.groupId}
            className="antu-rgroup-box"
            x={b.x + 0.5}
            y={b.y + 0.5}
            width={Math.max(0, b.w - 1)}
            height={Math.max(0, b.h - 1)}
            rx={10}
            fill={GROUP_PAINT.fill}
            stroke={GROUP_PAINT.stroke}
            strokeWidth={1}
          />
        ))}
      </svg>
      {boxes.map((b) => (
        <span
          key={b.groupId}
          className="antu-rgroup-name"
          title={b.label}
          style={{
            left: b.x + GROUP_PAD - 2,
            top: b.y + 7,
            maxWidth: Math.max(0, b.w - GROUP_PAD * 2),
            fontSize: GROUP_TITLE_FONT,
            color: GROUP_PAINT.title,
          }}
        >
          {b.label}
        </span>
      ))}
    </div>
  )
})

export default GroupBoxNode
