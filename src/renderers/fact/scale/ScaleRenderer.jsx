// ============================================================
//  src/renderers/fact/scale/ScaleRenderer.jsx — the proportional time scale (issue #85, kind A)
//
//  Distance along the axis is real time; the axis breaks where the scale changes. The layout is
//  in scale/layout.js (pure JS); this file holds the hover and pin state, measures the titles with
//  the page's real font, and hands the graph to the canvas shell.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { useEnv, usePrefs, usePreset } from '../../../shell/env.js'
import { useExport } from '../../../shell/useExport.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import ScaleLayerNode from './ScaleLayerNode.jsx'
import ScaleCardNode from './ScaleCardNode.jsx'
import ScaleRunNode from './ScaleRunNode.jsx'
import ScaleRunListNode from './ScaleRunListNode.jsx'
import ScaleDock from './ScaleDock.jsx'
import { buildScaleGraph, PAD_X, PAD_Y, TIME_FONT, TIME_LH, TITLE_FONT, TITLE_LH } from './layout.js'
import { useSelectEvent } from '../../../shell/useSelectEvent.js'

const nodeTypes = { scaleLayer: ScaleLayerNode, scaleCard: ScaleCardNode, scaleRun: ScaleRunNode, scaleRunList: ScaleRunListNode }

/** The titles measured in the page's font, so a card is exactly as tall as its title (see chronicle) */
function makeMeasure(root) {
  if (typeof document === 'undefined') return null
  const ctx = document.createElement('canvas').getContext?.('2d')
  if (!ctx) return null
  const family = getComputedStyle(root?.querySelector?.('.antu-app') || document.body).fontFamily
  const font = `600 ${TITLE_FONT}px ${family}`
  const cache = new Map()
  return (text) => {
    let w = cache.get(text)
    if (w === undefined) {
      ctx.font = font
      w = ctx.measureText(text).width
      cache.set(text, w)
    }
    return w
  }
}

export default function FactScale({ spec }) {
  const { root } = useEnv()
  const measure = useMemo(() => makeMeasure(root), [root])
  // A lane per party, offered when a side holds two or more parties; off by default, remembered per diagram
  // (the preset is MCP's antu_preview's, the prefs the page's or the host's; shell/env.js)
  const PRESET = usePreset()
  const prefs = usePrefs()
  const specKey = spec?.title || ''
  const crowded = useMemo(() => {
    const actors = Array.isArray(spec?.actors) ? spec.actors : []
    if (actors.length < 2) return false
    const count = new Map()
    for (const a of actors) if (a?.groupId) count.set(a.groupId, (count.get(a.groupId) ?? 0) + 1)
    return [...count.values()].some((n) => n >= 2)
  }, [spec])
  const [partyPrefs, setPartyPrefs] = useState(() => prefs.read().scaleByParty || {})
  const byParty = crowded && (PRESET?.byParty ?? partyPrefs[specKey] ?? false)
  const toggleByParty = (value) => {
    const map = { ...partyPrefs, [specKey]: value }
    setPartyPrefs(map)
    prefs.write({ scaleByParty: map })
  }
  const graph = useMemo(() => buildScaleGraph(spec, {}, { measure, byParty }), [spec, measure, byParty])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  useSelectEvent(spec, pinnedId, setPinnedId)
  const { canvasRef, exporting, onExport } = useExport(spec?.title)
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, pin: (id) => setPinnedId(id), unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )
  const isItem = (n) => n.type === 'scaleCard' || n.type === 'scaleRun'

  return (
    <div className="antu-fact antu-sc">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          nodeTypes={nodeTypes}
          style={{
            '--antu-sc-pad-x': `${PAD_X}px`,
            '--antu-sc-pad-y': `${PAD_Y}px`,
            '--antu-sc-title-font': `${TITLE_FONT}px`,
            '--antu-sc-title-lh': `${TITLE_LH}px`,
            '--antu-sc-time-font': `${TIME_FONT}px`,
            '--antu-sc-time-lh': `${TIME_LH}px`,
          }}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'scaleCard') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => setHoveredId((cur) => (cur === n.id ? null : cur))}
          onNodeClick={(_, n) => {
            if (isItem(n)) setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <ScaleDock byParty={byParty} onToggleByParty={crowded ? toggleByParty : null} exporting={exporting} onExport={onExport} />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
