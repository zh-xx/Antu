// ============================================================
//  src/renderers/justification/tree/JustificationRenderer.jsx — the justification tree
//
//  This file owns the "tree" way of drawing a justification diagram:
//    1. lay the spec out (tree/layout.js, pure computation, unit-tested)
//    2. hold the presentation state: orientation, link style, labels, the node being looked at
//    3. hand the nodes, the decoration layers and the control dock to the canvas shell
//
//  Like the relationship graph it **does not touch React Flow**: viewport, zoom, minimap and export
//  live in shell/Canvas.jsx, and the links are one self-drawn layer (LinkLayerNode).
//
//  What reaches React Flow, in drawing order (later ones sit on top):
//    issue boxes → link layer → nodes
//
//  Two kinds of state, kept apart on purpose:
//    · what changes the geometry (the orientation) goes into layout and re-fits the view;
//    · what is paint only (the labels, the node being looked at) never touches layout, and `fitKey`
//      tells the canvas so: looking at something must not throw a zoomed-in reader back to the
//      overview (issue #21).
// ============================================================

import { useMemo, useRef, useState } from 'react'

import Canvas from '../../../shell/Canvas.jsx'
import { readPrefs, writePrefs } from '../../../shell/prefs.js'
import { PreviewContext } from '../../../shell/previewContext.js'
import { useExport } from '../../../shell/useExport.js'
import IssueBoxNode from './IssueBoxNode.jsx'
import { foldDefault } from './foldDefault.js'
import JustificationNode from './JustificationNode.jsx'
import LinkLayerNode from './LinkLayerNode.jsx'
import JustificationDock from './JustificationDock.jsx'
import { buildJustificationGraph } from './layout.js'
import { chainOf } from './chain.js'

/** Node types used by the tree. Adding one means registering one line here. */
const nodeTypes = {
  jnode: JustificationNode,
  jlinks: LinkLayerNode,
  jgroups: IssueBoxNode,
}

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

/** External preset: used only by MCP's antu_preview (same convention as the other renderers) */
const PRESET = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null

