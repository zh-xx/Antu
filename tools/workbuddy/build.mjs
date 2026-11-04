#!/usr/bin/env node
// ============================================================
//  tools/workbuddy/build.mjs —— WorkBuddy skill packages (no connector)
//
//  Builds the skill-only package for WorkBuddy's open platform from skills/antu/
//  (so guides, field tables, examples and scripts stay in one place), with the
//  header fields the platform asks of a skill and a short section on what to do
//  there. The MCP connector package is retired; this file only builds skills.
//
//  Usage: node tools/workbuddy/build.mjs [--check]
//    --check   build, check the results against the platform's rules, and stop (no zip)
//  Output (not committed): tools/workbuddy/package-skill/antu/ + antu-workbuddy-skill-<version>.zip,
//                          tools/workbuddy/package-skill-slim/antu/ + antu-workbuddy-skill-slim-<version>.zip
//                          (slim is in reserve; the release attaches only the full skill zip)
// ============================================================

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, 'src')
/** Market avatar: 512×512 JPG/PNG ≤ 500 KB (SVG is not accepted). Source of the design stays as icon.svg. */
const ICON_PNG = join(SRC, 'icon.png')
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
export const ICON_MAX_BYTES = 500_000
export const ICON_SIZE_PX = 512

/** Market listing names (0.19+ display names). Machine id stays `antu`. */
export const DISPLAY_NAME_ZH = '案图 · 诉讼可视化'
export const DISPLAY_NAME_EN = 'Antu · Legal Diagrams'
export const DISPLAY_NAME_SLIM_ZH = '案图 · 诉讼可视化（精简）'
export const DISPLAY_NAME_SLIM_EN = 'Antu · Legal Diagrams (slim)'

/**
 * Platform-facing capability blurbs (description_zh / description_en) for non-technical WorkBuddy users:
 * diagram kinds and what they help with — no JSON / tooling jargon.
 */
export const DESCRIPTION_ZH =
  '案图帮你画法律图：案情时间线、程序流程、主体关系、裁判说理，一张图说清一件事，可保存、可转发。'
export const DESCRIPTION_EN =
  'Turn a case into clear visuals: what happened, how the process runs, who is connected, and how the court reasoned—four diagram types you can open and share offline.'
export const DESCRIPTION_SLIM_ZH = DESCRIPTION_ZH
export const DESCRIPTION_SLIM_EN = DESCRIPTION_EN

export const repoVersion = () => JSON.parse(readFileSync(join(HERE, '../../package.json'), 'utf8')).version

/** Double-quoted YAML scalar — needed when the value contains `:` (platform parse error otherwise). */
export const yamlDouble = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const SKILL_HEADER = (version, description, slim) => `---
name: antu
display_name: ${yamlDouble(slim ? DISPLAY_NAME_SLIM_ZH : DISPLAY_NAME_ZH)}
display_name_en: ${yamlDouble(slim ? DISPLAY_NAME_SLIM_EN : DISPLAY_NAME_EN)}
description: >-
${description
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
description_zh: ${yamlDouble(slim ? DESCRIPTION_SLIM_ZH : DESCRIPTION_ZH)}
description_en: ${yamlDouble(slim ? DESCRIPTION_SLIM_EN : DESCRIPTION_EN)}
version: "${version}"
author: Jicheng
license: AGPL-3.0-or-later
---
`

const IN_WORKBUDDY = `## In WorkBuddy

- **If you can call the tools \`antu_validate\`, \`antu_layout\` and \`antu_render\`**, use them and ignore the scripts below: they do the same.
- **Otherwise the scripts need Node 18 or newer.** Check once with \`node --version\`. If Node is missing but \`python3\` works, use the Python fallback of step 3 (it only makes the page, it cannot check the data). If neither works, tell the user plainly that Antu cannot run here, and that installing Node.js (LTS) fixes it. Never claim a diagram was made when it was not.
- \`<skill-dir>\` is the folder this \`SKILL.md\` is in; WorkBuddy keeps installed skills in \`~/.workbuddy/skills/antu/\` (or the \`.workbuddy/skills/antu/\` of a project). Write the user's JSON and the page in the folder they work in, never in the skill folder.
- Updates come through WorkBuddy's market: do not run \`npx skills update\`.

`

/**
 * The slim variant: no command line in the package, the model fetches it from npm with npx (pinned to this version).
 * Kept in reserve for the day the full package no longer fits the platform's 3 MB; see README.md.
 */
