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

/** 把 ISO 8601 时间转成便于阅读的显示文本。只在本文件内用，不外导。 */
function formatDate(date, approx) {
  const [d, t] = String(date).split('T')
  const prefix = approx ? '约 ' : ''
  if (!t) return prefix + d
  const parts = t.split(':')
  const hhmm = parts.slice(0, 2).join(':')
  return `${prefix}${d} ${hhmm}${parts[2] ? ':' + parts[2] : ''}`
}

/** 结束时刻的显示文本：同一天就只写时刻，跨天才写完整日期 */
function formatEnd(start, end) {
  const full = formatDate(end)
  const sameDay = String(start).split('T')[0] === String(end).split('T')[0]
  return sameDay && String(end).includes('T') ? full.split(' ').pop() : full
}

/**
 * 卡片上那一行时间。
 * 有 dateEnd（持续事件）就写成「起 - 止」，这样它和瞬时事件一眼分得开。
 * 注意这只在文字上表达时段，不在轴上画长度：槽是等距的而真实时间不是，
 * 按真实时长画长度会骗人（电梯案里 4 秒和 264 秒占的图上距离一样）。
 */
function formatTimeText(event) {
  const start = formatDate(event.date, event.approx)
  if (!event.dateEnd) return start
  return `${start} - ${formatEnd(event.date, event.dateEnd)}`
}

/** 时长的人类可读写法，给浮层用（卡片那行放不下） */
function formatDuration(start, end) {
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return ''
  let s = Math.round((b - a) / 1000)
  const d = Math.floor(s / 86400)
  s -= d * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const parts = []
  if (d) parts.push(`${d} 天`)
  if (h) parts.push(`${h} 小时`)
  if (m) parts.push(`${m} 分`)
  if (s || !parts.length) parts.push(`${s} 秒`)
  return parts.join(' ')
}

const EventNode = memo(function EventNode({ data }) {
  const { event, actorNames, sources, groupIndex, row, cardW, cardH, labelLines, fields = {}, isH } = data
  const { hoveredId, pinnedId, pin, unpin } = useContext(PreviewContext)

  const isPinned = pinnedId === event.id
  // 已经钉住一张时，别的卡不再冒预览，免得两层浮层打架
  const showPreview = !pinnedId && hoveredId === event.id
  const open = isPinned || showPreview
  // 时长算不出（dateEnd 早于 date 等）时留空，免得浮层出现「持续 」后面什么都没有
  const duration = event.dateEnd ? formatDuration(event.date, event.dateEnd) : ''

  return (
    <div
      className={`antu-card g${groupIndex}`}
      style={{ width: cardW, height: cardH }}
      // 键盘可达：Tab 能聚焦，回车/空格钉住，Esc 关掉。
      // 鼠标那条路仍走 React Flow 的 onNodeClick，两边都能用。
      role="button"
      tabIndex={0}
      aria-label={`${event.label}${event.date ? '，' + event.date : ''}`}
      aria-expanded={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (isPinned) unpin()
          else pin(event.id)
        } else if (e.key === 'Escape') {
          unpin()
        }
      }}
    >
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
          {formatTimeText(event)}
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
            // 第一个时间点没地方往时间轴的负方向冒（竖向是上方、横向是左侧），
            // 所以它反过来冒；其余都朝负方向冒，免得盖住后面的事件
            isH ? (row === 0 ? 'right' : 'left') : row === 0 ? 'below' : 'above',
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
              <div className="antu-preview-time">{formatTimeText(event)}</div>
              {isPinned && duration && (
                <div className="antu-preview-duration">持续 {duration}</div>
              )}
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

          {/* 悬停时就给一行来源。依据是这张图的立身之本，
              不该藏到「点开」之后：最轻的动作也要能看到个大概。 */}
          {!isPinned && (
            <div className={`antu-preview-src${sources.length ? '' : ' is-none'}`}>
              {sources.length
                ? `${SOURCE_WORD} ${sources.length} 项：${sources.map((s) => s.name).join(' · ')}`
                : `未列${SOURCE_WORD}`}
            </div>
          )}

          {showPreview && <div className="antu-preview-hint">点击卡片查看全文</div>}
        </div>
      )}
    </div>
  )
})

export default EventNode
