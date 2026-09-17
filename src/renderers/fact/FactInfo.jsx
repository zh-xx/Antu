// ============================================================
//  src/renderers/fact/FactInfo.jsx —— fact 图的信息块
//
//  放进左侧信息栏的那一段：标题、统计、图例，以及显示开关。
//  （标题、统计、图例以前压在画布顶部的一条横栏里，占掉 15% 的窗口高度。）
//
//  卡片内容可自选：依据／主体／详情摘要，三个开关，默认全关。
//  标题与时间不给关——没标题认不出是什么事，没时间在轴上没锚点。
//  开关一变，卡片高度重算、整张图重排、缩放重算（见 timelineLayout.js）。
// ============================================================

import { SIDE_LABELS, SOURCE_WORD, labelOf } from '../../core/labels.js'

/** 可选的卡片字段（标题与时间不在此列，它们固定显示） */
const OPTIONAL_FIELDS = [
  { key: 'sources', label: SOURCE_WORD },
  { key: 'actors', label: '主体' },
  { key: 'summary', label: '摘要' },
]

export default function FactInfo({
  spec,
  chips,
  showGrid,
  onToggleGrid,
  fields = {},
  onToggleField,
  sideLabels = {},
  orientation = 'vertical',
  onToggleOrientation,
  viewInfos = [],
  view,
  onSelectView,
}) {
  const legendItems = [
    { side: 'side1', cls: 'g0', label: sideLabels.side1 },
    { side: 'side2', cls: 'g1', label: sideLabels.side2 },
    { side: 'axis', cls: 'g2', label: sideLabels.axis },
  ].filter((it) => it.label)

  return (
    <div className="antu-info">
      <div className="antu-rail-label">本图</div>
      <h1 className="antu-info-title">{spec.title}</h1>

      <div className="antu-info-chips">
        {chips.map((c) => (
          <span key={c} className="antu-chip">
            {c}
          </span>
        ))}
      </div>

      {/* 图例跟着当前视角走，不是固定显示数据里的分组：
          换了视角，侧名就变了，图例还显示旧名字会自相矛盾 */}
      {legendItems.length > 0 && (
        <>
          <div className="antu-rail-label">图例</div>
          <div className="antu-info-legend">
            {legendItems.map((it) => (
              <span key={it.side} className="antu-legend-item">
                <i className={`antu-legend-dot ${it.cls}`} />
                <span>
                  {labelOf(SIDE_LABELS, it.side)}
                  {' · '}
                  {it.label}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {/* 视角：同一个案件换一种看法。多于一个才显示。
          摆不下的视角禁用，并说明原因，免得点进去才发现少了事件。 */}
      {viewInfos.length > 1 && (
        <>
          <div className="antu-rail-label">视角</div>
          <div className="antu-view-list">
            {viewInfos.map((info, i) => (
              <button
                key={`${info.view.label}-${i}`}
                className={`antu-view-btn${info.view === view ? ' active' : ''}`}
                disabled={!!info.reason}
                title={info.reason || ''}
                onClick={() => onSelectView(i)}
              >
                {info.view.label}
                {info.reason ? '（摆不下）' : ''}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="antu-rail-label">卡片内容</div>
      {OPTIONAL_FIELDS.map((f) => (
        <label key={f.key} className="antu-switch">
          <input
            type="checkbox"
            checked={!!fields[f.key]}
            onChange={(e) => onToggleField(f.key, e.target.checked)}
          />
          <span>{f.label}</span>
        </label>
      ))}
      <div className="antu-rail-note">标题与时间固定在卡上，不能关。</div>

      <div className="antu-rail-label">方向</div>
      <div className="antu-view-list is-row">
        {[
          ['vertical', '竖向'],
          ['horizontal', '横向'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`antu-view-btn${orientation === value ? ' active' : ''}`}
            onClick={() => onToggleOrientation(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="antu-rail-label">画布</div>
      <label className="antu-switch">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(e) => onToggleGrid(e.target.checked)}
        />
        <span>底层格线</span>
      </label>
    </div>
  )
}
