// ============================================================
//  src/renderers/relationship/matrix/MatrixLayerNode.jsx — the whole relation matrix, as one layer
//
//  Bands, the ruled grid, the heads, and the text of each relation in its cell. One decoration layer (1×1 to React Flow, drawn
//  at full size inside); paint is given as SVG attributes so the exported picture keeps it. The chips'
//  text is HTML laid over the SVG.
// ============================================================

import { memo } from 'react'
import { relationPaint } from '../graph/palette.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

const MatrixLayerNode = memo(function MatrixLayerNode({ data }) {
  const { theme } = useTheme()
  const { width, height, note, bands, heads, rowHeads, cells, diagonal, showLabels = true } = data
  const last = diagonal.length - 1
  const right = diagonal[last].x + diagonal[last].w
  const bottom = diagonal[last].y + diagonal[last].h
  const left = diagonal[0].x
  const topY = heads[0].y
  return (
    <div className="antu-mx-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-mx-svg" aria-hidden="true">
        {bands.map((b, i) => {
          const tone = theme.camp[b.tone] ?? theme.camp[0]
          return (
            <g key={`b${i}`}>
              <rect x={b.top.x} y={b.top.y} width={b.top.w} height={b.top.h} fill={tone.fill} stroke={tone.stroke} />
              <rect x={b.left.x} y={b.left.y} width={b.left.w} height={b.left.h} fill={tone.fill} stroke={tone.stroke} />
            </g>
          )
        })}
        {/* The head row and the head column are cells of their own, shaded; the diagonal (a party with itself) too */}
        <rect x={left} y={topY} width={right - left} height={heads[0].h} fill={theme.color.chip} />
        <rect x={rowHeads[0].x} y={rowHeads[0].y} width={rowHeads[0].w} height={bottom - rowHeads[0].y} fill={theme.color.chip} />
        {diagonal.map((d, i) => (
          <rect key={`d${i}`} x={d.x} y={d.y} width={d.w} height={d.h} fill={theme.color.chip} />
        ))}
        {/* The grid: ruled lines between rows and between columns, as in a table */}
        {rowHeads.map((r, i) => (
          <line key={`rl${i}`} x1={rowHeads[0].x} x2={right} y1={r.y} y2={r.y} stroke={theme.color.ink4} />
        ))}
        <line x1={rowHeads[0].x} x2={right} y1={bottom} y2={bottom} stroke={theme.color.ink4} />
        {heads.map((c, i) => (
          <line key={`cl${i}`} x1={c.x} x2={c.x} y1={topY} y2={bottom} stroke={theme.color.ink4} />
        ))}
        <line x1={right} x2={right} y1={topY} y2={bottom} stroke={theme.color.ink4} />
        <line x1={left} x2={right} y1={topY + heads[0].h} y2={topY + heads[0].h} stroke={theme.color.ink} strokeWidth={1.5} />
        <line x1={left} x2={left} y1={topY} y2={bottom} stroke={theme.color.ink} strokeWidth={1.5} />
        {!showLabels &&
          cells.flatMap((c) =>
            c.chips.map((ch, i) => {
              const p = relationPaint(ch.kind, theme)
              const cx = ch.x + ch.w / 2
              const cy = ch.y + ch.h / 2
              return <circle key={`${c.row}|${c.col}|${i}`} cx={cx} cy={cy} r={6} fill={p.stroke} fillOpacity={0.85} />
            }),
          )}
      </svg>

      <div className="antu-mx-note" style={{ left: note.x, top: note.y, width: note.w }}>
        {note.text}
      </div>
      {bands.map((b, i) => (
        <div key={`bt${i}`}>
          <div className="antu-mx-band" style={{ left: b.top.x, top: b.top.y, width: b.top.w, height: b.top.h, color: (theme.camp[b.tone] ?? theme.camp[0]).text }}>
            {b.label}
          </div>
          <div className={`antu-mx-band is-side${/[\u2e80-\u9fff]/.test(b.label) ? ' is-cjk' : ''}`} style={{ left: b.left.x, top: b.left.y, width: b.left.w, height: b.left.h, color: (theme.camp[b.tone] ?? theme.camp[0]).text }}>
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
            <span key={`t${c.row}|${c.col}|${i}`} className={`antu-mx-chip k-${ch.kind}`} data-rel={ch.id} style={{ left: ch.x, top: ch.y, width: ch.w, height: ch.h }}>
              <span>{ch.text}</span>
            </span>
          )),
        )}
    </div>
  )
})

export default MatrixLayerNode
