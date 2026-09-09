// ============================================================
//  src/renderers/fact/EventNode.jsx —— 事件节点
//
//  显示：时间（左侧，若近似加"约"）、标题、主体标签、来源标记。
// ============================================================

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

// 把 ISO 8601 时间转成便于阅读的显示文本
export function formatDate(date, dateEnd, approx) {
  const [d, t] = String(date).split('T')
  const prefix = approx ? '约 ' : ''
  if (!t) return prefix + d
  const parts = t.split(':')
  const hhmm = parts.slice(0, 2).join(':')
  return `${prefix}${d} ${hhmm}${parts[2] ? ':' + parts[2] : ''}`
}

const EventNode = memo(function EventNode({ data }) {
  const { event, actorNames, sourceCount } = data
  const hasActors = actorNames.length > 0

  return (
    <div className="antu-event-node">
      {/* 时间轴连接点：顶部入、底部出（视觉上隐藏，仅供边连接用） */}
      <Handle type="target" position={Position.Top} className="antu-handle" />
      <Handle type="source" position={Position.Bottom} className="antu-handle" />

      <div className="antu-event-time">
        {formatDate(event.date, event.dateEnd, event.approx)}
        {event.dateEnd && <span className="antu-event-duration"> → {formatDate(event.dateEnd)}</span>}
      </div>

      <div className="antu-event-body">
        <div className="antu-event-label">{event.label}</div>

        {hasActors && (
          <div className="antu-event-actors">
            {actorNames.map((n) => (
              <span key={n} className="antu-actor-tag">{n}</span>
            ))}
          </div>
        )}

        {event.detail && <div className="antu-event-detail">{event.detail}</div>}

        <div className="antu-event-meta">
          {event.approx && <span className="antu-badge-approx" title={event.dateNote || ''}>约</span>}
          {sourceCount > 0 && (
            <span className="antu-badge-source" title="来源数量">📎 {sourceCount}</span>
          )}
        </div>
      </div>
    </div>
  )
})

export default EventNode
