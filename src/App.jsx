// ============================================================
//  src/App.jsx —— 应用外壳
//
//  职责最小化：
//   1. 加载一份规范 JSON
//   2. 过校验门卫
//   3. 按 type 从注册表取渲染器并渲染
//  核心不认识"事实图/关系图"的业务语义，只认 type。
// ============================================================

import { useEffect, useState } from 'react'
import { validateSpec } from './core/validate.js'
import { getRenderer, listTypes } from './core/registry.js'

// 可切换的示例（v0 硬编码；将来由用户导入 JSON）
const EXAMPLES = [
  { label: '电梯劝烟案（双主体单线）', path: '/examples/fact-电梯劝烟案.json' },
  { label: '电梯劝烟案（单主体分侧）', path: '/examples/fact-电梯劝烟案-单主体.json' },
]

export default function App() {
  const [spec, setSpec] = useState(null)
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(false)
  // 支持 ?example=1 直接打开某个示例（便于分享与测试）
  const [current, setCurrent] = useState(() => {
    const idx = Number(new URLSearchParams(window.location.search).get('example'))
    return EXAMPLES[idx] || EXAMPLES[0]
  })

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

  return (
    <div className="antu-app">
      <nav className="antu-nav">
        <span className="antu-brand">案图 antu</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.path}
            className={`antu-nav-btn ${ex.path === current.path ? 'active' : ''}`}
            onClick={() => setCurrent(ex)}
          >
            {ex.label}
          </button>
        ))}
        <span className="antu-nav-info">
          已注册类型：{listTypes().join(' / ') || '（无）'}
        </span>
      </nav>

      {loading && <div className="antu-msg">加载中…</div>}

      {!loading && errors.length > 0 && (
        <div className="antu-error">
          <div className="antu-error-title">⚠️ 规范校验未通过（{errors.length} 处问题）</div>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {!loading && !errors.length && spec && !Renderer && (
        <div className="antu-error">
          <div className="antu-error-title">
            ⚠️ 没有为 type = "{spec.type}" 注册渲染器
          </div>
          <div className="antu-error-hint">
            已注册：{listTypes().join(' / ') || '（无）'}
          </div>
        </div>
      )}

      {!loading && !errors.length && Renderer && <Renderer spec={spec} />}
    </div>
  )
}
