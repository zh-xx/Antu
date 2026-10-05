// ============================================================
//  src/shell/Canvas.jsx —— the canvas shell
//
//  Everything "unrelated to which diagram is drawn" lives here, written once:
//    the viewport (the React Flow container), zoom limits, pan extents,
//    the minimap, re-fitting on resize, writing node sizes back.
//
//  A renderer hands over only a graph and its own overlay content; it **never touches
//  React Flow**. That way adding a second rendering kind needs not one word rewritten here.
//
//  Node events (hover, click, pane click) are passed in by the renderer, because
//  "what a click should do" is the rendering kind's own business; this only forwards them.
// ============================================================

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Panel, useNodesState, useEdgesState } from '@xyflow/react'

import { useLang } from './LangContext.jsx'
import { useTheme, themeVars } from '../theme/ThemeContext.jsx'
import { FIT_PADDING, fitWidthZoom, fitZoom } from '../core/canvas.js'
import { exportPng as runExportPng } from './exportPng.js'

/** Zoom-in ceiling. It used to be 1:1, on the grounds that "zooming further only
 *  stretches the same pixels": true of the information content, false for
 *  readability, since with every field on the on-screen text is only 8px.
 *  The ceiling only exists to prevent absurd zoom levels. */
const MAX_ZOOM = 3

/** The pan range leaves this much on all four sides of the content: panning stops at the edge instead of sliding into blank space */
const PAN_PAD = 160

