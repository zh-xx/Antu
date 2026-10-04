// ============================================================
//  src/renderers/fact/chronicle/LegendNode.jsx — what the marks on the line mean
//
//  Above the first card, aligned with the cards. It is part of the diagram (it goes into the
//  exported image): each group is a mark (circle, square or diamond, with its colour) and its name,
//  so on paper, and in black and white, the shape says the group. On the page each entry is a button:
//  click one and only that group's cards and marks stay lit; click it again to light them all.
// ============================================================

import { memo } from 'react'

const LegendNode = memo(function LegendNode({ data }) {
  const { groups, active = null, onToggle } = data
  return (
    <div className="antu-chr-legend nodrag nopan">
      {groups.map((g) => (
        <button
          key={g.groupIndex}
          type="button"
          className={`antu-chr-legend-item g${g.groupIndex}${active === g.groupIndex ? ' is-on' : ''}${active !== null && active !== g.groupIndex ? ' is-off' : ''}`}
          aria-pressed={active === g.groupIndex}
          onClick={() => onToggle?.(g.groupIndex)}
        >
          <i className={`antu-chr-mark s-${g.shape}`} />
          {g.label}
        </button>
      ))}
    </div>
  )
})

export default LegendNode
