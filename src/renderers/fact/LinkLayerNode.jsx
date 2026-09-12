// ============================================================
//  src/renderers/fact/LinkLayerNode.jsx —— 引线层（装饰节点）
//
//  所有“卡片 → 轴点”的引线集中在这一个节点里，整层排在卡片之前，
//  因此卡片永远压在引线之上，引线不会横穿别人的卡片。
//  本层不接收鼠标事件。
// ============================================================

import { memo } from 'react'

const LinkLayerNode = memo(function LinkLayerNode({ data }) {
  return (
    <div className="antu-link-layer">
      {data.segments.map((s, i) => (
        <span
          key={i}
          className="antu-link"
          style={{ left: s.left, top: s.top, width: s.width }}
        />
      ))}
    </div>
  )
})

export default LinkLayerNode
