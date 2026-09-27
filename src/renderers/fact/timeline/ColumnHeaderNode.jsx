// ============================================================
//  src/renderers/fact/timeline/ColumnHeaderNode.jsx — column headings
//
//  One line carrying the side and the group name (for example "side 1 · normal (performance as
//  agreed)"). Only when that side has several columns (several parties) is a second line with
//  the party names added below.
// ============================================================

import { memo } from 'react'

const ColumnHeaderNode = memo(function ColumnHeaderNode({ data }) {
  const { width, height, isH, groupIndex, sideTitle, colTitle } = data

  return (
    <div
      className={`antu-colhead g${groupIndex}${isH ? ' is-h' : ''}`}
      style={{ width, height: height || undefined }}
    >
      {sideTitle && <div className="antu-colhead-side">{sideTitle}</div>}
      {colTitle && <div className="antu-colhead-actor">{colTitle}</div>}
    </div>
  )
})

export default ColumnHeaderNode
