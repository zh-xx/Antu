// ============================================================
//  src/renderers/fact/AxisLineNode.jsx —— 轴线（装饰节点）
//
//  中间那一列的一条竖线，底端一个向下箭头表示时间方向；
//  每个槽在轴线上打一个小圆点，作为该时刻的标记。
//  轴上不写时间（时间在每张卡片上）。
//
//  **箭头用内联 SVG，不用 CSS 边框三角。** 边框三角靠 width:0;height:0
//  加三边 transparent 拼出形状，导出成 PNG 时会被整个丢掉
//  （html-to-image 不保留这种零尺寸元素），症状是导出图里轴上光秃秃的。
//  SVG 有真实尺寸，稳定。两个方向各给一套坐标，不靠旋转，少一层可变因素。
//
//  另外：箭头超出轴线 6px，那 6px 要算进内容尺寸（见 timeline/metrics.js
//  的 ARROW_EXTENT），否则导出时会被裁掉。
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
