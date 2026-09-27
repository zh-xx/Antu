// ============================================================
//  src/renderers/fact/timeline/AxisLineNode.jsx — the axis (a decoration node)
//
//  The vertical line of the middle column, with a downward arrow at its bottom end showing the
//  direction of time; each slot gets a small dot on the axis as the marker for that instant.
//  No time is written on the axis (time is on every card).
//
//  **The arrow is an inline SVG, not a CSS border triangle.** A border triangle is put together
//  from width:0;height:0 plus three transparent sides, and is dropped entirely when exported to
//  PNG (html-to-image does not keep such zero-size elements), the symptom being a bare axis in
//  the exported image. The SVG has a real size and is stable. Each direction gets its own set of
//  coordinates rather than a rotation, one variable fewer.
//
//  Also: the arrow reaches 6px beyond the axis line, and those 6px must be counted into the
//  content size (see ARROW_EXTENT in timeline/metrics.js), or the export crops them off.
// ============================================================

import { memo } from 'react'

const AxisLineNode = memo(function AxisLineNode({ data }) {
  const { isH, length, dotOffsets, dotSize } = data

  return (
    // The outer element is only there to be measured: its length is in place immediately, with no
    // transition. React Flow measures the node size from it to work out fitView's bounds and
    // centring; if the measured element animated its own size, what is measured would be the old
    // value halfway through the transition, and both zoom and position would be wrong (measured:
    // with all fields off the diagram floated to the top with a large blank area below).
    <div className={`antu-axis-wrap${isH ? ' is-h' : ''}`} style={isH ? { width: length } : { height: length }}>
      <div className="antu-axis-line" style={isH ? { width: length } : { height: length }}>
        {isH ? (
          <svg className="antu-axis-arrow" width="6" height="10" viewBox="0 0 6 10" aria-hidden="true">
            <polygon points="0,0 6,5 0,10" fill="currentColor" />
          </svg>
        ) : (
          <svg className="antu-axis-arrow" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
            <polygon points="0,0 10,0 5,6" fill="currentColor" />
          </svg>
        )}
      </div>
      {dotOffsets.map((p, i) => (
        <span
          key={i}
          className="antu-axis-dot"
          style={
            isH
              ? { left: p, top: -4, width: dotSize, height: dotSize }
              : { top: p, left: -4, width: dotSize, height: dotSize }
          }
        />
      ))}
    </div>
  )
})

export default AxisLineNode
