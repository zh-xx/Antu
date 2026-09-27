// ============================================================
//  src/renderers/fact/timeline/LinkLayerNode.jsx — the link layer (a decoration node)
//
//  All "card → axis dot" links are collected in this one node, and the whole layer is placed
//  before the cards, so cards always cover the links and a link never crosses another card.
//  This layer receives no mouse events.
// ============================================================

import { memo } from 'react'

const LinkLayerNode = memo(function LinkLayerNode({ data }) {
  const { segments, isH } = data

  return (
    <div className="antu-link-layer">
      {segments.map((s, i) => (
        <span
          key={i}
          // A horizontal line when vertical (border-top), a vertical line when horizontal (border-left)
          className={`antu-link${isH ? ' is-h' : ''}`}
          style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
        />
      ))}
    </div>
  )
})

export default LinkLayerNode
