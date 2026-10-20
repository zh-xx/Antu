#!/usr/bin/env node
// ============================================================
//  tools/workbuddy/build.mjs —— the Antu connector for WorkBuddy's open platform
//
//  WorkBuddy takes a "connector": a folder with connector-meta.json, mcp.json, icon.svg and a skill that tells the
//  model how to use the tools (https://open.workbuddy.cn/docs/connector). Ours is "MCP + Skill": the program is the
//  published npm package `@zh-xx/antu` (its `antu-mcp` binary), started over stdio; the skill is light and carries
//  no script. This builds the folder and a zip of it from src/, with the version of package.json written in.
//
//  A second package is built here too: the same skill without the connector ("technology version"), for the case that
//  the connector is not accepted or a user installs only skills. It is made from skills/antu/ (so the guides, the field
//  tables, the examples and the scripts are the ones of every other client, kept in one place), with the header fields
//  WorkBuddy asks of a skill and a short section on what to do there. See README.md.
//
//  Usage: node tools/workbuddy/build.mjs [--check]
//    --check   build, check the results against the platform's rules, and stop (no zip)
//  Output (not committed): tools/workbuddy/package/antu/ + antu-workbuddy-<version>.zip (the connector),
//                          tools/workbuddy/package-skill/antu/ + antu-workbuddy-skill-<version>.zip (the skill)
// ============================================================

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'src')
const OUT = join(HERE, 'package')
const ROOT = join(OUT, 'antu')
const SKILL_OUT = join(HERE, 'package-skill')
const SKILL_ROOT = join(SKILL_OUT, 'antu')
const SKILL_SOURCE = join(HERE, '../../skills/antu')

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


// ---------------------------------------------------------------------------
// The skill package (no connector)
// ---------------------------------------------------------------------------

const SKILL_HEADER = (version, description) => `---
name: antu
display_name: 案图 Antu（技能版）
display_name_en: Antu (skill)
description: >-
${description
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
description_zh: 用 Antu 把案情时间线、程序流程、主体关系、裁判说理画成可离线打开的单个 HTML 图。需要 Node 18 以上，没有时退到 Python 简化版。
description_en: Draw case timelines, procedures, party relationships and court reasoning as one offline HTML file. Needs Node 18+, or Python 3 for a reduced version.
version: "${version}"
author: Jicheng
license: AGPL-3.0-or-later
---
`

const IN_WORKBUDDY = `## In WorkBuddy

- **If you can call the tools \`antu_validate\`, \`antu_layout\` and \`antu_render\`** (the 案图 Antu connector is installed), use them and ignore the scripts below: they do the same, and the connector brings its own Node.
- **Otherwise the scripts need Node 18 or newer.** Check once with \`node --version\`. If Node is missing but \`python3\` works, use the Python fallback of step 3 (it only makes the page, it cannot check the data). If neither works, tell the user plainly that Antu cannot run here, and that installing Node.js (LTS) or the 案图 Antu connector fixes it. Never claim a diagram was made when it was not.
- \`<skill-dir>\` is the folder this \`SKILL.md\` is in; WorkBuddy keeps installed skills in \`~/.workbuddy/skills/antu/\` (or the \`.workbuddy/skills/antu/\` of a project). Write the user's JSON and the page in the folder they work in, never in the skill folder.
- Updates come through WorkBuddy's market: do not run \`npx skills update\`.

`

