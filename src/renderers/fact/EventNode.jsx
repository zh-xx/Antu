// ============================================================
//  src/renderers/fact/EventNode.jsx —— 事件卡片
//
//  固定尺寸（320 × 112），卡片上只放时间、标题、主体标签、来源数。
//  卡片到轴点的引线不在这里，由 LinkLayerNode 统一画在卡片下层。
//
//  详情就在卡片旁边，分两级：
//    悬停 → 浮层露出 detail 摘要（3 行，鼠标移开就收）
//    点击 → 同一个浮层钉住，展开全文与全部依据，可滚动
//  浮层是覆盖式的，不改变画布尺寸，所以卡片永远不会跑位。
// ============================================================

import { memo, useContext } from 'react'
import { PreviewContext } from './previewContext.js'
import { SOURCE_TYPE_LABELS, SOURCE_WORD, labelOf } from '../../core/labels.js'

/** 把 ISO 8601 时间转成便于阅读的显示文本 */
export function formatDate(date, approx) {
  const [d, t] = String(date).split('T')
  const prefix = approx ? '约 ' : ''
  if (!t) return prefix + d
  const parts = t.split(':')
  const hhmm = parts.slice(0, 2).join(':')
  return `${prefix}${d} ${hhmm}${parts[2] ? ':' + parts[2] : ''}`
}

const EventNode = memo(function EventNode({ data }) {
  const { event, actorNames, sources, groupIndex, row, cardW, cardH, labelLines, fields = {} } = data
  const { hoveredId, pinnedId, unpin } = useContext(PreviewContext)

  const isPinned = pinnedId === event.id
  // 已经钉住一张时，别的卡不再冒预览，免得两层浮层打架
  const showPreview = !pinnedId && hoveredId === event.id
  const open = isPinned || showPreview

  return (
    <div className={`antu-card g${groupIndex}`} style={{ width: cardW, height: cardH }}>
      {/* 卡片内容按开关决定。标题与时间不给关：
          没标题认不出是什么事，没时间在轴上就没有锚点。
          标题的截断行数跟着卡片实际留的行数走，不多留也不截早。 */}
      <div
        className="antu-card-label"
        style={{ WebkitLineClamp: labelLines, lineClamp: labelLines }}
      >
        {event.label}
      </div>

      {fields.summary && event.summary && (
        <div className="antu-card-snippet">{event.summary}</div>
      )}

      {fields.actors && actorNames.length > 0 && (
        <div className="antu-card-actors">
          {actorNames.map((n) => (
            <span key={n} className="antu-actor-tag">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="antu-card-foot">
        <span className="antu-card-time" title={event.dateNote || ''}>
          {formatDate(event.date, event.approx)}
        </span>
        {fields.sources && (
          <span className={`antu-card-src${sources.length ? '' : ' is-none'}`}>
            <i className="antu-src-dot" />
            {sources.length ? `${SOURCE_WORD} ${sources.length}` : `未列${SOURCE_WORD}`}
          </span>
        )}
      </div>

      {open && (
        <div
          className={[
            'antu-preview',
            // nowheel / nopan 是 React Flow 约定的类名：
            // 画布开着 panOnScroll，不加这两个类，滚轮会被画布拿去做平移，
            // 浮层里的长文就永远滚不动。
            'nowheel',
            'nopan',
            row === 0 ? 'below' : 'above', // 第一行上方没地方，改往下冒
            isPinned ? 'pinned' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isPinned && (
            <button
              className="antu-preview-close"
              title="关闭"
              onClick={(e) => {
                e.stopPropagation()
                unpin()
              }}
            >
              ×
            </button>
          )}

          {isPinned && (
            <>
              <div className="antu-preview-time">{formatDate(event.date, event.approx)}</div>
              <div className="antu-preview-title">{event.label}</div>
              {actorNames.length > 0 && (
                <div className="antu-preview-actors">
                  {actorNames.map((n) => (
                    <span key={n} className="antu-actor-tag">
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {event.detail && <div className="antu-preview-text">{event.detail}</div>}

          {isPinned && event.dateNote && (
            <div className="antu-preview-note">时间说明：{event.dateNote}</div>
          )}

          {isPinned && sources.length > 0 && (
            <>
              <div className="antu-preview-sub">
                {SOURCE_WORD}（{sources.length}）
              </div>
              {sources.map((s) => (
                <div key={s.id} className="antu-source">
                  <div className="antu-source-name">
                    {s.name}
                    <span className="antu-source-type">{labelOf(SOURCE_TYPE_LABELS, s.type)}</span>
                  </div>
                  {s.quote && <div className="antu-source-quote">{s.quote}</div>}
                </div>
              ))}
            </>
          )}

          {showPreview && <div className="antu-preview-hint">点击卡片查看全文</div>}
        </div>
      )}
    </div>
  )
})

export default EventNode
