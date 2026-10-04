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
import { useTheme } from '../../../theme/ThemeContext.jsx'

const arrowId = (c) => `antu-rt-arrow-${c.replace(/[^0-9a-z]/gi, '')}`

const RouteLayerNode = memo(function RouteLayerNode({ data }) {
  const { theme } = useTheme()
  const f = theme.flow
  const LINE = f.link.main.stroke
  const RED = f.outcome.negative.stroke
  const GREY = f.link.plain.stroke
  const outOf = (o) => f.outcome[o] ?? f.outcome.neutral
  const { width, height, top, bandBottom, bands, lineY, lineFrom, lineTo, stations, hangs, arcs, showLabels = true } = data
  const colours = [...new Set([RED, GREY, LINE])]
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
          <rect key={`b${i}`} x={b.x} y={top} width={b.w} height={bandBottom - top} rx={theme.radius.group} fill={f.stage.fill} stroke={f.stage.stroke} />
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
            const c = outOf(b.outcome).stroke
            if (j > 0) {
              const p = h.boxes[j - 1]
              parts.push(<path key={`a${j}`} d={`M ${h.cx} ${p.y + p.h} L ${h.cx} ${b.y - 2}`} fill="none" stroke={GREY} strokeWidth={1.6} markerEnd={`url(#${arrowId(GREY)})`} />)
            }
            parts.push(<rect key={`r${j}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.kind === 'end' ? Math.min(b.h / 2, 22) : 8} fill={b.kind === 'end' ? outOf(b.outcome).fill : theme.color.bg} stroke={b.kind === 'end' ? c : b.outcome === 'neutral' ? theme.color.ink4 : c} strokeWidth={1.6} strokeDasharray={b.kind === 'end' ? outOf(b.outcome).dash : undefined} />)
          })
          if (h.more) {
            const last = h.boxes.at(-1)
            parts.push(<path key="m" d={`M ${h.cx} ${last.y + last.h} L ${h.cx} ${h.more.y - 2}`} fill="none" stroke={GREY} strokeWidth={1.6} strokeDasharray="3 3" />)
            parts.push(<rect key="mr" x={h.more.x} y={h.more.y} width={h.more.w} height={h.more.h} rx={theme.radius.group} fill={f.stage.fill} stroke={theme.color.ink4} strokeDasharray="4 3" />)
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
          const colour = a.kind === 'jump' ? GREY : RED
          const dir = a.toX > a.fromX ? 1 : -1
          const head = a.start === 'box' ? `M ${a.fromX} ${a.fromY} L ${a.out} ${a.fromY} L ${a.out} ${a.depth - 18}` : `M ${a.fromX} ${lineY + 16} C ${a.fromX} ${lineY + 40} ${a.out} ${lineY + 50} ${a.out} ${lineY + 80} L ${a.out} ${a.depth - 18}`
          const d = `${head} Q ${a.out} ${a.depth} ${a.out + dir * 18} ${a.depth} L ${a.into - dir * 18} ${a.depth} Q ${a.into} ${a.depth} ${a.into} ${a.depth - 18} L ${a.into} ${lineY + 80} C ${a.into} ${lineY + 50} ${a.toX} ${lineY + 40} ${a.toX} ${lineY + 14}`
          return <path key={`c${i}`} d={d} fill="none" stroke={colour} strokeWidth={2} strokeDasharray={a.kind === 'jump' ? undefined : '6 4'} strokeLinejoin="round" markerEnd={`url(#${arrowId(colour)})`} />
        })}
        {stations.map((s) => {
          const c = outOf(s.outcome).stroke
          if (s.kind === 'decision') return <path key={s.id} d={`M ${s.x} ${s.y - 17} L ${s.x + 17} ${s.y} L ${s.x} ${s.y + 17} L ${s.x - 17} ${s.y} Z`} fill={f.outcome.neutral.fill} stroke={LINE} strokeWidth={2.6} />
          if (s.kind === 'start') return <circle key={s.id} cx={s.x} cy={s.y} r={11} fill={LINE} stroke={theme.color.bg} strokeWidth={3} />
          if (s.kind === 'end') return <rect key={s.id} x={s.x - 11} y={s.y - 11} width={22} height={22} rx={4} fill={s.outcome === 'neutral' ? theme.color.ink : c} stroke={theme.color.bg} strokeWidth={3} />
          if (s.kind === 'document') return <rect key={s.id} x={s.x - 8} y={s.y - 10} width={16} height={20} rx={3} fill={theme.color.bg} stroke={c} strokeWidth={3} />
          return <circle key={s.id} cx={s.x} cy={s.y} r={9} fill={theme.color.bg} stroke={c} strokeWidth={3} strokeDasharray={s.kind === 'note' ? '3 3' : undefined} />
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
          <div key={`hb${i}${b.id}`} className={`antu-rt-box${b.kind === 'end' ? ' is-end' : ''}`} data-id={b.id} title={b.detail || undefined} style={{ left: b.x, top: b.y, width: b.w, height: b.h, color: b.kind === 'end' ? outOf(b.outcome).stroke : undefined }}>
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
