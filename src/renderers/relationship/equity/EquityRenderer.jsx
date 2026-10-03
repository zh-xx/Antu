// ============================================================
//  src/renderers/relationship/equity/EquityRenderer.jsx — the equity tree (issue #91)
//
//  Holders above what they hold, the share on each line. Same JSON as the graph; the reader switches
//  kind in the label card. The layout (equity/layout.js) is pure; this holds the hover and pin state,
//  hands the shell the graph and its node types, and reuses the graph's own entity box, so a party looks
//  and opens the same in every kind. It reads top to bottom, so it opens fitted to its width.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { readPrefs, writePrefs } from '../../../shell/prefs.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useExport } from '../../../shell/useExport.js'
import { useLang } from '../../../shell/LangContext.jsx'
import EntityNode from '../graph/EntityNode.jsx'
import FocusDock from '../focus/FocusDock.jsx'
import EquityLayerNode from './EquityLayerNode.jsx'
import { buildEquityGraph } from './layout.js'

const nodeTypes = { rnode: EntityNode, equityLayer: EquityLayerNode }

export default function RelationshipEquity({ spec }) {
  const specKey = `rel:${spec?.title || ''}`
  const { t, lang } = useLang()

  // The labels switch is shared with the graph and the other kinds (same key)
  const [fieldPrefs, setFieldPrefs] = useState(() => readPrefs().relationshipFieldsByDiagram || {})
  const showLabels = fieldPrefs[specKey]?.labels ?? true
  const setLabels = (v) => {
    const map = { ...fieldPrefs, [specKey]: { ...fieldPrefs[specKey], labels: v } }
    setFieldPrefs(map)
    writePrefs({ relationshipFieldsByDiagram: map })
  }

  const layout = useMemo(() => buildEquityGraph(spec, { t }), [spec, lang])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, pin: (id) => setPinnedId(id), unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )

  const graph = useMemo(
    () => ({
      nodes: layout.nodes.map((n) => (n.type === 'equityLayer' ? { ...n, data: { ...n.data, showLabels } } : n)),
      edges: [],
      size: layout.size,
    }),
    [layout, showLabels],
  )

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className="antu-relationship antu-eq">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitKey={layout}
          fitWidth
          nodeTypes={nodeTypes}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'rnode') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => setHoveredId((cur) => (cur === n.id ? null : cur))}
          onNodeClick={(_, n) => {
            if (n.type === 'rnode') setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <FocusDock kinds={{}} showLabels={showLabels} onToggleLabels={setLabels} exporting={exporting} onExport={onExport} />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
