// ============================================================
//  src/App.jsx —— 应用外壳
//
//  职责最小化：
//   1. 加载一份规范 JSON
//   2. 过校验门卫
//   3. 按 type 从注册表取渲染器并渲染
//  核心不认识"事实图/关系图"的业务语义，只认 type。
//
//  布局：**没有常驻侧栏**，画布占满整个窗口，其余都是画布上的浮层。
//    左上角    案件切换器（案子 ▸ 图）
//    底部中间  显示控制胶囊（由渲染器自己放）
//    左下右下  缩放、缩略图（React Flow 自带）
//  为什么不要侧栏：侧栏里真正"图上没有的"只有案件导航和本图规模两样，
//  为它们常年占掉 268px 宽（窗宽的 17%）不划算；当事人就是列标题、
//  来源就在卡片浮层里，都是重复的。
//
//  渲染器不可用时（加载中／校验没过／类型没实现），左上角的切换器照常在，
//  换个图永远可用，不会因为一个坏文件就把人困住。
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { validateSpec } from './core/validate.js'
import { getRenderer, listKinds, listTypes } from './core/registry.js'
import { GRAPH_TYPE_LABELS, labelOf } from './core/labels.js'
import DiagramHeader from './shell/DiagramHeader.jsx'

/**
 * 演示数据：开发时用哪份 JSON。
 *
 * 真实产物是**一份 JSON 一个 HTML**，页面里没有"换图"，所以这份清单
 * 只服务于开发和演示：换一份用 URL 参数 `?example=N`，界面上不留入口。
 * （生成自包含 HTML 时，走的是"把这份 JSON 内联进去"，与这份清单无关。）
 */
const CASES = [
  {
    name: '郭兵诉杭州野生动物世界 · 人脸识别第一案',
    diagrams: [
      {
        label: '年卡入园方式变更经过',
        path: '/examples/fact-人脸识别第一案-单主体.json',
      },
    ],
  },
  {
    name: '田九菊诉杨帆生命权纠纷案',
    diagrams: [{ label: '事件经过', path: '/examples/fact-电梯劝烟案.json' }],
  },
  {
    name: '买卖合同纠纷',
    diagrams: [
      { label: '履约与违约经过', path: '/examples/fact-示例-同侧双主体.json' },
    ],
  },
  {
    name: '建设工程施工合同纠纷',
    diagrams: [
      {
        label: '施工合同履行时间线',
        path: '/examples/fact-示例-两侧各两个主体.json',
      },
      {
        label: '付款与结算时间线',
        path: '/examples/fact-示例-建设工程-付款与结算.json',
      },
    ],
  },
  {
    name: '项目进展',
    diagrams: [{ label: '单轴时间线', path: '/examples/fact-示例-无分组.json' }],
  },
  {
    name: '设备采购与安装纠纷',
    diagrams: [
      { label: '四个时间点', path: '/examples/fact-示例-四方四个时间点.json' },
    ],
  },
  {
    name: '股权转让纠纷',
    diagrams: [{ label: '三个时间点', path: '/examples/fact-示例-三个时间点.json' }],
  },
]

