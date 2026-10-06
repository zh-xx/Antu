// ============================================================
//  tools/build-npm.mjs — build the npm package (dist-npm/)
//
//  One package, @zh-xx/antu, gives two commands: `antu` (the command line of the skill: validate, layout, render,
//  preview) and `antu-mcp` (the MCP server, started over stdio by a client). Both are one bundled file each, with
//  every dependency inside (vite.cli.config.js, vite.mcp.config.js), so `npx` downloads a small package and no tree
//  of others, and nothing is built on the user's machine. Beside them: the viewer page (the engine with the place
//  for the data left empty), the agent guides and the examples the server serves, the licence and the notices.
//
//  Nothing is written by hand twice: the files are the ones the repository has, and the version is package.json's
//  (spec/versioning.md). The package is made here and published from dist-npm/ (see #80); this script publishes nothing.
//
//    node tools/build-npm.mjs            write dist-npm/
//    node tools/build-npm.mjs --out DIR  write it into DIR instead
//
//  dist-npm/
//    package.json  README.md  LICENSE  THIRD-PARTY-NOTICES.md
//    bin/antu.mjs  bin/antu-mcp.mjs
//    assets/viewer.html
//    examples/     (the examples the server lists; not README.md)
//    spec/agent/   (the guide of each kind)
// ============================================================

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build as viteBuild } from 'vite'

import { REPO, buildViewerHtml, engineVersion, ensureEngine, readEngine } from './lib/make-html.mjs'
import { REPO_URL, licenseNotice, thirdPartyNotices } from './lib/notices.mjs'

export const PACKAGE_NAME = '@zh-xx/antu'
export const NPM_DIR = join(REPO, 'dist-npm')

/** package.json of the package, written from the repository's one (version, licence, author) */
export function packageJson() {
  const root = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
  return {
    name: PACKAGE_NAME,
    version: root.version,
    description: 'Antu: legal diagrams (fact, procedure, relationship, justification) from JSON, as one offline HTML page. The command line and the MCP server.',
    license: root.license,
    author: root.author,
    homepage: REPO_URL,
    repository: { type: 'git', url: `git+${REPO_URL}.git` },
    bugs: { url: `${REPO_URL}/issues` },
    keywords: ['legal', 'diagram', 'mcp', 'model-context-protocol', 'agent', 'visualization'],
    type: 'module',
    bin: { antu: 'bin/antu.mjs', 'antu-mcp': 'bin/antu-mcp.mjs' },
    engines: { node: '>=18' },
    publishConfig: { access: 'public' },
  }
}

/** A bundle with the licence notice in front of the code (the minifier drops comments, so it is put in here) */
function withNotice(code) {
  const [shebang, ...rest] = code.split('\n')
  const notice = licenseNotice(engineVersion())
    .split('\n')
    .map((line) => `// ${line}`.trimEnd())
    .join('\n')
  return `${shebang}\n${notice}\n${rest.join('\n')}`
}

async function bundle(config, built) {
  await viteBuild({ configFile: join(REPO, config) })
  return withNotice(readFileSync(join(REPO, built), 'utf8'))
}

/** Write the package into `dir`, replacing what is there */
export async function writeNpmPackage(dir = NPM_DIR) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'bin'), { recursive: true })
  mkdirSync(join(dir, 'assets'), { recursive: true })

  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(packageJson(), null, 2)}\n`)
  writeFileSync(join(dir, 'bin/antu.mjs'), await bundle('vite.cli.config.js', 'dist-cli/antu.mjs'), { mode: 0o755 })
  writeFileSync(join(dir, 'bin/antu-mcp.mjs'), await bundle('vite.mcp.config.js', 'dist-mcp/antu-mcp.mjs'), { mode: 0o755 })

  ensureEngine({ quiet: true })
  writeFileSync(join(dir, 'assets/viewer.html'), buildViewerHtml(readEngine()))

  cpSync(join(REPO, 'examples'), join(dir, 'examples'), { recursive: true, filter: (src) => !src.endsWith('README.md') })
  cpSync(join(REPO, 'spec/agent'), join(dir, 'spec/agent'), { recursive: true, filter: (src) => !src.endsWith('README.md') })

  writeFileSync(join(dir, 'LICENSE'), readFileSync(join(REPO, 'LICENSE'), 'utf8'))
  writeFileSync(join(dir, 'THIRD-PARTY-NOTICES.md'), thirdPartyNotices())
  writeFileSync(join(dir, 'README.md'), readme())
  return dir
}

function readme() {
  return `# ${PACKAGE_NAME}

Antu draws legal diagrams (fact timelines, procedure flowcharts, relationship diagrams, justification trees) from JSON,
as one HTML page that opens offline. This package holds its two commands.

- \`antu\`: the command line (\`validate\`, \`layout\`, \`render\`, \`preview\`; \`antu --version\`).
- \`antu-mcp\`: the MCP server, started by an MCP client over stdio.

Install guidance for each client, the guides and the source are in the repository: ${REPO_URL}

Licence: AGPL-3.0-or-later (LICENSE); the notices of the code of others inside the files are in THIRD-PARTY-NOTICES.md.
`
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out')
  const dir = writeNpmPackage(i >= 0 ? resolve(process.argv[i + 1]) : NPM_DIR)
  const out = await dir
  process.stdout.write(`${out}\n`)
  if (!existsSync(join(out, 'bin/antu-mcp.mjs'))) process.exit(1)
}

