// Stable host-test markers stamped onto React Flow nodes (issue 166, spec/embed.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOST_NODE_DOM_ATTRIBUTES, isHostTestNodeId, stampHostNode } from '../src/shell/hostAttrs.js'

test('stampHostNode adds data-antu=node; skips ghost and decoration ids', () => {
  assert.equal(isHostTestNodeId('n-1'), true)
  assert.equal(isHostTestNodeId('__plinks__'), false)
  assert.equal(isHostTestNodeId('__head__date'), false)
  const n = stampHostNode({ id: 'n-1', type: 'pnode', position: { x: 0, y: 0 } }, '__minimap__')
  assert.deepEqual(n.domAttributes, HOST_NODE_DOM_ATTRIBUTES)
  assert.equal(n.domAttributes['data-antu'], 'node')
  assert.equal(stampHostNode({ id: '__minimap__', type: 'miniGhost' }, '__minimap__').domAttributes, undefined)
  assert.equal(stampHostNode({ id: '__plinks__', type: 'plinks' }, '__minimap__').domAttributes, undefined)
  assert.equal(stampHostNode(n, '__minimap__'), n, 'idempotent when already stamped')
})
