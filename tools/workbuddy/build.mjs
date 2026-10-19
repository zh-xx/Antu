#!/usr/bin/env node
// ============================================================
//  tools/workbuddy/build.mjs —— the Antu connector for WorkBuddy's open platform
//
//  WorkBuddy takes a "connector": a folder with connector-meta.json, mcp.json, icon.svg and a skill that tells the
//  model how to use the tools (https://open.workbuddy.cn/docs/connector). Ours is "MCP + Skill": the program is the
//  published npm package `@zh-xx/antu` (its `antu-mcp` binary), started over stdio; the skill is light and carries
//  no script. This builds the folder and a zip of it from src/, with the version of package.json written in.
//
//  Usage: node tools/workbuddy/build.mjs [--check]
//    --check   build, check the result against the platform's rules, and stop (no zip)
//  Output (not committed): tools/workbuddy/package/antu/ and tools/workbuddy/antu-workbuddy-<version>.zip
// ============================================================

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'src')
const OUT = join(HERE, 'package')
const ROOT = join(OUT, 'antu')

export const repoVersion = () => JSON.parse(readFileSync(join(HERE, '../../package.json'), 'utf8')).version

const fill = (text, version) => text.replaceAll('{{version}}', version)

/** Write the connector folder; returns its path */
export function buildFolder(version = repoVersion()) {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(join(ROOT, 'skills/antu'), { recursive: true })
  for (const file of ['connector-meta.json', 'mcp.json', 'skills/antu/SKILL.md']) {
    writeFileSync(join(ROOT, file), fill(readFileSync(join(SRC, file), 'utf8'), version))
  }
  cpSync(join(SRC, 'icon.svg'), join(ROOT, 'icon.svg'))
  return ROOT
}

/**
 * Check a built connector folder against what the platform's documentation asks. Returns the problems (empty: ok).
 * @param {string} dir the folder that holds connector-meta.json
 * @param {string} version the version it must carry
 */
export function checkFolder(dir, version = repoVersion()) {
  const bad = []
  const read = (f) => readFileSync(join(dir, f), 'utf8')
  const json = (f) => {
    try {
      return JSON.parse(read(f))
    } catch (e) {
      bad.push(`${f}: not valid JSON (${e.message})`)
      return {}
    }
  }
  for (const f of ['connector-meta.json', 'mcp.json', 'icon.svg', 'skills/antu/SKILL.md']) {
    if (!existsSync(join(dir, f))) bad.push(`${f}: missing`)
  }
  if (bad.length) return bad

  const meta = json('connector-meta.json')
  if (!/^[a-z0-9-]+$/.test(meta.source ?? '')) bad.push('connector-meta.json: source must be lower-case letters, digits and hyphens')
  if (meta.type !== 'mcp') bad.push('connector-meta.json: type must be "mcp"')
  if (meta.version !== version) bad.push(`connector-meta.json: version ${meta.version} is not ${version}`)
  for (const k of ['name', 'name_en', 'description', 'description_zh', 'description_en', 'minWorkbuddyVersion']) {
    if (typeof meta[k] !== 'string' || !meta[k]) bad.push(`connector-meta.json: ${k} is required`)
  }
  for (const k of ['description_zh', 'description_en']) {
    const n = [...(meta[k] ?? '')].length
    if (n < 20 || n > 140) bad.push(`connector-meta.json: ${k} has ${n} characters (the platform suggests 20 to 100; 140 at most here)`)
  }
  for (const k of ['examples_zh', 'examples_en']) {
    const n = Array.isArray(meta[k]) ? meta[k].length : 0
    if (n < 2 || n > 5) bad.push(`connector-meta.json: ${k} needs 2 to 5 examples, has ${n}`)
  }

  const mcp = json('mcp.json')
  const servers = Object.entries(mcp.mcpServers ?? {})
  if (servers.length !== 1) bad.push(`mcp.json: exactly one MCP server, found ${servers.length}`)
  for (const [, s] of servers) {
    const pin = (s.args ?? []).find((a) => String(a).startsWith('@zh-xx/antu@'))
    if (pin !== `@zh-xx/antu@${version}`) bad.push(`mcp.json: the package must be pinned to @zh-xx/antu@${version}, found ${pin}`)
    if (s.runtime?.type !== 'node') bad.push('mcp.json: declare the managed Node runtime')
    for (const r of s.npmRegistries ?? []) if (!r.startsWith('https://')) bad.push(`mcp.json: registry ${r} is not https`)
  }

  const skill = read('skills/antu/SKILL.md')
  const front = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? ''
  for (const k of ['name', 'description', 'description_zh', 'description_en', 'version', 'author']) {
    if (!new RegExp(`^${k}:`, 'm').test(front)) bad.push(`SKILL.md: frontmatter field ${k} is required`)
  }
  if (!front.includes(`version: "${version}"`)) bad.push(`SKILL.md: version is not ${version}`)

  // No real credential anywhere in the folder
  for (const f of ['connector-meta.json', 'mcp.json', 'skills/antu/SKILL.md']) {
    if (/(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/.test(read(f))) bad.push(`${f}: looks like it holds a credential`)
  }
  if (read('icon.svg').length > 20000) bad.push('icon.svg: larger than 20 KB')
  return bad
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = repoVersion()
  const dir = buildFolder(version)
  const bad = checkFolder(dir, version)
  if (bad.length) {
    console.error(bad.map((b) => `✗ ${b}`).join('\n'))
    process.exit(1)
  }
  console.log(`connector folder ok: ${dir}`)
  if (!process.argv.includes('--check')) {
    const zip = join(HERE, `antu-workbuddy-${version}.zip`)
    rmSync(zip, { force: true })
    const r = spawnSync('zip', ['-qr', zip, 'antu'], { cwd: OUT, stdio: 'inherit' })
    if (r.status !== 0) {
      console.error('could not run `zip` (install it, or zip the folder yourself)')
      process.exit(1)
    }
    console.log(`zip: ${zip}`)
  }
}
