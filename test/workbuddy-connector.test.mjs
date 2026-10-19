// The WorkBuddy connector (tools/workbuddy): the folder it builds keeps the platform's rules, and its skill names only
// tools the MCP server really has.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFolder, checkFolder, repoVersion } from '../tools/workbuddy/build.mjs'

const dir = buildFolder()
const version = repoVersion()

test('the built connector folder passes its own checks', () => {
  assert.deepEqual(checkFolder(dir, version), [])
})

test('the checks catch a wrong version, a second server and a credential', () => {
  const meta = join(dir, 'connector-meta.json')
  const mcp = join(dir, 'mcp.json')
  const goodMeta = readFileSync(meta, 'utf8')
  const goodMcp = readFileSync(mcp, 'utf8')
  try {
    writeFileSync(meta, goodMeta.replace(`"version": "${version}"`, '"version": "0.0.1"'))
    assert.ok(checkFolder(dir, version).some((p) => p.includes('version 0.0.1')))
    writeFileSync(meta, goodMeta)
    const m = JSON.parse(goodMcp)
    m.mcpServers.second = m.mcpServers.antu
    writeFileSync(mcp, JSON.stringify(m))
    assert.ok(checkFolder(dir, version).some((p) => p.includes('exactly one MCP server')))
    writeFileSync(mcp, goodMcp.replace('"-y"', '"-y", "Bearer abcdefghijklmnopqrstuvwxyz0123"'))
    assert.ok(checkFolder(dir, version).some((p) => p.includes('credential')))
  } finally {
    writeFileSync(meta, goodMeta)
    writeFileSync(mcp, goodMcp)
  }
})

test('the skill names only tools the MCP server registers, and all four types', () => {
  const server = readFileSync(new URL('../tools/mcp/server.mjs', import.meta.url), 'utf8')
  const registered = new Set([...server.matchAll(/registerTool\(\s*'(antu_\w+)'/g)].map((m) => m[1]))
  const skill = readFileSync(join(dir, 'skills/antu/SKILL.md'), 'utf8')
  const named = new Set(skill.match(/antu_\w+/g))
  assert.ok(named.size >= 6)
  for (const t of named) assert.ok(registered.has(t), `${t} is not a tool of the server`)
  for (const type of ['fact', 'procedure', 'relationship', 'justification']) assert.ok(skill.includes(`\`${type}\``), type)
})
