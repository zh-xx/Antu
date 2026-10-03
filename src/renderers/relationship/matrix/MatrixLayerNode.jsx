// ============================================================
//  src/renderers/relationship/matrix/MatrixLayerNode.jsx — the whole relation matrix, as one layer
//
//  Bands, the grid, the heads, and the chips in the cells. One decoration layer (1×1 to React Flow, drawn
//  at full size inside); paint is given as SVG attributes so the exported picture keeps it. The chips'
//  text is HTML laid over the SVG, as in the guarantee chain.
// ============================================================

import { memo } from 'react'
import { relationPaint } from '../graph/palette.js'

const BAND_TONES = [
  { fill: '#eff6ff', stroke: '#bfdbfe', text: '#1d4ed8' },
  { fill: '#fff7ed', stroke: '#fed7aa', text: '#c2410c' },
]

const MatrixLayerNode = memo(function MatrixLayerNode({ data }) {
  const { width, height, corner, bands, heads, rowHeads, cells, diagonal, showLabels = true } = data
  const last = diagonal.length - 1
  const right = diagonal[last].x + diagonal[last].w
  const bottom = diagonal[last].y + diagonal[last].h
  const left = diagonal[0].x
  const topY = heads[0].y
  return (
    <div className="antu-mx-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-mx-svg" aria-hidden="true">
        {bands.map((b, i) => {
          const tone = BAND_TONES[b.tone] ?? BAND_TONES[0]
          return (
            <g key={`b${i}`}>
              <rect x={b.top.x} y={b.top.y} width={b.top.w} height={b.top.h} rx={6} fill={tone.fill} stroke={tone.stroke} />
              <rect x={b.left.x} y={b.left.y} width={b.left.w} height={b.left.h} rx={6} fill={tone.fill} stroke={tone.stroke} />
            </g>
          )
        })}
        {diagonal.map((d, i) => (
          <rect key={`d${i}`} x={d.x} y={d.y} width={d.w} height={d.h} fill="#f1f5f9" />
        ))}
        {/* The grid: a hairline between rows and between columns */}
        {rowHeads.map((r, i) => (
          <line key={`rl${i}`} x1={rowHeads[0].x} x2={right} y1={r.y} y2={r.y} stroke="#e2e8f0" />
        ))}
        <line x1={rowHeads[0].x} x2={right} y1={bottom} y2={bottom} stroke="#e2e8f0" />
        {heads.map((c, i) => (
          <line key={`cl${i}`} x1={c.x} x2={c.x} y1={topY} y2={bottom} stroke="#e2e8f0" />
        ))}
        <line x1={right} x2={right} y1={topY} y2={bottom} stroke="#e2e8f0" />
        <line x1={left} x2={right} y1={topY + heads[0].h} y2={topY + heads[0].h} stroke="#94a3b8" />
        <line x1={left} x2={left} y1={topY} y2={bottom} stroke="#94a3b8" />
        {showLabels &&
          cells.flatMap((c) =>
            c.chips.map((ch, i) => {
              const p = relationPaint(ch.kind)
              return <rect key={`${c.row}|${c.col}|${i}`} x={ch.x} y={ch.y} width={ch.w} height={ch.h} rx={8} fill={p.stroke} fillOpacity={0.12} stroke={p.stroke} strokeWidth={1} strokeDasharray={p.dash} />
            }),
          )}
        {!showLabels &&
          cells.flatMap((c) =>
            c.chips.map((ch, i) => {
              const p = relationPaint(ch.kind)
              const cx = ch.x + ch.w / 2
              const cy = ch.y + ch.h / 2
              return <circle key={`${c.row}|${c.col}|${i}`} cx={cx} cy={cy} r={6} fill={p.stroke} fillOpacity={0.85} />
            }),
          )}
      </svg>

      <div className="antu-mx-corner" style={{ left: corner.x, top: corner.y, width: corner.w, height: corner.h }}>
        {corner.text}
      </div>
      {bands.map((b, i) => (
        <div key={`bt${i}`}>
          <div className="antu-mx-band" style={{ left: b.top.x, top: b.top.y, width: b.top.w, height: b.top.h, color: (BAND_TONES[b.tone] ?? BAND_TONES[0]).text }}>
            {b.label}
          </div>
          <div className={`antu-mx-band is-side${/[\u2e80-\u9fff]/.test(b.label) ? ' is-cjk' : ''}`} style={{ left: b.left.x, top: b.left.y, width: b.left.w, height: b.left.h, color: (BAND_TONES[b.tone] ?? BAND_TONES[0]).text }}>
            <span>{b.label}</span>
          </div>
        </div>
      ))}
      {heads.map((c) => (
        <div key={`h${c.id}`} className="antu-mx-head" data-id={c.id} style={{ left: c.x, top: c.y, width: c.w, height: c.h }}>
          <span>{c.text}</span>
        </div>
      ))}
      {rowHeads.map((r) => (
        <div key={`r${r.id}`} className="antu-mx-rowhead" data-id={r.id} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
          <span>{r.text}</span>
        </div>
      ))}
      {showLabels &&
        cells.flatMap((c) =>
          c.chips.map((ch, i) => (
            <span key={`t${c.row}|${c.col}|${i}`} className={`antu-mx-chip k-${ch.kind}`} data-rel={ch.id} style={{ left: ch.x, top: ch.y, width: ch.w, height: ch.h, color: relationPaint(ch.kind).stroke }}>
              <span>{ch.text}</span>
            </span>
          )),
        )}
    </div>
  )
})

export default MatrixLayerNode
