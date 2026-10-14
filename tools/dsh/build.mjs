#!/usr/bin/env node
// ============================================================
//  tools/dsh/build.mjs — assemble package/ for @zh-xx/antu-dsh
//
//  - Copy Host sources into package/ (index.js, lib/)
//  - Copy Client ModuleLoader entry
//  - Build / reuse @zh-xx/antu/embed and wrap it as client.embed.js
//  - Sync version from the repository package.json
//
//    node tools/dsh/build.mjs
// ============================================================

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

async function ensureEmbed() {
  if (existsSync(EMBED_OUT)) return EMBED_OUT
  const npmEmbed = join(REPO, 'dist-npm/embed/antu-embed.js')
  if (existsSync(npmEmbed)) return npmEmbed
  await viteBuild({ configFile: join(REPO, 'vite.embed.config.js') })
  if (!existsSync(EMBED_OUT)) throw new Error('tools/dsh/build.mjs: embed build produced no antu-embed.js')
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

function copyHost() {
  mkdirSync(join(PKG, 'lib'), { recursive: true })
  cpSync(join(SRC, 'tools.mjs'), join(PKG, 'lib', 'tools.mjs'))
  cpSync(join(SRC, 'skill.mjs'), join(PKG, 'lib', 'skill.mjs'))
  // Host entry: rewrite relative imports to ./lib/
  let host = readFileSync(join(SRC, 'host.mjs'), 'utf8')
  host = host
    .replace("from './tools.mjs'", "from './lib/tools.mjs'")
    .replace("from './skill.mjs'", "from './lib/skill.mjs'")
  writeFileSync(join(PKG, 'index.js'), host)
  cpSync(join(SRC, 'client.js'), join(PKG, 'client.js'))
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
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

async function main() {
  copyHost()
  syncPackageJson()
  const embedPath = await ensureEmbed()
  writeEmbedChunk(embedPath)
  // Drop any stale dist/ folder from earlier scaffold notes.
  const dist = join(PKG, 'dist')
  if (existsSync(dist)) rmSync(dist, { recursive: true, force: true })
  console.log(`@zh-xx/antu-dsh ${rootVersion()} → ${PKG}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
