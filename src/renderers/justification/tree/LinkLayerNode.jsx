// ============================================================
//  src/renderers/justification/tree/LinkLayerNode.jsx — the link layer (a decoration node)
//
//  Every link of the tree is drawn here, in one SVG, from the geometry layout.js already computed
//  (`points` / `d` / `dCurve` / `labelAt`). This file computes no geometry of its own.
//
//  While a node is looked at (`litLines`), the links of its chain stay and the rest fade. Stance is paint
//  only (palette.js): support is the plain line, opposition red and dashed, a norm's basis violet and
//  dotted, so switching nothing ever moves a line and the exported picture shows what the screen shows.
//
//  The layer sits before the nodes, so a node always covers a line that runs behind it. It takes no
//  mouse events. Paint goes on as attributes.
// ============================================================

import { memo, useMemo } from 'react'
import { stancePaint, DIM_OPACITY } from './palette.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

const LinkLayerNode = memo(function LinkLayerNode({ data }) {
  const { theme } = useTheme()
  const { connections, width, height, showLabels, curved, litLines = null } = data
  const stancesDrawn = useMemo(() => [...new Set(connections.map((c) => c.stance))], [connections])
  const opacityOf = (c) => (litLines === null || litLines.has(c.id) ? 1 : DIM_OPACITY)

  return (
    <div className="antu-jlinks">
      <svg className="antu-jlinks-svg" width={width} height={height} aria-hidden="true">
        <defs>
          {stancesDrawn.map((s) => (
            <marker
              key={s}
              id={`antu-jarrow-${s}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={stancePaint(s, theme).stroke} />
            </marker>
          ))}
        </defs>

        {connections.map((c) => {
          const p = stancePaint(c.stance, theme)
          return (
            <g key={c.id} className={`antu-jlink s-${c.stance}`} opacity={opacityOf(c)}>
              <path
                d={curved ? c.dCurve : c.d}
                fill="none"
                stroke={p.stroke}
                strokeWidth={p.width}
                strokeDasharray={p.dash}
                markerEnd={`url(#antu-jarrow-${c.stance})`}
              />
            </g>
          )
        })}
      </svg>

      {showLabels &&
        connections
          .filter((c) => c.label && c.labelAt)
          .map((c) => (
            <span
              key={c.id}
              className={`antu-rlabel antu-jlabel s-${c.stance}`}
              style={{ left: c.labelAt.x, top: c.labelAt.y, width: c.labelSize.width, height: c.labelSize.height, opacity: opacityOf(c) }}
            >
              {c.label}
            </span>
          ))}
    </div>
  )
})

export default LinkLayerNode
