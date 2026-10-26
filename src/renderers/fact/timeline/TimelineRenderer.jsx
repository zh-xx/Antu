// ============================================================
//  src/renderers/fact/timeline/TimelineRenderer.jsx — the timeline
//
//  This file owns the "timeline" way of drawing:
//    1. compute the spec into nodes (timeline/layout.js)
//    2. hold the presentation state: card fields, orientation, underlying grid lines, staggered rows
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
import { usePreset, usePrefs } from '../../../shell/env.js'
import { specKeyOf } from '../../../shell/prefs.js'
import { useSpecPref } from '../../relationship/useSpecPref.js'
import { useExport } from '../../../shell/useExport.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import EventNode from '../EventNode.jsx'
import ControlDock from '../ControlDock.jsx'
import ColumnHeaderNode from './ColumnHeaderNode.jsx'
import AxisLineNode from './AxisLineNode.jsx'
import LinkLayerNode from './LinkLayerNode.jsx'
import CellLayerNode from './CellLayerNode.jsx'
import { CARD_PAD_X, CARD_PAD_Y } from '../cardGeometry.js'
import { buildFactGraph } from './layout.js'
import { useSelectEvent } from '../../../shell/useSelectEvent.js'

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

export default function FactTimeline({ spec }) {
  // External preset: used only by MCP's antu_preview.
  // It has to specify "which orientation, which fields" for a screenshot without
  // polluting the user's own preferences, so it travels through a one-shot global rather than
  // localStorage.
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const prefs = usePrefs()
  // Per-diagram preferences are keyed by the spec's content (shell/prefs.js `specKeyOf`), so two
  // diagrams with the same title, or none, never share a record.
  const specKey = specKeyOf(spec)

  // Which optional fields the card shows, remembered per diagram. Only the fields the user actually
  // touched are stored, and the preset only supplies the first values.
  const [storedFields, setStoredFields] = useSpecPref('fields', specKey, (stored) => stored || {})
  // Memoised: an object rebuilt on every render sat in the graph memo's dependencies, so every re-render
  // (a hover, a pin) rebuilt the whole graph and re-fitted the viewport, throwing a zoomed-in reader back
  // to the overview (issue 273; the same failure #21 fixed for the other renderers with `fitKey`).
  const presetFields = PRESET?.fields || null
  const fields = useMemo(
    () => ({ ...FIELD_DEFAULTS, ...storedFields, ...(presetFields || {}) }),
    [storedFields, presetFields],
  )
  const toggleField = (key, value) => setStoredFields({ ...storedFields, [key]: value })

  // Underlying grid lines: also a choice about this diagram now (issue 236)
  const [showGrid, setShowGrid] = useSpecPref('showGrid', specKey, (stored) => stored === true)
  const toggleGrid = (value) => setShowGrid(value)

  // Staggered rows (vertical only, see rowTopsOf in metrics.js): on by default, and what the reader set is remembered
  // per diagram, like the orientation, so turning it off in one diagram does not change how another opens.
  const [staggerPrefs, setStaggerPrefs] = useState(() => prefs.read().staggers || {})
  const stagger = PRESET?.stagger ?? staggerPrefs[specKey] ?? true
  const toggleStagger = (value) => {
    const map = { ...staggerPrefs, [specKey]: value }
    setStaggerPrefs(map)
    prefs.write({ staggers: map })
  }

  // Orientation of the time axis. What was set by hand is remembered per diagram; what was not
  // is decided by the slot count: 5 or more slots vertical, 4 or fewer horizontal. A horizontal
  // cell is 316 wide, and one screen minus the heading column fits only about 3.8 slots.
  const [orientationPrefs, setOrientationPrefs] = useState(() => prefs.read().orientations || {})
  const slotCount = Array.isArray(spec?.slots) ? spec.slots.length : 0
  const orientation =
    PRESET?.orientation || orientationPrefs[specKey] || (slotCount >= 5 ? 'vertical' : 'horizontal')
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    prefs.write({ orientations: map })
  }

  // The field switches are an input to layout: they decide how many rows a card takes. Change them
  // and the whole diagram is laid out again and the viewport re-fits.
  const graph = useMemo(
    () => buildFactGraph(spec, fields, undefined, orientation, { stagger }),
    [spec, fields, orientation, stagger],
  )

  // `fitKey` says when the *layout* changed: the canvas re-fits on it, not on every new graph object, so a
  // rebuild that only changes paint leaves the viewport where the reader put it (issue 273, as #21).
  const layoutKey = useMemo(
    () => ({ spec, fields, orientation, stagger }),
    [spec, fields, orientation, stagger],
  )

  // Overlay state: hoveredId is the card the mouse passed over, pinnedId is the card clicked open
  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  useSelectEvent(spec, pinnedId, setPinnedId)

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
          fitKey={layoutKey}
          nodeTypes={nodeTypes}
          // The grid lines assume rows of one height; staggered rows have none to show
          showGrid={showGrid && !graph.staggered}
          // Card padding comes from cardGeometry.js alone, through CSS variables. The type sizes
          // are the shared steps (theme/scale.js): the same numbers the character limit divides by.
          style={{
            '--antu-card-pad-x': `${CARD_PAD_X}px`,
            '--antu-card-pad-y': `${CARD_PAD_Y}px`,
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
            fields={fields}
            onToggleField={toggleField}
            orientation={orientation}
            onToggleOrientation={toggleOrientation}
            showGrid={showGrid}
            onToggleGrid={toggleGrid}
            stagger={stagger}
            onToggleStagger={toggleStagger}
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
