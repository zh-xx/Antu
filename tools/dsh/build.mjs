#!/usr/bin/env node
// ============================================================
//  tools/dsh/build.mjs — assemble package/ for @zh-xx/antu-dsh
//
//  - Copy Host sources into package/ (index.js, lib/)
//  - Copy Client ModuleLoader entry
//  - Always rebuild @zh-xx/antu/embed and wrap it as client.embed.js
//  - Sync version from the repository package.json
//
//  Generated files under package/ are not committed (see .gitignore).
//
//    node tools/dsh/build.mjs
// ============================================================

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as viteBuild } from 'vite'

import { REPO_URL, thirdPartyNotices } from '../lib/notices.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '../..')
const SRC = join(HERE, 'src')
const PKG = join(HERE, 'package')
const EMBED_OUT = join(REPO, 'dist-embed/antu-embed.js')

function rootVersion() {
  return JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version
}

/** Always rebuild so a stale dist-embed without cardUi cannot ship. */
async function ensureEmbed() {
  await viteBuild({ configFile: join(REPO, 'vite.embed.config.js') })
  if (!existsSync(EMBED_OUT)) throw new Error('tools/dsh/build.mjs: embed build produced no antu-embed.js')
  const text = readFileSync(EMBED_OUT, 'utf8')
  if (!/\bas cardUi\b/.test(text) && !/\bcardUi\b/.test(text)) {
    throw new Error('tools/dsh/build.mjs: embed bundle is missing cardUi — rebuild from current src/embed')
  }
  return EMBED_OUT
}

/**
 * Wrap the self-contained ESM embed bundle as a ModuleLoader chunk.
 * The chunk must not sync-require other client*.js files (DSH protocol).
 * Vite's embed build is one file with a single trailing `export { … as … }`.
 */
function writeEmbedChunk(embedPath) {
  const esm = readFileSync(embedPath, 'utf8')
  const match = esm.match(/\nexport\s*\{([^}]+)\}\s*;?\s*$/)
  if (!match) {
    throw new Error('tools/dsh/build.mjs: antu-embed.js has no trailing named export block')
  }
  const body = esm.slice(0, match.index)
  // A future ESM with a live import cannot sit inside a plain factory function.
  if (/(?:^|\n)\s*import[\s{*]/.test(body) || /\bimport\.meta\b/.test(body)) {
    throw new Error(
      'tools/dsh/build.mjs: embed bundle has a top-level import or import.meta; refuse to wrap as a ModuleLoader chunk',
    )
  }
  const assigns = match[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const bits = part.split(/\s+as\s+/).map((s) => s.trim())
      const local = bits[0]
      const name = bits[1] || local
      return `    exports[${JSON.stringify(name)}] = ${local};`
    })
    .join('\n')

  // The card reads cardUi, and its kind strip reads kindsOf/kindIcon/kindLabel; keep them in the chunk
  // even if the embed's export block moves.
  for (const name of ['cardUi', 'kindsOf', 'kindIcon', 'kindLabel']) {
    if (!assigns.includes(`["${name}"]`)) {
      throw new Error(`tools/dsh/build.mjs: embed export list has no ${name}`)
    }
  }

  const wrapped = `window.__ModuleLoader__.load({
  id: '@zh-xx/antu-dsh',
  chunk: 'client.embed.js',
  factory() {
    const exports = {};
${body}
${assigns}
    return exports;
  },
});
`
  writeFileSync(join(PKG, 'client.embed.js'), wrapped)
}

