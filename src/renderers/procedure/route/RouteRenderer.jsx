// ============================================================
//  src/renderers/procedure/route/RouteRenderer.jsx — the route map (issue #95)
//
//  The main line as one line, left to right; where the process loops or ends early hangs below it. Same
//  JSON as the flowchart; the reader switches kind in the label card. The layout (route/layout.js) is
//  pure; this holds the labels switch and hands the shell one decoration layer. A long main line makes
//  a wide picture, so it opens at a readable zoom from the left and the reader scrolls sideways
//  (Canvas fitMinZoom), not shrunk to the width of the screen.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { usePrefs } from '../../../shell/env.js'
import { useExport } from '../../../shell/useExport.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch } from '../../../shell/DockParts.jsx'
import RouteLayerNode from './RouteLayerNode.jsx'
import { buildRouteGraph } from './layout.js'

const nodeTypes = { routeLayer: RouteLayerNode }

/** The zoom a wide route opens at: small enough to see the shape, not so small that the text is unreadable */
const OPEN_MIN_ZOOM = 0.8

export default function ProcedureRoute({ spec }) {
  const prefs = usePrefs()
  const specKey = `proc:${spec?.title || ''}`
  const { t, lang } = useLang()
  const [fieldPrefs, setFieldPrefs] = useState(() => prefs.read().procedureRouteFieldsByDiagram || {})
  const showLabels = fieldPrefs[specKey]?.labels ?? true
  const setLabels = (v) => {
    const map = { ...fieldPrefs, [specKey]: { ...fieldPrefs[specKey], labels: v } }
    setFieldPrefs(map)
    prefs.write({ procedureRouteFieldsByDiagram: map })
  }
  const layout = useMemo(() => buildRouteGraph(spec, { t }), [spec, lang])
  const graph = useMemo(() => ({ nodes: layout.nodes.map((n) => ({ ...n, data: { ...n.data, showLabels } })), edges: [], size: layout.size }), [layout, showLabels])
  const { canvasRef, exporting, onExport } = useExport(spec?.title)
  return (
    <div className="antu-procedure antu-rt">
      <Canvas ref={canvasRef} graph={graph} fitKey={layout} fitSelf fitMinZoom={OPEN_MIN_ZOOM} nodeTypes={nodeTypes}>
        <div className="antu-dock">
          <div className="antu-dock-bar">
            <button className={`antu-dock-chip${showLabels ? ' is-on' : ''}`} onClick={() => setLabels(!showLabels)}>
              {t('proc.route.labels')}
            </button>
            <span className="antu-dock-sep" />
            <DockLangSwitch />
            <span className="antu-dock-sep" />
            <DockExportButton exporting={exporting} onExport={onExport} />
          </div>
        </div>
      </Canvas>
    </div>
  )
}
