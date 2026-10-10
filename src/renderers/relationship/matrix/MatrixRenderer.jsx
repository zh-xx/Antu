// ============================================================
//  src/renderers/relationship/matrix/MatrixRenderer.jsx — the relation matrix (issue #91)
//
//  Parties × parties; each cell names the relations from its row's party to its column's party. Same
//  JSON as the graph; the reader switches kind in the label card. The layout (matrix/layout.js) is
//  pure; this holds the labels switch and hands the shell one decoration layer. It is a table, so it
//  opens fitted to its width like the chronicle.
// ============================================================

import { useMemo } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { useExport } from '../../../shell/useExport.js'
import { useLang } from '../../../shell/LangContext.jsx'
import FocusDock from '../focus/FocusDock.jsx'
import MatrixLayerNode from './MatrixLayerNode.jsx'
import { buildMatrixGraph } from './layout.js'
import { useSpecPref } from '../useSpecPref.js'

const nodeTypes = { matrixLayer: MatrixLayerNode }

export default function RelationshipMatrix({ spec }) {
  const specKey = `rel:${spec?.title || ''}`
  const { t, lang } = useLang()

  // The labels switch is shared with the graph and the other kinds (same key)
  const [stored, setStored] = useSpecPref('relationshipFieldsByDiagram', specKey)
  const showLabels = stored?.labels ?? true
  const setLabels = (v) => setStored({ ...stored, labels: v })

  const layout = useMemo(() => buildMatrixGraph(spec, { t }), [spec, lang])
  const graph = useMemo(
    () => ({
      nodes: layout.nodes.map((n) => ({ ...n, data: { ...n.data, showLabels } })),
      edges: [],
      size: layout.size,
    }),
    [layout, showLabels],
  )

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className="antu-relationship antu-mx">
      <Canvas ref={canvasRef} graph={graph} fitKey={layout} fitWidth nodeTypes={nodeTypes}>
        <FocusDock
          kinds={{}}
          showLabels={showLabels}
          onToggleLabels={setLabels}
          exporting={exporting}
          onExport={onExport}
        />
      </Canvas>
    </div>
  )
}
