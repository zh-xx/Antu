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

const SIDE_ORDER = ['side1', 'side2', 'axis']

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
}) {
  const groups = Array.isArray(spec.groups) ? spec.groups : []

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

      {groups.length > 0 && (
        <>
          <div className="antu-rail-label">图例</div>
          <div className="antu-info-legend">
            {groups.map((g, i) => (
              <span key={g.id} className="antu-legend-item">
                <i className={`antu-legend-dot g${i}`} />
                <span>
                  {labelOf(SIDE_LABELS, SIDE_ORDER[i])}
                  {' · '}
                  {g.label}
                </span>
              </span>
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
