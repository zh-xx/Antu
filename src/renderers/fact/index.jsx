// ============================================================
//  src/renderers/fact/index.jsx —— fact（事实图）渲染器
//
//  输入：通过校验的 fact 规范
//  输出：时间轴线图
//
//  v0：单线时间轴（layout: "timeline"）
//  将来：bilateral（按 actors 分列）/ lanes（多泳道）
// ============================================================

import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import EventNode, { formatDate } from './EventNode.jsx'
import { buildTimeline } from './timelineLayout.js'

const nodeTypes = { event: EventNode }

export default function FactRenderer({ spec }) {
  const layout = spec.layout || 'timeline'

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildTimeline(spec),
    [spec],
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const approxCount = spec.events.filter((e) => e.approx).length

  return (
    <div className="antu-fact">
      <header className="antu-fact-header">
        <div>
          <h1 className="antu-fact-title">{spec.title}</h1>
          <div className="antu-fact-meta">
            {spec.events.length} 个事件 · {spec.actors?.length || 0} 个主体 ·{' '}
            {spec.sources?.length || 0} 个来源 · 布局 {layout}
            {approxCount > 0 && ` · ${approxCount} 个近似时间`}
          </div>
        </div>
        <div className="antu-fact-range">
          {formatDate(spec.events[0]?.date)} ～{' '}
          {formatDate(spec.events[spec.events.length - 1]?.date)}
        </div>
      </header>

      <main className="antu-fact-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
        >
          <Background gap={20} color="#e2e8f0" />
          <Controls />
          <MiniMap pannable zoomable nodeColor="#93c5fd" />
        </ReactFlow>
      </main>
    </div>
  )
}