/** Helper modules inlined into the ModuleLoader client entry (it has no ESM imports): marker, file, one name each must define */
const INLINED = [
  [
    '/*@@INJECT_CARD_MODEL@@*/',
    'card-model.mjs',
    [
      'parseArgsRaw',
      'kindChoices',
      'pickOpening',
      'effectiveTheme',
      'readerPick',
      'mountOptions',
      'renderFailure',
      'THEMES',
      'ANTU_DIAGRAMS_KIND',
      'antuDiagramsDefinition',
      'antuDiagramsStart',
      'antuDiagramsUpdate',
      'antuAddress',
      'parseAntuAddress',
      'browserReadsResourceHost',
      'diagramFromRecords',
      'isAntuRenderName',
      'isAppendSurfaceEvent',
    ],
  ],
  ['/*@@INJECT_LOCALE@@*/', 'locale.mjs', ['ANTU_NS', 'zh', 'en']],
  ['/*@@INJECT_REQUIRE_ASYNC@@*/', 'require-async.mjs', ['resolveRequireAsync', 'beginLoadEmbed']],
]

function writeClientEntry() {
  let out = readFileSync(join(SRC, 'client.js'), 'utf8')
  for (const [marker, file, names] of INLINED) {
    if (!out.includes(marker)) {
      throw new Error(`tools/dsh/build.mjs: client.js is missing the ${file} inject marker`)
    }
    const helper = readFileSync(join(SRC, file), 'utf8')
      // Drop the file banner; keep JSDoc / inline comments.
      .replace(/^\/\/ =+[\s\S]*?\/\/ =+\n+/, '')
      .replace(/^export /gm, '')
      .trim()
    for (const name of names) {
      if (!helper.includes(name)) throw new Error(`tools/dsh/build.mjs: ${file} is missing ${name}`)
    }
    out = out.replace(marker, helper)
  }
  writeFileSync(join(PKG, 'client.js'), out)
}

/** What npm shows and what the licence asks for: the readme, the licence and the notices of the code bundled in client.embed.js */
function writeDocs() {
  cpSync(join(HERE, 'README.md'), join(PKG, 'README.md'))
  cpSync(join(REPO, 'LICENSE'), join(PKG, 'LICENSE'))
  writeFileSync(join(PKG, 'THIRD-PARTY-NOTICES.md'), thirdPartyNotices())
}

function copyHost() {
  mkdirSync(join(PKG, 'lib'), { recursive: true })
  cpSync(join(SRC, 'tools.mjs'), join(PKG, 'lib', 'tools.mjs'))
  cpSync(join(SRC, 'skill.mjs'), join(PKG, 'lib', 'skill.mjs'))
  cpSync(join(SRC, 'require-async.mjs'), join(PKG, 'lib', 'require-async.mjs'))
  let host = readFileSync(join(SRC, 'host.mjs'), 'utf8')
  host = host
    .replace("from './tools.mjs'", "from './lib/tools.mjs'")
    .replace("from './skill.mjs'", "from './lib/skill.mjs'")
  writeFileSync(join(PKG, 'index.js'), host)
  writeClientEntry()
}

/** The DSH versions the plugin is tested on: 0.2.0-rc.2 and 0.2.1-rc.2, then any release of 0.2 */
const DSH_RANGE = '^0.2.0-rc.2 || ^0.2.1-rc.0'

