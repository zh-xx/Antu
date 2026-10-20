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
//                          tools/workbuddy/package-skill/antu/ + antu-workbuddy-skill-<version>.zip (the skill),
//                          tools/workbuddy/package-skill-slim/antu/ + antu-workbuddy-skill-slim-<version>.zip (in reserve, see README)
// ============================================================

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'src')
const OUT = join(HERE, 'package')
const ROOT = join(OUT, 'antu')
const SKILL_OUT = join(HERE, 'package-skill')
const SKILL_ROOT = join(SKILL_OUT, 'antu')
const SLIM_OUT = join(HERE, 'package-skill-slim')
const SLIM_ROOT = join(SLIM_OUT, 'antu')
const SKILL_SOURCE = join(HERE, '../../skills/antu')
/**
 * WorkBuddy takes a skill of 3 MB at most (the platform's answer to the first upload: the unzipped size counted, a 1.3 MB
 * zip of 4.3 MB was refused). A bit under it, so that the build stops before the platform does.
 */
export const SKILL_MAX_BYTES = 2_900_000

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

const SKILL_HEADER = (version, description, slim) => `---
name: antu
display_name: ${slim ? '案图 Antu（技能版·精简）' : '案图 Antu（技能版）'}
display_name_en: ${slim ? 'Antu (skill, slim)' : 'Antu (skill)'}
description: >-
${description
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
description_zh: ${slim ? '用 Antu 把案情时间线、程序流程、主体关系、裁判说理画成可离线打开的单个 HTML 图。命令行从 npm 取（需要 Node 18 以上、npm 和网络），没有时退到 Python 简化版。' : '用 Antu 把案情时间线、程序流程、主体关系、裁判说理画成可离线打开的单个 HTML 图。需要 Node 18 以上，没有时退到 Python 简化版。'}
description_en: ${slim ? 'Draw case timelines, procedures, party relationships and court reasoning as one offline HTML file. The command line comes from npm (Node 18+, npm and a network), or Python 3 for a reduced version.' : 'Draw case timelines, procedures, party relationships and court reasoning as one offline HTML file. Needs Node 18+, or Python 3 for a reduced version.'}
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

/**
 * The slim variant: no command line in the package, the model fetches it from npm with npx (pinned to this version).
 * Kept in reserve for the day the full package no longer fits the platform's 3 MB; see README.md.
 */
const slimWorkBuddy = (version) => `## In WorkBuddy

- **If you can call the tools \`antu_validate\`, \`antu_layout\` and \`antu_render\`** (the 案图 Antu connector is installed), use them and ignore the commands below: they do the same.
- **Otherwise the command line comes from npm**, so it needs Node 18 or newer, npm, and a network the first time (it is cached afterwards). Check once with \`node --version\` and \`npm --version\`. The commands of step 3 are written \`npx -y -p @zh-xx/antu@${version} antu <command> …\`. If the download is slow or fails, add \`--registry https://registry.npmmirror.com\` after \`npx\` (the mirror can lag a few minutes behind a new version; then try \`--registry https://registry.npmjs.org\`).
- **If Node, npm or the network is missing but \`python3\` works**, use the Python fallback of step 3 (\`scripts/make_html.py\`, which is in this folder): it only makes the page and cannot check the data. If nothing works, tell the user plainly that Antu cannot run here, and that installing Node.js (LTS) or the 案图 Antu connector fixes it. Never claim a diagram was made when it was not.
- \`<skill-dir>\` is the folder this \`SKILL.md\` is in; WorkBuddy keeps installed skills in \`~/.workbuddy/skills/antu/\` (or the \`.workbuddy/skills/antu/\` of a project). Write the user's JSON and the page in the folder they work in, never in the skill folder.
- Updates come through WorkBuddy's market: do not run \`npx skills update\`.

`

/**
 * The skill package folder: skills/antu/ with WorkBuddy's header fields and a section on what to do there.
 * `slim`: without scripts/antu.mjs (see slimWorkBuddy above).
 */
