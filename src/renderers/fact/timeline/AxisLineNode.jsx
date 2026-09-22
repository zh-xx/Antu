// ============================================================
//  src/renderers/fact/AxisLineNode.jsx —— 轴线（装饰节点）
//
//  中间那一列的一条竖线，底端一个向下箭头表示时间方向；
//  每个槽在轴线上打一个小圆点，作为该时刻的标记。
//  轴上不写时间（时间在每张卡片上）。
// ============================================================

import { memo } from 'react'

const AxisLineNode = memo(function AxisLineNode({ data }) {
  const { isH, length, dotOffsets, dotSize } = data

  return (
    // 外层只负责“被测量”：长度立即到位、不加过渡。
    // React Flow 靠它量出节点尺寸来算 fitView 的边界与居中；
    // 如果让被测量的元素自己做尺寸过渡，它量到的会是过渡中间的旧值，
    // 缩放和位置就都会算错（实测过：全关字段后图会浮在上方、下面空一大块）。
    <div className={`antu-axis-wrap${isH ? ' is-h' : ''}`} style={isH ? { width: length } : { height: length }}>
      <div className="antu-axis-line" style={isH ? { width: length } : { height: length }}>
        <span className="antu-axis-arrow" />
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
