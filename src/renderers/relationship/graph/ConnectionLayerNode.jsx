// ============================================================
//  src/renderers/relationship/graph/ConnectionLayerNode.jsx — the link layer (a decoration node)
//
//  Every relation of the graph is drawn here, in one SVG, from the geometry layout.js already
//  computed (`points` / `d` / `dCurve` / `labelAt`). This file computes no geometry of its own,
//  apart from the tie of a guarantee to the claim it secures (secures.js).
//
//  Hiding a kind of relation is done here, by not drawing it: the layout is never asked again, so
//  nothing moves when the reader switches a kind off, and the exported picture shows what the
//  screen shows. While an entity is looked at (`litEntity`), the relations that touch it stay and
//  the rest fade.
//
//  The layer sits before the entities, so an entity always covers a line that runs behind it. It
//  takes no mouse events. Paint goes on as attributes (palette.js).
// ============================================================

import { memo, useMemo } from 'react'
import { relationPaint, RELATION_PAINT, DIM_OPACITY } from './palette.js'
import { securesTies } from './secures.js'

const ConnectionLayerNode = memo(function ConnectionLayerNode({ data }) {
  const { connections, width, height, hiddenKinds = [], showLabels, curved, litEntity = null } = data

  const visible = useMemo(() => connections.filter((c) => !hiddenKinds.includes(c.kind)), [connections, hiddenKinds])
  const kindsDrawn = useMemo(() => [...new Set(visible.filter((c) => c.directed).map((c) => c.kind))], [visible])
  // A tie is drawn only when both the guarantee and its claim are on show
  const ties = useMemo(() => {
    const ids = new Set(visible.map((c) => c.id))
    return securesTies(connections).filter((t) => ids.has(t.id) && ids.has(t.claimId))
  }, [connections, visible])

  const touches = (c) => litEntity === null || c.from === litEntity || c.to === litEntity
  const opacityOf = (c) => (touches(c) ? 1 : DIM_OPACITY)

  return (
    <div className="antu-rlinks">
      <svg className="antu-rlinks-svg" width={width} height={height} aria-hidden="true">
        <defs>
          {kindsDrawn.map((k) => (
            <marker
              key={k}
              id={`antu-rarrow-${k}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={(RELATION_PAINT[k] ?? RELATION_PAINT.other).stroke} />
            </marker>
          ))}
        </defs>

        {visible.map((c) => {
          const p = relationPaint(c.kind)
          const d = curved ? c.dCurve : c.d
          const marker = c.directed ? `url(#antu-rarrow-${c.kind})` : undefined
          return (
            <g key={c.id} className={`antu-rlink k-${c.kind}`} opacity={opacityOf(c)}>
              <path d={d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeDasharray={p.dash} markerEnd={marker} />
              {/* A double line: a pale one down the middle of a wide one */}
              {p.double && <path d={d} fill="none" stroke="#ffffff" strokeWidth={p.width - 2.4} />}
            </g>
          )
        })}

        {ties.map((t) => (
          <g key={`tie:${t.id}`} className="antu-rtie" opacity={litEntity === null ? 1 : DIM_OPACITY}>
            <line x1={t.from[0]} y1={t.from[1]} x2={t.to[0]} y2={t.to[1]} stroke={RELATION_PAINT.guarantee.stroke} strokeWidth={1.2} strokeDasharray="2 3" />
            <circle cx={t.to[0]} cy={t.to[1]} r={3.2} fill={RELATION_PAINT.guarantee.stroke} />
          </g>
        ))}
      </svg>

      {showLabels &&
        visible.map((c) => (
          <span
            key={c.id}
            className={`antu-rlabel k-${c.kind}`}
            style={{ left: c.labelAt.x, top: c.labelAt.y, width: c.labelSize.width, height: c.labelSize.height, opacity: opacityOf(c) }}
          >
            {c.label}
          </span>
        ))}
    </div>
  )
})

export default ConnectionLayerNode
