// ============================================================
//  tools/build-skill.mjs — build the agent skill (skills/antu/)
//
//  The skill is what an agent is given to draw with antu when it has no MCP server: how to choose a diagram,
//  the guide and field table of each kind, examples, and a viewer page to put the data into. The formats it
//  installs into (Claude Code, Codex, WorkBuddy, `npx skills`) all read a folder with a SKILL.md.
//
//  Nothing in it is written by hand twice (CONTRIBUTING rule 7): the guides are spec/agent/<kind>/guide.md,
//  the field tables come from each kind's knowledge (the same text `antu_schema` gives), the examples are
//  examples/agent/, the version is package.json's. Only SKILL.md (tools/skill/SKILL.md) and the Python
//  filler (tools/skill/make_html.py) are authored, and they live in tools/skill/.
//
//  The skill folder is committed, and it is the state of the **last release**: it is rebuilt in the release
//  pull request (spec/versioning.md), not in every change, so a person who installs it from the repository
//  never gets guides that are newer than the viewer beside them.
//
//    node tools/build-skill.mjs            write skills/antu/
//    node tools/build-skill.mjs --out DIR  write the same into DIR instead (CI tests main's command line this way,
//                                          without touching the committed folder, which is the last release)
//    node tools/build-skill.mjs --check    say whether skills/antu/ is what a build would write (exit 1 if not)
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { build as viteBuild } from 'vite'

import { REPO, SPEC_MARKER, buildViewerHtml, engineVersion, ensureEngine, readEngine } from './lib/make-html.mjs'
import { describeSchema, listKnowledgeTypes, readAgentGuide } from './mcp/engine.mjs'
import { ADDITIONAL_PERMISSION, COPYRIGHT, LICENSE_SPDX, REPO_URL, licenseNotice, thirdPartyNotices } from './lib/notices.mjs'

export const SKILL_DIR = join(REPO, 'skills/antu')
const VIEWER = 'assets/viewer.html'
/** The command line, bundled into one file (vite.cli.config.js): large, and rebuilt by every build like the viewer */
const CLI = 'scripts/antu.mjs'

/**
 * Files the sources add to the skill after the last release. The skill folder is the state of the last release and
 * is rebuilt in the release pull request, so such a file is missing from the folder until then: a check made between
 * releases (`checkSkill({ strict: false })`, the unit test) lets it be missing, the release workflow's check
 * (`--check`) does not. The release pull request empties this list.
 */
export const ADDED_SINCE_RELEASE = []

/** The licence notes of the skill: what an agent may say when asked, written from the same text as the pages and the notices */
export function licenseNotes() {
  return `# Licence notes

${COPYRIGHT}. Antu is free software under the GNU Affero General Public License, version 3 or any later version (\`LICENSE\`, SPDX \`${LICENSE_SPDX}\`). The source is at ${REPO_URL}.

In short: it may be used, changed and shared, including commercially. A changed version that is shared, or offered to others over a network, must be released under the same licence, with the notices kept and the source made available. There is no warranty. This summary is not the licence; the text in \`LICENSE\` is.

${ADDITIONAL_PERMISSION.join('\n')}

The code of other projects inside the viewer page and the command line keeps its own licence; its notices are in \`THIRD-PARTY-NOTICES.md\`. Every page this skill makes carries the licence and the place of the source (the block \`antu-license\` in the page).
`
}

/** Every file of the skill except the viewer (which is large and is checked by its stamp), as path -> text */
export function skillFiles() {
  const version = engineVersion()
  const files = new Map()
  const authored = (name) => readFileSync(join(REPO, 'tools/skill', name), 'utf8')

  files.set('SKILL.md', authored('SKILL.md').replaceAll('{{version}}', version))
  files.set('scripts/make_html.py', authored('make_html.py'))

  const types = listKnowledgeTypes().map((t) => t.type)
  for (const type of types) {
    const guide = readAgentGuide(type)
    if (!guide) throw new Error(`no agent guide for "${type}" (spec/agent/${type}/guide.md)`)
    files.set(`references/guide-${type}.md`, guide)
    const fields = describeSchema(type)
    if (!fields.ok) throw new Error(fields.reason)
    files.set(`references/fields-${type}.md`, `# Fields of the ${type} diagram\n\n\`\`\`\n${fields.text}\n\`\`\`\n`)

    const dir = join(REPO, 'examples/agent', type)
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      files.set(`examples/${type}/${f}`, readFileSync(join(dir, f), 'utf8'))
    }
  }
  files.set('VERSION', `${version}\n`)
  // the licence of antu, and the notices of the code of others that is inside the viewer and the command line:
  // they travel with the skill (so with the zip)
  files.set('LICENSE', readFileSync(join(REPO, 'LICENSE'), 'utf8'))
  files.set('THIRD-PARTY-NOTICES.md', thirdPartyNotices())
  files.set('LICENSE-NOTES.md', licenseNotes())
  return files
}

