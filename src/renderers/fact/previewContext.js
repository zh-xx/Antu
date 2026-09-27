// ============================================================
//  src/renderers/fact/previewContext.js
//
//  Shared state for the card detail overlay: which card is hovered, which card is pinned.
//  A file of its own so that both index.jsx and EventNode.jsx can use it without importing
//  each other and forming a cycle.
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
})
