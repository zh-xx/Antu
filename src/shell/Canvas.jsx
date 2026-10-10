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

import { useContext, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Panel, useNodesState, useEdgesState } from '@xyflow/react'

import { useLang } from './LangContext.jsx'
import { useTheme, themeVars } from '../theme/ThemeContext.jsx'
import { FIT_PADDING, fitWidthZoom, fitZoom } from '../core/canvas.js'
import { EXPORT_CLASS, exportPng as runExportPng, renderPng } from './exportPng.js'
import { ShownSpecContext, useEnv, useUi } from './env.js'
import { nodesOfItem, pinTargetOf } from '../core/items.js'
import { placeDock } from './dockPlace.js'

/** React Flow's minimap width plus its border, until one has been measured */
const MINIMAP_WIDTH = 202

/**
 * The capsule's width on one line, whether or not it is wrapped now: its items side by side with their margins
 * (the separators have some), the gaps between them, its padding and border. (A wrapped bar's own width says
 * nothing about how wide it would be unwrapped.)
 */
function oneLineWidth(bar) {
  const px = (style, keys) => keys.reduce((s, k) => s + (parseFloat(style[k]) || 0), 0)
  const cs = getComputedStyle(bar)
  const items = [...bar.children].filter((c) => getComputedStyle(c).position !== 'absolute')
  const gap = parseFloat(cs.columnGap) || 0
  const width = items.reduce((s, c) => s + c.getBoundingClientRect().width + px(getComputedStyle(c), ['marginLeft', 'marginRight']), 0)
  return Math.ceil(width + gap * Math.max(items.length - 1, 0) + px(cs, ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']))
}

/** Zoom-in ceiling. It used to be 1:1, on the grounds that "zooming further only
 *  stretches the same pixels": true of the information content, false for
 *  readability, since with every field on the on-screen text is only 8px.
 *  The ceiling only exists to prevent absurd zoom levels. */
const MAX_ZOOM = 3

/** The pan range leaves this much on all four sides of the content: panning stops at the edge instead of sliding into blank space */
const PAN_PAD = 160

/** The whole picture as one empty node, for the minimap alone (see miniGhost below) */
const MiniGhost = () => null
const MINI_GHOST_ID = '__minimap__'
const miniGhost = ({ width, height }) => ({
  id: MINI_GHOST_ID,
  type: 'miniGhost',
  position: { x: 0, y: 0 },
  width: Math.max(1, width),
  height: Math.max(1, height),
  draggable: false,
  selectable: false,
  connectable: false,
  focusable: false,
  data: {},
  style: { pointerEvents: 'none', visibility: 'hidden' },
})
const miniColor = (node) => (node.id === MINI_GHOST_ID ? '#eef1f5' : '#cbd5e1')

/** The element an item's node stands at: a canvas node, or a row of the flowchart's rule table (`rule:<id>`) */
const selectorOf = (id) =>
  id.startsWith('rule:') ? `[data-pin-id="${CSS.escape(id)}"]` : `.react-flow__node[data-id="${CSS.escape(id)}"]`

export default function Canvas({
  ref,
  graph,
  fitKey,
  fitWidth = false,
  fitSelf = false,
  fitMinZoom = 0,
  fitMaxZoom = 0,
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
  // The decoration layers are declared 1×1 (see fact/timeline/nodes.js), so the minimap saw nothing of a picture drawn
  // only by layers (the route map, the relation path): one empty node as large as the picture gives it its extent
  const allNodeTypes = useMemo(() => ({ ...nodeTypes, miniGhost: MiniGhost }), [nodeTypes])
  const { theme } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState([miniGhost(graph.size), ...graph.nodes])
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)

  useEffect(() => {
    // Replacing the whole set wipes React Flow's runtime state, of which selected
    // must survive: it weights the selected node (z-index 1000), and once wiped, a
    // pinned overlay is covered by a neighbouring card.
    // measured is deliberately not kept: the card height may have changed, so let it
    // be measured again.
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      return [miniGhost(graph.size), ...graph.nodes].map((n) => {
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
  // Whether fit() has placed the picture yet. The first attempt is made one frame after mount, which can come before
  // React Flow hands over its instance (onInit); fit() then did nothing, and the page stayed at React Flow's default
  // viewport, only centred by the pan limits (a long chronicle opened at its very top, with no margin). onInit runs the
  // first fit when that happened.
  const fittedRef = useRef(false)
  const fit = (duration = 300) => {
    const { width, height } = graph.size
    if (!rfRef.current) return
    fittedRef.current = true
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
    // A small picture does not open enlarged to fill the screen (fitMaxZoom: the relationship graph and focus view):
    // the text stays about the size it was drawn at, centred, and the rest of the screen is left empty
    if (fitMaxZoom && width && height && el?.clientWidth && el?.clientHeight) {
      const viewport = { width: el.clientWidth, height: el.clientHeight }
      const whole = Math.min(viewport.width / (width * (1 + FIT_PADDING)), viewport.height / (height * (1 + FIT_PADDING)))
      if (whole > fitMaxZoom) {
        const zoom = fitMaxZoom
        rfRef.current.setViewport({ x: (viewport.width - width * zoom) / 2, y: (viewport.height - height * zoom) / 2, zoom }, { duration })
        return
      }
    }
    if (width && height) rfRef.current.fitBounds({ x: 0, y: 0, width, height }, { padding: FIT_PADDING, duration })
    else rfRef.current.fitView({ padding: FIT_PADDING, duration })
  }
  const firstFitRef = useRef(true)
  const { drawn } = useEnv()
  // whether the first fit has run: a host's select and focus wait for it (held by the command bus till then)
  const [placed, setPlaced] = useState(false)
  useEffect(() => {
    // Wait one frame so React Flow measures the new sizes first
    const id = requestAnimationFrame(() => {
      const first = firstFitRef.current
      fit(first ? 0 : 300)
      firstFitRef.current = false
      // the diagram is on the screen and fitted: a host waiting on `ready` may now take its picture
      if (first) {
        drawn()
        setPlaced(true)
      }
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

  // A host that mounted the diagram (src/embed/) asks the canvas for these two; on the viewer page nobody does
  const { commands } = useEnv()
  // the latest fit, read when the command comes
  const fitRef = useRef(fit)
  fitRef.current = fit
  useEffect(() => {
    const offFit = commands.on('fitView', () => fitRef.current(300))
    const offPng = commands.on('exportPng', ({ pixelRatio } = {}) => renderPng({ rootEl: canvasRef.current, graph, pixelRatio }))
    return () => {
      offFit()
      offPng()
    }
  }, [commands, graph])

  // A host names items of its spec (issue 164): `select` pins the card of one as a click would, `focus` brings it
  // into view, `highlight` rings them. An item is found among the canvas nodes the way `select` events name them
  // back (core/items.js); a rule of the flowchart is a row of its table, found by its `data-pin-id`.
  const shownSpec = useContext(ShownSpecContext)
  const { highlight } = useEnv()
  const latestRef = useRef(null)
  latestRef.current = { spec: shownSpec, graph, minZoom }
  useEffect(() => {
    if (!placed) return undefined
    const elementOf = (id) => canvasRef.current?.querySelector(selectorOf(id))
    const markSelected = (target) =>
      setNodes((prev) => prev.map((n) => (!!n.selected === (n.id === target) ? n : { ...n, selected: n.id === target })))
    const offSelect = commands.on('select', (id) => {
      // a kind no reader can pin anything in (the route map) has nobody to answer
      if (!commands.has('pin')) return false
      if (id === null) {
        commands.run('pin', null)
        markSelected(null)
        return true
      }
      const { spec, graph: g } = latestRef.current
      const target = pinTargetOf(spec, g.nodes, id)
      if (!target || !elementOf(target)) return false
      commands.run('pin', target)
      markSelected(target)
      return true
    })
    const offFocus = commands.on('focus', (id) => {
      const { spec, graph: g, minZoom: floor } = latestRef.current
      const el = nodesOfItem(spec, g.nodes, id).map(elementOf).find(Boolean)
      const rf = rfRef.current
      const box = canvasRef.current?.getBoundingClientRect()
      if (!el || !rf || !box?.width) return false
      const rect = el.getBoundingClientRect()
      const zoom = rf.getZoom()
      const centre = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      // the zoom stays, unless the item would not fit in the window at it
      const fits = Math.min((box.width * 0.9 * zoom) / rect.width, (box.height * 0.9 * zoom) / rect.height)
      rf.setCenter(centre.x, centre.y, { zoom: Math.max(Math.min(zoom, fits), floor), duration: 300 })
      return true
    })
    return () => {
      offSelect()
      offFocus()
    }
  }, [placed, commands, setNodes])
  const marked = useSyncExternalStore(highlight.subscribe, highlight.get)
  // the ring is the theme's own colour, and an export (which marks the app with EXPORT_CLASS) leaves it out
  const markCss = useMemo(() => {
    const selectors = marked
      .flatMap((id) => nodesOfItem(shownSpec, graph.nodes, id))
      .map(selectorOf)
    if (!selectors.length) return ''
    return `.antu-app:not(.${EXPORT_CLASS}) :is(${selectors.join(', ')}) { outline: 3px solid var(--antu-side1); outline-offset: 4px; }`
  }, [marked, shownSpec, graph])

  // The pieces of the shell a host may turn off (`mount(…, { ui })`); all on for the viewer page
  const showZoom = useUi('zoom')
  const showMinimap = useUi('minimap')
  const showCapsule = useUi('capsule')

  // Where the capsule goes on this width, and whether the minimap gives way to it (shell/dockPlace.js)
  const [dock, setDock] = useState({ left: null, maxWidth: null, hideMinimap: false })
  const minimapWidthRef = useRef(MINIMAP_WIDTH)
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el || !showCapsule) return undefined
    const place = () => {
      const bar = el.querySelector('.antu-dock-capsule .antu-dock-bar')
      if (!bar || !el.clientWidth) return
      const box = el.getBoundingClientRect()
      const zoom = showZoom ? el.querySelector('.react-flow__controls') : null
      const mini = el.querySelector('.react-flow__minimap')
      if (mini?.offsetWidth) minimapWidthRef.current = mini.offsetWidth
      const next = placeDock({
        width: el.clientWidth,
        natural: oneLineWidth(bar),
        zoomRight: zoom ? zoom.getBoundingClientRect().right - box.left : null,
        minimapWidth: showMinimap ? minimapWidthRef.current : null,
      })
      setDock((prev) => (prev.left === next.left && prev.maxWidth === next.maxWidth && prev.hideMinimap === next.hideMinimap ? prev : next))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    const bar = el.querySelector('.antu-dock-capsule .antu-dock-bar')
    if (bar) ro.observe(bar)
    return () => ro.disconnect()
    // Not on `children`: it is a new element on every render (a hover re-renders), and measuring again then
    // cost some forty style reads each time. The observer already sees the capsule change size when its
    // content does.
  }, [showCapsule, showZoom, showMinimap])
  const dockStyle = dock.left == null
    ? undefined
    // (a React Flow panel has a margin of its own; `left` is already measured from the canvas edge)
    : { left: dock.left, marginLeft: 0, transform: 'none', ...(dock.maxWidth != null ? { '--antu-dock-max': `${dock.maxWidth}px` } : {}) }

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
      {markCss && <style>{markCss}</style>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={allNodeTypes}
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
          if (!fittedRef.current) requestAnimationFrame(() => fit(0))
        }}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        // A diagram whose content is mostly decoration layers (fitSelf: the relation path) is
        // fitted to graph.size by fit() alone, not to the boxes React Flow can measure.
        // A width-fitted diagram is placed by fit() alone: React Flow's own initial fit runs once the nodes are
        // measured, which can come after fit() and would shrink a long column back to the whole
        fitView={!fitWidth && !fitSelf}
        fitViewOptions={{ padding: FIT_PADDING, ...(fitMaxZoom ? { maxZoom: fitMaxZoom } : {}) }}
        minZoom={minZoom}
        maxZoom={MAX_ZOOM}
      >
        {/* The shell (dot grid, zoom, minimap, dock) is not themed: only the diagram is; its variables are set on the viewport below */}
        <Background gap={20} color="#e8ebef" />
        {/* The padding must match the initial fit, or clicking the button once makes the zoom jump */}
        {showZoom && <Controls showInteractive={false} onFitView={() => fit(300)} />}
        {/* The display controls float centred below the canvas: the zoom controls are bottom left and the minimap bottom right, so the three do not collide */}
        {showCapsule && (
          <Panel position="bottom-center" className={`antu-dock-capsule${dock.maxWidth != null ? ' is-wrapped' : ''}`} style={dockStyle}>
            {children}
          </Panel>
        )}
        {showMinimap && !dock.hideMinimap && <MiniMap pannable zoomable nodeColor={miniColor} />}
      </ReactFlow>
    </main>
  )
}
