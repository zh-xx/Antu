// ============================================================
//  src/shell/hostAttrs.js — stable DOM markers for host tests (issue 166)
//
//  React Flow puts `data-id` on every node wrapper and spreads `node.domAttributes`
//  onto it. Antu stamps `data-antu="node"` so a host can find a JSON item without
//  depending on React Flow's `.react-flow__node*` class names. Contract: spec/embed.md.
// ============================================================

/** Attribute set stamped onto every diagram node (not the minimap ghost). */
export const HOST_NODE_DOM_ATTRIBUTES = Object.freeze({ 'data-antu': 'node' })

/**
 * Copy of a React Flow node with Antu's host-test marker. The minimap ghost is left alone.
 * @param {object} node
 * @param {string} [ghostId]
 */
export function stampHostNode(node, ghostId) {
  if (!node || node.id === ghostId) return node
  const prev = node.domAttributes
  if (prev && prev['data-antu'] === 'node') return node
  return { ...node, domAttributes: { ...prev, ...HOST_NODE_DOM_ATTRIBUTES } }
}
