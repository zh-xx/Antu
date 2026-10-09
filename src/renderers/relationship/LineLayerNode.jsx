// ============================================================
//  src/renderers/relationship/LineLayerNode.jsx — everything of a levelled relationship view that is not a party box
//
//  Shared by the equity tree, the authority chart and the relation path: one decoration
//  layer (1×1 to React Flow, drawn at full size inside) holding the lines from box to box, their pills,
//  the frames of the sections under the picture, and the text in them.
//  Paint is given as SVG attributes (and the pills' border as CSS the export keeps), so the exported
//  picture shows what the screen shows. A line is painted by its relation kind (palette.js).
// ============================================================

import { memo } from 'react'
import { relationPaint } from './graph/palette.js'
import { useTheme } from '../../theme/ThemeContext.jsx'

const LineLayerNode = memo(function LineLayerNode({ data }) {
  const { theme } = useTheme()
  const { width, height, links, pills, empties, frames, texts, table = null, showLabels = true } = data
  const kinds = [...new Set(links.filter((l) => l.arrow !== 'none').map((l) => (l.ink ? 'ink' : l.kind ?? 'equity')))]
  return (
    <div className="antu-ln-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-ln-svg" aria-hidden="true">
        <defs>
          {kinds.map((k) => (
            <marker key={k} id={`antu-ln-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={k === 'ink' ? theme.color.ink2 : relationPaint(k, theme).stroke} />
            </marker>
          ))}
        </defs>
        {table && (
          <g>
            <rect x={table.x} y={table.y} width={table.w} height={table.headH} fill={theme.color.chip} />
            {table.rows.filter((r) => r.sep !== false).map((r) => (
              <line key={`rl${r.id}`} x1={table.x} x2={table.x + table.w} y1={r.y + r.h} y2={r.y + r.h} stroke={theme.color.line} />
            ))}
            {table.xs.map((x, i) => (
              <line key={`cl${i}`} x1={x} x2={x} y1={table.y} y2={table.bottom} stroke={theme.color.line} />
            ))}
            <line x1={table.x} x2={table.x + table.w} y1={table.y} y2={table.y} stroke={theme.color.ink4} />
            <line x1={table.x} x2={table.x + table.w} y1={table.y + table.headH} y2={table.y + table.headH} stroke={theme.color.ink4} />
          </g>
        )}
        {frames.map((f, i) => (
          <g key={`f${i}`}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={theme.radius.group} fill={theme.color.bg} stroke={theme.color.line} />
            <text x={f.titleAt[0]} y={f.titleAt[1]} fontSize={14} fontWeight={700} fill={theme.color.ink3}>
              {f.title}
            </text>
          </g>
        ))}
        {empties.map((e, i) => (
          <g key={`e${i}`}>
            <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={theme.radius.group} fill={theme.color.chip} stroke={theme.color.ink4} strokeDasharray="4 4" />
            <text x={e.x + e.w / 2} y={e.y + e.h / 2 - 2} textAnchor="middle" fontSize={16} fontWeight={650} fill={theme.color.ink3}>
              {e.text}
            </text>
            <text x={e.x + e.w / 2} y={e.y + e.h / 2 + 22} textAnchor="middle" fontSize={12.5} fill={theme.color.ink4}>
              {e.sub}
            </text>
          </g>
        ))}
        {links.map((l, i) => {
          const kind = l.ink ? 'ink' : l.kind ?? 'equity'
          const paint = l.ink ? { stroke: theme.color.ink2, width: 1.6 } : relationPaint(kind, theme)
          return (
            <g key={`l${i}`} opacity={l.opacity ?? 1}>
              <path
                d={l.d}
                fill="none"
                stroke={paint.stroke}
                strokeWidth={l.width ?? paint.width}
                strokeDasharray={l.back ? '5 4' : paint.dash}
                markerEnd={l.arrow === 'none' || l.arrow === 'start' ? undefined : `url(#antu-ln-arrow-${kind})`}
                markerStart={l.arrow === 'start' ? `url(#antu-ln-arrow-${kind})` : undefined}
              />
              {paint.double && <path d={l.d} fill="none" stroke={theme.color.bg} strokeWidth={(l.width ?? paint.width) - 2.4} />}
            </g>
          )
        })}
      </svg>
      {table &&
        table.header.map((h) => (
          <div key={`th${h.x}`} className="antu-ln-cell is-head" style={{ left: h.x, top: table.y, width: h.w, height: table.headH }}>
            {h.text}
          </div>
        ))}
      {table &&
        table.rows.flatMap((r) =>
          r.cells.map((c, i) => (
            <div key={`${r.id}:${i}`} className={`antu-ln-cell${c.bold ? ' is-first' : ''}`} data-row={r.id} style={{ left: c.x, top: c.y ?? r.y, width: c.w, height: c.h ?? r.h }}>
              {c.lines.map((l, j) => (
                <div key={j} className={i === 0 && j > 0 ? 'antu-ln-cell-sub' : undefined}>
                  {l}
                </div>
              ))}
            </div>
          )),
        )}
      {showLabels &&
        pills.map((p, i) => (
          <span
            key={`pt${i}`}
            className={`antu-ln-pill${p.unknown ? ' is-unknown' : ''}${p.back ? ' is-back' : ''}${p.ink ? ' is-ink' : ''}`}
            data-rel={p.relId}
            style={{ left: p.x, top: p.y, opacity: p.opacity ?? 1, ...(p.kind && !p.ink ? { borderColor: relationPaint(p.kind, theme).stroke, color: relationPaint(p.kind, theme).stroke } : {}) }}
          >
            {p.text}
          </span>
        ))}
      {texts.map((x, i) => (
        <div key={`t${i}`} className={`antu-ln-text${x.tone === 'note' ? ' is-note' : x.tone === 'row' ? ' is-row' : ''}`} style={{ left: x.x, top: x.y, width: x.w }}>
          <div>{x.main}</div>
          {x.sub && <div className="antu-ln-text-sub">{x.sub}</div>}
        </div>
      ))}
    </div>
  )
})

export default LineLayerNode
