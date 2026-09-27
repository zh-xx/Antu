# React Flow feature reference

> Purpose: to look up "what it can do, whether we use it, and where we intend to use it".
> Version: `@xyflow/react` 12. Official docs <https://reactflow.dev>
> Related: why it was chosen is in `spec/fact/rendering.md` §6.

Status markers: **✅ in use** | **planned** | **not needed**

---

## 1. Viewport layer (the canvas itself)

| Feature | API | Status |
|---|---|---|
| Zoom, pan | `zoomOnScroll`, `panOnDrag` | ✅ in use |
| Fit view | `fitView`, `fitViewOptions` | ✅ in use |
| Zoom limits | `minZoom`, `maxZoom` | ✅ in use |
| Zoom buttons | `<Controls />` | ✅ in use |
| Minimap | `<MiniMap />` | ✅ in use |
| Grid background | `<Background />` | ✅ in use |
| Pan bounds | `translateExtent` | ✅ in use (160px of padding around the content; panning stops at the edge) |
| Tooltips / labels for the zoom buttons | `ariaLabelConfig` | ✅ in use (both languages, see `src/core/labels.js`) |
| Render only visible nodes | `onlyRenderVisibleElements` | not needed (the current scale does not call for it) |

## 2. Node layer

| Feature | API | Status |
|---|---|---|
| Custom nodes | `nodeTypes` | ✅ in use (cards, column headings, axis, link layer, cell layer; 5 kinds) |
| Node position | `position` | ✅ in use |
| Dragging disabled | `draggable` / `nodesDraggable` | ✅ in use (turned off for now) |
| Node z-order | `zIndex` | ✅ in use. React Flow writes an inline `z-index: 0` on every node; we override it with CSS plus `!important` (a hovered card is raised to 10) |
| Snap to grid while dragging | `snapToGrid`, `snapGrid` | planned (for drag editing) |
| Selection and multi-select | `selectable` | ✅ in use (**not optional**: a pinned popover only covers neighbouring cards because a selected node gets a weighted `z-index: 1000`) |
| Node toolbar, resize handles | `<NodeToolbar />`, `<NodeResizer />` | not needed |

## 3. Edge layer

| Feature | API | Status |
|---|---|---|
| Edges | `edges` | **the fact diagram does not use them** (see below); they are the main content of the relationship and procedure diagrams |
| **Edge draw order** | automatic; the whole edge layer sits under the nodes | known (in the source the in-viewport order is edges → connection preview → edge labels → nodes). The fact diagram lays out its own link layer, so this does not apply |
| Four built-in paths | `type`: `straight` / `default` (bezier) / `step` / `smoothstep` | spare (relationship / procedure) |
| Arrowheads | `markerEnd: MarkerType.ArrowClosed` | planned (relationship, procedure) |
| Edge labels | `<EdgeLabelRenderer />` | not needed |
| Animated edges | `animated` | not needed |

### Why the fact diagram does not use edges

The fact data contains **no event-to-event relation**: only events to entities (parties,
groups, sources), and those three are already expressed by **position** (column = side ×
party; sources live in the popover). The row order is itself the time order. So turning
the link into an `edges` entry would only redraw a decorative line; semantically it is
not a relation.

`edges` means "there is a relation between two nodes that has to be drawn". Draw it when
there is one; leaving it empty when there is not is not a defect.
**Edges are left for the relationship and procedure diagrams**: in those two, `edges`
are the main content.

## 4. Handles and connection rules

| Feature | API | Status |
|---|---|---|
| Handles | `<Handle type="source" \| "target" position={...} id="..." />` | **not used by the fact diagram**; used by relationship / procedure |
| Several handles on one node | distinguished by `id`; the edge names `sourceHandle` / `targetHandle` | spare (useful when one axis node carries N anchor points) |
| Connection validation | `isValidConnection` | not needed |
| Manual connecting | `onConnect` | not needed |

## 5. Interaction callbacks