/** The viewer page: the engine with the place for the data left empty */
function viewerHtml() {
  ensureEngine({ quiet: true })
  const { js, css } = readEngine()
  return buildViewerHtml({ js, css })
}

/**
 * The command line as one file: every dependency inside, so it runs with nothing installed beside it.
 * The licence notice is put in front of the code here and not through the bundler's banner option: the minifier
 * drops comments, banner or not, and a notice that is built in but not in the file is no notice.
 */
async function buildCli(dir) {
  await viteBuild({ configFile: join(REPO, 'vite.cli.config.js') })
  const [shebang, ...code] = readFileSync(join(REPO, 'dist-cli/antu.mjs'), 'utf8').split('\n')
  const notice = licenseNotice(engineVersion())
    .split('\n')
    .map((line) => `// ${line}`.trimEnd())
    .join('\n')
  writeFileSync(join(dir, CLI), `${shebang}\n${notice}\n${code.join('\n')}`)
}

/** Write the skill into `dir` (skills/antu/ by default), replacing what is there */
export async function writeSkill(dir = SKILL_DIR) {
  rmSync(dir, { recursive: true, force: true })
  for (const [path, text] of skillFiles()) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, VIEWER), viewerHtml())
  await buildCli(dir)
}

/** Differences between the skill folder and a build: [] when there are none */
export function checkSkill({ strict = true } = {}) {
  const problems = []
  const version = engineVersion()
  const want = skillFiles()
  for (const [path, text] of want) {
    const file = join(SKILL_DIR, path)
    if (!existsSync(file)) {
      if (strict || !ADDED_SINCE_RELEASE.includes(path)) problems.push(`missing: ${path}`)
    } else if (readFileSync(file, 'utf8') !== text) problems.push(`differs from a build: ${path}`)
  }
  const have = []
  const walk = (dir, prefix = '') => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${prefix}${e.name}/`)
      else have.push(`${prefix}${e.name}`)
    }
  }
  walk(SKILL_DIR)
  for (const path of have) if (!want.has(path) && path !== VIEWER && path !== CLI) problems.push(`not part of a build: ${path}`)

  // The viewer is 2 MB and changes with every source change, so it is not compared byte for byte: it must be
  // a viewer template of this version.
  const viewer = join(SKILL_DIR, VIEWER)
  if (!existsSync(viewer)) problems.push(`missing: ${VIEWER}`)
  else {
    const html = readFileSync(viewer, 'utf8')
    if (html.split(SPEC_MARKER).length !== 2) problems.push(`${VIEWER} does not hold exactly one ${SPEC_MARKER}`)
    if (!html.includes(`<meta name="generator" content="antu ${version}">`)) problems.push(`${VIEWER} is not a build of antu ${version}`)
    if (!html.includes('<script type="text/plain" id="antu-license">')) problems.push(`${VIEWER} carries no licence notice`)
  }

  // The command line is 1.5 MB of bundled code: like the viewer it is not compared byte for byte. It is run, and
  // must say it is this version.
  const cli = join(SKILL_DIR, CLI)
  if (!existsSync(cli)) problems.push(`missing: ${CLI}`)
  else {
    try {
      const said = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim()
      if (said !== `antu ${version}`) problems.push(`${CLI} says "${said}", not "antu ${version}"`)
      if (!readFileSync(cli, 'utf8').slice(0, 2000).includes('GNU Affero General Public')) problems.push(`${CLI} carries no licence notice`)
    } catch (e) {
      problems.push(`${CLI} does not run: ${String(e.message).split('\n')[0]}`)
    }
  }
  return problems
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  if (process.argv.includes('--check')) {
    const problems = checkSkill()
    if (problems.length) {
      console.error(`skills/antu is not what a build of ${engineVersion()} writes:\n  ${problems.join('\n  ')}\nrun: npm run build:skill`)
      process.exit(1)
    }
    console.log(`skills/antu is a build of ${engineVersion()}`)
  } else {
    const i = process.argv.indexOf('--out')
    const dir = i > 0 ? resolve(process.argv[i + 1] ?? '') : SKILL_DIR
    if (i > 0 && !process.argv[i + 1]) {
      console.error('--out needs a directory')
      process.exit(2)
    }
    await writeSkill(dir)
    console.log(`wrote ${dir}`)
  }
}