export default function Canvas({
  ref,
  graph,
  fitKey,
  fitWidth = false,
  fitSelf = false,
  fitMinZoom = 0,
  nodeTypes,
  showGrid = false,
  style,
  children,
  onNodeMouseEnter,
  onNodeMouseLeave,
  onNodeClick,
  onPaneClick,
}) {
  // Nodes must live in writable state: React Flow writes the measured sizes back onto
  // the nodes via onNodesChange, and everything that depends on size (the MiniMap and
  // the like) relies on that write-back.
  const { ariaLabels } = useLang()
  const { theme } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    // Replacing the whole set wipes React Flow's runtime state, of which selected
    // must survive: it weights the selected node (z-index 1000), and once wiped, a
    // pinned overlay is covered by a neighbouring card.
    // measured is deliberately not kept: the card height may have changed, so let it
    // be measured again.
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return graph.nodes.map((n) => {
        const old = prevById.get(n.id)
        return old?.selected ? { ...n, selected: true } : n
      })
    })
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  // `fitKey` says when the *layout* changed. Without it every new graph object re-fits, which is
  // right for a view switch but wrong for paint-only changes (a lit box while hovering a rule row):
  // they rebuilt the graph and threw a zoomed-in reader back to the overview (issue #21).
  //
  // The graph changed, so the viewport must be fitted again, or the bottom is cut
  // off-screen. fitView only runs once on init; this covers the later ones. Later fits
  // animate, so the view slides over instead of flashing (the first open does not
  // animate, otherwise the page moves by itself the moment it appears).
  const rfRef = useRef(null)
  // Fit to the size the layout computed (graph.size), not to what React Flow can measure: the decoration
  // layers are declared 1×1 (see fact/timeline/nodes.js), so their real extent — a group box wider than
  // its nodes — never reached fitView's bounds and was cut off (issue #42). graph.size is also what
  // fitZoom and the pan limits use, so the three now agree.
  const fit = (duration = 300) => {
    const { width, height } = graph.size
    if (!rfRef.current) return
    // A diagram read top to bottom (fitWidth) opens at the zoom that fits its width (never above
    // 1:1), scrolled to the top; one shorter than the screen is centred instead.
    const el = canvasRef.current
    if (fitWidth && width && height && el?.clientWidth && el?.clientHeight) {
      const viewport = { width: el.clientWidth, height: el.clientHeight }
      const zoom = fitWidthZoom(graph.size, viewport)
      const top = (viewport.height * FIT_PADDING) / 4
      const y = height * zoom + top * 2 <= viewport.height ? (viewport.height - height * zoom) / 2 : top
      rfRef.current.setViewport({ x: (viewport.width - width * zoom) / 2, y, zoom }, { duration })
      return
    }
    // A wide picture read left to right (fitMinZoom: the procedure route map) does not shrink below a readable
    // zoom: it opens at that zoom from the left, centred up and down, and the reader scrolls sideways
    if (fitMinZoom && width && height && el?.clientWidth && el?.clientHeight) {
      const viewport = { width: el.clientWidth, height: el.clientHeight }
      const whole = fitZoom(graph.size, viewport)
      if (whole < fitMinZoom) {
        const zoom = fitMinZoom
        const x = (viewport.width * FIT_PADDING) / 4
        const y = height * zoom + 16 <= viewport.height ? (viewport.height - height * zoom) / 2 : (viewport.height * FIT_PADDING) / 4
        rfRef.current.setViewport({ x, y, zoom }, { duration })
        return
      }
    }
    if (width && height) rfRef.current.fitBounds({ x: 0, y: 0, width, height }, { padding: FIT_PADDING, duration })
    else rfRef.current.fitView({ padding: FIT_PADDING, duration })
  }
  const firstFitRef = useRef(true)
  useEffect(() => {
    // Wait one frame so React Flow measures the new sizes first
    const id = requestAnimationFrame(() => {
      fit(firstFitRef.current ? 0 : 300)
      firstFitRef.current = false
    })
    return () => cancelAnimationFrame(id)
  }, [fitKey ?? graph])

  const translateExtent = useMemo(
    () => [
      [-PAN_PAD, -PAN_PAD],
      [graph.size.width + PAN_PAD, graph.size.height + PAN_PAD],
    ],
    [graph],
  )

  // Measure the real size of the canvas container to compute the zoom at which the
  // whole diagram just fits
  const canvasRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setCanvasSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The zoom floor is the factor at which the whole diagram just fits: shrinking below
  // a full overview is not allowed, or it becomes a small patch in the middle of the
  // window surrounded by blank space.
  // It is computed with the same function as fitView so the two numbers cannot drift
  // apart (see core/canvas.js).
  const minZoom = useMemo(() => {
    const { width, height } = canvasSize
    if (!width || !height) return 0.1
    return Math.max(fitZoom(graph.size, { width, height }), 0.05)
  }, [canvasSize, graph])

  // Why export lives here: it has to grab the .react-flow__viewport node, and this is
  // the only place in the project that knows what the canvas DOM looks like and how
  // large the content is (graph.size).
  // A renderer only receives an exportPng method and still never touches React Flow
  // (see spec/fact/rendering.md §10).
  useImperativeHandle(
    ref,
    () => ({
      exportPng: ({ title } = {}) => runExportPng({ rootEl: canvasRef.current, graph, title }),
    }),
    [graph],
  )

  // The theme reaches the diagram only: its CSS variables sit on the viewport (the layer the export clones), not on the
  // app root, so the shell round it keeps one look in every theme
  useEffect(() => {
    const viewport = canvasRef.current?.querySelector('.react-flow__viewport')
    if (!viewport) return
    for (const [k, v] of Object.entries(themeVars(theme))) viewport.style.setProperty(k, v)
  }, [theme, graph])

  return (
    <main
      className={`antu-canvas${showGrid ? ' show-grid' : ''}`}
      ref={canvasRef}
      style={style}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        ariaLabelConfig={ariaLabels}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        // Both trackpad and mouse should feel right, following the usual convention
        // "scroll = pan, with a modifier = zoom":
        //   two-finger swipe / wheel         → pan (panOnScroll)
        //   pinch / Ctrl(Cmd)+wheel          → zoom (zoomOnPinch, a path independent of the wheel)
        //   press and drag                   → pan
        panOnScroll
        panOnScrollMode="free"
        panOnScrollSpeed={1}
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag
        translateExtent={translateExtent}
        onInit={(inst) => {
          rfRef.current = inst
        }}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        // A diagram whose content is mostly decoration layers (fitSelf: the relation path, the camp summary) is
        // fitted to graph.size by fit() alone, not to the boxes React Flow can measure.
        // A width-fitted diagram is placed by fit() alone: React Flow's own initial fit runs once the nodes are
        // measured, which can come after fit() and would shrink a long column back to the whole
        fitView={!fitWidth && !fitSelf}
        fitViewOptions={{ padding: FIT_PADDING }}
        minZoom={minZoom}
        maxZoom={MAX_ZOOM}
      >
        {/* The shell (dot grid, zoom, minimap, dock) is not themed: only the diagram is; its variables are set on the viewport below */}
        <Background gap={20} color="#e8ebef" />
        {/* The padding must match the initial fit, or clicking the button once makes the zoom jump */}
        <Controls showInteractive={false} onFitView={() => fit(300)} />
        {/* The display controls float centred below the canvas: the zoom controls are bottom left and the minimap bottom right, so the three do not collide */}
        <Panel position="bottom-center">{children}</Panel>
        <MiniMap pannable zoomable nodeColor="#cbd5e1" />
      </ReactFlow>
    </main>
  )
}
