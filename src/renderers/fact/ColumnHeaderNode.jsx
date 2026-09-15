// ============================================================
//  src/renderers/fact/ColumnHeaderNode.jsx —— 列标题
//
//  一行写侧与组名（如“第 1 侧 · 正常（按约定履行）”）。
//  只有该侧有多列（多主体）时，才在下面补一行主体名。
// ============================================================

import { memo } from 'react'

const ColumnHeaderNode = memo(function ColumnHeaderNode({ data }) {
  const { width, sideTitle, colTitle, groupIndex } = data

  return (
    <div className={`antu-colhead g${groupIndex}`} style={{ width }}>
      {sideTitle && <div className="antu-colhead-side">{sideTitle}</div>}
      {colTitle && <div className="antu-colhead-actor">{colTitle}</div>}
    </div>
  )
})

export default ColumnHeaderNode
