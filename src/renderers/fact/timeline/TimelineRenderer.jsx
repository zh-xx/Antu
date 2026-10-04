// ============================================================
//  src/renderers/fact/timeline/TimelineRenderer.jsx — the timeline
//
//  This file owns the "timeline" way of drawing:
//    1. pick a view that fits, and compute the spec into nodes (timeline/layout.js)
//    2. hold the presentation state: view, card fields, orientation, underlying grid lines
//    3. hand the nodes, the overlay state and the control dock to the canvas shell (shell/Canvas.jsx)
//
//  It **does not touch React Flow**: viewport, zoom, minimap and size changes all live in the
//  shell, so adding a second way of drawing rewrites not one word of that.
//
//  Presentation state belongs here, not in App: App should only know "there is a spec, look up
//  the renderer by type". (These states used to live in App, which forced App to pass 9 props to
//  the renderer, 8 of them fact/timeline concepts.)
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { readPrefs, writePrefs } from '../../../shell/prefs.js'
import { useExport } from '../../../shell/useExport.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import EventNode from '../EventNode.jsx'
import ControlDock from '../ControlDock.jsx'
import ColumnHeaderNode from './ColumnHeaderNode.jsx'
import AxisLineNode from './AxisLineNode.jsx'
import LinkLayerNode from './LinkLayerNode.jsx'
import CellLayerNode from './CellLayerNode.jsx'
import { CARD_PAD_X, CARD_PAD_Y, LABEL_FONT, SNIPPET_FONT } from '../cardGeometry.js'
import { buildFactGraph } from './layout.js'
import { viewsOf } from './grid.js'

/** Node types used by the timeline. Adding one means registering one line here. */
const nodeTypes = {
  card: EventNode,
  colHeader: ColumnHeaderNode,
  axis: AxisLineNode,
  links: LinkLayerNode,
  cells: CellLayerNode,
}

/** Defaults for the optional card fields. Title and time are not listed: they are fixed on the card. */
const FIELD_DEFAULTS = { sources: false, actors: false, summary: true }

/**
 * External preset: used only by MCP's antu_preview.
 * It has to specify "which orientation, which fields, which view" for a screenshot without
 * polluting the user's own preferences, so it travels through a one-shot global rather than
 * localStorage.
 */
const PRESET = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null

export default function FactTimeline({ spec }) {
  // Per-diagram preferences use the **title** as key: it is written in the data, so it exists in
  // development and in the built page alike, and it does not depend on a file name (the built
  // page has no file name at all).
  const specKey = spec?.title || ''

  // Which optional fields the card shows. Only the ones the user actually touched are stored.
  const [fields, setFields] = useState(() => ({
    ...FIELD_DEFAULTS,
    ...readPrefs().fields,
    ...(PRESET?.fields || {}),
  }))
  const toggleField = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }))
    writePrefs({ fields: { ...readPrefs().fields, [key]: value } })
  }

  // Underlying grid lines: a global preference
  const [showGrid, setShowGrid] = useState(() => readPrefs().showGrid === true)
  const toggleGrid = (value) => {
    setShowGrid(value)
    writePrefs({ showGrid: value })
  }

  // View index. One page holds one data set, so there is no "reset when the diagram changes".
  const [viewIndex, setViewIndex] = useState(PRESET?.viewIndex ?? 0)

  // Orientation of the time axis. What was set by hand is remembered per diagram; what was not
  // is decided by the slot count: 5 or more slots vertical, 4 or fewer horizontal. A horizontal
  // cell is 316 wide, and one screen minus the heading column fits only about 3.8 slots.
  const [orientationPrefs, setOrientationPrefs] = useState(() => readPrefs().orientations || {})
  const slotCount = Array.isArray(spec?.slots) ? spec.slots.length : 0
  const orientation =
    PRESET?.orientation || orientationPrefs[specKey] || (slotCount >= 5 ? 'vertical' : 'horizontal')
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    writePrefs({ orientations: map })
  }

  // The view, like the field switches, is an input to layout: the view decides the side split and
  // which columns exist, the fields decide how many rows a card takes. Change either and the whole
  // diagram is laid out again and the viewport re-fits.
  const views = useMemo(() => viewsOf(spec), [spec])

  // Lay out every view once first. **A view that does not fit does not become an option**: an
  // option that cannot be clicked is noise. Its index in the original list is kept and sent back
  // on selection, so that filtering cannot shift it.
  const viewInfos = useMemo(
    () =>
      views.map((v, i) => {
        const g = buildFactGraph(spec, fields, v, orientation)
        const reason = g.errors.length > 0 ? g.errors[0] : ''
        if (reason) {
          // A view that does not fit never appears among the options, so nothing in the interface
          // shows that it is broken. A warning is printed so that whoever wrote the data (an
          // agent) can find it. Fixed English, **not in the interface dictionary**: the dictionary
          // holds user-facing text only, and a string that never reaches the interface would force
          // both dictionaries to carry an unused Chinese entry (the validator's key-consistency
          // check exists for exactly this).
          console.warn(`[antu] view "${v.label}" does not fit; removed from options. Reason: ${reason}`)
        }
        return { view: v, index: i, reason }
      }),
    [spec, fields, views, orientation],
  )
  const usable = useMemo(() => viewInfos.filter((info) => !info.reason), [viewInfos])

  // The selected one must also be one that fits (the first view in the data may not):
  // fall back to the first usable one, and only when none is usable fall back to the original
  // so that the problem is visible.
  const safeIndex =
    viewInfos[viewIndex] && !viewInfos[viewIndex].reason ? viewIndex : (usable[0]?.index ?? viewIndex)
  const view = (viewInfos[safeIndex] || viewInfos[0]).view
  const graph = useMemo(
    () => buildFactGraph(spec, fields, view, orientation),
    [spec, fields, view, orientation],
  )

  // Overlay state: hoveredId is the card the mouse passed over, pinnedId is the card clicked open
  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)

  // Export: the guard and the failure message live in the shell hook, shared with every renderer
  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  // Overlay state goes down through Context, avoiding a rebuild of the whole node array that writing into node data would cause
  const preview = useMemo(
    () => ({
      hoveredId,
      pinnedId,
      // The card can pin and close itself (the keyboard path needs it); the mouse path still goes through React Flow's onNodeClick
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
          // Card padding and summary font size come from cardGeometry.js alone, and the styles take
          // them through CSS variables. Otherwise "card width / font size" and "the summary
          // character limit" would each have their own copy, and changing one would silently throw
          // the other off.
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
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
