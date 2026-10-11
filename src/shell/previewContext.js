// ============================================================
//  src/shell/previewContext.js
//
//  Shared state for the detail overlay: which node is hovered, which node is pinned.
//  A file of its own so that a renderer and its node component can both use it without
//  importing each other and forming a cycle. It lives in the shell because every rendering
//  kind has the same two-level overlay (hover to peek, click to pin): fact's event cards and
//  procedure's flow nodes both read it.
//
//  Why Context rather than writing into node data:
//  writing into data would force setNodes, and every mouse pass over a card would rebuild the
//  whole node array; Context re-renders only the cards subscribed to it, far cheaper.
// ============================================================

import { createContext } from 'react'

export const PreviewContext = createContext({
  hoveredId: null,
  pinnedId: null,
  // A card could previously only be pinned by a mouse click (React Flow's onNodeClick),
  // which keyboard users cannot reach. These two functions let the card pin and close itself.
  pin: () => {},
  unpin: () => {},
  // A view that can hand a party over to another view (the relationship graph to its focus view) sets this
  focusOn: null,
})
