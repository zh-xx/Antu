// ============================================================
//  src/renderers/fact/AxisNode.jsx —— 时间轴线（装饰节点）
//
//  一条横向实线，作为"时间轴"的视觉基准；不可拖动/选中。
// ============================================================

import { memo } from 'react'

const AxisNode = memo(function AxisNode({ data }) {
  return (
    <div className="antu-axis" style={{ width: data.width }}>
      <span className="antu-axis-arrow">→</span>
    </div>
  )
})

export default AxisNode
