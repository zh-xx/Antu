// ============================================================
//  src/renderers/relationship/graph/RelationshipRenderer.jsx — the relationship graph
//
//  This file owns the "graph" way of drawing a relationship diagram:
//    1. lay the spec out (graph/layout.js, pure computation, unit-tested)
//    2. hold the presentation state: orientation, link style, which kinds are shown, labels, groups
//    3. hand the entities, the decoration layers and the control dock to the canvas shell
//
//  Like the flowchart it **does not touch React Flow**: viewport, zoom, minimap and export live in
//  shell/Canvas.jsx, and the links are one self-drawn layer (ConnectionLayerNode).
//
//  What reaches React Flow, in drawing order (later ones sit on top):
//    group boxes → link layer → entities
//
//  Two kinds of state, kept apart on purpose:
//    · what changes the geometry (orientation, the group boxes) goes into layout and re-fits the view;
//    · what is paint only (which kinds are drawn, the labels, the entity being looked at) never
//      touches layout, and `fitKey` tells the canvas so: looking at something must not throw a
//      zoomed-in reader back to the overview (issue #21), and switching a kind off must not move
//      anything.
// ============================================================

import { useMemo, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { useEnv, usePreset, usePrefs } from '../../../shell/env.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useExport } from '../../../shell/useExport.js'
import { useLang } from '../../../shell/LangContext.jsx'
import EntityNode from './EntityNode.jsx'
import ConnectionLayerNode from './ConnectionLayerNode.jsx'
import GroupBoxNode from './GroupBoxNode.jsx'
import RelationshipDock from './RelationshipDock.jsx'
import { buildRelationshipGraph } from './layout.js'
import { lookedAt } from './secures.js'
import { OPEN_MAX_ZOOM } from './metrics.js'
import { useSelectEvent } from '../../../shell/useSelectEvent.js'
import { useSpecPref } from '../useSpecPref.js'

/** Node types used by the graph. Adding one means registering one line here. */
const nodeTypes = {
  rnode: EntityNode,
  rlinks: ConnectionLayerNode,
  rgroups: GroupBoxNode,
}

/** Defaults: everything on. A first look should show everything the data says. */
const FIELD_DEFAULTS = { labels: true, groups: true, hiddenKinds: [] }

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

export default function RelationshipGraph({ spec }) {
  // External preset: used only by MCP's antu_preview (same convention as the other renderers)
  // (read through usePreset, shell/env.js: the viewer page's window.__ANTU_PRESET__, none when mounted)
  const PRESET = usePreset()
  const prefs = usePrefs()
  // Namespaced: the flowchart keys its remembered choices by title too, and two diagrams of
  // different types may share a title
  const specKey = `rel:${spec?.title || ''}`
  const hasGroups = Array.isArray(spec?.groups) && spec.groups.length > 0
  const { t, lang } = useLang()

  // What to show is a choice about this data, so it is remembered per diagram (as in the flowchart)
  // (a preview's preset gives the first values; the controls still work after it)
  const [stored, setStored] = useSpecPref('relationshipFieldsByDiagram', specKey, (was) => (PRESET?.fields ? { ...was, ...PRESET.fields } : was))
  const fields = { ...FIELD_DEFAULTS, ...stored }
  const setField = (patch) => setStored({ ...stored, ...patch })
  const toggleKind = (kind) => {
    const hidden = fields.hiddenKinds.includes(kind) ? fields.hiddenKinds.filter((k) => k !== kind) : [...fields.hiddenKinds, kind]
    setField({ hiddenKinds: hidden })
  }

  // Orientation: remembered per diagram. With nothing chosen a holder stands above what it holds.
  const [orientationPref, toggleOrientation] = useSpecPref('orientations', specKey, (was) => PRESET?.orientation || was)
  const orientation = orientationPref || 'vertical'

  // Link style: curved (the default) or straight, one choice for every diagram, remembered
  const [linkStyle, setLinkStyle] = useState(() => PRESET?.linkStyle || prefs.read().linkStyle || 'curved')
  const toggleLinkStyle = (next) => {
    setLinkStyle(next)
    prefs.write({ linkStyle: next })
  }

  // Only the switches that move geometry go into layout: the group boxes turn camps into columns;
  // the interface language changes the default text on a relation and so the size of its label
  const layout = useMemo(
    () => buildRelationshipGraph(spec, { groups: fields.groups, t }, undefined, orientation),
    // `t` follows `lang`, so the language is what the layout depends on
    [spec, fields.groups, orientation, lang],
  )

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  useSelectEvent(spec, pinnedId, setPinnedId)
  // The pinned card can hand its party to the focus view: it is remembered as the centre, then the kind is switched
  const { commands } = useEnv()
  const preview = useMemo(
    () => ({
      hoveredId,
      pinnedId,
      pin: (id) => setPinnedId(id),
      unpin: () => setPinnedId(null),
      focusOn: (id) => {
        prefs.write({ relationshipCentres: { ...(prefs.read().relationshipCentres || {}), [specKey]: id } })
        setPinnedId(null)
        commands.run('setKind', 'focus')
      },
    }),
    [hoveredId, pinnedId, specKey, prefs, commands],
  )
  // The entity being looked at (pinned, else hovered): the relations that touch it stay, the rest fade
  const litEntity = pinnedId ?? hoveredId

  const graph = useMemo(() => {
    const { width, height } = layout.size
    const deco = []
    if (layout.groupBoxes.length) {
      deco.push({ ...DECORATION, id: '__groups__', type: 'rgroups', position: { x: 0, y: 0 }, data: { boxes: layout.groupBoxes, width, height } })
    }
    deco.push({
      ...DECORATION,
      id: '__rlinks__',
      type: 'rlinks',
      position: { x: 0, y: 0 },
      data: {
        connections: layout.connections,
        width,
        height,
        hiddenKinds: fields.hiddenKinds,
        showLabels: fields.labels,
        curved: linkStyle === 'curved',
        litEntity,
      },
    })
    const seen = litEntity ? lookedAt(layout.connections, litEntity).entities : null
    const nodes = seen ? layout.nodes.map((n) => ({ ...n, data: { ...n.data, lit: n.id === litEntity, dim: !seen.has(n.id) } })) : layout.nodes
    return { nodes: [...deco, ...nodes], edges: [], size: layout.size }
  }, [layout, fields.hiddenKinds, fields.labels, linkStyle, litEntity])

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className="antu-relationship">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitKey={layout}
          fitMaxZoom={OPEN_MAX_ZOOM}
          nodeTypes={nodeTypes}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'rnode') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => {
            setHoveredId((cur) => (cur === n.id ? null : cur))
          }}
          onNodeClick={(_, n) => {
            if (n.type === 'rnode') setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <RelationshipDock
            kinds={layout.stats.kinds}
            hiddenKinds={fields.hiddenKinds}
            onToggleKind={toggleKind}
            showLabels={fields.labels}
            onToggleLabels={(v) => setField({ labels: v })}
            hasGroups={hasGroups}
            showGroups={fields.groups}
            onToggleGroups={(v) => setField({ groups: v })}
            orientation={orientation}
            onToggleOrientation={toggleOrientation}
            linkStyle={linkStyle}
            onToggleLinkStyle={toggleLinkStyle}
            exporting={exporting}
            onExport={onExport}
          />
        </Canvas>
      </PreviewContext.Provider>
    </div>
  )
}
