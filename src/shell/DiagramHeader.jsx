// ============================================================
//  src/shell/DiagramHeader.jsx —— 画布左上角的那一块
//
//  最终产物是一份**自包含的 HTML**：一个 fact 生成一份 JSON，
//  一份 JSON 生成一个 HTML。这个 HTML 打开就是一张图，没有"别的图"可换，
//  所以这里不放任何文件/案子切换。
//
//  页面上唯一要能操作的是**渲染类型（小类）**：
//  同一份 JSON 属于一个大类（fact），可以用该大类的任一小类来画，
//  比如时间图、泳道图。切换它不用重新加载数据。
//
//  三行：
//    图的标题（JSON 的 title）
//    大类 + 渲染类型切换器
//    规模与时间跨度
// ============================================================

import { useEffect, useRef, useState } from 'react'

export default function DiagramHeader({ title, typeLabel, info = [], kinds = [], kind, onSelectKind }) {
  // 只有一种渲染类型时不做成按钮：点开只有一个选项的菜单是白费一步
  const multi = kinds.length > 1
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // 点外面关掉。用捕获阶段，免得被画布的 pointerdown 吃掉。
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const kindLabel = kinds.find((k) => k.kind === kind)?.label

  return (
    <div className="antu-header" ref={rootRef}>
      <div className="antu-header-card">
        <h1 className="antu-header-title">{title}</h1>

        <div className="antu-header-row">
          <span className="antu-header-type">{typeLabel}</span>
          {multi ? (
            <button
              className={`antu-header-kind is-btn${open ? ' is-open' : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              {kindLabel}
              <span className="antu-header-caret" />
            </button>
          ) : (
            kindLabel && <span className="antu-header-kind">{kindLabel}</span>
          )}
        </div>

        {info.length > 0 && <p className="antu-header-info">{info.join(' · ')}</p>}
      </div>

      {open && (
        <div className="antu-header-menu">
          {kinds.map((k) => (
            <button
              key={k.kind}
              className={`antu-header-opt${k.kind === kind ? ' is-on' : ''}`}
              onClick={() => {
                setOpen(false)
                onSelectKind(k.kind)
              }}
            >
              <span className="antu-header-tick">{k.kind === kind ? '✓' : ''}</span>
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
