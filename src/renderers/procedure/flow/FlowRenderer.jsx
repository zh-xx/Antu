// @ts-check
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
//    stage boxes → link layer → nodes
//  The two decoration layers are added here, not in layout.js: layout's `nodes` stays exactly
//  "one per node of the data", which is what its unit tests pin.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { usePrefs, useViewValue } from '../../../shell/env.js'
import { specKeyOf } from '../../../shell/prefs.js'
import { useSpecPref } from '../../relationship/useSpecPref.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useExport } from '../../../shell/useExport.js'
import FlowNode from './FlowNode.jsx'
import RuleTableNode from './RuleTableNode.jsx'
import ConnectionLayerNode from './ConnectionLayerNode.jsx'
import StageBoxNode from './StageBoxNode.jsx'
import FlowDock from './FlowDock.jsx'
import { layoutProcedureAsync } from './layoutAsync.js'
import { useSelectEvent } from '../../../shell/useSelectEvent.js'

/**
 * Placeholder until the async layout finishes (issue 330); keeps the canvas mounted.
 * Typed loosely so the empty arrays are not inferred as `never[]`.
 * @type {{
 *   errors: string[],
 *   hints: string[],
 *   orientation: string,
 *   nodes: any[],
 *   edges: any[],
 *   connections: any[],
 *   rows: any[],
 *   spine: any[],
 *   stageBoxes: any[],
 *   ruleTable: any,
 *   size: { width: number, height: number },
 *   stats: Record<string, number>,
 * }}
 */
const EMPTY_LAYOUT = {
  errors: [],
  hints: [],
  orientation: 'vertical',
  nodes: [],
  edges: [],
  connections: [],
  rows: [],
  spine: [],
  stageBoxes: [],
  ruleTable: null,
  size: { width: 0, height: 0 },
  stats: { nodes: 0, edges: 0, connections: 0, layers: 0, widest: 0, backEdges: 0, decisions: 0, ends: 0, groupedEdges: 0 },
}

/** Node types used by the flowchart. Adding one means registering one line here. */
const nodeTypes = {
  pnode: FlowNode,
  prtable: RuleTableNode,
  plinks: ConnectionLayerNode,
  pstages: StageBoxNode,
}

/** Wide flows open at this zoom from the left (same floor as the route map; issue 166) */
const OPEN_MIN_ZOOM = 0.7

/**
 * Defaults for the switches. Most are on: a first look should show everything the data says. The rule table
 * opens off (issue 235), one click away when the data has rules. Stored under their own preference key, apart
 * from the timeline's card fields: the two sets share no switch, and one key for both would make each overwrite
 * the other.
 */
const FIELD_DEFAULTS = { conditions: true, detail: true, mainLine: true, stages: true, rules: false }
/** The States switch starts on in every theme (issue 235); kept as a function so a caller's shape does not change */
export const statesByDefault = () => true

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

