// ============================================================
//  src/renderers/relationship/LevelledView.jsx — the page of a levelled relationship view (shared)
//
//  The equity tree, the authority chart, the relation path and the camp summary are all a pure layout
//  (one `build(spec, options)` returning party boxes and one line layer) drawn by the graph's own party
//  box and LineLayerNode. This holds what they share: the labels switch (remembered together with the
//  graph's), the hover and pin of a party's overlay, fit to width or not, the dock and the export.
//  A view says what it adds: `options` for its layout (the path's two ends), `onParty` for a click,
//  and `dockExtra` for a control of its own.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../shell/Canvas.jsx'
import { usePrefs } from '../../shell/env.js'
import { PreviewContext } from '../../shell/previewContext.js'
import { useExport } from '../../shell/useExport.js'
import { useLang } from '../../shell/LangContext.jsx'
import EntityNode from './graph/EntityNode.jsx'
import FocusDock from './focus/FocusDock.jsx'
import LineLayerNode from './LineLayerNode.jsx'
import { useSelectEvent } from '../../shell/useSelectEvent.js'

const nodeTypes = { rnode: EntityNode, lineLayer: LineLayerNode }

export default function LevelledView({ spec, build, className, options = {}, onParty = null, dockExtra = null, fitWidth = true, decorate = null }) {
  const prefs = usePrefs()
  const specKey = `rel:${spec?.title || ''}`
  const { t, lang } = useLang()

  const [fieldPrefs, setFieldPrefs] = useState(() => prefs.read().relationshipFieldsByDiagram || {})
  const showLabels = fieldPrefs[specKey]?.labels ?? true
  const setLabels = (v) => {
    const map = { ...fieldPrefs, [specKey]: { ...fieldPrefs[specKey], labels: v } }
    setFieldPrefs(map)
    prefs.write({ relationshipFieldsByDiagram: map })
  }

  const optionsKey = JSON.stringify(options)
  const layout = useMemo(() => build(spec, { ...options, t }), [spec, lang, optionsKey])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  useSelectEvent(spec, pinnedId)
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, pin: (id) => setPinnedId(id), unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )

  const graph = useMemo(() => {
    const nodes = layout.nodes.map((n) => {
      if (n.type === 'lineLayer') return { ...n, data: { ...n.data, showLabels } }
      return decorate ? { ...n, data: decorate(n) } : n
    })
    return { nodes, edges: [], size: layout.size }
  }, [layout, showLabels, decorate])

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className={`antu-relationship ${className}`}>
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitKey={layout}
          fitWidth={fitWidth}
          fitSelf={!fitWidth}
          nodeTypes={nodeTypes}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'rnode') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => setHoveredId((cur) => (cur === n.id ? null : cur))}
          onNodeClick={(_, n) => {
            if (n.type !== 'rnode') return
            if (onParty) onParty(n.id, { pin: () => setPinnedId(n.id), unpin: () => setPinnedId(null) })
            else setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <FocusDock kinds={{}} showLabels={showLabels} onToggleLabels={setLabels} exporting={exporting} onExport={onExport} extra={dockExtra ? dockExtra(layout) : null} />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
