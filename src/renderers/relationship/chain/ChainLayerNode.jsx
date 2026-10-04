// ============================================================
//  src/renderers/relationship/chain/ChainLayerNode.jsx — everything of the guarantee chain that is not a card
//
//  One decoration layer (1×1 to React Flow, drawn at full size inside): the column headings, the rule and
//  title of each section under the blocks, the links from claim to guarantor (one trunk, a branch to each)
//  and from guarantor to what stands behind it, the labels under the boxes, and the text of the sections.
//  One ink for every line. Paint is given as SVG attributes so the exported picture keeps it.
// ============================================================

import { memo } from 'react'
const INK = '#475569'
const SOFT = '#94a3b8'
const R = 8

/**
 * A line from one point to another with square turns: straight when they are level, else across to `turnX`,
 * up or down, and across again; the turns are rounded.
 */
function elbow([x1, y1], [x2, y2], turnX) {
  if (Math.abs(y1 - y2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`
  const tx = turnX ?? (x1 + x2) / 2
  const dir = y2 > y1 ? 1 : -1
  const r = Math.min(R, Math.abs(y2 - y1) / 2, Math.abs(tx - x1), Math.abs(x2 - tx))
  return `M ${x1} ${y1} L ${tx - r} ${y1} Q ${tx} ${y1} ${tx} ${y1 + dir * r} L ${tx} ${y2 - dir * r} Q ${tx} ${y2} ${tx + r} ${y2} L ${x2} ${y2}`
}

const ChainLayerNode = memo(function ChainLayerNode({ data }) {
  const { width, height, headings, links, chips, empties, frames, texts, showLabels = true } = data
  return (
    <div className="antu-ch-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-ch-svg" aria-hidden="true">
        <defs>
          <marker id="antu-ch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 Z" fill={INK} />
          </marker>
        </defs>
        {frames.map((f, i) => (
          <g key={`f${i}`}>
            <line x1={f.x} y1={f.y} x2={f.x + f.w} y2={f.y} stroke="#cbd5e1" />
            <text x={f.titleAt[0]} y={f.titleAt[1]} fontSize={13} fontWeight={700} fill={INK}>
              {f.title}
            </text>
          </g>
        ))}
        {empties.map((e, i) => (
          <g key={`e${i}`}>
            <text x={e.x} y={e.y + 22} fontSize={16} fontWeight={650} fill={INK}>
              {e.text}
            </text>
            {e.sub && (
              <text x={e.x} y={e.y + 46} fontSize={12.5} fill={SOFT}>
                {e.sub}
              </text>
            )}
          </g>
        ))}
        {links.map((l, i) => {
          const marker = l.arrow === 'end' ? { markerEnd: 'url(#antu-ch-arrow)' } : l.arrow === 'start' ? { markerStart: 'url(#antu-ch-arrow)' } : {}
          return <path key={`l${i}`} d={elbow(l.from, l.to, l.trunk)} fill="none" stroke={INK} strokeWidth={l.kind === 'guarantee' && l.trunk !== undefined ? 1.6 : 1.2} strokeDasharray={l.dotted ? '2 5' : undefined} strokeLinejoin="round" {...marker} />
        })}
      </svg>

      {headings.map((h, i) => (
        <div key={`h${i}`} className="antu-ch-head" style={{ left: h.x, top: h.y }}>
          {h.text}
        </div>
      ))}
      {showLabels &&
        chips.map((c, i) => (
          <span key={`c${i}`} className="antu-ch-chip" style={{ left: c.x, top: c.y, maxWidth: c.maxW }}>
            {c.text}
          </span>
        ))}
      {texts.map((x, i) => (
        <div key={`t${i}`} className={`antu-ch-text${x.tone === 'note' ? ' is-note' : ''}`} style={{ left: x.x, top: x.y, width: x.w }}>
          <div>{x.main}</div>
          {x.sub && <div className="antu-ch-text-sub">{x.sub}</div>}
        </div>
      ))}
    </div>
  )
})

export default ChainLayerNode
