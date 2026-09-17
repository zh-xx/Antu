// ============================================================
//  src/App.jsx —— 应用外壳
//
//  职责最小化：
//   1. 加载一份规范 JSON
//   2. 过校验门卫
//   3. 按 type 从注册表取渲染器并渲染
//  核心不认识“事实图/关系图”的业务语义，只认 type。
//
//  布局：左边一条信息栏（AppRail），右边整块交给渲染器。
//  渲染器不可用时（加载中／校验没过／类型没实现），信息栏由 App 自己
//  撑起来，这样示例切换永远可用，不会因为一个坏文件就把人困住。
// ============================================================

import { useEffect, useState } from 'react'
import { validateSpec } from './core/validate.js'
import { getRenderer, listTypes } from './core/registry.js'
import { GRAPH_TYPE_LABELS, labelOf } from './core/labels.js'
import AppRail from './shell/AppRail.jsx'

// 可切换的示例（v0 硬编码；将来由用户导入 JSON）
// 前两份是真实案例，后三份是示意数据，用来覆盖三形态的各种排布
const EXAMPLES = [
  { label: '单主体 · 人脸识别案', path: '/examples/fact-人脸识别第一案-单主体.json' },
  { label: '双主体 · 电梯劝烟案', path: '/examples/fact-电梯劝烟案.json' },
  { label: '多主体 · 一侧两列', path: '/examples/fact-示例-同侧双主体.json' },
  { label: '多主体 · 两侧各两列', path: '/examples/fact-示例-两侧各两个主体.json' },
  { label: '无分组 · 单轴时间线', path: '/examples/fact-示例-无分组.json' },
  { label: '四方 · 四个时间点', path: '/examples/fact-示例-四方四个时间点.json' },
  { label: '两方 · 三个时间点', path: '/examples/fact-示例-三个时间点.json' },
]

/**
 * 卡片可选字段的默认值。
 * 标题与时间不在此列，它们固定在卡上。
 */
const FIELD_DEFAULTS = { sources: false, actors: false, summary: true }

/**
 * 本地偏好的读写。关键点：**只在用户真的动过开关时才写入**。
 * 如果一进来就把默认值整份写进去，那份记录就会压过默认值，
 * 以后改默认值（比如把摘要改成默认显示）谁都不会生效。
 */
function readPref(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writePref(key, patch) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...readPref(key), ...patch }))
  } catch {
    /* 隐私模式下写不进去，忽略即可 */
  }
}

/** 渲染器不可用时的兜底说明 */
function FallbackInfo({ loading, errors, spec, hasRenderer }) {
  if (loading) return <div className="antu-info-msg">加载中…</div>

  if (errors.length > 0) {
    return (
      <div className="antu-error">
        <div className="antu-error-title">规范校验未通过（{errors.length} 处问题）</div>
        <ul>
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    )
  }

  if (spec && !hasRenderer) {
    return (
      <div className="antu-error">
        <div className="antu-error-title">没有为 type = "{spec.type}" 注册渲染器</div>
        <div className="antu-error-hint">
          已注册：{listTypes().map((t) => labelOf(GRAPH_TYPE_LABELS, t)).join(' / ') || '（无）'}
        </div>
      </div>
    )
  }

  return null
}

export default function App() {
  const [spec, setSpec] = useState(null)
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(false)
  // 显示格线：全局偏好，不能放在渲染器里（切换示例时渲染器会带着 key
  // 重挂载，放里面会被重置）。用户动过才记到本地。
  const [showGrid, setShowGrid] = useState(() => readPref('antu.prefs').showGrid === true)

  const toggleGrid = (value) => {
    setShowGrid(value)
    writePref('antu.prefs', { showGrid: value })
  }

  // 卡片上显示哪些可选字段。同样只记用户动过的那几个，
  // 没动过的继续跟随 FIELD_DEFAULTS。
  const [fields, setFields] = useState(() => ({
    ...FIELD_DEFAULTS,
    ...readPref('antu.prefs').fields,
  }))

  const toggleField = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }))
    writePref('antu.prefs', { fields: { ...readPref('antu.prefs').fields, [key]: value } })
  }


  // 视角下标。换图时回到第一个：不同数据的视角清单不一样，留着旧下标没有意义。
  // 不持久化，因为下标只在当前这份数据里有含义。
  const [viewIndex, setViewIndex] = useState(0)
  useEffect(() => {
    setViewIndex(0)
  }, [spec])

  // 支持 ?example=1 直接打开某个示例（便于分享与测试）
  const [current, setCurrent] = useState(() => {
    const idx = Number(new URLSearchParams(window.location.search).get('example'))
    return EXAMPLES[idx] || EXAMPLES[0]
  })

  // 时间轴方向。**按图记**，不跟着切换示例走：
  //   手动设过的  → 用记下来的
  //   没设过的    → 按槽数算默认：槽 ≥ 5 竖向，槽 ≤ 4 横向
  // 为什么按槽数：横向一格宽 316，一屏减掉标题列只排得下约 3.8 个槽；
  // 槽到 5 个，横向就明显挤了，竖向开始赢。
  const [orientationPrefs, setOrientationPrefs] = useState(
    () => readPref('antu.prefs').orientations || {},
  )
  const slotCount = Array.isArray(spec?.slots) ? spec.slots.length : 0
  const orientation = orientationPrefs[current.path] || (slotCount >= 5 ? 'vertical' : 'horizontal')
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [current.path]: next }
    setOrientationPrefs(map)
    writePref('antu.prefs', { orientations: map })
  }

  // 加载 + 校验
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErrors([])

    fetch(encodeURI(current.path))
      .then((r) => {
        if (!r.ok) throw new Error(`加载失败：HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const errs = validateSpec(data)
        setErrors(errs)
        setSpec(errs.length ? null : data)
      })
      .catch((e) => {
        if (!cancelled) setErrors([String(e.message || e)])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [current])

  const Renderer = spec ? getRenderer(spec.type) : null
  const ready = !loading && errors.length === 0 && Renderer

  // 示例切换与应用级信息，交给信息栏的 nav 插槽
  const nav = (
    <nav className="antu-rail-nav">
      <div className="antu-rail-label">示例</div>
      {EXAMPLES.map((ex) => (
        <button
          key={ex.path}
          className={`antu-nav-btn${ex.path === current.path ? ' active' : ''}`}
          onClick={() => setCurrent(ex)}
        >
          {ex.label}
        </button>
      ))}
      <div className="antu-rail-note">
        图形类型：{listTypes().map((t) => labelOf(GRAPH_TYPE_LABELS, t)).join(' / ') || '（无）'}
      </div>
    </nav>
  )

  return (
    <div className="antu-app">
      {ready ? (
        <Renderer
          key={current.path}
          spec={spec}
          nav={nav}
          showGrid={showGrid}
          onToggleGrid={toggleGrid}
          fields={fields}
          onToggleField={toggleField}
          viewIndex={viewIndex}
          onSelectView={setViewIndex}
          orientation={orientation}
          onToggleOrientation={toggleOrientation}
        />
      ) : (
        <AppRail
          nav={nav}
          info={
            <FallbackInfo
              loading={loading}
              errors={errors}
              spec={spec}
              hasRenderer={!!Renderer}
            />
          }
        />
      )}
    </div>
  )
}
