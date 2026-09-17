// ============================================================
//  src/renderers/fact/LinkLayerNode.jsx —— 引线层（装饰节点）
//
//  所有“卡片 → 轴点”的引线集中在这一个节点里，整层排在卡片之前，
//  因此卡片永远压在引线之上，引线不会横穿别人的卡片。
//  本层不接收鼠标事件。
// ============================================================

import { memo } from 'react'

const LinkLayerNode = memo(function LinkLayerNode({ data }) {
  const { segments, isH } = data

  return (
    <div className="antu-link-layer">
      {segments.map((s, i) => (
        <span
          key={i}
          // 竖向是横线（border-top），横向是竖线（border-left）
          className={`antu-link${isH ? ' is-h' : ''}`}
          style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
        />
      ))}
    </div>
  )
})

export default LinkLayerNode
