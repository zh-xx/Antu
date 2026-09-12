// ============================================================
//  src/shell/AppRail.jsx —— 左侧信息栏（引擎的界面外壳）
//
//  为什么信息放左边而不是顶上：
//  这张图是**竖着长**的，垂直空间才是稀缺资源；而屏幕一般是宽屏，
//  横向本来就富余。
//
//  两个插槽：
//    nav  —— 应用级的东西（品牌、示例切换），由 App 提供
//    info —— 图级的东西（标题、统计、图例），由各渲染器提供
//  外壳只负责摆放与收起，不认识任何业务语义。
//
//  窄屏（≤1080）会自动折成顶部横条，并且**默认收起**：
//  展开时它比原来的两条顶栏还高，收起后只剩一行，反而更省地方。
// ============================================================

import { useEffect, useState } from 'react'

const NARROW = '(max-width: 1080px)'

export default function AppRail({ nav, info }) {
  // 窄屏默认收起，宽屏默认展开
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches,
  )

  // 跨越断点时跟着切换一次；用户手动收起/展开后，不再强行覆盖
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const apply = (e) => setCollapsed(e.matches)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <aside className={`antu-rail${collapsed ? ' is-collapsed' : ''}`}>
      <div className="antu-rail-head">
        <span className="antu-rail-brand">案图</span>
        <button
          className="antu-rail-toggle"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? '展开信息栏' : '收起信息栏'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开信息栏' : '收起信息栏'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <div className="antu-rail-content">
        {nav}
        {info}
      </div>
    </aside>
  )
}
