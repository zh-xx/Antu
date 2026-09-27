// ============================================================
//  src/renderers/procedure/flow/FlowRenderer.jsx — the flowchart
//
//  This file owns the "flowchart" way of drawing a procedure:
//    1. lay the spec out (flow/layout.js, pure computation, unit-tested)
//    2. hold the presentation state: orientation and the four switches of §6.2
//    3. hand the nodes, the overlay state and the control dock to the canvas shell
//
//  Like the timeline, it **does not touch React Flow**: viewport, zoom, minimap and export
//  live in shell/Canvas.jsx. And like the timeline, links are not React Flow edges but one
//  self-drawn layer (ConnectionLayerNode), for the reasons in spec/procedure/schema-draft.md §6.1.
//
//  What reaches React Flow, in drawing order (later ones sit on top):
//    stage bands → link layer → nodes
//  The two decoration layers are added here, not in layout.js: layout's `nodes` stays exactly
//  "one per node of the data", which is what its unit tests pin.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { readPrefs, writePrefs } from '../../../shell/prefs.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useExport } from '../../../shell/useExport.js'
import FlowNode from './FlowNode.jsx'
import ConnectionLayerNode from './ConnectionLayerNode.jsx'
import StageBandNode from './StageBandNode.jsx'
import FlowDock from './FlowDock.jsx'
import { buildProcedureGraph } from './layout.js'
import { PAD } from './metrics.js'

/** Node types used by the flowchart. Adding one means registering one line here. */
const nodeTypes = {
  pnode: FlowNode,
  plinks: ConnectionLayerNode,
  pstages: StageBandNode,
}

/**
 * Defaults for the switches. All on: a first look should show everything the data says.
 * Stored under their own preference key, apart from the timeline's card fields: the two
 * sets share no switch, and one key for both would make each overwrite the other.
 */
const FIELD_DEFAULTS = { conditions: true, detail: true, mainLine: true, stages: true }

/** Attributes shared by decoration nodes; for why 1×1, see cellsNode in fact/timeline/nodes.js */
const DECORATION = {
  width: 1,
  height: 1,
  draggable: false,
  selectable: false,
  connectable: false,
  focusable: false,
  style: { pointerEvents: 'none' },
}

/** External preset: used only by MCP's antu_preview (same convention as the timeline) */
const PRESET = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null

export default function ProcedureFlow({ spec }) {
  const specKey = spec?.title || ''
  const hasStages = Array.isArray(spec?.stages) && spec.stages.length > 0

  const [fields, setFields] = useState(() => ({
    ...FIELD_DEFAULTS,
    ...readPrefs().flowFields,
    ...(PRESET?.fields || {}),
  }))
  const toggleField = (key, value) => {
    setFields((f) => ({ ...f, [key]: value }))
    writePrefs({ flowFields: { ...readPrefs().flowFields, [key]: value } })
  }

  // Orientation: remembered per diagram, as with the timeline. With nothing chosen a
  // flowchart reads top to bottom (§6.1): the main line runs down the centre of the screen.
  const [orientationPrefs, setOrientationPrefs] = useState(() => readPrefs().orientations || {})
  const orientation = PRESET?.orientation || orientationPrefs[specKey] || 'vertical'
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    writePrefs({ orientations: map })
  }
  const vertical = orientation !== 'horizontal'

  // Only the switches that move geometry go into layout: detail changes what a node shows,
  // stages reserve the gutter. Condition labels and the main-line highlight are paint only,
  // so toggling them re-draws the link layer without re-fitting the viewport.
  const layout = useMemo(
    () => buildProcedureGraph(spec, { detail: fields.detail, stages: fields.stages }, undefined, orientation),
    [spec, fields.detail, fields.stages, orientation],
  )

  const graph = useMemo(() => {
    const { width, height } = layout.size
    const deco = []
    if (layout.stageBands.length) {
      deco.push({
        ...DECORATION,
        id: '__stages__',
        type: 'pstages',
        position: { x: 0, y: 0 },
        data: { bands: layout.stageBands, pad: PAD, gutter: layout.gutter, width, height, vertical },
      })
    }
    deco.push({
      ...DECORATION,
      id: '__plinks__',
      type: 'plinks',
      position: { x: 0, y: 0 },
      data: {
        connections: layout.connections,
        width,
        height,
        showConditions: fields.conditions,
        highlightMain: fields.mainLine,
      },
    })
    return { nodes: [...deco, ...layout.nodes], edges: [], size: layout.size }
  }, [layout, vertical, fields.conditions, fields.mainLine])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  const preview = useMemo(
    () => ({
      hoveredId,
      pinnedId,
      pin: (id) => setPinnedId(id),
      unpin: () => setPinnedId(null),
    }),
    [hoveredId, pinnedId],
  )

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className="antu-procedure">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          nodeTypes={nodeTypes}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'pnode') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => {
            setHoveredId((cur) => (cur === n.id ? null : cur))
          }}
          onNodeClick={(_, n) => {
            if (n.type === 'pnode') setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <FlowDock
            fields={fields}
            onToggleField={toggleField}
            hasStages={hasStages}
            orientation={orientation}
            onToggleOrientation={toggleOrientation}
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
