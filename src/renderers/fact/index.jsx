// ============================================================
//  src/renderers/fact/index.jsx —— fact（事实图）渲染器
//
//  输入：通过校验的 fact 规范
//  输出：时间图
//
//  布局自动选择：
//   - 有 groups → 单主体横向时间轴，按 groups 分上下两侧
//   - 否则 → 单线纵向时间轴
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
import AxisNode from './AxisNode.jsx'
import { buildFactGraph } from './timelineLayout.js'

const nodeTypes = { event: EventNode, axis: AxisNode }

export default function FactRenderer({ spec }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFactGraph(spec),
    [spec],
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const approxCount = spec.events.filter((e) => e.approx).length
  const hasGroups = Array.isArray(spec.groups) && spec.groups.length > 0

  return (
    <div className="antu-fact">
      <header className="antu-fact-header">
        <div>
          <h1 className="antu-fact-title">{spec.title}</h1>
          <div className="antu-fact-meta">
            {spec.events.length} 个事件 · {spec.actors?.length || 0} 个主体 ·{' '}
            {spec.sources?.length || 0} 个来源
            {hasGroups && ` · 分组：${spec.groups.map((g) => g.label).join(' / ')}`}
            {approxCount > 0 && ` · ${approxCount} 个近似时间`}
          </div>
        </div>

        {/* 分组图例（顺序即上下位置） */}
        {hasGroups && (
          <div className="antu-legend">
            {spec.groups.map((g, i) => (
              <span key={g.id} className="antu-legend-item">
                <i className={`antu-legend-dot g${i}`} />
                {g.label}
              </span>
            ))}
          </div>
        )}

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
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.15}
        >
          <Background gap={20} color="#e2e8f0" />
          <Controls />
          <MiniMap pannable zoomable nodeColor="#93c5fd" />
        </ReactFlow>
      </main>
    </div>
  )
}
