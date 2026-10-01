// ============================================================
//  tools/lib/make-html.mjs —— the only implementation that builds the self-contained HTML
//
//  This logic used to have one copy in tools/make-html.mjs and another in
//  tools/mcp/engine.mjs, 83% similar (the escaping rules, the HTML skeleton and the
//  title escaping were all duplicated). Changing one and forgetting the other showed up
//  as "the HTML produced by one path is wrong", which is very hard to notice. There is
//  now only this one, and both the command-line tool and MCP call it.
//
//  Product: one .html file with the engine (JS + CSS) and the data all inlined,
//  double-click to view, no network, no server.
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SPEC_MARKER, escapeForScript } from './fill.mjs'
import { licenseNotice } from './notices.mjs'

/** The repository root. This file is under tools/lib/, so two levels up. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const ENGINE_JS = join(REPO, 'dist-engine/engine.js')
const ENGINE_CSS = join(REPO, 'dist-engine/engine.css')

/** The engine sources. If the products are older than these, a rebuild is due. */
const ENGINE_SOURCES = ['src', 'vite.engine.config.js']

/** Engine code only: handle `</script` and keep every other character as it is */
export function escapeEngineCode(code) {
  return String(code).replace(/<\/script/gi, '<\\/script')
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}

function newestMtime(paths) {
  let newest = 0
  const walk = (p) => {
    if (!existsSync(p)) return
    const st = statSync(p)
    if (st.isDirectory()) for (const n of readdirSync(p)) walk(join(p, n))
    else newest = Math.max(newest, st.mtimeMs)
  }
  for (const p of paths) walk(resolve(REPO, p))
  return newest
}

/**
 * Whether the engine needs rebuilding.
 *
 * Why not just check whether the product exists: if you change the sources without
 * rebuilding, the generated HTML carries the old engine, and it **raises no error and
 * cannot be seen** (this pitfall has been hit). So judge by source modification time.
 */
export function needsEngineBuild() {
  if (!existsSync(ENGINE_JS) || !existsSync(ENGINE_CSS)) return true
  return newestMtime(ENGINE_SOURCES) > statSync(ENGINE_JS).mtimeMs
}

/** Build the engine if needed. With quiet, the build output is suppressed (MCP does not need it flooding the screen). */
export function ensureEngine({ force = false, quiet = false } = {}) {
  if (!force && !needsEngineBuild()) return false
  execFileSync('npx', ['vite', 'build', '--config', 'vite.engine.config.js'], {
    cwd: REPO,
    stdio: quiet ? 'pipe' : 'inherit',
  })
  return true
}

/** Read the engine products */
export function readEngine() {
  return { js: readFileSync(ENGINE_JS, 'utf8'), css: readFileSync(ENGINE_CSS, 'utf8') }
}

/**
 * Assemble one self-contained HTML.
 * @param spec   the antu JSON
 * @param engine { js, css } the engine products (the caller does ensureEngine + readEngine first)
 * @param preset optional. Render with the given orientation/fields/view from the start (MCP preview needs to specify these)
 */
// SPEC_MARKER and escapeForScript are in ./fill.mjs (the command line in the skill bundles that file alone)
export { SPEC_MARKER, escapeForScript }

/** The engine's version, from package.json (written once there; spec/versioning.md) */
export function engineVersion() {
  return JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version
}

/**
 * A viewer template: the same page as buildHtml gives, with the data left out for someone else to fill in
 * (an agent that has no Node: it swaps SPEC_MARKER for the JSON). One page, two ways to make it.
 */
export function buildViewerHtml({ js, css } = {}) {
  return buildHtml(undefined, { js, css })
}

export function buildHtml(spec, { js, css, preset } = {}) {
  const title = escapeHtml(spec?.title || 'antu')
  return `<!DOCTYPE html>
<!-- lang is the document language, not the data language. The UI can be switched at
     runtime (see src/core/i18n.js), so index.html rewrites this attribute on boot to
     match the chosen interface language; 'en' is the default here because English is
     this project's default language. -->
<html lang="en" data-antu-lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · antu</title>
<meta name="generator" content="antu ${engineVersion()}">
<script type="text/plain" id="antu-license">
${escapeEngineCode(licenseNotice(engineVersion()))}
</script>
<style>
html, body { margin: 0; height: 100%; font-family: system-ui, "Microsoft YaHei", sans-serif; }
#root { height: 100%; }
${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__ANTU_SPEC__ = ${spec === undefined ? SPEC_MARKER : escapeForScript(JSON.stringify(spec))};</script>
${preset ? `<script>window.__ANTU_PRESET__ = ${escapeForScript(JSON.stringify(preset))};</script>` : ''}
<script>${escapeEngineCode(js)}</script>
</body>
</html>
`
}

/** Replace characters that cannot go into a file name; truncate if too long */
export function slugify(text) {
  return String(text || 'antu')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 60)
}

/**
 * All in one: make sure the engine is fresh → assemble the HTML → write the file.
 * Without outPath it writes to dist-html/<title>.html.
 */
export function renderToFile(spec, { outPath, preset, force = false, quiet = false } = {}) {
  ensureEngine({ force, quiet })
  const engine = readEngine()
  const html = buildHtml(spec, { ...engine, preset })
  const target = resolve(outPath || join(REPO, 'dist-html', `${slugify(spec?.title)}.html`))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, html)
  return { path: target, bytes: Buffer.byteLength(html) }
}
