// ============================================================
//  src/shell/Canvas.jsx —— 画布外壳
//
//  凡"与画什么图无关"的事都在这里，只写一次：
//    视口（React Flow 容器）、缩放上下限、平移边界、缩略图、
//    尺寸变化时重新适配、节点尺寸的回写。
//
//  渲染器只交出一个 graph 和它自己的浮层内容，**不碰 React Flow**。
//  这样加第二个画法时，这七十来行一个字都不用重写。
//
//  节点事件（悬停、点击、点空白）由渲染器传进来，因为"点了要做什么"
//  是画法自己的事；这里只负责把事件转出去。
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Panel, useNodesState, useEdgesState } from '@xyflow/react'

import { ARIA_LABEL_CONFIG } from '../core/labels.js'
import { FIT_PADDING, fitZoom } from '../core/canvas.js'

/** 放大上限。原先定 1:1，理由是"再放大只是把同样的像素摊大"：
 *  这话对信息量没错，对可读性却是错的，字段全开时字号在屏幕上只有 8px。
 *  上限只用来防止放大到荒唐的程度。 */
const MAX_ZOOM = 3

/** 平移范围在内容四周各留这么多，滑到边就停，不会滑进空白 */
const PAN_PAD = 160

export default function Canvas({
  graph,
  nodeTypes,
  showGrid = false,
  style,
  children,
  onNodeMouseEnter,
  onNodeMouseLeave,
  onNodeClick,
  onPaneClick,
}) {
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

  // 图变了就得重新适配一次视口，否则底部会被切在屏幕外。
  // fitView 只在初始化时跑一次，这里补上后续的；后续的走动画，
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

  const translateExtent = useMemo(
    () => [
      [-PAN_PAD, -PAN_PAD],
      [graph.size.width + PAN_PAD, graph.size.height + PAN_PAD],
    ],
    [graph],
  )

  // 量画布容器的实际尺寸，用来算"刚好装下整张图"的缩放倍数
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
  // 和 fitView 用同一个函数算，两个数不会走偏（见 core/canvas.js）。
  const minZoom = useMemo(() => {
    const { width, height } = canvasSize
    if (!width || !height) return 0.1
    return Math.max(fitZoom(graph.size, { width, height }), 0.05)
  }, [canvasSize, graph])

  return (
    <main
      className={`antu-canvas${showGrid ? ' show-grid' : ''}`}
      ref={canvasRef}
      style={style}
    >
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
        // 触摸板与鼠标都要顺手，按"滚动＝平移、加修饰键＝缩放"的通用约定：
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
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={minZoom}
        maxZoom={MAX_ZOOM}
      >
        {/* 背景点阵用的也是色板里的分隔线色，别引新灰 */}
        <Background gap={20} color="#e8ebef" />
        {/* 留白要和初始适配用同一个值，否则点一次按钮缩放会跳一下 */}
        <Controls showInteractive={false} fitViewOptions={{ padding: FIT_PADDING }} />
        {/* 显示类控制浮在画布下方居中：缩放控件在左下、小地图在右下，三个不打架 */}
        <Panel position="bottom-center">{children}</Panel>
        <MiniMap pannable zoomable nodeColor="#cbd5e1" />
      </ReactFlow>
    </main>
  )
}