export default function ProcedureFlow({ spec }) {
  const prefs = usePrefs()
  const specKey = specKeyOf(spec)
  const hasStages = Array.isArray(spec?.stages) && spec.stages.length > 0
  const hasRules = Array.isArray(spec?.rules) && spec.rules.length > 0

  // The switches are remembered per diagram, like the orientation: what to show is a choice about
  // this data (many diagrams have no stages at all), so turning stages off on one must not turn
  // them off everywhere (issue #22)
  const [fieldPrefs, setFieldPrefs] = useState(() => prefs.read().flowFieldsByDiagram || {})
  const storedFields = fieldPrefs[specKey] || {}

  // Every switch goes through the view state (issue 200): a host's `initial`/`locked`/`persist`, the page's
  // preset and the reader's own click are resolved in one place; `statesByDefault` stays the fallback
  const conditionsView = useViewValue('view.flow.conditions', storedFields.conditions, FIELD_DEFAULTS.conditions)
  const detailView = useViewValue('view.flow.detail', storedFields.detail, FIELD_DEFAULTS.detail)
  const mainLineView = useViewValue('view.flow.mainLine', storedFields.mainLine, FIELD_DEFAULTS.mainLine)
  const statesView = useViewValue('view.flow.states', storedFields.states, statesByDefault())
  const stagesView = useViewValue('view.flow.stages', storedFields.stages, FIELD_DEFAULTS.stages)
  const rulesView = useViewValue('view.flow.rules', storedFields.rules, FIELD_DEFAULTS.rules)
  // Layout engine: 'current' (ELK) or 'mainline' (spine-first prototype, issue 190).
  // Mainline always applies when chosen; Stages on folds columns, Stages off → one straight trunk.
  const engineView = useViewValue('view.flow.engine', storedFields.engine, 'current')
  const fieldView = { conditions: conditionsView, detail: detailView, mainLine: mainLineView, states: statesView, stages: stagesView, rules: rulesView }
  const fields = Object.fromEntries(Object.entries(fieldView).map(([key, view]) => [key, view.value]))
  const engine = engineView.value === 'mainline' ? 'mainline' : 'current'
  const toggleField = (key, value) => {
    fieldView[key].touch()
    const map = { ...fieldPrefs, [specKey]: { ...fieldPrefs[specKey], [key]: value } }
    setFieldPrefs(map)
    prefs.write({ flowFieldsByDiagram: map })
  }
  // Trial layout engine is toggled from the label-card About panel (not the dock). Re-read when it writes.
  useEffect(() => {
    const sync = (/** @type {CustomEvent} */ ev) => {
      if (ev.detail?.specKey && ev.detail.specKey !== specKey) return
      setFieldPrefs(prefs.read().flowFieldsByDiagram || {})
    }
    window.addEventListener('antu:flow-fields', sync)
    return () => window.removeEventListener('antu:flow-fields', sync)
  }, [prefs, specKey])

  // Orientation: remembered per diagram, as with the timeline. With nothing chosen a
  // flowchart reads top to bottom (§6.1): the main line runs down the centre of the screen.
  const [orientationPrefs, setOrientationPrefs] = useState(() => prefs.read().orientations || {})
  const orientationView = useViewValue('view.flow.orientation', orientationPrefs[specKey], 'vertical')
  const orientation = typeof orientationView.value === 'string' ? orientationView.value : 'vertical'
  const toggleOrientation = (next) => {
    orientationView.touch()
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    prefs.write({ orientations: map })
  }

  // Link style: curved (the reader's choice: it reads softer, like Mermaid) or straight (orthogonal). Both draw
  // the same route. Remembered per diagram now (issue 236), in the same map every renderer uses.
  const [linkStyle, setLinkStyle] = useSpecPref('linkStyle', specKey)
  const linkStyleView = useViewValue('view.flow.linkStyle', linkStyle, 'straight')
  const linkStyleValue = typeof linkStyleView.value === 'string' ? linkStyleView.value : 'straight'
  const toggleLinkStyle = (next) => {
    linkStyleView.touch()
    setLinkStyle(next)
  }

  // Geometry yields to the event loop while it runs (issue 330). Keep the last layout on
  // screen while a toggle recomputes, so the page stays interactive. Detail / stages / rules /
  // engine move geometry; condition labels and the main-line highlight are paint only.
  const [layout, setLayout] = useState(EMPTY_LAYOUT)
  const layoutReq = useRef(0)
  useEffect(() => {
    const id = ++layoutReq.current
    let cancelled = false
    layoutProcedureAsync(
      spec,
      { detail: fields.detail, stages: fields.stages, rules: fields.rules, engine },
      orientation,
    ).then((next) => {
      if (!cancelled && id === layoutReq.current) setLayout(next)
    })
    return () => {
      cancelled = true
    }
  }, [spec, fields.detail, fields.stages, fields.rules, engine, orientation])

  const [hoveredId, setHoveredId] = useState(/** @type {string | null} */ (null))
  const [pinnedId, setPinnedId] = useState(/** @type {string | null} */ (null))
  useSelectEvent(spec, pinnedId, setPinnedId)
  const preview = useMemo(
    () => ({
      hoveredId,
      pinnedId,
      pin: (id) => setPinnedId(id),
      unpin: () => setPinnedId(null),
      // The rule table's rows are not canvas nodes of their own, so they report hover themselves
      hover: (id) => setHoveredId(id),
    }),
    [hoveredId, pinnedId],
  )

  // The rule being looked at (pinned, else hovered): its stage boxes and its end light up, which
  // is how a row of the table points into the diagram
  const activeRule = useMemo(() => {
    const id = pinnedId?.startsWith('rule:') ? pinnedId : !pinnedId && hoveredId?.startsWith('rule:') ? hoveredId : null
    return id ? (spec.rules ?? []).find((r) => `rule:${r.id}` === id) ?? null : null
  }, [hoveredId, pinnedId, spec])

  const graph = useMemo(() => {
    const { width, height } = layout.size
    const deco = []
    const litStages = activeRule ? (activeRule.stageIds?.length ? activeRule.stageIds : layout.stageBoxes.map((b) => b.stageId)) : []
    if (layout.stageBoxes.length) {
      deco.push({
        ...DECORATION,
        id: '__stages__',
        type: 'pstages',
        position: { x: 0, y: 0 },
        data: { boxes: layout.stageBoxes, width, height, lit: litStages },
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
        curved: linkStyleValue === 'curved',
      },
    })
    const nodes = layout.nodes.map((n) => ({ ...n, data: { ...n.data, states: fields.states, lit: n.id === activeRule?.endId || n.data.lit } }))
    // The rule table: one node, not draggable, its rows hover and pin themselves
    const table = layout.ruleTable
      ? [
          {
            id: '__rules__',
            type: 'prtable',
            position: { x: layout.ruleTable.x, y: layout.ruleTable.y },
            width: layout.ruleTable.w,
            height: layout.ruleTable.h,
            draggable: false,
            selectable: false,
            connectable: false,
            focusable: false,
            data: { table: layout.ruleTable, domain: spec.domain, sourceById: new Map((spec.sources ?? []).map((s) => [s.id, s])) },
          },
        ]
      : []
    return { nodes: [...deco, ...nodes, ...table], edges: [], size: layout.size }
  }, [layout, spec, fields.conditions, fields.mainLine, fields.states, linkStyleValue, activeRule])

  const { canvasRef, exporting, onExport } = useExport(spec?.title)
  // Which controls a host locked (issue 200): FlowDock leaves exactly those out
  const locked = {
    ...Object.fromEntries(Object.entries(fieldView).filter(([, view]) => view.locked).map(([key]) => [key, true])),
    orientation: orientationView.locked,
    linkStyle: linkStyleView.locked,
  }

  return (
    <div className="antu-procedure">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitKey={layout}
          fitMinZoom={OPEN_MIN_ZOOM}
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
            hasRules={hasRules}
            orientation={orientation}
            onToggleOrientation={toggleOrientation}
            linkStyle={linkStyleValue}
            onToggleLinkStyle={toggleLinkStyle}
            locked={locked}
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