export function buildSkillFolder(version = repoVersion(), { slim = false } = {}) {
  if (!existsSync(join(SKILL_SOURCE, 'SKILL.md'))) throw new Error('skills/antu/ is missing: run npm run build:skill first')
  const built = readFileSync(join(SKILL_SOURCE, 'VERSION'), 'utf8').trim()
  if (built !== version) throw new Error(`skills/antu/ is a build of ${built}, not ${version}: run npm run build:skill`)
  const out = slim ? SLIM_OUT : SKILL_OUT
  const root = slim ? SLIM_ROOT : SKILL_ROOT

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  cpSync(SKILL_SOURCE, root, { recursive: true })
  // The viewer page is 2.3 MB of the 4.3: ship it compressed. The command line and make_html.py read either form.
  const viewer = join(root, 'assets/viewer.html')
  writeFileSync(`${viewer}.gz`, gzipSync(readFileSync(viewer), { level: 9 }))
  rmSync(viewer)
  if (slim) rmSync(join(root, 'scripts/antu.mjs'))

  const text = readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8')
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) throw new Error('skills/antu/SKILL.md has no header')
  const description = /^description: >-\n((?: {2}.*\n?)+)/m.exec(match[1])?.[1].replace(/^ {2}/gm, '').trimEnd()
  if (!description) throw new Error('skills/antu/SKILL.md: the description was not found in the header')

  let body = text.slice(match[0].length)
  const anchor = '## 1. Choose the kind of diagram'
  if (!body.includes(anchor)) throw new Error('skills/antu/SKILL.md: the first section was not found')
  body = body.replace(anchor, (slim ? slimWorkBuddy(version) : IN_WORKBUDDY) + anchor)
  const notice = 'with the command the notice gives (`npx skills update antu -g`)'
  if (!body.includes(notice)) throw new Error('skills/antu/SKILL.md: the update notice was not found')
  body = body.replace(notice, "and that a newer version is in WorkBuddy's market")
  if (slim) {
    // the commands of step 3 run the package from npm instead of scripts/antu.mjs
    const intro = '`scripts/antu.mjs` (Node 18 or newer, nothing to install).'
    if (!body.includes(intro)) throw new Error('skills/antu/SKILL.md: the introduction of step 3 was not found')
    body = body.replace(intro, `\`npx -y -p @zh-xx/antu@${version} antu\` (Node 18 or newer and npm; the first run downloads it).`)
    const before = body
    body = body.replaceAll('node <skill-dir>/scripts/antu.mjs ', `npx -y -p @zh-xx/antu@${version} antu `)
    if (body === before) throw new Error('skills/antu/SKILL.md: the commands of step 3 were not found')
  }
  writeFileSync(join(root, 'SKILL.md'), SKILL_HEADER(version, description, slim) + body)
  return root
}

/** Check a built skill folder against what the platform's documentation asks of a skill; the problems (empty: ok) */
export function checkSkillFolder(dir, version = repoVersion(), { slim = false } = {}) {
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
  for (const f of [...(slim ? [] : ['scripts/antu.mjs']), 'scripts/make_html.py', 'assets/viewer.html.gz', 'references/guide-fact.md', 'examples/fact-1-minimal.zh-CN.json']) {
    if (!existsSync(join(dir, f))) bad.push(`${f}: missing`)
  }
  if (slim) {
    if (existsSync(join(dir, 'scripts/antu.mjs'))) bad.push('scripts/antu.mjs: the slim package carries no command line')
    if (/node <skill-dir>\/scripts\/antu\.mjs/.test(text)) bad.push('SKILL.md: still runs scripts/antu.mjs')
    if (!text.includes(`npx -y -p @zh-xx/antu@${version} antu `)) bad.push(`SKILL.md: the commands must run @zh-xx/antu@${version} with npx`)
  }
  if (existsSync(join(dir, 'assets/viewer.html'))) bad.push('assets/viewer.html: the page must ship compressed (assets/viewer.html.gz)')

  // The size the platform counts: every file, unzipped
  const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0)
  const total = size(dir)
  if (total > SKILL_MAX_BYTES) bad.push(`the package is ${total} bytes unzipped; WorkBuddy takes 3 MB at most, and this build allows ${SKILL_MAX_BYTES}`)
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
  const slimDir = buildSkillFolder(version, { slim: true })
  const bad = [
    ...checkFolder(dir, version).map((b) => `connector: ${b}`),
    ...checkSkillFolder(skillDir, version).map((b) => `skill: ${b}`),
    ...checkSkillFolder(slimDir, version, { slim: true }).map((b) => `skill (slim): ${b}`),
  ]
  if (bad.length) {
    console.error(bad.map((b) => `✗ ${b}`).join('\n'))
    process.exit(1)
  }
  console.log(`connector folder ok: ${dir}`)
  console.log(`skill folder ok: ${skillDir}`)
  console.log(`skill (slim) folder ok: ${slimDir}`)
  if (!process.argv.includes('--check')) {
    zipOf(OUT, join(HERE, `antu-workbuddy-${version}.zip`))
    zipOf(SKILL_OUT, join(HERE, `antu-workbuddy-skill-${version}.zip`))
    zipOf(SLIM_OUT, join(HERE, `antu-workbuddy-skill-slim-${version}.zip`))
  }
}
