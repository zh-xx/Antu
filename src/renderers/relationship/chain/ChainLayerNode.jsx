// ============================================================
//  src/renderers/relationship/chain/ChainLayerNode.jsx — everything of the guarantee chain that is not a card
//
//  One decoration layer (1×1 to React Flow, drawn at full size inside): the column headings, the frames of
//  the sections under the blocks, the links from claim to guarantor and from guarantor to what stands
//  behind it, the empty dashed boxes ("no security"), the labels on the links, and the text of the
//  sections. Paint is given as SVG attributes so the exported picture keeps it.
// ============================================================

import { memo } from 'react'
import { RELATION_PAINT, relationPaint } from '../graph/palette.js'

const INK = '#64748b'

const ChainLayerNode = memo(function ChainLayerNode({ data }) {
  const { width, height, headings, links, chips, empties, frames, texts, showLabels = true } = data
  const kinds = [...new Set(links.map((l) => l.kind))]
  return (
    <div className="antu-ch-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-ch-svg" aria-hidden="true">
        <defs>
          {kinds.map((k) => (
            <marker key={k} id={`antu-ch-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={(RELATION_PAINT[k] ?? RELATION_PAINT.other).stroke} />
            </marker>
          ))}
        </defs>
        {frames.map((f, i) => (
          <g key={`f${i}`}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={12} fill={f.tone === 'warn' ? '#fffbeb' : '#ffffff'} stroke={f.tone === 'warn' ? '#f59e0b' : '#e5e7eb'} strokeOpacity={f.tone === 'warn' ? 0.7 : 1} />
            <text x={f.titleAt[0]} y={f.titleAt[1]} fontSize={14} fontWeight={700} fill={f.tone === 'warn' ? '#b45309' : INK}>
              {f.title}
            </text>
          </g>
        ))}
        {empties.map((e, i) => (
          <g key={`e${i}`}>
            <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={10} fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4 4" />
            <text x={e.x + e.w / 2} y={e.y + e.h / 2 + (e.sub ? -2 : 5)} textAnchor="middle" fontSize={e.sub ? 16 : 14} fontWeight={e.sub ? 650 : 400} fill={e.sub ? INK : '#94a3b8'}>
              {e.text}
            </text>
            {e.sub && (
              <text x={e.x + e.w / 2} y={e.y + e.h / 2 + 22} textAnchor="middle" fontSize={12.5} fill="#94a3b8">
                {e.sub}
              </text>
            )}
          </g>
        ))}
        {links.map((l, i) => {
          const p = relationPaint(l.kind)
          const mx = (l.from[0] + l.to[0]) / 2
          const d = `M ${l.from[0]} ${l.from[1]} C ${mx} ${l.from[1]} ${mx} ${l.to[1]} ${l.to[0]} ${l.to[1]}`
          const marker = l.arrow === 'end' ? { markerEnd: `url(#antu-ch-arrow-${l.kind})` } : l.arrow === 'start' ? { markerStart: `url(#antu-ch-arrow-${l.kind})` } : {}
          return <path key={`l${i}`} d={d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeDasharray={l.dotted ? '2 5' : p.dash} {...marker} />
        })}
      </svg>

      {headings.map((h, i) => (
        <div key={`h${i}`} className="antu-ch-head" style={{ left: h.x, top: h.y }}>
          {h.text}
        </div>
      ))}
      {showLabels &&
        chips.map((c, i) => (
          <span key={`c${i}`} className={`antu-ch-chip k-${c.kind}`} style={{ left: c.x, top: c.y, maxWidth: c.maxW }}>
            {c.text}
          </span>
        ))}
      {texts.map((x, i) => (
        <div key={`t${i}`} className={`antu-ch-text${x.tone === 'warn' ? ' is-warn' : x.tone === 'note' ? ' is-note' : ''}`} style={{ left: x.x, top: x.y, width: x.w }}>
          <div>{x.main}</div>
          {x.sub && <div className="antu-ch-text-sub">{x.sub}</div>}
        </div>
      ))}
    </div>
  )
})

export default ChainLayerNode
