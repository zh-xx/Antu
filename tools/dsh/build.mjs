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

  if (!assigns.includes('["cardUi"]') && !assigns.includes("['cardUi']")) {
    throw new Error('tools/dsh/build.mjs: embed export list has no cardUi')
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
      'pickOpening',
      'mountOptions',
      'renderFailure',
      'THEMES',
      'ANTU_DIAGRAMS_KIND',
      'antuDiagramsDefinition',
      'antuDiagramsStart',
      'antuDiagramsUpdate',
      'isAntuRenderName',
      'isAppendSurfaceEvent',
    ],
  ],
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
  // Plugin UI words live in package/locale/*.json (the Host manifest already ships them); inline the
  // `client` half into the ModuleLoader entry, which has no ESM imports to read them at runtime.
  const localeMarker = '/*@@INJECT_LOCALE@@*/'
  if (!out.includes(localeMarker)) {
    throw new Error('tools/dsh/build.mjs: client.js is missing the locale inject marker')
  }
  const readClientLocale = (name) => {
    const path = join(PKG, 'locale', name)
    if (!existsSync(path)) throw new Error(`tools/dsh/build.mjs: missing locale file ${path}`)
    return JSON.parse(readFileSync(path, 'utf8')).client || {}
  }
  const locale = { zh: readClientLocale('zh.json'), en: readClientLocale('en.json') }
  out = out.replace(localeMarker, () => `const LOCALE = ${JSON.stringify(locale)}`)
  writeFileSync(join(PKG, 'client.js'), out)
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

function syncPackageJson() {
  const path = join(PKG, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  const version = rootVersion()
  pkg.version = version
  pkg.private = true
  pkg.description =
    'Antu diagrams inside DeepSeek Harness: Host tools (antu_validate / antu_layout / antu_render) and an interactive chat card.'
  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    '@zh-xx/antu': version,
  }
  // Client chat card needs ModuleLoader require.async (package-local chunks) — DSH ≥ 0.2.0-rc.2.
  // Peers stay optional so a Host-only profile can still load the tools without the web Client stack.
  pkg.peerDependencies = {
    '@deepseek-ai/dsh-tools': '^0.2.0-rc.2',
    '@deepseek-ai/dsh-skill': '^0.2.0-rc.2',
  }
  pkg.peerDependenciesMeta = {
    '@deepseek-ai/dsh-tools': { optional: true },
    '@deepseek-ai/dsh-skill': { optional: true },
  }
  pkg.files = [
    'index.js',
    'client.js',
    'client.embed.js',
    'lib/',
    'cordis.patch.yml',
    'locale/',
    'icon.svg',
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