| Feature | API | Status |
|---|---|---|
| Node click | `onNodeClick` | ✅ in use (pins the card popover) |
| Mouse enter / leave a node | `onNodeMouseEnter` / `onNodeMouseLeave` | ✅ in use (shows the summary on hover) |
| Edge click | `onEdgeClick` | not needed |
| Pane click | `onPaneClick` | ✅ in use (dismisses the popover) |
| Selection change | `onSelectionChange` | not needed (the weighting is automatic; nothing to listen for) |

## 6. Structure and other

| Feature | API | Status |
|---|---|---|
| **Sub-flows** (nested nodes; a parent containing children) | `parentId`, `extent: 'parent'`, `style.width/height` on the parent | planned (possibly useful to wrap one whole time slot) |
| Controlled / uncontrolled state | `useNodesState`, `useEdgesState` | ✅ required (see §10, items 1 and 2) |
| Node/edge helpers | `getNodesBounds`, `getViewportForBounds`, `addEdge` | **not used when exporting**: the two 1×1 decorative nodes would be counted into the bounding box and add a ring of blank space. We use our own `graph.size` instead, see `fact/rendering.md` §10.3 |
| Reading the canvas instance | `useReactFlow()` | **not used when exporting**: that path also goes through the DOM (`.react-flow__viewport`); no need for the canvas instance |
| Third-party attribution watermark | `proOptions.hideAttribution` | left visible (no Pro subscription; the author asks that it not be hidden) |

---

## 7. Common recipes (snippets)

**Invisible handles** (an edge has to attach to them, but they should not be seen)

```jsx
<Handle type="source" position={Position.Right} id="r" className="antu-handle" />
```
```css
.antu-handle { opacity: 0; pointer-events: none; }
```

**A straight edge**

```jsx
{ id: 'e1', source: 'ev-1', sourceHandle: 'r',
  target: 'dot-1', targetHandle: 'l',
  type: 'straight', style: { stroke: '#cbd5e1', strokeWidth: 1 },
  selectable: false, focusable: false }
```

**Snap to grid while dragging**

```jsx
<ReactFlow snapToGrid snapGrid={[96, 44]} />
```

**Sub-flow** (child coordinates are relative to the parent)

```jsx
{ id: 'slot-1', type: 'slot', position: { x: 0, y: 0 }, style: { width: 1152, height: 176 } },
{ id: 'ev-1', parentId: 'slot-1', extent: 'parent', position: { x: 32, y: 32 }, type: 'card' }
```

**Exporting a PNG** (already implemented, see `fact/rendering.md` §10)

```js
import { toBlob } from 'html-to-image'
// Grab .react-flow__viewport, replace the **clone's** transform with the identity
// transform, and pass graph.size as the size. That exports the whole diagram and is
// independent of the user's current pan and zoom.
// Do not use getNodesBounds (see the table in §6), and do not capture the whole
// .antu-app (that would give you the window's aspect ratio).
```

**Let long text scroll inside a popover** (required while the canvas has `panOnScroll`,
otherwise the wheel is taken by the canvas and pans)

```jsx
<div className="antu-preview nowheel nopan">…</div>
```

**Pan bounds** (panning stops at the edge of the content)

```jsx
const PAD = 160
translateExtent={[[-PAD, -PAD], [w + PAD, h + PAD]]}
```

**The whole set of tooltips and accessibility labels** (copy every key; a key you miss
falls back to English)

```jsx
ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Zoom in', 'minimap.ariaLabel': 'Minimap', … }}
```

**Zoom lower bound = the factor that exactly fits the whole diagram** (the formula must
match the algorithm used internally, or the first scroll jumps)

```js
// Derived from measurements: viewport 857 high → 0.5776; 1000 high → 0.6732
// Both fit viewport / (content × 1.12), where 1.12 = 1 + padding ratio 0.12
const fit = Math.min(
  w / (contentWidth * (1 + PADDING)),
  h / (contentHeight * (1 + PADDING)),
)
// Then cap at 1: for a small diagram the fit factor exceeds 1, and then the lower and
// upper bounds would collide and zoom would lock up
const minZoom = Math.max(Math.min(fit, 1), 0.05)
const maxZoom = 3   // the upper bound only exists to stop absurd magnification
```

---

## 8. What is not React Flow

Easily confused, so listed separately:

| Concern | Whose job |
|---|---|
| Where nodes go (automatic layout) | **not React Flow**. Use dagre or elkjs, or compute it yourself (the fact diagram computes its own grid) |
| Exporting an image | screenshotting uses `html-to-image`; but **the extent is ours to compute**: React Flow's `getNodesBounds` would count the two 1×1 decorative nodes, so it cannot be used |
| Our own layout rules | `src/renderers/fact/timeline/grid.js`, unrelated to React Flow |

## 9. Progress notes

- **In use**: the whole viewport layer (including pan bounds, dynamic zoom limits, zoom
  animation), 5 kinds of custom node, node click and enter/leave, pane click, selection
  weighting, accessibility labels in both languages, controlled node state
- **The fact diagram stops here**: no further React Flow capabilities will be added. The
  edges and handles in §3 and §4 are left for the relationship and procedure diagrams
- **Image export is done** (not through React Flow's helpers; through the DOM, see §6, §7)
- **Later**: drag editing (`snapToGrid`), sub-flows

## 10. Pitfalls (check here first)

| Symptom | Cause | Fix |
|---|---|---|
| The MiniMap is blank, not a single block | node dimensions are written back onto the node objects by `onNodesChange`; pass only a constant array and nobody receives them | put the nodes in `useNodesState` and hand `onNodesChange` to React Flow |
| A zero-size decorative node is invisible entirely (its lines go with it) | a separate rule: a node with no dimensions is given `visibility: hidden`; the decorative layer is 0×0 to begin with, and **`onNodesChange` cannot fix it** | give the node object `1×1` (not 0×0; see the next row) |
| **The "fit view" button on the canvas does nothing** | the decorative layer was given `width: 0, height: 0`, so the node **never gets `measured`**; if React Flow finds a single node without `measured` it judges `nodesInitialized` false, and the queued `fitView` path requires it to be **true** before it resolves | give the decorative layer `width: 1, height: 1`: it has dimensions, so it is visible and measurable. A 1×1 effect on the content bounds is negligible |
| Clicking "fit view" makes the zoom jump slightly (1.8%) | that button uses React Flow's own default padding of 0.1, while we initialise with 0.12 | pass `fitViewOptions={{ padding: the same value }}` to `<Controls>` |
| Long text in a popover will not scroll; the wheel pans the canvas | the canvas has `panOnScroll`, which intercepts the wheel event | add `nowheel nopan` to the popover |
| Two-finger trackpad scrolling zooms | `zoomOnScroll` is on by default, so the wheel zooms | turn `panOnScroll` on and `zoomOnScroll` off; pinch uses `zoomOnPinch`, independent of the wheel |
| The zoom lower bound makes the view jump on the first scroll | our own formula did not match the one used internally | use the measured one: `viewport / (content × (1 + padding ratio))`, do not derive it literally from the source |
| Opening the detail panel makes cards move | the panel takes part in layout and narrows the canvas | always position the panel absolutely so it never changes the canvas size |
| Links from both sides cut across other people's cards | links lived inside the card nodes and were raised with them | move the links into their own layer, ordered before all cards |
| The end of a link pierces the axis dot and breaks the white circle | the link layer was ordered **after** the axis, so it was drawn on top of the dot | move the link layer **before** the axis; the dot covering the end of the line is more robust than changing the line length |
| Switching a field makes the view "jump" | the diagram changed, so `fitView` runs again, and by default it is instant | `fitView({ duration: 300 })`; pass 0 on first open, otherwise the page animates on load |
| After re-running `fitView` the bounds are wrong and the diagram floats upwards | a size transition was put on the **measured** element, so React Flow measured a mid-transition value | split "the shell that is measured" from "the core that animates" into two elements: no transition on the shell, transition on the core |
| The collapse button does not respond | the brand is a positioned element and the button is in flow, and **positioned elements paint on top by default**, so the brand swallowed the click | give the brand `pointer-events: none` (it is two words; it should not receive clicks) |
| A pinned popover is covered by a neighbouring card | replacing the whole node array wipes `selected`, and the selection weighting (z-index 1000) goes with it | keep `selected` when syncing nodes; `measured` is deliberately not kept, because card height may have changed and it must be re-measured |
