// ============================================================
//  tools/lib/make-html.mjs —— 生成自包含 HTML 的唯一实现
//
//  这段逻辑原先在 tools/make-html.mjs 和 tools/mcp/engine.mjs 里
//  各有一份，相似度 83%（转义规则、HTML 骨架、标题转义都重复了）。
//  改一处忘一处，症状是"某一条路生成出来的 HTML 不对"，很难发现。
//  现在只有这一份，命令行工具和 MCP 都调它。
//
//  产物：一个 .html 文件，引擎（JS + CSS）和数据全部内联在里面，
//  双击就能看，不联网、不要服务器。
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根目录。本文件在 tools/lib/ 下，所以往上两级。 */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const ENGINE_JS = join(REPO, 'dist-engine/engine.js')
const ENGINE_CSS = join(REPO, 'dist-engine/engine.css')

/** 引擎的源码。产物比它们旧就说明该重新构建了。 */
const ENGINE_SOURCES = ['src', 'vite.engine.config.js']

/**
 * 内联时的转义。
 *
 * 两个坑：
 *   数据里出现 `</script` 会提前把脚本块关掉 → JSON 里的 `<` 一并转义成 \u003c
 *   引擎代码里同样可能出现 `</script`（字符串常量里） → 同样处理
 */
export function escapeForScript(text) {
  return String(text).replace(/</g, '\\u003c')
}

/** 引擎代码专用：只处理 `</script`，其余字符原样保留 */
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
 * 引擎该不该重新构建。
 *
 * 为什么不能只看"产物在不在"：改完源码不重新构建，生成出来的 HTML 里
 * 装的就是旧引擎，而且**不报错、看不出来**（这个坑踩过）。
 * 所以按源码修改时间判断。
 */
export function needsEngineBuild() {
  if (!existsSync(ENGINE_JS) || !existsSync(ENGINE_CSS)) return true
  return newestMtime(ENGINE_SOURCES) > statSync(ENGINE_JS).mtimeMs
}

/** 需要就构建引擎。quiet 时把构建输出收起来（MCP 里不需要刷屏）。 */
export function ensureEngine({ force = false, quiet = false } = {}) {
  if (!force && !needsEngineBuild()) return false
  execFileSync('npx', ['vite', 'build', '--config', 'vite.engine.config.js'], {
    cwd: REPO,
    stdio: quiet ? 'pipe' : 'inherit',
  })
  return true
}

/** 读引擎产物 */
export function readEngine() {
  return { js: readFileSync(ENGINE_JS, 'utf8'), css: readFileSync(ENGINE_CSS, 'utf8') }
}

/**
 * 拼出一个自包含 HTML。
 * @param spec   案图的 JSON
 * @param engine { js, css } 引擎产物（由调用方先 ensureEngine + readEngine）
 * @param preset 可选。开局就用指定的方向/字段/视角渲染（MCP 预览要能指定这些）
 */
export function buildHtml(spec, { js, css, preset } = {}) {
  const title = escapeHtml(spec?.title || '案图')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · 案图</title>
<style>
html, body { margin: 0; height: 100%; font-family: system-ui, "Microsoft YaHei", sans-serif; }
#root { height: 100%; }
${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__ANTU_SPEC__ = ${escapeForScript(JSON.stringify(spec))};</script>
${preset ? `<script>window.__ANTU_PRESET__ = ${escapeForScript(JSON.stringify(preset))};</script>` : ''}
<script>${escapeEngineCode(js)}</script>
</body>
</html>
`
}

/** 文件名里不能有的字符换掉，太长截断 */
export function slugify(text) {
  return String(text || 'antu')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 60)
}

/**
 * 一步到位：确保引擎是新的 → 拼 HTML → 写文件。
 * 不传 outPath 就写到 dist-html/<标题>.html。
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
