// ============================================================
//  src/renderers/fact/chronicle/ChronicleRenderer.jsx — the chronicle (issue #85)
//
//  Every event in one column, in order, on one spine; the time passed between time points is
//  written between them. Same JSON as the timeline; the reader switches kind in the label card.
//
//  Like the timeline it never touches React Flow: it hands the shell a graph (chronicle/layout.js),
//  its node types and its dock. It opens fitted to its width (Canvas fitWidth), because a long
//  chronicle fitted whole would be too small to read.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { useEnv, usePreset, usePrefs } from '../../../shell/env.js'
import { useExport } from '../../../shell/useExport.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import EntryNode from './EntryNode.jsx'
import SpineNode from './SpineNode.jsx'
import LegendNode from './LegendNode.jsx'
import ChronicleDock from './ChronicleDock.jsx'
import { buildChronicleGraph, PAD_X, PAD_Y, SUMMARY_FONT, SUMMARY_LH, TAG_FONT, TAG_LH, TITLE_FONT, TITLE_LH, WHEN_LH } from './layout.js'
import { useSelectEvent } from '../../../shell/useSelectEvent.js'

const nodeTypes = { entry: EntryNode, spine: SpineNode, legend: LegendNode }

/**
 * Measure text with the font the page really draws in, so each card is exactly as tall as its
 * text: an estimate has to err long to be safe, and that leaves a blank line in some cards.
 * Canvas measureText shapes text the way layout does; null where there is no canvas.
 * `root` is where this diagram's elements are (shell/env.js): the document, or a mounted diagram's shadow root.
 */
function makeMeasure(root) {
  if (typeof document === 'undefined') return null
  const ctx = document.createElement('canvas').getContext?.('2d')
  if (!ctx) return null
  const family = getComputedStyle(root?.querySelector?.('.antu-app') || document.body).fontFamily
  const fonts = { title: `600 ${TITLE_FONT}px ${family}`, summary: `${SUMMARY_FONT}px ${family}` }
  const cache = new Map()
  return (text, kind) => {
    const key = kind + '\u0000' + text
    let w = cache.get(key)
    if (w === undefined) {
      ctx.font = fonts[kind]
      w = ctx.measureText(text).width
      cache.set(key, w)
    }
    return w
  }
}

/** The same defaults and the same stored switches as the timeline: one set of card fields per reader */
const FIELD_DEFAULTS = { sources: false, actors: false, summary: true }

export default function FactChronicle({ spec }) {
  // External preset for screenshots (antu_preview, the skill's preview); see the timeline renderer
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const prefs = usePrefs()
  const [fields, setFields] = useState(() => ({
    ...FIELD_DEFAULTS,
    ...prefs.read().fields,
    ...(PRESET?.fields || {}),
  }))
  const toggleField = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }))
    prefs.write({ fields: { ...prefs.read().fields, [key]: value } })
  }

  const { root } = useEnv()
  const measure = useMemo(() => makeMeasure(root), [root])
  const layout = useMemo(() => buildChronicleGraph(spec, fields, { measure }), [spec, fields, measure])

  // One group lit at a time (the legend's buttons): its cards and marks stay, the others are faded
  const [activeGroup, setActiveGroup] = useState(null)
  const toggleGroup = (i) => setActiveGroup((cur) => (cur === i ? null : i))
  const graph = useMemo(() => {
    if (activeGroup === null) {
      return { ...layout, nodes: layout.nodes.map((n) => (n.type === 'legend' ? { ...n, data: { ...n.data, active: null, onToggle: toggleGroup } } : n)) }
    }
    const nodes = layout.nodes.map((n) => {
      if (n.type === 'entry') return { ...n, data: { ...n.data, dim: n.data.groupIndex !== activeGroup || n.data.shape === 'none' } }
      if (n.type === 'spine') return { ...n, data: { ...n.data, dots: n.data.dots.map((d) => ({ ...d, dim: d.groupIndex !== activeGroup || d.shape === 'none' })) } }
      if (n.type === 'legend') return { ...n, data: { ...n.data, active: activeGroup, onToggle: toggleGroup } }
      return n
    })
    return { ...layout, nodes }
  }, [layout, activeGroup])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  useSelectEvent(spec, pinnedId)
  const { canvasRef, exporting, onExport } = useExport(spec?.title)
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, pin: (id) => setPinnedId(id), unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )

  return (
    <div className="antu-fact antu-chr">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitWidth
          nodeTypes={nodeTypes}
          // Every number the styles need comes from layout.js, so the height the layout computed
          // and the height the text takes cannot drift apart
          style={{
            '--antu-chr-pad-x': `${PAD_X}px`,
            '--antu-chr-pad-y': `${PAD_Y}px`,
            '--antu-chr-title-font': `${TITLE_FONT}px`,
            '--antu-chr-title-lh': `${TITLE_LH}px`,
            '--antu-chr-summary-font': `${SUMMARY_FONT}px`,
            '--antu-chr-summary-lh': `${SUMMARY_LH}px`,
            '--antu-chr-tag-font': `${TAG_FONT}px`,
            '--antu-chr-tag-lh': `${TAG_LH}px`,
            '--antu-chr-when-lh': `${WHEN_LH}px`,
          }}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'entry') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => {
            setHoveredId((cur) => (cur === n.id ? null : cur))
          }}
          onNodeClick={(_, n) => {
            if (n.type === 'entry') setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <ChronicleDock fields={fields} onToggleField={toggleField} exporting={exporting} onExport={onExport} />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
