// ============================================================
//  src/renderers/fact/AxisLineNode.jsx —— 轴线（装饰节点）
//
//  中间那一列的一条竖线，底端一个向下箭头表示时间方向；
//  每个槽在轴线上打一个小圆点，作为该时刻的标记。
//  轴上不写时间（时间在每张卡片上）。
// ============================================================

import { memo } from 'react'

const AxisLineNode = memo(function AxisLineNode({ data }) {
  const { height, dotYs, dotSize } = data

  return (
    <div className="antu-axis-line" style={{ height }}>
      <span className="antu-axis-arrow">▼</span>
      {dotYs.map((y, i) => (
        <span
          key={i}
          className="antu-axis-dot"
          style={{ top: y, width: dotSize, height: dotSize }}
        />
      ))}
    </div>
  )
})

export default AxisLineNode
