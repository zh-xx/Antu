// src/core/agentGuides.generated.js is written from spec/agent/*/guide.md
// (tools/gen/agent-guides.mjs) so `@zh-xx/antu/validate` can serve guide(type)
// without reading the filesystem. A test fails when the file is stale.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { readFileSync } from 'node:fs'

import { AGENT_GUIDES } from '../src/core/agentGuides.generated.js'
import '../src/renderers/index.js'
import { listKnowledgeTypes } from '../src/core/registry.js'

test('agentGuides.generated.js is what the guide files say (run `node tools/gen/agent-guides.mjs`)', () => {
  const r = spawnSync(process.execPath, ['tools/gen/agent-guides.mjs', '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})

test('every registered type has its mechanism notes in AGENT_GUIDES, matching the file', () => {
  const types = listKnowledgeTypes().map((t) => t.type).sort()
  assert.deepEqual(Object.keys(AGENT_GUIDES).sort(), types)
  for (const type of types) {
    const file = readFileSync(`spec/agent/${type}/guide.md`, 'utf8')
    assert.equal(AGENT_GUIDES[type], file, type)
  }
})
