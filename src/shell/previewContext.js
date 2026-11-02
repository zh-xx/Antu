// @ts-check
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

/**
 * @typedef {{
 *   hoveredId: string | null,
 *   pinnedId: string | null,
 *   pin: (id: string) => void,
 *   unpin: () => void,
 *   focusOn?: ((id: string) => void) | null,
 *   hover?: (id: string | null) => void,
 * }} PreviewContextValue
 */
export const PreviewContext = createContext(/** @type {PreviewContextValue} */ ({
  hoveredId: null,
  pinnedId: null,
  pin: (_id) => {},
  unpin: () => {},
  focusOn: null,
}))
