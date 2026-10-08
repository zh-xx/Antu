// ============================================================
//  src/renderers/fact/timeline/ColumnHeaderNode.jsx — column headings
//
//  One line carrying the side's title. When the side has several columns (several parties), the
//  title is written once over all of them and each column is headed by its party's name (vertical:
//  one node for the side, `actors` one per column; horizontal: the title on the side's first lane,
//  the party's name on every lane). See headerNodes in nodes.js.
// ============================================================

import { memo } from 'react'

const ColumnHeaderNode = memo(function ColumnHeaderNode({ data }) {
  const { width, height, isH, groupIndex, sideTitle, colTitle, actors, laneW } = data

  return (
    <div
      className={`antu-colhead g${groupIndex}${isH ? ' is-h' : ''}${actors ? ' is-span' : ''}`}
      style={{ width, height: height || undefined }}
    >
      {sideTitle && <div className="antu-colhead-side">{sideTitle}</div>}
      {actors && (
        <div className="antu-colhead-actors">
          {actors.map((name, i) => (
            <div key={i} className="antu-colhead-actor" style={{ width: laneW }}>
              {name}
            </div>
          ))}
        </div>
      )}
      {colTitle && <div className="antu-colhead-actor">{colTitle}</div>}
    </div>
  )
})

export default ColumnHeaderNode
