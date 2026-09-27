// ============================================================
//  src/renderers/procedure/flow/StageBandNode.jsx — stage bands (a decoration node)
//
//  Draws the bands layout.js cut along the main line (`stageBands`): a thin bar and the stage
//  name in the gutter, and a light dashed line across the diagram where one stage hands over to
//  the next. The bands never overlap, by construction (see step ⑦ in layout.js), so nothing
//  here has to resolve collisions.
//
//  Vertical: the gutter is a column on the left, bands run downwards.
//  Horizontal: the gutter is a row along the top, bands run to the right.
// ============================================================

import { memo } from 'react'

/** Space kept between one band's bar and the next, so two stages never read as one */
const BAR_GAP = 8

const StageBandNode = memo(function StageBandNode({ data }) {
  const { bands, pad, gutter, width, height, vertical } = data

  return (
    <div className={`antu-pstages${vertical ? '' : ' is-h'}`}>
      {bands.map((b, i) => {
        const len = b.to - b.from
        const bar = vertical
          ? { left: pad, top: b.from + BAR_GAP / 2, width: 3, height: Math.max(0, len - BAR_GAP) }
          : { left: b.from + BAR_GAP / 2, top: pad, width: Math.max(0, len - BAR_GAP), height: 3 }
        const label = vertical
          ? { left: pad + 12, top: b.from + BAR_GAP / 2, width: gutter - 28 }
          : { left: b.from + 12, top: pad + 10, width: Math.max(0, len - 24) }
        // The hand-over line: across the whole diagram, at the start of every band but the first
        const rule =
          i === 0
            ? null
            : vertical
              ? { left: pad, top: b.from, width: width - pad * 2, height: 0 }
              : { left: b.from, top: pad, width: 0, height: height - pad * 2 }
        return (
          <div key={`${b.stageId}-${i}`}>
            {rule && <span className="antu-pstage-rule" style={rule} />}
            <span className="antu-pstage-bar" style={bar} />
            <span className="antu-pstage-name" style={label} title={b.label}>
              {b.label}
            </span>
          </div>
        )
      })}
    </div>
  )
})

export default StageBandNode
