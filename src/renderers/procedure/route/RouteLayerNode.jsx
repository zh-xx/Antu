// ============================================================
//  src/renderers/procedure/route/RouteLayerNode.jsx — the whole route map, as one layer
//
//  The stage bands, the line with its stations, their labels, the branches hanging below and the arcs
//  under them. One decoration layer (1×1 to React Flow, drawn at full size inside); paint is given as SVG
//  attributes so the exported picture keeps it. The lists under the picture are the shared line layer's
//  (relationship/LineLayerNode.jsx). A station and a hanging box carry the node's detail as a tooltip.
// ============================================================

import { memo } from 'react'
import LineLayerNode from '../../relationship/LineLayerNode.jsx'

const OUT = { positive: '#047857', negative: '#b91c1c', neutral: '#475569' }
const OUT_FILL = { positive: '#ecfdf5', negative: '#fef2f2', neutral: '#ffffff' }
const LINE = '#1d4ed8'
const RED = '#b91c1c'

const arrowId = (c) => `antu-rt-arrow-${c.slice(1)}`

const RouteLayerNode = memo(function RouteLayerNode({ data }) {
  const { width, height, top, bandBottom, bands, lineY, lineFrom, lineTo, stations, hangs, arcs, showLabels = true } = data
  const colours = [RED, '#64748b', LINE]
  return (
    <div className="antu-rt-layer" style={{ width, height }}>
      <LineLayerNode data={{ ...data, links: [], pills: [], blocks: [], showLabels }} />
      <svg width={width} height={height} className="antu-rt-svg" aria-hidden="true">
        <defs>
          {colours.map((c) => (
            <marker key={c} id={arrowId(c)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={c} />
            </marker>
          ))}
        </defs>
        {bands.map((b, i) => (
          <rect key={`b${i}`} x={b.x} y={top} width={b.w} height={bandBottom - top} rx={12} fill="#f8fafc" stroke="#e2e8f0" />
        ))}
        <line x1={lineFrom} x2={lineTo} y1={lineY} y2={lineY} stroke={LINE} strokeWidth={5} strokeLinecap="round" />
        {hangs.map((h, i) => {
          const first = h.boxes[0]
          const startX = h.fromX
          const startY = lineY + 16
          const parts = []
          if (first) {
            parts.push(<path key="in" d={`M ${startX} ${startY} C ${startX} ${startY + 22} ${h.cx} ${first.y - 30} ${h.cx} ${first.y - 2}`} fill="none" stroke={RED} strokeWidth={2} markerEnd={`url(#${arrowId(RED)})`} />)
          }
          h.boxes.forEach((b, j) => {
            const c = OUT[b.outcome] ?? OUT.neutral
            if (j > 0) {
              const p = h.boxes[j - 1]
              parts.push(<path key={`a${j}`} d={`M ${h.cx} ${p.y + p.h} L ${h.cx} ${b.y - 2}`} fill="none" stroke="#64748b" strokeWidth={1.6} markerEnd={`url(#${arrowId('#64748b')})`} />)
            }
            parts.push(<rect key={`r${j}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.kind === 'end' ? Math.min(b.h / 2, 22) : 8} fill={b.kind === 'end' ? OUT_FILL[b.outcome] ?? '#fff' : '#fff'} stroke={b.kind === 'end' ? c : b.outcome === 'neutral' ? '#94a3b8' : c} strokeWidth={1.6} />)
          })
          if (h.more) {
            const last = h.boxes.at(-1)
            parts.push(<path key="m" d={`M ${h.cx} ${last.y + last.h} L ${h.cx} ${h.more.y - 2}`} fill="none" stroke="#64748b" strokeWidth={1.6} strokeDasharray="3 3" />)
            parts.push(<rect key="mr" x={h.more.x} y={h.more.y} width={h.more.w} height={h.more.h} rx={12} fill="#f8fafc" stroke="#94a3b8" strokeDasharray="4 3" />)
          }
          if (h.tail.type === 'return' && h.boxes.length && !h.tail.asArc) {
            const last = h.boxes.at(-1)
            const to = stations.find((s) => s.id === h.tail.to)
            const sx = last.x + last.w
            const sy = last.y + last.h / 2
            const rx = Math.max(sx + 22, to.x + 34)
            parts.push(<path key="ret" d={`M ${sx} ${sy} L ${rx} ${sy} L ${rx} ${lineY + 40} L ${to.x + 9} ${lineY + 15}`} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" markerEnd={`url(#${arrowId(RED)})`} />)
          }
          return <g key={`h${i}`}>{parts}</g>
        })}
        {arcs.map((a, i) => {
          const colour = a.kind === 'jump' ? '#64748b' : RED
          const dir = a.toX > a.fromX ? 1 : -1
          const head = a.start === 'box' ? `M ${a.fromX} ${a.fromY} L ${a.out} ${a.fromY} L ${a.out} ${a.depth - 18}` : `M ${a.fromX} ${lineY + 16} C ${a.fromX} ${lineY + 40} ${a.out} ${lineY + 50} ${a.out} ${lineY + 80} L ${a.out} ${a.depth - 18}`
          const d = `${head} Q ${a.out} ${a.depth} ${a.out + dir * 18} ${a.depth} L ${a.into - dir * 18} ${a.depth} Q ${a.into} ${a.depth} ${a.into} ${a.depth - 18} L ${a.into} ${lineY + 80} C ${a.into} ${lineY + 50} ${a.toX} ${lineY + 40} ${a.toX} ${lineY + 14}`
          return <path key={`c${i}`} d={d} fill="none" stroke={colour} strokeWidth={2} strokeDasharray={a.kind === 'jump' ? undefined : '6 4'} strokeLinejoin="round" markerEnd={`url(#${arrowId(colour)})`} />
        })}
        {stations.map((s) => {
          const c = OUT[s.outcome] ?? OUT.neutral
          if (s.kind === 'decision') return <path key={s.id} d={`M ${s.x} ${s.y - 17} L ${s.x + 17} ${s.y} L ${s.x} ${s.y + 17} L ${s.x - 17} ${s.y} Z`} fill="#eff6ff" stroke={LINE} strokeWidth={2.6} />
          if (s.kind === 'start') return <circle key={s.id} cx={s.x} cy={s.y} r={11} fill={LINE} stroke="#ffffff" strokeWidth={3} />
          if (s.kind === 'end') return <rect key={s.id} x={s.x - 11} y={s.y - 11} width={22} height={22} rx={4} fill={s.outcome === 'neutral' ? '#0f172a' : c} stroke="#ffffff" strokeWidth={3} />
          if (s.kind === 'document') return <rect key={s.id} x={s.x - 8} y={s.y - 10} width={16} height={20} rx={3} fill="#ffffff" stroke={c} strokeWidth={3} />
          return <circle key={s.id} cx={s.x} cy={s.y} r={9} fill="#ffffff" stroke={c} strokeWidth={3} strokeDasharray={s.kind === 'note' ? '3 3' : undefined} />
        })}
      </svg>
      {stations.map((s) => (
        <div key={`l${s.id}`} className={`antu-rt-label${s.kind === 'decision' ? ' is-decision' : ''}`} data-id={s.id} title={s.detail || undefined} style={{ left: s.labelBox.x, top: s.labelBox.y, width: s.labelBox.w, height: s.labelBox.h }}>
          {s.actor && <div className="antu-rt-actor">{s.actor}</div>}
          <div>{s.label}</div>
        </div>
      ))}
      {bands.map((b, i) => (
        <div key={`bt${i}`} className="antu-rt-band" style={{ left: b.x, top: top + 6, width: b.w }}>
          {b.label}
        </div>
      ))}
      {hangs.flatMap((h, i) => [
        ...h.boxes.map((b) => (
          <div key={`hb${i}${b.id}`} className={`antu-rt-box${b.kind === 'end' ? ' is-end' : ''}`} data-id={b.id} title={b.detail || undefined} style={{ left: b.x, top: b.y, width: b.w, height: b.h, color: b.kind === 'end' ? OUT[b.outcome] : undefined }}>
            <span>{b.label}</span>
          </div>
        )),
        ...(h.more ? [<div key={`hm${i}`} className="antu-rt-more" style={{ left: h.more.x, top: h.more.y, width: h.more.w, height: h.more.h }}>{h.more.text}</div>] : []),
        ...(showLabels && h.cond ? [<span key={`hc${i}`} className="antu-rt-cond is-hang" style={{ left: h.cx, top: h.topY - 22 }}>{h.cond}</span>] : []),
      ])}
      {showLabels &&
        arcs
          .filter((a) => a.cond)
          .map((a, i) => (
            <span key={`ac${i}`} className={`antu-rt-cond${a.kind === 'loop' ? ' is-loop' : ''}`} style={{ left: (a.out + a.into) / 2, top: a.depth }}>
              {a.cond}
            </span>
          ))}
    </div>
  )
})

export default RouteLayerNode