const slimWorkBuddy = (version) => `## In WorkBuddy

- **If you can call the tools \`antu_validate\`, \`antu_layout\` and \`antu_render\`**, use them and ignore the commands below: they do the same.
- **Otherwise the command line comes from npm**, so it needs Node 18 or newer, npm, and a network the first time (it is cached afterwards). Check once with \`node --version\` and \`npm --version\`. The commands of step 3 are written \`npx -y -p @zh-xx/antu@${version} antu <command> …\`. If the download is slow or fails, add \`--registry https://registry.npmmirror.com\` after \`npx\` (the mirror can lag a few minutes behind a new version; then try \`--registry https://registry.npmjs.org\`).
- **If Node, npm or the network is missing but \`python3\` works**, use the Python fallback of step 3 (\`scripts/make_html.py\`, which is in this folder): it only makes the page and cannot check the data. If nothing works, tell the user plainly that Antu cannot run here, and that installing Node.js (LTS) fixes it. Never claim a diagram was made when it was not.
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

  if (!existsSync(ICON_PNG)) throw new Error('tools/workbuddy/src/icon.png is missing (512×512 PNG for the market avatar)')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  cpSync(SKILL_SOURCE, root, { recursive: true })
  cpSync(ICON_PNG, join(root, 'icon.png'))
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
  for (const f of [...(slim ? [] : ['scripts/antu.mjs']), 'scripts/make_html.py', 'assets/viewer.html.gz', 'icon.png', 'references/guide-fact.md', 'examples/fact-1-minimal.zh-CN.json']) {
    if (!existsSync(join(dir, f))) bad.push(`${f}: missing`)
  }
  if (existsSync(join(dir, 'icon.png'))) {
    const iconBytes = readFileSync(join(dir, 'icon.png'))
    if (iconBytes.length > ICON_MAX_BYTES) bad.push(`icon.png: ${iconBytes.length} bytes; WorkBuddy takes ${ICON_MAX_BYTES} at most`)
    if (iconBytes[0] !== 0x89 || iconBytes[1] !== 0x50) bad.push('icon.png: must be a PNG (JPG also allowed by the platform; we ship PNG)')
    // IHDR width/height are big-endian at bytes 16..23 of a standard PNG
    const w = iconBytes.readUInt32BE(16)
    const h = iconBytes.readUInt32BE(20)
    if (w !== ICON_SIZE_PX || h !== ICON_SIZE_PX) bad.push(`icon.png: ${w}×${h}; WorkBuddy asks for ${ICON_SIZE_PX}×${ICON_SIZE_PX}`)
  }
  if (existsSync(join(dir, 'icon.svg'))) bad.push('icon.svg: ship icon.png only — the market avatar rejects SVG')
  const wantName = slim ? DISPLAY_NAME_SLIM_ZH : DISPLAY_NAME_ZH
  const wantNameEn = slim ? DISPLAY_NAME_SLIM_EN : DISPLAY_NAME_EN
  if (!front.includes(`display_name: ${yamlDouble(wantName)}`) && !front.includes(`display_name: ${wantName}`)) {
    bad.push(`SKILL.md: display_name must be ${wantName}`)
  }
  if (!front.includes(`display_name_en: ${yamlDouble(wantNameEn)}`) && !front.includes(`display_name_en: ${wantNameEn}`)) {
    bad.push(`SKILL.md: display_name_en must be ${wantNameEn}`)
  }
  // Values with `:` must be quoted or the platform's YAML parser fails
  // ("mapping values are not allowed in this context").
  for (const [k, v] of [
    ['description_zh', slim ? DESCRIPTION_SLIM_ZH : DESCRIPTION_ZH],
    ['description_en', slim ? DESCRIPTION_SLIM_EN : DESCRIPTION_EN],
  ]) {
    if (!front.includes(`${k}: ${yamlDouble(v)}`)) bad.push(`SKILL.md: ${k} must be a double-quoted YAML string`)
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
  const skillDir = buildSkillFolder(version)
  const slimDir = buildSkillFolder(version, { slim: true })
  const bad = [
    ...checkSkillFolder(skillDir, version).map((b) => `skill: ${b}`),
    ...checkSkillFolder(slimDir, version, { slim: true }).map((b) => `skill (slim): ${b}`),
  ]
  if (bad.length) {
    console.error(bad.map((b) => `✗ ${b}`).join('\n'))
    process.exit(1)
  }
  console.log(`skill folder ok: ${skillDir}`)
  console.log(`skill (slim) folder ok: ${slimDir}`)
  if (!process.argv.includes('--check')) {
    zipOf(SKILL_OUT, join(HERE, `antu-workbuddy-skill-${version}.zip`))
    zipOf(SLIM_OUT, join(HERE, `antu-workbuddy-skill-slim-${version}.zip`))
  }
}
