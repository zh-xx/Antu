// ============================================================
//  src/renderers/justification/tree/IssueBoxNode.jsx — the issues' boxes (a decoration node)
//
//  Draws the boxes layout.js worked out for the issues (`groupBoxes`): a light filled rectangle round an
//  issue's nodes, its name in the top-left corner. The box is also where an issue is folded up and opened
//  again: the name is a button with a small arrow (down = open, right = folded); a folded issue's name
//  ends with how many nodes are left out ("· 12 folded").
//
//  The boxes never overlap and always contain their own members (layout.js sets the issues side by side),
//  so nothing here has to resolve collisions. Paint goes on as attributes and inline styles, so the
//  exported image carries it (palette.js). Folding moves geometry, so the renderer lays the diagram out
//  again (and refits the view); this file only reports the click.
// ============================================================

import { memo } from 'react'
import { GROUP_PAINT } from './palette.js'
import { GROUP_PAD, GROUP_TITLE_FONT } from './metrics.js'
import { useLang } from '../../../shell/LangContext.jsx'

const IssueBoxNode = memo(function IssueBoxNode({ data }) {
  const { boxes, width, height, onToggle, foldable = true } = data
  const { t } = useLang()
  return (
    <div className="antu-rgroups">
      <svg className="antu-rgroups-svg" width={width} height={height} aria-hidden="true">
        {boxes.map((b) => (
          <rect
            key={b.groupId}
            className={`antu-rgroup-box${b.collapsed ? ' is-folded' : ''}`}
            x={b.x + 0.5}
            y={b.y + 0.5}
            width={Math.max(0, b.w - 1)}
            height={Math.max(0, b.h - 1)}
            rx={10}
            fill={GROUP_PAINT.fill}
            stroke={GROUP_PAINT.stroke}
            strokeWidth={1}
            strokeDasharray={b.collapsed ? '5 4' : undefined}
          />
        ))}
      </svg>
      {boxes.map((b) => {
        const style = {
          left: b.x + GROUP_PAD - 2,
          top: b.y + 7,
          maxWidth: Math.max(0, b.w - GROUP_PAD * 2),
          fontSize: GROUP_TITLE_FONT,
          color: GROUP_PAINT.title,
        }
        const name = b.collapsed ? `${b.label} · ${t('jus.folded', { n: b.hidden })}` : b.label
        // Only an issue that has something to fold gets the control
        const canFold = foldable && (b.collapsed || b.total > 1)
        return canFold ? (
          <button
            key={b.groupId}
            type="button"
            className={`antu-rgroup-name antu-jissue-toggle nodrag nopan${b.collapsed ? ' is-folded' : ''}`}
            title={t(b.collapsed ? 'jus.unfold' : 'jus.fold')}
            aria-expanded={!b.collapsed}
            style={style}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(b.groupId)
            }}
          >
            <span className="antu-jissue-arrow" aria-hidden="true">
              {b.collapsed ? '▸' : '▾'}
            </span>
            {name}
          </button>
        ) : (
          <span key={b.groupId} className="antu-rgroup-name" title={b.label} style={style}>
            {name}
          </span>
        )
      })}
    </div>
  )
})

export default IssueBoxNode
