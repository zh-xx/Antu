// spec/versions.md is written from the registry (tools/gen/versions.mjs) and the command line and the MCP server tell
// the same list (tools/lib/versions.mjs). The rules are in spec/versioning.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { VERSIONS_FILE, expectedVersionsFile } from '../tools/gen/versions.mjs'
import { formatVersions, versionsMarkdown, versionsReport } from '../tools/lib/versions.mjs'
import { listKnowledgeTypes, diagramsOf } from '../src/core/registry.js'

test('spec/versions.md is what the registry says (run `node tools/gen/versions.mjs` to write it)', () => {
  assert.equal(readFileSync(VERSIONS_FILE, 'utf8'), expectedVersionsFile())
})

test('the report holds every type and every diagram of the registry, the default first', () => {
  const r = versionsReport('9.9.9')
  assert.equal(r.release, '9.9.9')
  assert.deepEqual(r.types.map((t) => t.type), listKnowledgeTypes().map((t) => t.type))
  for (const t of r.types) assert.deepEqual(t.diagrams.map((d) => d.kind), diagramsOf(t.type).map((d) => d.kind))
})

test('one type can be asked for; an unknown one gives none', () => {
  assert.deepEqual(versionsReport('1.0.0', 'fact').types.map((t) => t.type), ['fact'])
  assert.deepEqual(versionsReport('1.0.0', 'nope').types, [])
})

test('the text names the release, each type with its generation, and marks the default way', () => {
  const text = formatVersions(versionsReport('1.2.3'))
  assert.match(text, /^Antu 1\.2\.3\n/)
  assert.match(text, /^fact: format generation \d+$/m)
  assert.match(text, /timeline +v\d+ +experimental +since 0\.2\.0 +\(default\)/)
  assert.equal(text.split('(default)').length - 1, listKnowledgeTypes().length)
})

test('the table has a row for each diagram and carries no release number', () => {
  const md = versionsMarkdown(versionsReport('1.2.3'))
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && l.includes('/'))
  assert.equal(rows.length, listKnowledgeTypes().reduce((n, t) => n + diagramsOf(t.type).length, 0))
  assert.ok(!md.includes('1.2.3'))
})
