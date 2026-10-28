// Stable host-test markers stamped onto React Flow nodes (issue 166, spec/embed.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOST_NODE_DOM_ATTRIBUTES, stampHostNode } from '../src/shell/hostAttrs.js'

test('stampHostNode adds data-antu=node and leaves the ghost alone', () => {
  const n = stampHostNode({ id: 'n-1', type: 'pnode', position: { x: 0, y: 0 } }, '__ghost__')
  assert.deepEqual(n.domAttributes, HOST_NODE_DOM_ATTRIBUTES)
  assert.equal(n.domAttributes['data-antu'], 'node')
  const ghost = stampHostNode({ id: '__ghost__', type: 'miniGhost' }, '__ghost__')
  assert.equal(ghost.domAttributes, undefined)
  const again = stampHostNode(n, '__ghost__')
  assert.equal(again, n, 'idempotent when already stamped')
})
