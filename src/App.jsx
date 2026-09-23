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
import { readPrefs, writePrefs } from './shell/prefs.js'
import ErrorBoundary from './shell/ErrorBoundary.jsx'

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

  // 按图记的偏好用**标题**当键：它写在数据里，开发和成品都有，
  // 而且不依赖文件名（成品根本没有文件名）。
  const specKey = spec?.title || ''

  // 子类是渲染层的选择，不在数据里：从注册表按大类查出有哪些画法。
  // 手动选过的按图记着，没选过就用第一个（默认画法）。
  const kinds = useMemo(() => (spec ? listKinds(spec.type) : []), [spec])
  const [kindPrefs, setKindPrefs] = useState(() => readPrefs().kinds || {})
  const kind = kinds.find((k) => k.kind === kindPrefs[specKey])?.kind ?? kinds[0]?.kind ?? null
  const selectKind = (next) => {
    const map = { ...kindPrefs, [specKey]: next }
    setKindPrefs(map)
    writePrefs({ kinds: map })
  }
  const Renderer = spec ? getRenderer(spec.type, kind) : null
  const ready = errors.length === 0 && Renderer

  return (
    <div className="antu-app">
      {/* 标签卡常显，不给开关。原先它同时控制"屏幕上显不显示"和"导出带不带"，
          现在导出一律不带题头（rendering §10.2 改过），开关就没有意义了。 */}
      <DiagramHeader
        title={spec?.title || '案图'}
        typeLabel={spec ? labelOf(GRAPH_TYPE_LABELS, spec.type) : ''}
        info={diagramInfo(spec)}
        kinds={kinds}
        kind={kind}
        onSelectKind={selectKind}
      />

      {ready ? (
        <ErrorBoundary>
          <Renderer spec={spec} />
        </ErrorBoundary>
      ) : (
        <FallbackInfo errors={errors} spec={spec} hasRenderer={!!Renderer} />
      )}
    </div>
  )
}
