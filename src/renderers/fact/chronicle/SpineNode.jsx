// ============================================================
//  src/renderers/fact/chronicle/SpineNode.jsx — the spine, its dots and the gap pills
//
//  A decoration layer (1×1 to React Flow, drawn at full size inside; see timeline/nodes.js).
//  The spine runs from the first dot to the last. Where a long gap lies (30 days or more) it is
//  dashed and the pill is amber, so a jump in the story shows from a distance; a short gap is a
//  grey pill on a solid spine. A hollow dot is an event without a date.
// ============================================================

import { memo } from 'react'
import { useLang } from '../../../shell/LangContext.jsx'

const SpineNode = memo(function SpineNode({ data }) {
  const { x, top, bottom, dots, pills, breaks, dotSize } = data
  const { t } = useLang()

  // Solid pieces between the long-gap breaks
  const pieces = []
  let from = top
  for (const b of breaks) {
    pieces.push({ y0: from, y1: b.y0, dashed: false })
    pieces.push({ y0: b.y0, y1: b.y1, dashed: true })
    from = b.y1
  }
  pieces.push({ y0: from, y1: bottom, dashed: false })

  return (
    <div className="antu-chr-spine">
      {pieces
        .filter((p) => p.y1 > p.y0)
        .map((p, i) => (
          <span
            key={`s${i}`}
            className={`antu-chr-line${p.dashed ? ' is-break' : ''}`}
            style={{ left: x - 1.5, top: p.y0, height: p.y1 - p.y0 }}
          />
        ))}
      {dots.map((d, i) => (
        <span
          key={`d${i}`}
          className={`antu-chr-dot g${d.groupIndex}${d.hollow ? ' is-hollow' : ''}`}
          style={{ left: x - dotSize / 2, top: d.y - dotSize / 2, width: dotSize, height: dotSize }}
        />
      ))}
      {pills.map((p, i) => (
        <span key={`p${i}`} className={`antu-chr-gap${p.gap.long ? ' is-long' : ''}`} style={{ left: x + 12, top: p.y }}>
          {(p.gap.approx ? t('card.approxPrefix') : '') + t(p.gap.key, p.gap.vars)}
        </span>
      ))}
    </div>
  )
})

export default SpineNode
