// ============================================================
//  src/renderers/fact/timeline/TimelineRenderer.jsx —— 时间图
//
//  这个文件负责"时间图"这一种画法：
//    1. 挑一个排得下的视角，把规范算成 nodes（timeline/layout.js）
//    2. 管住呈现状态：视角、卡片字段、方向、底层格线
//    3. 把节点、浮层状态、控制胶囊交给画布外壳（shell/Canvas.jsx）
//
//  它**不碰 React Flow**：视口、缩放、缩略图、尺寸变化都在外壳里，
//  加第二个画法时那部分一个字不用重写。
//
//  呈现状态归这里，不归 App：App 只该知道"有一份 spec，按 type 找渲染器"。
//  （原先这些状态放在 App 里，导致 App 得给渲染器传 9 个 props，其中 8 个
//   是 fact/timeline 的概念。见 known-issues 第 15 条。）
// ============================================================

import { useMemo, useRef, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { readPrefs, writePrefs } from '../../../shell/prefs.js'
import { useShell } from '../../../shell/shellContext.js'
import { PreviewContext } from '../previewContext.js'
import EventNode from '../EventNode.jsx'
import ControlDock from '../ControlDock.jsx'
import ColumnHeaderNode from './ColumnHeaderNode.jsx'
import AxisLineNode from './AxisLineNode.jsx'
import LinkLayerNode from './LinkLayerNode.jsx'
import CellLayerNode from './CellLayerNode.jsx'
import { CARD_PAD_X, CARD_PAD_Y, LABEL_FONT, SNIPPET_FONT } from '../cardGeometry.js'
import { buildFactGraph } from './layout.js'
import { viewsOf } from './grid.js'

/** 时间图用到的节点类型。加一类就在这里登记一行。 */
const nodeTypes = {
  card: EventNode,
  colHeader: ColumnHeaderNode,
  axis: AxisLineNode,
  links: LinkLayerNode,
  cells: CellLayerNode,
}

/** 卡片可选字段的默认值。标题与时间不在此列，它们固定在卡上。 */
const FIELD_DEFAULTS = { sources: false, actors: false, summary: true }

/**
 * 外部预设：只有 MCP 的 antu_preview 会用到。
 * 它要能指定"用哪个方向、开哪些字段、看第几个视角"来截图，
 * 又不能污染用户自己的偏好，所以走一个一次性的全局，而不是写 localStorage。
 */
const PRESET = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null

export default function FactTimeline({ spec }) {
  // 按图记的偏好用**标题**当键：它写在数据里，开发和成品都有，
  // 而且不依赖文件名（成品根本没有文件名）。
  const specKey = spec?.title || ''

  // 卡片上显示哪些可选字段。只记用户真动过的那几个。
  const [fields, setFields] = useState(() => ({
    ...FIELD_DEFAULTS,
    ...readPrefs().fields,
    ...(PRESET?.fields || {}),
  }))
  const toggleField = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }))
    writePrefs({ fields: { ...readPrefs().fields, [key]: value } })
  }

  // 底层格线：全局偏好
  const [showGrid, setShowGrid] = useState(() => readPrefs().showGrid === true)
  const toggleGrid = (value) => {
    setShowGrid(value)
    writePrefs({ showGrid: value })
  }

  // 视角下标。一个页面只有一份数据，所以不需要"换图归零"。
  const [viewIndex, setViewIndex] = useState(PRESET?.viewIndex ?? 0)

  // 时间轴方向。手动设过的按图记住，没设过的按槽数算：
  // 槽 ≥ 5 竖向，槽 ≤ 4 横向。横向一格宽 316，一屏减掉标题列只排得下约 3.8 个槽。
  const [orientationPrefs, setOrientationPrefs] = useState(() => readPrefs().orientations || {})
  const slotCount = Array.isArray(spec?.slots) ? spec.slots.length : 0
  const orientation =
    PRESET?.orientation || orientationPrefs[specKey] || (slotCount >= 5 ? 'vertical' : 'horizontal')
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    writePrefs({ orientations: map })
  }

  // 视角和字段开关一样，都是排布的输入：视角决定分侧与有哪些列，
  // 字段决定卡片放几行。两者一变，整张图重排、视口重新适配。
  const views = useMemo(() => viewsOf(spec), [spec])

  // 先把每个视角都试排一遍。**摆不下的不进选项**：一个点了没用的选项是噪音。
  // 这里保留它在原清单里的下标，选中时按原下标回传，免得过滤后错位。
  const viewInfos = useMemo(
    () =>
      views.map((v, i) => {
        const g = buildFactGraph(spec, fields, v, orientation)
        const reason = g.errors.length > 0 ? g.errors[0] : ''
        if (reason) {
          // 摆不下的视角不会出现在选项里，从界面上完全看不出它有问题。
          // 打一条警告，写数据的人（agent）才找得到。
          console.warn(`[案图] 视角「${v.label}」摆不下，已从选项中去掉。原因：${reason}`)
        }
        return { view: v, index: i, reason }
      }),
    [spec, fields, views, orientation],
  )
  const usable = useMemo(() => viewInfos.filter((info) => !info.reason), [viewInfos])

  // 当前选中的那个也不能是摆不下的（比如数据里第一个视角就摆不下）：
  // 真遇到就退到第一个能用的。一个能用的都没有时才退回原样，把问题显示出来。
  const safeIndex =
    viewInfos[viewIndex] && !viewInfos[viewIndex].reason ? viewIndex : (usable[0]?.index ?? viewIndex)
  const view = (viewInfos[safeIndex] || viewInfos[0]).view
  const graph = useMemo(
    () => buildFactGraph(spec, fields, view, orientation),
    [spec, fields, view, orientation],
  )

  // 浮层状态：hoveredId 是鼠标划过的卡，pinnedId 是点住不放的卡
  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)

  // 标签卡的显隐归外壳（headerVisible），这里只是把它转给底部胶囊，
  // 并让导出跟着它走——**屏幕上显示什么，导出就是什么**（rendering §10.2）。
  const { headerVisible, toggleHeader } = useShell()

  // 导出：真正的活在画布外壳里（只有它知道 React Flow 的 DOM 与内容尺寸），
  // 这里只把"现在这份 graph + 要不要带题头 + 文件名"递过去。
  // 守卫用 ref 而不是 state：state 在同一个 tick 里还是旧值，连点两下会导两次。
  const canvasRef = useRef(null)
  const exportingRef = useRef(false)
  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    try {
      await canvasRef.current?.exportPng({ includeHeader: headerVisible, title: spec?.title })
    } catch (e) {
      // 导出失败不能白失败：告诉人一声，而不是按钮点了没反应
      console.error('[案图] 导出失败：', e)
      window.alert(`导出失败：${e.message}`)
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  // 浮层状态通过 Context 传下去，避免写进节点 data 引发整份节点数组重建
  const preview = useMemo(
    () => ({
      hoveredId,
      pinnedId,
      // 卡片自己也能钉/关（键盘那条路要用）；鼠标那条仍走 React Flow 的 onNodeClick
      pin: (id) => setPinnedId(id),
      unpin: () => setPinnedId(null),
    }),
    [hoveredId, pinnedId],
  )

  return (
    <div className="antu-fact">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          nodeTypes={nodeTypes}
          showGrid={showGrid}
          // 卡片内边距与摘要字号由 cardGeometry.js 统一给出，样式层通过 CSS 变量取用。
          // 否则「卡片宽度/字号」和「摘要字数上限」会各写一份，改了一处另一处就悄悄失准。
          style={{
            '--antu-card-pad-x': `${CARD_PAD_X}px`,
            '--antu-card-pad-y': `${CARD_PAD_Y}px`,
            '--antu-label-font': `${LABEL_FONT}px`,
            '--antu-snippet-font': `${SNIPPET_FONT}px`,
          }}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'card') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => {
            setHoveredId((cur) => (cur === n.id ? null : cur))
          }}
          onNodeClick={(_, n) => {
            if (n.type === 'card') setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <ControlDock
            viewOptions={usable}
            viewCount={viewInfos.length}
            view={view}
            onSelectView={setViewIndex}
            fields={fields}
            onToggleField={toggleField}
            orientation={orientation}
            onToggleOrientation={toggleOrientation}
            showGrid={showGrid}
            onToggleGrid={toggleGrid}
            showHeader={headerVisible}
            onToggleHeader={toggleHeader}
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
