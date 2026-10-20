// The WorkBuddy connector (tools/workbuddy): the folder it builds keeps the platform's rules, and its skill names only
// tools the MCP server really has.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFolder, buildSkillFolder, checkFolder, checkSkillFolder, repoVersion } from '../tools/workbuddy/build.mjs'

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

test('the market names are the project\'s own: 案图 Antu in Chinese, Antu in English', () => {
  const meta = JSON.parse(readFileSync(join(dir, 'connector-meta.json'), 'utf8'))
  assert.equal(meta.name_zh, '案图 Antu')
  assert.equal(meta.name_en, 'Antu')
  const skill = readFileSync(join(dir, 'skills/antu/SKILL.md'), 'utf8')
  assert.match(skill, /^display_name: 案图 Antu$/m)
})

// ---- the skill package (no connector) ----

test('the skill package is the general skill with WorkBuddy\'s header and section, and passes its checks', () => {
  const skillDir = buildSkillFolder()
  assert.deepEqual(checkSkillFolder(skillDir, version), [])
  const text = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
  assert.match(text, /^display_name: 案图 Antu（技能版）$/m)
  assert.match(text, /^author: Jicheng$/m)
  // the same guides, field tables and examples as every other client: one place for the content
  const general = readFileSync('skills/antu/SKILL.md', 'utf8')
  assert.ok(text.includes('## 2. Write the JSON'), 'the body of the general skill is kept')
  assert.ok(general.includes('## 2. Write the JSON'))
  for (const f of ['references/guide-fact.md', 'references/fields-relationship.md', 'examples/justification-1-minimal.en.json']) {
    assert.equal(readFileSync(join(skillDir, f), 'utf8'), readFileSync(join('skills/antu', f), 'utf8'), f)
  }
})

test('the skill package checks catch a missing field, a nested header, a deeper folder and the old update command', () => {
  const skillDir = buildSkillFolder()
  const file = join(skillDir, 'SKILL.md')
  const good = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, good.replace(/^author: .*\n/m, ''))
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('author')))
    writeFileSync(file, good.replace('license: AGPL-3.0-or-later', 'metadata:\n  version: "1"'))
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('metadata')))
    writeFileSync(file, good + '\n`npx skills update antu -g`\n')
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('npx skills update')))
    writeFileSync(file, good)
    mkdirSync(join(skillDir, 'examples/deep'), { recursive: true })
    writeFileSync(join(skillDir, 'examples/deep/x.json'), '{}')
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('deeper than')))
  } finally {
    writeFileSync(file, good)
    rmSync(join(skillDir, 'examples/deep'), { recursive: true, force: true })
  }
})

test('both packages carry the developer name registered on the platform (Jicheng)', () => {
  assert.match(readFileSync(join(dir, 'skills/antu/SKILL.md'), 'utf8'), /^author: Jicheng$/m)
  assert.match(readFileSync(join(buildSkillFolder(), 'SKILL.md'), 'utf8'), /^author: Jicheng$/m)
})
