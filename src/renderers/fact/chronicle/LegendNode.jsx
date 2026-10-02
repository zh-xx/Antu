// ============================================================
//  src/renderers/fact/chronicle/LegendNode.jsx — what the dot colours mean
//
//  Above the first card, aligned with the cards. It is part of the diagram (it goes into the
//  exported image), because without it the colours of the dots mean nothing on paper.
// ============================================================

import { memo } from 'react'

const LegendNode = memo(function LegendNode({ data }) {
  return (
    <div className="antu-chr-legend">
      {data.groups.map((g) => (
        <span key={g.groupIndex} className={`antu-chr-group g${g.groupIndex}`}>
          <i />
          {g.label}
        </span>
      ))}
    </div>
  )
})

export default LegendNode