function syncPackageJson() {
  const path = join(PKG, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  const version = rootVersion()
  pkg.version = version
  // Publishable as @zh-xx/antu-dsh (spec/dsh-plugin.md P2.x step 5); the first version goes out with a release.
  delete pkg.private
  pkg.publishConfig = { access: 'public' }
  pkg.license = 'AGPL-3.0-or-later'
  pkg.author = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).author
  pkg.homepage = `${REPO_URL}/tree/main/tools/dsh`
  pkg.repository = { type: 'git', url: `git+${REPO_URL}.git`, directory: 'tools/dsh' }
  pkg.bugs = { url: `${REPO_URL}/issues` }
  pkg.keywords = ['deepseek-harness', 'dsh-plugin', 'legal', 'diagram', 'antu']
  pkg.description =
    'Antu diagrams inside DeepSeek Harness: Host tools (antu_validate / antu_layout / antu_render) and an interactive chat card.'
  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    '@zh-xx/antu': version,
  }
  // Client chat card needs ModuleLoader require.async (package-local chunks) — DSH ≥ 0.2.0-rc.2.
  // Peers stay optional so a Host-only profile can still load the tools without the web Client stack.
  // A prerelease only satisfies a range that names a prerelease of the same x.y.z, so ^0.2.0-rc.2 alone leaves
  // out 0.2.1-rc.2 (tested working): the second range takes in the 0.2.1 prereleases.
  pkg.peerDependencies = {
    '@deepseek-ai/dsh-tools': DSH_RANGE,
    '@deepseek-ai/dsh-skill': DSH_RANGE,
  }
  pkg.peerDependenciesMeta = {
    '@deepseek-ai/dsh-tools': { optional: true },
    '@deepseek-ai/dsh-skill': { optional: true },
  }
  // The official bundles require the shared atoms from DSH's module table and declare the package
  // as a development dependency; the client manifest carries it as an informational inject entry.
  // The theme service is declared the same way: the plugin reads DSH's light / dark mode through it.
  pkg.devDependencies = {
    ...(pkg.devDependencies || {}),
    '@deepseek-ai/dsh-client-ui-primitives': '0.2.0-rc.2',
    '@deepseek-ai/dsh-client-ui-theme': '0.2.0-rc.2',
  }
  pkg.files = [
    'index.js',
    'client.js',
    'client.embed.js',
    'lib/',
    'cordis.patch.yml',
    'locale/',
    'icon.svg',
    'README.md',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
  ]
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.client = {
    platform: 'web',
    immediately: true,
    inject: [
      '@deepseek-ai/dsh-client-ui-tool',
      '@deepseek-ai/dsh-client-ui-sidebar-right',
      '@deepseek-ai/dsh-client-ui-chat',
      '@deepseek-ai/dsh-client-ui-conversation',
      // The full view is a resource: the provider (resources), its Session address (sessions) and
      // the history stream it pages through (remote.session).
      '@deepseek-ai/dsh-client-resources',
      '@deepseek-ai/dsh-api-session-controller',
      '@deepseek-ai/dsh-api-remotes',
      // Words come from the locale service; the compact tool row uses DSH's shared DisclosureRow.
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-primitives',
      // The diagram follows DSH's light / dark mode, read through the theme service.
      '@deepseek-ai/dsh-client-ui-theme',
    ],
  }
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** Prefer installing the tgz: a bare directory `link:` often lacks resolvable peers. */
function packTarball() {
  const isTgz = (n) => n.startsWith('zh-xx-antu-dsh-') && n.endsWith('.tgz')
  // Pack into a staging folder first: if npm pack fails, the tarball from the last good build stays.
  const staging = mkdtempSync(join(HERE, '.pack-'))
  try {
    try {
      execFileSync('npm', ['pack', '--pack-destination', staging], {
        cwd: PKG,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      })
    } catch (e) {
      const detail = String(e.stderr || e.stdout || e.message || e).trim()
      throw new Error(`tools/dsh/build.mjs: npm pack failed; the previous tarball (if any) is kept\n${detail}`, { cause: e })
    }
    const tgz = readdirSync(staging).find(isTgz)
    if (!tgz) throw new Error('tools/dsh/build.mjs: npm pack produced no tarball')
    for (const name of readdirSync(HERE)) {
      if (isTgz(name)) rmSync(join(HERE, name), { force: true })
    }
    renameSync(join(staging, tgz), join(HERE, tgz))
    return join(HERE, tgz)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

async function main() {
  copyHost()
  syncPackageJson()
  writeDocs()
  const embedPath = await ensureEmbed()
  writeEmbedChunk(embedPath)
  const dist = join(PKG, 'dist')
  if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })
  const tarball = packTarball()
  console.log(`@zh-xx/antu-dsh ${rootVersion()} → ${PKG}`)
  console.log(`tarball → ${tarball}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
