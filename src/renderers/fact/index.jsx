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
import { viewsOf } from '../../core/factGrid.js'
import { CARD_PAD_X, CARD_PAD_Y, LABEL_FONT, SNIPPET_FONT } from '../../core/cardGeometry.js'
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

export default function FactRenderer({
  spec,
  nav,
  showGrid = false,
  onToggleGrid,
  fields = {},
  onToggleField,
  viewIndex = 0,
  onSelectView,
  orientation = 'vertical',
  onToggleOrientation,
}) {
  // 视角和字段开关一样，都是排布的输入：视角决定分侧与有哪些列，
  // 字段决定卡片放几行。两者一变，整张图重排、视口重新适配。
  const views = useMemo(() => viewsOf(spec), [spec])
  // 先把每个视角都试排一遍，标出哪些摆不下（比如不分侧时同一时间点有多条事件）。
  // 摆不下的视角在切换器里禁用，而不是点进去才发现少了事件。
  const viewInfos = useMemo(
    () =>
      views.map((v) => {
        const g = buildFactGraph(spec, fields, v, orientation)
        return { view: v, reason: g.errors.length > 0 ? g.errors[0] : '' }
      }),
    [spec, fields, views, orientation],
  )
  const active = viewInfos[Math.min(Math.max(viewIndex, 0), viewInfos.length - 1)] || viewInfos[0]
  const view = active.view
  const graph = useMemo(
    () => buildFactGraph(spec, fields, view, orientation),
    [spec, fields, view, orientation],
  )

  // 浮层状态：hoveredId 是鼠标划过的卡，pinnedId 是点住不放的卡
  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)

  // 节点必须放在可写状态里：React Flow 会把量出来的尺寸通过 onNodesChange
  // 回写到节点上，MiniMap 等依赖尺寸的功能都靠这份回写。
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    // 整份替换会把 React Flow 的运行时状态抹掉，其中 selected 必须留下：
    // 它对选中节点有加权（z-index 1000），抹掉之后钉住的浮层会被邻卡盖住。
    // measured 故意不保留：卡片高度可能变了，要让它重新量。
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return graph.nodes.map((n) => {
        const old = prevById.get(n.id)
        return old?.selected ? { ...n, selected: true } : n
      })
    })
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  // 字段开关会改变卡片高度、进而改变整张图的高度。
  // 图变了就得重新适配一次视口，否则底部会被切在屏幕外。
  // fitView 只初始化时跑一次，这里补上后续的；后续的走动画，
  // 让画面滑过去而不是闪一下（初次打开不做动画，否则一进页面就自己动）。
  const rfRef = useRef(null)
  const firstFitRef = useRef(true)
  useEffect(() => {
    // 等一帧，让 React Flow 先把新尺寸量出来
    const id = requestAnimationFrame(() => {
      rfRef.current?.fitView({
        padding: FIT_PADDING,
        duration: firstFitRef.current ? 0 : 300,
      })
      firstFitRef.current = false
    })
    return () => cancelAnimationFrame(id)
  }, [graph])

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

  // 缩放下限＝刚好装下整张图的倍数：不允许缩到比全览更小，
  // 否则会缩成窗口中间一小块，四周全是空白。
  // 但图很小时全览倍数会超过 1，那时上限就没了空间，所以这里封顶到 1。
  const minZoom = useMemo(() => {
    const { width, height } = canvasSize
    if (!width || !height) return 0.1
    const zx = width / (graph.size.width * (1 + FIT_PADDING))
    const zy = height / (graph.size.height * (1 + FIT_PADDING))
    return Math.max(Math.min(zx, zy, 1), 0.05)
  }, [canvasSize, graph])

  // 放大上限 3 倍。原先定 1:1，理由是「再放大只是把同样的像素摊大」——
  // 这话对信息量没错，对可读性却是错的：字段全开时字号在屏幕上只有 8px，
  // 不放大根本读不了。上限只用来防止放大到荒唐的程度。
  const maxZoom = 3

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
            fields={fields}
            onToggleField={onToggleField}
            sideLabels={graph.sideLabels}
            orientation={orientation}
            onToggleOrientation={onToggleOrientation}
            viewInfos={viewInfos}
            view={view}
            onSelectView={onSelectView}
          />
        }
      />

      <div className="antu-fact-body">
        <main
          className={`antu-fact-canvas${showGrid ? ' show-grid' : ''}`}
          ref={canvasRef}
          // 卡片内边距与摘要字号由 core/cardGeometry.js 统一给出，样式层通过
          // CSS 变量取用。否则「卡片宽度/字号」和「摘要字数上限」会各写一份，
          // 改了一处另一处就悄悄失准。
          style={{
            '--antu-card-pad-x': `${CARD_PAD_X}px`,
            '--antu-card-pad-y': `${CARD_PAD_Y}px`,
            '--antu-label-font': `${LABEL_FONT}px`,
            '--antu-snippet-font': `${SNIPPET_FONT}px`,
          }}
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
              onInit={(inst) => {
                rfRef.current = inst
              }}
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
              {/* 背景点阵用的也是色板里的分隔线色，别引新灰 */}
              <Background gap={20} color="#e8ebef" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor="#cbd5e1" />
            </ReactFlow>
          </PreviewContext.Provider>
        </main>
      </div>
    </div>
  )
}