export default function JustificationTree({ spec }) {
  // Namespaced: the other diagrams key their remembered choices by title too, and two diagrams of
  // different types may share a title
  const specKey = `jus:${spec?.title || ''}`
  const hasLabels = Array.isArray(spec?.links) && spec.links.some((k) => k?.label)

  // Labels: remembered per diagram, on to begin with (a first look should show what the data says)
  const [labelPrefs, setLabelPrefs] = useState(() => readPrefs().justificationLabels || {})
  const showLabels = PRESET?.fields?.labels ?? labelPrefs[specKey] ?? true
  const toggleLabels = (v) => {
    const map = { ...labelPrefs, [specKey]: v }
    setLabelPrefs(map)
    writePrefs({ justificationLabels: map })
  }

  // Orientation: remembered per diagram. With nothing chosen the conclusion stands at the left.
  const [orientationPrefs, setOrientationPrefs] = useState(() => readPrefs().orientations || {})
  const orientation = PRESET?.orientation || orientationPrefs[specKey] || 'horizontal'
  const toggleOrientation = (next) => {
    const map = { ...orientationPrefs, [specKey]: next }
    setOrientationPrefs(map)
    writePrefs({ orientations: map })
  }

  // Link style: curved (the default) or straight, one choice for every diagram, remembered
  const [linkStyle, setLinkStyle] = useState(() => PRESET?.linkStyle || readPrefs().linkStyle || 'curved')
  const toggleLinkStyle = (next) => {
    setLinkStyle(next)
    writePrefs({ linkStyle: next })
  }

  // Issues folded up: remembered per diagram. They change the geometry, so they go into layout and re-fit the view.
  const issueIds = useMemo(() => (Array.isArray(spec?.groups) ? spec.groups.map((g) => g?.id).filter(Boolean) : []), [spec])
  const [foldPrefs, setFoldPrefs] = useState(() => readPrefs().justificationFolded || {})
  // Nothing chosen yet: a diagram whose text would be unreadable opens folded (foldDefault.js); the reader unfolds what is being read
  const openFolded = useMemo(() => foldDefault(spec, buildJustificationGraph).issues, [spec])
  const folded = useMemo(() => (PRESET?.fields?.collapsed ?? foldPrefs[specKey] ?? openFolded).filter((id) => issueIds.includes(id)), [foldPrefs, specKey, issueIds, openFolded])
  // The latest choice is kept in a ref too: two clicks before a render (a fast double click) must both count
  const foldedRef = useRef(folded)
  const foldMapRef = useRef(foldPrefs)
  const setFolded = (list) => {
    foldedRef.current = list
    foldMapRef.current = { ...foldMapRef.current, [specKey]: list }
    setFoldPrefs(foldMapRef.current)
    writePrefs({ justificationFolded: foldMapRef.current })
  }
  const toggleIssue = (id) => {
    const cur = foldedRef.current.filter((g) => issueIds.includes(g))
    setFolded(cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id])
  }
  const allFolded = issueIds.length > 0 && issueIds.every((id) => folded.includes(id))
  const toggleAll = () => setFolded(foldedRef.current.length === issueIds.length ? [] : issueIds)

  // Repeats: a fact used in several places of one issue is drawn beside each use, unless the reader merges them
  // (fewer nodes, longer lines). It changes the geometry, so it goes into layout and re-fits the view.
  const hasShared = useMemo(() => {
    const uses = new Map()
    const kinds = new Map((Array.isArray(spec?.nodes) ? spec.nodes : []).map((n) => [n?.id, n?.kind]))
    for (const k of Array.isArray(spec?.links) ? spec.links : []) {
      if (kinds.get(k?.from) === 'fact') uses.set(k.from, (uses.get(k.from) ?? 0) + 1)
    }
    return [...uses.values()].some((n) => n > 1)
  }, [spec])
  const [mergePrefs, setMergePrefs] = useState(() => readPrefs().justificationMerged || {})
  const merged = PRESET?.fields?.merged ?? mergePrefs[specKey] ?? false
  const toggleMerged = (v) => {
    const map = { ...mergePrefs, [specKey]: v }
    setMergePrefs(map)
    writePrefs({ justificationMerged: map })
  }

  const layout = useMemo(() => buildJustificationGraph(spec, { collapsed: folded, merged }, undefined, orientation), [spec, orientation, folded, merged])

  const [hoveredId, setHoveredId] = useState(null)
  const [pinnedId, setPinnedId] = useState(null)
  const preview = useMemo(
    () => ({ hoveredId, pinnedId, pin: (id) => setPinnedId(id), unpin: () => setPinnedId(null) }),
    [hoveredId, pinnedId],
  )
  // The node being looked at (pinned, else hovered): its chain stays, the rest fades
  const litNode = pinnedId ?? hoveredId

  const graph = useMemo(() => {
    const { width, height } = layout.size
    const deco = []
    if (layout.groupBoxes.length) {
      deco.push({ ...DECORATION, id: '__groups__', type: 'jgroups', position: { x: 0, y: 0 }, data: { boxes: layout.groupBoxes, width, height, onToggle: toggleIssue } })
    }
    const chain = litNode ? chainOf(layout.connections, layout.nodes, litNode) : null
    deco.push({
      ...DECORATION,
      id: '__jlinks__',
      type: 'jlinks',
      position: { x: 0, y: 0 },
      data: { connections: layout.connections, width, height, showLabels, curved: linkStyle === 'curved', litLines: chain ? chain.lines : null },
    })
    const nodes = chain
      ? layout.nodes.map((n) => ({ ...n, data: { ...n.data, lit: n.id === litNode, dim: !chain.nodes.has(n.id) } }))
      : layout.nodes
    return { nodes: [...deco, ...nodes], edges: [], size: layout.size }
  }, [layout, showLabels, linkStyle, litNode])

  const { canvasRef, exporting, onExport } = useExport(spec?.title)

  return (
    <div className="antu-justification">
      <PreviewContext.Provider value={preview}>
        <Canvas
          ref={canvasRef}
          graph={graph}
          fitKey={layout}
          nodeTypes={nodeTypes}
          onNodeMouseEnter={(_, n) => {
            if (n.type === 'jnode') setHoveredId(n.id)
          }}
          onNodeMouseLeave={(_, n) => {
            setHoveredId((cur) => (cur === n.id ? null : cur))
          }}
          onNodeClick={(_, n) => {
            if (n.type === 'jnode') setPinnedId(n.id)
          }}
          onPaneClick={() => setPinnedId(null)}
        >
          <JustificationDock
            hasShared={hasShared}
            merged={merged}
            onToggleMerged={toggleMerged}
            hasIssues={issueIds.length > 1}
            allFolded={allFolded}
            onToggleAll={toggleAll}
            hasLabels={hasLabels}
            showLabels={showLabels}
            onToggleLabels={toggleLabels}
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
