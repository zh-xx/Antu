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
import { usePrefs, useViewValue } from '../../../shell/env.js'
import { useExport } from '../../../shell/useExport.js'
import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch } from '../../../shell/DockParts.jsx'
import RouteLayerNode from './RouteLayerNode.jsx'
import { buildRouteGraph } from './layout.js'
import { useTheme } from '../../../theme/ThemeContext.jsx'
import { statesByDefault } from '../flow/FlowRenderer.jsx'

const nodeTypes = { routeLayer: RouteLayerNode }

/** The zoom a wide route opens at: small enough to see the shape, not so small that the text is unreadable */
const OPEN_MIN_ZOOM = 0.7

export default function ProcedureRoute({ spec }) {
  const prefs = usePrefs()
  const specKey = `proc:${spec?.title || ''}`
  const { t, lang } = useLang()
  const [fieldPrefs, setFieldPrefs] = useState(() => prefs.read().procedureRouteFieldsByDiagram || {})
  const storedFields = fieldPrefs[specKey] || {}
  const { id: themeId } = useTheme()
  // Both switches go through the view state (issue 200): a host's initial/locked/persist, the page's preset and
  // the reader's click are resolved in one place. The four states in colour (issue 187) are off in the document
  // theme and on in the others, unless switched for this diagram; `statesByDefault` stays the fallback.
  const labelsView = useViewValue('view.route.labels', storedFields.labels, true)
  const statesView = useViewValue('view.route.states', storedFields.states, statesByDefault(themeId))
  const showLabels = labelsView.value
  const showStates = statesView.value
  const views = { labels: labelsView, states: statesView }
  const setField = (key, v) => {
    views[key].touch()
    const map = { ...fieldPrefs, [specKey]: { ...fieldPrefs[specKey], [key]: v } }
    setFieldPrefs(map)
    prefs.write({ procedureRouteFieldsByDiagram: map })
  }
  const layout = useMemo(() => buildRouteGraph(spec, { t }), [spec, lang])
  const graph = useMemo(() => ({ nodes: layout.nodes.map((n) => ({ ...n, data: { ...n.data, showLabels, showStates } })), edges: [], size: layout.size }), [layout, showLabels, showStates])
  const { canvasRef, exporting, onExport } = useExport(spec?.title)
  return (
    <div className="antu-procedure antu-rt">
      <Canvas ref={canvasRef} graph={graph} fitKey={layout} fitSelf fitMinZoom={OPEN_MIN_ZOOM} nodeTypes={nodeTypes}>
        <div className="antu-dock">
          <div className="antu-dock-bar">
            {/* a locked switch has no control at all */}
            {!labelsView.locked && (
              <button className={`antu-dock-chip${showLabels ? ' is-on' : ''}`} onClick={() => setField('labels', !showLabels)}>
                {t('proc.route.labels')}
              </button>
            )}
            {!statesView.locked && (
              <button className={`antu-dock-chip${showStates ? ' is-on' : ''}`} onClick={() => setField('states', !showStates)}>
                {t('flow.states')}
              </button>
            )}
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
