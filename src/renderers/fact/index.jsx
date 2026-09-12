// ============================================================
//  src/renderers/fact/index.jsx —— fact（事实图）渲染器
//
//  输入：通过校验的 fact 规范
//  输出：一张网格
//    行 = 槽（时间点，自上而下）
//    列 = 第 1 侧各主体 · 轴线 · 第 2 侧各主体
//  所有位置来自 core/factGrid.js，本文件负责画与交互。
//
//  详情不用侧边栏，改为**卡片旁边的浮层**：
//  悬停露出摘要，点击就地钉住看全文。
//  浮层是覆盖式的，画布尺寸从头到尾不变，卡片不会跑位。
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import EventNode from './EventNode.jsx'
import ColumnHeaderNode from './ColumnHeaderNode.jsx'
import AxisLineNode from './AxisLineNode.jsx'
import LinkLayerNode from './LinkLayerNode.jsx'
import CellLayerNode from './CellLayerNode.jsx'
import FactInfo from './FactInfo.jsx'
import AppRail from '../../shell/AppRail.jsx'
import { PreviewContext } from './previewContext.js'
import { buildFactGraph } from './timelineLayout.js'
import { ARIA_LABEL_CONFIG } from '../../core/labels.js'

const nodeTypes = {
  card: EventNode,
  colHeader: ColumnHeaderNode,
  axis: AxisLineNode,
  links: LinkLayerNode,
  cells: CellLayerNode,
}

/** fitView 的留白比例，算缩放下限时要用同一个值 */
const FIT_PADDING = 0.12

export default function FactRenderer({ spec, nav, showGrid = false, onToggleGrid }) {
  const graph = useMemo(() => buildFactGraph(spec), [spec])

  // 浮层状态：hoveredId 是鼠标划过的卡，pinnedId 是点住不放的卡
  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)

  // 节点必须放在可写状态里：React Flow 会把量出来的尺寸通过 onNodesChange
  // 回写到节点上，MiniMap 等依赖尺寸的功能都靠这份回写。
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  // 画布边界：平移范围限制在内容四周各留 160px，滑到边就停，不会滑进空白。
  const translateExtent = useMemo(() => {
    const PAD = 160
    return [
      [-PAD, -PAD],
      [graph.size.width + PAD, graph.size.height + PAD],
    ]
  }, [graph])

  const slots = Array.isArray(spec.slots) ? spec.slots : []

  // 量画布容器的实际尺寸，用来算“刚好装下整张图”的缩放倍数
  const canvasRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setCanvasSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 缩放下限＝刚好装下整张图的倍数，相当于“不允许缩到比全览更小”。
  // 公式：缩放 = 视口 ÷ (内容 × (1 + 留白比例))，宽高各算一次取小值。
  // 这条是拿实测反推出来的：视口 857 高时全览为 0.5776，1000 高时为 0.6732，
  // 两组数据都落在 (视口 ÷ 1487) 上，1487 = 1328 × 1.12。
  // 若公式与它不一致，缩放下限就会偏离全览，第一次滚动时画面会跳一下。
  const minZoom = useMemo(() => {
    const { width, height } = canvasSize
    if (!width || !height) return 0.1
    const zx = width / (graph.size.width * (1 + FIT_PADDING))
    const zy = height / (graph.size.height * (1 + FIT_PADDING))
    return Math.max(Math.min(zx, zy), 0.05)
  }, [canvasSize, graph])

  // 放大上限＝1 倍（内容原始大小）。字号与间距都按 1 倍设计，
  // 再放大只是把同样的像素摊大，看不出更多信息。
  // 图很小时全览倍数会超过 1，那就以全览为准，保证上下限不打架。
  const maxZoom = useMemo(() => Math.max(1, minZoom), [minZoom])

  // 浮层状态通过 Context 传下去，避免写进节点 data 引发整份节点数组重建
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )

  const eventCount = slots.reduce((n, s) => n + (s?.events?.length || 0), 0)
  const approxCount = slots.reduce(
    (n, s) => n + (s?.events || []).filter((e) => e?.approx).length,
    0,
  )

  const chips = [
    `${eventCount} 个事件`,
    `${slots.length} 个时间点`,
    `${spec.actors?.length || 0} 个主体`,
    `${spec.sources?.length || 0} 个来源`,
    approxCount > 0 ? `${approxCount} 个近似时间` : null,
  ].filter(Boolean)

  return (
    <div className="antu-fact">
      {/* 标题、统计、图例全部挪到左侧栏，画布顶部一点不占 */}
      <AppRail
        nav={nav}
        info={
          <FactInfo
            spec={spec}
            chips={chips}
            showGrid={showGrid}
            onToggleGrid={onToggleGrid}
          />
        }
      />

      <div className="antu-fact-body">
        <main
          className={`antu-fact-canvas${showGrid ? ' show-grid' : ''}`}
          ref={canvasRef}
        >
          <PreviewContext.Provider value={preview}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              ariaLabelConfig={ARIA_LABEL_CONFIG}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesFocusable={false}
              // 触摸板与鼠标都要顺手，按“滚动＝平移、加修饰键＝缩放”的通用约定：
              //   两指滑动 / 滚轮         → 平移（panOnScroll）
              //   捏合 / Ctrl(Cmd)+滚轮   → 缩放（zoomOnPinch，与滚轮是两条独立通路）
              //   按住拖动                → 平移
              panOnScroll
              panOnScrollMode="free"
              panOnScrollSpeed={1}
              zoomOnScroll={false}
              zoomOnPinch
              panOnDrag
              translateExtent={translateExtent}
              onNodeMouseEnter={(_, n) => {
                if (n.type === 'card') setHoveredId(n.id)
              }}
              onNodeMouseLeave={(_, n) => {
                setHoveredId((cur) => (cur === n.id ? null : cur))
              }}
              onNodeClick={(_, n) => {
                if (n.type === 'card') setPinnedId(n.id)
              }}
              onPaneClick={() => setPinnedId(null)}
              fitView
              fitViewOptions={{ padding: FIT_PADDING }}
              minZoom={minZoom}
              maxZoom={maxZoom}
            >
              <Background gap={20} color="#e9edf2" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor="#cbd5e1" />
            </ReactFlow>
          </PreviewContext.Provider>
        </main>
      </div>
    </div>
  )
}
