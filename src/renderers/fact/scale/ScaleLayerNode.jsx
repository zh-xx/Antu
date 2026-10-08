// ============================================================
//  src/renderers/fact/scale/ScaleLayerNode.jsx — everything on the time scale that is not a card
//
//  One decoration layer (1×1 to React Flow, drawn at full size inside; see timeline/nodes.js):
//  the lanes with their labels, the breaks, the marks (dot, bar, band, hollow dot), the leader
//  lines from the cards, the brackets under gathered runs, and the time axis with its ticks and
//  segment captions. Paint is given as SVG attributes so the exported picture keeps it.
// ============================================================

import { memo } from 'react'
import { useLang } from '../../../shell/LangContext.jsx'
import { LABEL_W, BREAK_W } from './layout.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'

export const runMark = (n) => (n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`)

const ScaleLayerNode = memo(function ScaleLayerNode({ data }) {
  const { t } = useLang()
  const { theme } = useTheme()
  const c0 = theme.color
  // Group colours: side 1, side 2, and the axis colour for what belongs to neither (as on the timeline)
  const GROUP_COLOURS = [c0.side1, c0.side2, c0.axis]
  const LINE = c0.line
  const INK = c0.ink3
  const { width, lanesH, axisY, lanes, segments, ticks, marks, leaders, brackets } = data
  const height = axisY + 44
  const colour = (i) => GROUP_COLOURS[i] ?? GROUP_COLOURS[2]
  // The bands alternate by group, not by lane: with a lane per party, the lanes of one side share a band
  const block = []
  lanes.forEach((l, i) => block.push(i === 0 ? 0 : block[i - 1] + (l.groupIndex !== lanes[i - 1].groupIndex ? 1 : 0)))

  return (
    <div className="antu-sc-layer" style={{ width, height }}>
      <svg width={width} height={height} className="antu-sc-svg" aria-hidden="true">
        {/* lanes: a light band per group, alternating, and the line the marks sit on */}
        {lanes.map((l, i) => (
          <g key={l.key}>
            {block[i] % 2 === 1 && <rect x={0} y={l.top} width={width} height={l.lineY - l.top + 14} fill={c0.chip} fillOpacity={0.6} />}
            <line x1={LABEL_W} x2={width} y1={l.lineY} y2={l.lineY} stroke={LINE} strokeWidth={2} />
          </g>
        ))}

        {/* breaks: a shaded strip across every lane, with // on the axis */}
        {segments
          .filter((s) => s.breakBefore)
          .map((s) => {
            const b = s.breakBefore
            return (
              <g key={`b${s.index}`}>
                <rect x={b.x + 6} y={0} width={b.w - 12} height={axisY} fill={c0.chip} />
                <line x1={b.x + 6} x2={b.x + 6} y1={0} y2={axisY} stroke={c0.line} strokeDasharray="3 4" />
                <line x1={b.x + b.w - 6} x2={b.x + b.w - 6} y1={0} y2={axisY} stroke={c0.line} strokeDasharray="3 4" />
                <text x={b.x + BREAK_W / 2} y={axisY + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill={INK}>
                  {'//'}
                </text>
              </g>
            )
          })}

        {/* leader lines, under the marks */}
        {leaders.map((l, i) => (
          <line key={`l${i}`} x1={l.x} x2={l.x} y1={l.y0} y2={l.y1} stroke={c0.ink4} strokeWidth={1} strokeDasharray={l.run ? '3 3' : undefined} />
        ))}

        {/* marks */}
        {marks.map((m) => {
          const c = colour(m.groupIndex)
          if (m.kind === 'band') {
            return (
              <rect key={m.id} x={m.x0} y={m.y - 7} width={m.x1 - m.x0} height={14} rx={3} fill={c} fillOpacity={0.16} stroke={c} strokeOpacity={0.5} strokeDasharray="3 2" />
            )
          }
          if (m.kind === 'bar') {
            return <rect key={m.id} x={m.x0} y={m.y - 4} width={Math.max(6, m.x1 - m.x0)} height={8} rx={4} fill={c} />
          }
          if (m.undated) {
            return <circle key={m.id} cx={m.x} cy={m.y} r={5} fill={c0.bg} stroke={GROUP_COLOURS[2]} strokeWidth={1.5} strokeDasharray="2 2" />
          }
          // Side 2 is a square, side 1 a circle: the sides differ without colour (the lanes are named too)
          if (m.groupIndex === 1) return <rect key={m.id} x={m.x - 5} y={m.y - 5} width={10} height={10} rx={2} fill={c} stroke={c0.bg} strokeWidth={2} />
          return <circle key={m.id} cx={m.x} cy={m.y} r={5.5} fill={c} stroke={c0.bg} strokeWidth={2} />
        })}

        {/* brackets under gathered runs */}
        {brackets.map((b) => (
          <g key={`r${b.run}`}>
            <path d={`M${b.x0} ${b.y - 4} V${b.y} H${b.x1} V${b.y - 4}`} fill="none" stroke={INK} strokeWidth={1.2} />
            <text x={(b.x0 + b.x1) / 2} y={b.y + 13} textAnchor="middle" fontSize={11} fill={INK}>
              {runMark(b.run)}
            </text>
          </g>
        ))}

        {/* the time axis */}
        <line x1={LABEL_W} x2={width} y1={axisY} y2={axisY} stroke={c0.axis} strokeWidth={1.5} />
        {ticks.map((k, i) => (
          <g key={`t${i}`}>
            <line x1={k.x} x2={k.x} y1={axisY} y2={axisY + 5} stroke={c0.axis} />
            <text x={k.x} y={axisY + 17} textAnchor="middle" fontSize={10.5} fill={INK}>
              {k.label}
            </text>
          </g>
        ))}
      </svg>

      {/* lane labels, on the left */}
      {lanes.map((l) => (
        <div key={l.key} className={`antu-sc-lane g${l.groupIndex}`} style={{ bottom: `calc(100% - ${l.lineY + 8}px)`, width: LABEL_W - 20 }}>
          <i />
          <span>
            {l.side ? <em className="antu-sc-lane-side">{l.side}</em> : null}
            {l.other ? (lanes.length > 1 ? t('scale.other') : t('scale.events')) : l.label}
          </span>
        </div>
      ))}

      {/* segment captions and break captions, under the ticks */}
      {segments.map((s) => (
        <div key={`c${s.index}`} className="antu-sc-seg" style={{ left: s.x0, width: s.x1 - s.x0, top: axisY + 24 }}>
          {t('scale.segment', { n: s.index + 1, unit: t(`scale.unit.${s.unit}`), count: s.count })}
        </div>
      ))}
      {segments
        .filter((s) => s.breakBefore?.gap)
        .map((s) => (
          <div key={`g${s.index}`} className="antu-sc-break" style={{ left: s.breakBefore.x, width: s.breakBefore.w, top: lanesH / 2 - 10 }}>
            {t(s.breakBefore.gap.key, s.breakBefore.gap.vars)}
          </div>
        ))}
    </div>
  )
})

export default ScaleLayerNode