/** 把所有图摊平，方便按路径查它属于哪个案子、叫什么 */
/** 摊平成一份清单，URL 参数按下标取 */
const ALL_DIAGRAMS = CASES.flatMap((c) => c.diagrams.map((d) => ({ ...d, caseName: c.name })))

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
function FallbackInfo({ loading, errors, spec, hasRenderer }) {
  if (loading) return <div className="antu-fallback">加载中…</div>

  if (errors.length > 0) {
    return (
      <div className="antu-fallback">
        <div className="antu-error-title">规范校验未通过（{errors.length} 处问题）</div>
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
        <div className="antu-error-title">
          没有为 type = "{spec.type}" 注册渲染器
        </div>
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
  const [loading, setLoading] = useState(false)

  // 底层格线：全局偏好，不能放在渲染器里（切换图时渲染器会带着 key 重挂载，
  // 放里面会被重置）。用户动过才记到本地。
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

  // 视角下标。换图时回到第一个：不同数据的视角清单不一样，留着旧下标没有意义。
  const [viewIndex, setViewIndex] = useState(PRESET?.viewIndex ?? 0)
  useEffect(() => {
    setViewIndex(PRESET?.viewIndex ?? 0)
  }, [spec])

  // 支持 ?example=1 直接打开某张图（便于分享与测试）
  const [current, setCurrent] = useState(() => {
    const idx = Number(new URLSearchParams(window.location.search).get('example'))
    return ALL_DIAGRAMS[idx] || ALL_DIAGRAMS[0]
  })
  // 时间轴方向。**按图记**，不跟着切换图走：
  //   手动设过的  → 用记下来的
  //   没设过的    → 按槽数算默认：槽 ≥ 5 竖向，槽 ≤ 4 横向
  // 为什么按槽数：横向一格宽 316，一屏减掉标题列只排得下约 3.8 个槽；
  // 槽到 5 个，横向就明显挤了，竖向开始赢。
  const [orientationPrefs, setOrientationPrefs] = useState(
    () => readPref('antu.prefs').orientations || {},
  )
  const slotCount = Array.isArray(spec?.slots) ? spec.slots.length : 0
  const orientation =
    PRESET?.orientation || orientationPrefs[current.path] || (slotCount >= 5 ? 'vertical' : 'horizontal')
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [current.path]: next }
    setOrientationPrefs(map)
    writePref('antu.prefs', { orientations: map })
  }

  // 加载 + 校验
  useEffect(() => {
    // 自包含 HTML：规范内联在页面里，整页没有任何网络请求。
    // 这是最终形态（一个 fact 一份 JSON 一个 HTML），开发时才走下面的 fetch。
    const inline = typeof window !== 'undefined' ? window.__ANTU_SPEC__ : null
    if (inline) {
      const errs = validateSpec(inline)
      setErrors(errs)
      setSpec(errs.length ? null : inline)
      return undefined
    }

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

  // 子类是渲染层的选择，不在数据里：从注册表按大类查出有哪些画法。
  // 手动选过的按图记着，没选过就用第一个（默认画法）。
  const kinds = useMemo(() => (spec ? listKinds(spec.type) : []), [spec])
  const [kindPrefs, setKindPrefs] = useState(() => readPref('antu.prefs').kinds || {})
  const kind =
    kinds.find((k) => k.kind === kindPrefs[current.path])?.kind ?? kinds[0]?.kind ?? null
  const selectKind = (next) => {
    const map = { ...kindPrefs, [current.path]: next }
    setKindPrefs(map)
    writePref('antu.prefs', { kinds: map })
  }
  const kindLabel = kinds.find((k) => k.kind === kind)?.label

  const Renderer = spec ? getRenderer(spec.type, kind) : null
  const ready = !loading && errors.length === 0 && Renderer

  return (
    <div className="antu-app">
      <DiagramHeader
        title={spec?.title || current.label}
        typeLabel={spec ? labelOf(GRAPH_TYPE_LABELS, spec.type) : ''}
        info={diagramInfo(spec)}
        kinds={kinds}
        kind={kind}
        onSelectKind={selectKind}
      />

      {ready ? (
        <Renderer
          key={current.path}
          spec={spec}
          showGrid={showGrid}
          onToggleGrid={toggleGrid}
          fields={fields}
          onToggleField={toggleField}
          viewIndex={viewIndex}
          onSelectView={setViewIndex}
          orientation={orientation}
          onToggleOrientation={toggleOrientation}
          kinds={kinds}
          kind={kind}
          onSelectKind={selectKind}
        />
      ) : (
        <FallbackInfo loading={loading} errors={errors} spec={spec} hasRenderer={!!Renderer} />
      )}
    </div>
  )
}
