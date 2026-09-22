// ============================================================
//  src/App.jsx —— 应用外壳
//
//  职责最小化：
//   1. 校验页面内联进来的那份规范
//   2. 按大类 × 子类从注册表取渲染器并渲染
//   3. 记住用户自己的阅读偏好
//  核心不认识"事实图/关系图"的业务语义，只认 type。
//
//  **数据从哪来：页面内联。** 成品是一份自包含的 HTML，一份 JSON 一个文件；
//  开发时由 vite.config.js 里的插件把同一份 JSON 注进 index.html。
//  两边走完全同一条路，所以这里没有 fetch、没有示例清单、没有回落分支。
//  演示数据住在开发配置里，成品里一个字节都不带。
//
//  布局：没有常驻侧栏，画布占满整个窗口，其余都是画布上的浮层。
//    左上角    标签卡（图的标题、大类、渲染类型切换）
//    底部中间  控制胶囊（由渲染器自己放）
//    左下右下  缩放、缩略图（React Flow 自带）
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { validateSpec } from './core/validate.js'
import { getRenderer, listKinds, listTypes } from './core/registry.js'
import { GRAPH_TYPE_LABELS, labelOf } from './core/labels.js'
import DiagramHeader from './shell/DiagramHeader.jsx'

/**
 * 卡片可选字段的默认值。
 * 标题与时间不在此列，它们固定在卡上。
 */
const FIELD_DEFAULTS = { sources: false, actors: false, summary: true }

/**
 * 外部预设：只有 MCP 的 antu_preview 会用到。
 * 它要能指定"用哪个方向、开哪些字段、看第几个视角"来截图，
 * 又不能污染用户自己的偏好，所以走一个一次性的全局，而不是写 localStorage。
 */
const PRESET = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null

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
function FallbackInfo({ errors, spec, hasRenderer }) {
  if (errors.length > 0) {
    return (
      <div className="antu-fallback">
        <div className="antu-error-title">这份数据不能用（{errors.length} 处问题）</div>
        <ul className="antu-error-list">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    )
  }

  if (spec && !hasRenderer) {
    return (
      <div className="antu-fallback">
        <div className="antu-error-title">没有为 type = "{spec.type}" 注册渲染器</div>
        <div className="antu-error-hint">
          已注册：{listTypes().map((t) => labelOf(GRAPH_TYPE_LABELS, t)).join(' / ') || '（无）'}
        </div>
      </div>
    )
  }

  return null
}

/** 标签卡第三行：规模与时间跨度（大类已经在上面的行里，不重复） */
function diagramInfo(spec) {
  if (!spec) return []
  const out = []

  const slots = Array.isArray(spec.slots) ? spec.slots : []
  const dates = slots
    .flatMap((s) => (s?.events || []).map((e) => e?.date))
    .filter((d) => typeof d === 'string' && d)
    .sort()

  let slotsLine = `${slots.length} 个时间点`
  if (dates.length > 0) {
    const first = dates[0].slice(0, 10)
    const last = dates[dates.length - 1].slice(0, 10)
    slotsLine += first === last ? ` · ${first}` : ` · ${first} 至 ${last}`
  }
  out.push(slotsLine)
  out.push(`${spec.actors?.length || 0} 个主体`)
  out.push(`${spec.sources?.length || 0} 个来源`)
  return out
}

export default function App() {
  const [spec, setSpec] = useState(null)
  const [errors, setErrors] = useState([])

  // 数据内联在页面里。取不到就是生成/注入那一环出了问题，明确说出来，
  // 不要拿"我去别处找找看"糊过去（成品里根本没有"别处"）。
  useEffect(() => {
    const inline = typeof window !== 'undefined' ? window.__ANTU_SPEC__ : undefined
    if (!inline) {
      setErrors([
        import.meta.env.DEV
          ? '开发服务器没拿到数据：用 ?example=0 或 ?spec=examples/某份.json 指定一份。'
          : '这份文件里没有内联数据，生成时出了问题。请重新生成这份 HTML。',
      ])
      return
    }
    const errs = validateSpec(inline)
    setErrors(errs)
    setSpec(errs.length ? null : inline)
  }, [])

  // 底层格线：全局偏好。用户动过才记到本地。
  const [showGrid, setShowGrid] = useState(() => readPref('antu.prefs').showGrid === true)
  const toggleGrid = (value) => {
    setShowGrid(value)
    writePref('antu.prefs', { showGrid: value })
  }

  // 卡片上显示哪些可选字段。同样只记用户动过的那几个。
  const [fields, setFields] = useState(() => ({
    ...FIELD_DEFAULTS,
    ...readPref('antu.prefs').fields,
    ...(PRESET?.fields || {}),
  }))
  const toggleField = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }))
    writePref('antu.prefs', { fields: { ...readPref('antu.prefs').fields, [key]: value } })
  }

  // 视角下标。一个页面只有一份数据，所以不需要"换图归零"。
  const [viewIndex, setViewIndex] = useState(PRESET?.viewIndex ?? 0)

  // 按图记的偏好用**标题**当键：它写在数据里，开发和成品都有，
  // 而且不依赖文件名（成品根本没有文件名）。
  const specKey = spec?.title || ''

  // 时间轴方向。手动设过的按图记住，没设过的按槽数算：
  // 槽 ≥ 5 竖向，槽 ≤ 4 横向。横向一格宽 316，一屏减掉标题列只排得下约 3.8 个槽。
  const [orientationPrefs, setOrientationPrefs] = useState(
    () => readPref('antu.prefs').orientations || {},
  )
  const slotCount = Array.isArray(spec?.slots) ? spec.slots.length : 0
  const orientation =
    PRESET?.orientation || orientationPrefs[specKey] || (slotCount >= 5 ? 'vertical' : 'horizontal')
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    writePref('antu.prefs', { orientations: map })
  }

  // 子类是渲染层的选择，不在数据里：从注册表按大类查出有哪些画法。
  // 手动选过的按图记着，没选过就用第一个（默认画法）。
  const kinds = useMemo(() => (spec ? listKinds(spec.type) : []), [spec])
  const [kindPrefs, setKindPrefs] = useState(() => readPref('antu.prefs').kinds || {})
  const kind = kinds.find((k) => k.kind === kindPrefs[specKey])?.kind ?? kinds[0]?.kind ?? null
  const selectKind = (next) => {
    const map = { ...kindPrefs, [specKey]: next }
    setKindPrefs(map)
    writePref('antu.prefs', { kinds: map })
  }
  const kindLabel = kinds.find((k) => k.kind === kind)?.label

  const Renderer = spec ? getRenderer(spec.type, kind) : null
  const ready = errors.length === 0 && Renderer

  return (
    <div className="antu-app">
      <DiagramHeader
        title={spec?.title || '案图'}
        typeLabel={spec ? labelOf(GRAPH_TYPE_LABELS, spec.type) : ''}
        info={diagramInfo(spec)}
        kinds={kinds}
        kind={kind}
        onSelectKind={selectKind}
      />

      {ready ? (
        <Renderer
          spec={spec}
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
        <FallbackInfo errors={errors} spec={spec} hasRenderer={!!Renderer} />
      )}
    </div>
  )
}
