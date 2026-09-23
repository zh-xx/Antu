// ============================================================
//  src/renderers/fact/ControlDock.jsx —— 画布底部的控制胶囊
//
//  显示类控制集中在这里，浮在画布正下方居中。
//  视角不在这里：它最常用，留在左栏一级，点一次就能切。
//
//  六个控制，按苹果的规矩各用各的形态：
//    视角      选项名长、最多五个，摆不下 → 一个按钮显示当前值，点开带勾号的列表
//    卡片内容  三个独立开关，少 → 全部摆出来，点一下切（开着的高亮）
//    方向      两个互斥 → 分段控件，两个都摆出来、选中的凸起
//    格线      一个开关 → 点一下切
//    题头      一个开关 → 点一下切。它同时决定导出带不带题头（rendering §10.2）
//    导出图片  唯一一个**动作**，不是开关 → 用分隔符隔开，点了就下文件
//  一句话：选项少且独立就摆出来，选项名长就收进菜单。
//  画法（子类）不在这里：它是"这份数据用哪种画法看"，属于页面最上层的问题，
//  放在左上角的标签卡里。
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { SOURCE_WORD } from '../../core/labels.js'

/** 可选的卡片字段（标题与时间固定显示，不在此列） */
const OPTIONAL_FIELDS = [
  { key: 'sources', label: SOURCE_WORD },
  { key: 'actors', label: '主体' },
  { key: 'summary', label: '摘要' },
]

const ORIENTATIONS = [
  ['vertical', '竖向'],
  ['horizontal', '横向'],
]

export default function ControlDock({
  /** 可选的视角（摆不下的已经被上游滤掉，不会进来） */
  viewOptions = [],
  /** 数据里一共有几个视角，用来判断要不要显示这个菜单 */
  viewCount = 0,
  view,
  onSelectView,
  fields = {},
  onToggleField,
  orientation = 'vertical',
  onToggleOrientation,
  showGrid = false,
  onToggleGrid,
  showHeader = true,
  onToggleHeader,
  exporting = false,
  onExport,
}) {
  // 同时只开一个菜单：开新的自动关旧的
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // 点外面关掉。用捕获阶段，免得被画布自己的事件吃掉。
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  return (
    <div className="antu-dock" ref={rootRef}>
      {open && (
        <div className="antu-dock-pop">
          {viewOptions.map((info) => (
            <button
              key={info.view.label}
              className={`antu-dock-opt${info.view === view ? ' is-on' : ''}`}
              onClick={() => {
                setOpen(false)
                onSelectView(info.index)
              }}
            >
              <span className="antu-dock-tick">{info.view === view ? '✓' : ''}</span>
              {info.view.label}
            </button>
          ))}
        </div>
      )}

      <div className="antu-dock-bar">
        {/* 视角选项名长、最多五个，摆不下，所以收进菜单 */}
        {viewCount > 1 && (
          <>
            <button
              className={`antu-dock-chip${open ? ' is-open' : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              {view?.label}
              <span className="antu-dock-caret" />
            </button>
            <span className="antu-dock-sep" />
          </>
        )}
        {OPTIONAL_FIELDS.map((f) => (
          <button
            key={f.key}
            className={`antu-dock-chip${fields[f.key] ? ' is-on' : ''}`}
            onClick={() => onToggleField(f.key, !fields[f.key])}
          >
            {f.label}
          </button>
        ))}

        <span className="antu-dock-sep" />

        {/* 分段控件：只有两个选项，都摆出来比收进菜单少一次点击 */}
        <div className="antu-dock-seg">
          {ORIENTATIONS.map(([value, label]) => (
            <button
              key={value}
              className={`antu-dock-seg-item${orientation === value ? ' is-on' : ''}`}
              onClick={() => onToggleOrientation(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="antu-dock-sep" />

        <button
          className={`antu-dock-chip${showGrid ? ' is-on' : ''}`}
          onClick={() => onToggleGrid(!showGrid)}
        >
          格线
        </button>

        <button
          className={`antu-dock-chip${showHeader ? ' is-on' : ''}`}
          onClick={() => onToggleHeader(!showHeader)}
        >
          题头
        </button>

        {/* 分隔符隔开：前面全是"怎么看"的开关，这个是唯一的动作 */}
        <span className="antu-dock-sep" />

        <button
          className="antu-dock-action"
          onClick={onExport}
          disabled={exporting}
          title="把整张图导成 PNG（2 倍分辨率）"
        >
          {exporting ? '导出中…' : '导出图片'}
        </button>
      </div>
    </div>
  )
}
