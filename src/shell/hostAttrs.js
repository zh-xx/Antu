// ============================================================
//  src/shell/hostAttrs.js — stable DOM markers for host tests (issue 166)
//
//  React Flow puts `data-id` on every node wrapper and spreads `node.domAttributes`
//  onto it. Antu stamps `data-antu="node"` so a host can find a JSON item without
//  depending on React Flow's `.react-flow__node*` class names. Contract: spec/embed.md.
// ============================================================

/** Attribute set stamped onto JSON-item diagram nodes (not decoration layers / the minimap ghost). */
export const HOST_NODE_DOM_ATTRIBUTES = Object.freeze({ 'data-antu': 'node' })

/** Decoration and shell helpers use ids like `__plinks__`, `__stages__`, `__head__…`. */
export function isHostTestNodeId(id) {
  return typeof id === 'string' && id.length > 0 && !id.startsWith('__')
}

/**
 * Copy of a React Flow node with Antu's host-test marker.
 * Skips the minimap ghost and decoration / layer nodes (`__…` ids).
 * @param {object} node
 * @param {string} [ghostId]
 */
export function stampHostNode(node, ghostId) {
  if (!node || node.id === ghostId || !isHostTestNodeId(node.id)) return node
  const prev = node.domAttributes
  if (prev && prev['data-antu'] === 'node') return node
  return { ...node, domAttributes: { ...prev, ...HOST_NODE_DOM_ATTRIBUTES } }
}
