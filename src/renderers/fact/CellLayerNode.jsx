// ============================================================
//  src/renderers/fact/CellLayerNode.jsx —— 格子层（装饰节点）
//
//  把底层那套矩形一格一格画出来（虚线），让“整张图是矩形拼出来的”
//  这件事看得见。默认不显示，由信息栏里的开关控制。
//
//  两个要点：
//   1. 用 SVG 画而不是 CSS 的 dashed 边框——CSS 的虚线长度改不了，
//      缩放后很容易密到看不出是虚线。
//   2. 线宽与虚线间隔按当前缩放**反向补偿**：图缩到 0.5 倍时，
//      线在屏幕上的粗细和疏密保持不变，不会糊成一条实线。
//
//  两侧各多画一列空位（PAD_COLS），把坐标系的余量也显出来。
// ============================================================

import { memo } from 'react'
import { useStore } from '@xyflow/react'

/** 内容两侧各多画几列空位 */
const PAD_COLS = 1

const CellLayerNode = memo(function CellLayerNode({ data }) {
  const { cols, rows, cellW, cellH, originX, originY, isH } = data

  const zoom = useStore((s) => s.transform[2]) || 1
  const k = 1 / zoom // 反向补偿系数

  // 屏幕上的线宽：比卡片边框细一点，免得抢戏
  const SCREEN_STROKE = 0.8
  const stroke = SCREEN_STROKE * k

  // 沿车道轴多画两列空位，用来显示坐标系的余量。
  // 竖向时车道是列（左右各多一列），横向时车道是行（上下各多一行）。
  const totalLanes = cols + PAD_COLS * 2
  const width = isH ? originX + rows * cellW : totalLanes * cellW
  const height = isH ? totalLanes * cellH : originY + rows * cellH

  const rects = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < totalLanes; c += 1) {
      // 竖向：槽沿纵向走，车道沿横向走；横向：两者互换
      const x = (isH ? originX + r * cellW : c * cellW) + stroke / 2
      const y = (isH ? c * cellH : originY + r * cellH) + stroke / 2
      rects.push(
        <rect
          key={`${r}-${c}`}
          className="antu-cell"
          x={x}
          y={y}
          width={cellW - stroke}
          height={cellH - stroke}
          strokeWidth={stroke}
          strokeDasharray={`${11 * k} ${7 * k}`}
        />,
      )
    }
  }

  return (
    <svg
      className="antu-cells"
      style={{
        left: isH ? 0 : -PAD_COLS * cellW,
        top: isH ? -PAD_COLS * cellH : 0,
        width,
        height,
      }}
    >
      {rects}
    </svg>
  )
})

export default CellLayerNode