/** The skill package folder: skills/antu/ with WorkBuddy's header fields and the section above */
export function buildSkillFolder(version = repoVersion()) {
  if (!existsSync(join(SKILL_SOURCE, 'SKILL.md'))) throw new Error('skills/antu/ is missing: run npm run build:skill first')
  const built = readFileSync(join(SKILL_SOURCE, 'VERSION'), 'utf8').trim()
  if (built !== version) throw new Error(`skills/antu/ is a build of ${built}, not ${version}: run npm run build:skill`)

  rmSync(SKILL_OUT, { recursive: true, force: true })
  mkdirSync(SKILL_OUT, { recursive: true })
  cpSync(SKILL_SOURCE, SKILL_ROOT, { recursive: true })

  const text = readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8')
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) throw new Error('skills/antu/SKILL.md has no header')
  const description = /^description: >-\n((?: {2}.*\n?)+)/m.exec(match[1])?.[1].replace(/^ {2}/gm, '').trimEnd()
  if (!description) throw new Error('skills/antu/SKILL.md: the description was not found in the header')

  let body = text.slice(match[0].length)
  const anchor = '## 1. Choose the kind of diagram'
  if (!body.includes(anchor)) throw new Error('skills/antu/SKILL.md: the first section was not found')
  body = body.replace(anchor, IN_WORKBUDDY + anchor)
  const notice = 'with the command the notice gives (`npx skills update antu -g`)'
  if (!body.includes(notice)) throw new Error('skills/antu/SKILL.md: the update notice was not found')
  body = body.replace(notice, "and that a newer version is in WorkBuddy's market")
  writeFileSync(join(SKILL_ROOT, 'SKILL.md'), SKILL_HEADER(version, description) + body)
  return SKILL_ROOT
}

/** Check a built skill folder against what the platform's documentation asks of a skill; the problems (empty: ok) */
export function checkSkillFolder(dir, version = repoVersion()) {
  const bad = []
  const skillFile = join(dir, 'SKILL.md')
  if (!existsSync(skillFile)) return ['SKILL.md: missing']
  const text = readFileSync(skillFile, 'utf8')
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
  for (const k of ['name', 'description', 'description_zh', 'description_en', 'version', 'author']) {
    if (!new RegExp(`^${k}:`, 'm').test(front)) bad.push(`SKILL.md: frontmatter field ${k} is required`)
  }
  if (!front.includes(`version: "${version}"`)) bad.push(`SKILL.md: version is not ${version}`)
  if (/^metadata:/m.test(front)) bad.push('SKILL.md: a nested header block (metadata) may trip the platform parser')
  if (!text.includes('## In WorkBuddy')) bad.push('SKILL.md: the WorkBuddy section is missing')
  if (text.includes('`npx skills update antu -g`')) bad.push('SKILL.md: still tells the model to run npx skills update antu -g')

  // Two levels at most: root / folder / file (some hosts refuse the whole package for one file deeper)
  const walk = (d, depth = 1) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), depth + 1) : [depth]))
  const deep = walk(dir).filter((depth) => depth > 2).length
  if (deep) bad.push(`${deep} file(s) deeper than root / folder / file`)
  for (const f of ['scripts/antu.mjs', 'scripts/make_html.py', 'assets/viewer.html', 'references/guide-fact.md', 'examples/fact-1-minimal.zh-CN.json']) {
    if (!existsSync(join(dir, f))) bad.push(`${f}: missing`)
  }
  return bad
}

const zipOf = (cwd, zip) => {
  rmSync(zip, { force: true })
  const r = spawnSync('zip', ['-qr', zip, 'antu'], { cwd, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('could not run `zip` (install it, or zip the folder yourself)')
    process.exit(1)
  }
  console.log(`zip: ${zip}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = repoVersion()
  const dir = buildFolder(version)
  const skillDir = buildSkillFolder(version)
  const bad = [...checkFolder(dir, version).map((b) => `connector: ${b}`), ...checkSkillFolder(skillDir, version).map((b) => `skill: ${b}`)]
  if (bad.length) {
    console.error(bad.map((b) => `✗ ${b}`).join('\n'))
    process.exit(1)
  }
  console.log(`connector folder ok: ${dir}`)
  console.log(`skill folder ok: ${skillDir}`)
  if (!process.argv.includes('--check')) {
    zipOf(OUT, join(HERE, `antu-workbuddy-${version}.zip`))
    zipOf(SKILL_OUT, join(HERE, `antu-workbuddy-skill-${version}.zip`))
  }
}
