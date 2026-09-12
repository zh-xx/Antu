// ============================================================
//  src/renderers/fact/FactInfo.jsx —— fact 图的信息块
//
//  放进左侧信息栏的那一段：标题、统计、图例，以及显示开关。
//  （标题、统计、图例以前压在画布顶部的一条横栏里，占掉 15% 的窗口高度。）
// ============================================================

import { SIDE_LABELS, labelOf } from '../../core/labels.js'

const SIDE_ORDER = ['side1', 'side2', 'axis']

export default function FactInfo({ spec, chips, showGrid, onToggleGrid }) {
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

      <div className="antu-rail-label">显示</div>
      <label className="antu-switch">
        <input
          type="checkbox"
          checked={showGrid}
          onChange={(e) => onToggleGrid(e.target.checked)}
        />
        <span>底层格线（矩形）</span>
      </label>
    </div>
  )
}
