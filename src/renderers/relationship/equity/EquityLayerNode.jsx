// ============================================================
//  src/renderers/relationship/equity/EquityLayerNode.jsx — everything of the equity tree that is not a party box
//
//  One decoration layer (1×1 to React Flow, drawn at full size inside): the lines from holder to held,
//  their pills, the frames of the sections under the tree, and the text in them. Paint is given as SVG
//  attributes so the exported picture keeps it.
// ============================================================

import { memo } from 'react'
import { relationPaint } from '../graph/palette.js'

const INK = '#64748b'
const PILL_H = 22
const EquityLayerNode = memo(function EquityLayerNode({ data }) {
  const { width, height, links, pills, empties, frames, texts, showLabels = true } = data
  const paint = relationPaint('equity')
  return (
    <div className="antu-eq-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-eq-svg" aria-hidden="true">
        <defs>
          <marker id="antu-eq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 Z" fill={paint.stroke} />
          </marker>
        </defs>
        {frames.map((f, i) => (
          <g key={`f${i}`}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={12} fill="#ffffff" stroke="#e5e7eb" />
            <text x={f.titleAt[0]} y={f.titleAt[1]} fontSize={14} fontWeight={700} fill={INK}>
              {f.title}
            </text>
          </g>
        ))}
        {empties.map((e, i) => (
          <g key={`e${i}`}>
            <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={10} fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 4" />
            <text x={e.x + e.w / 2} y={e.y + e.h / 2 - 2} textAnchor="middle" fontSize={16} fontWeight={650} fill={INK}>
              {e.text}
            </text>
            <text x={e.x + e.w / 2} y={e.y + e.h / 2 + 22} textAnchor="middle" fontSize={12.5} fill="#94a3b8">
              {e.sub}
            </text>
          </g>
        ))}
        {links.map((l, i) => (
          <path
            key={`l${i}`}
            d={l.d}
            fill="none"
            stroke={paint.stroke}
            strokeWidth={paint.width}
            strokeDasharray={l.back ? '5 4' : undefined}
            markerEnd="url(#antu-eq-arrow)"
          />
        ))}
      </svg>
      {showLabels &&
        pills.map((p, i) => (
          <span key={`pt${i}`} className={`antu-eq-pill${p.unknown ? ' is-unknown' : ''}${p.back ? ' is-back' : ''}`} data-rel={p.relId} style={{ left: p.x, top: p.y, height: PILL_H, lineHeight: `${PILL_H - 2}px` }}>
            {p.text}
          </span>
        ))}
      {texts.map((x, i) => (
        <div key={`t${i}`} className={`antu-eq-text${x.tone === 'note' ? ' is-note' : ''}`} style={{ left: x.x, top: x.y, width: x.w }}>
          <div>{x.main}</div>
          {x.sub && <div className="antu-eq-text-sub">{x.sub}</div>}
        </div>
      ))}
    </div>
  )
})

export default EquityLayerNode
