#!/usr/bin/env node
// ============================================================
//  tools/make-html.mjs —— 把一份规范 JSON 变成一个自包含的 HTML
//
//  产物是一个 .html 文件：双击就能打开，不要服务器、不联网、可离线。
//  引擎（JS + CSS）和数据（JSON）全部内联在这一个文件里，
//  所以发给别人、归档、当附件都没问题。
//
//  用法：
//    node tools/make-html.mjs <规范.json> [-o 输出.html] [--rebuild]
//    npm run diagram -- examples/xxx.json
//
//  引擎源码有改动时会自动重新构建；--rebuild 强制重建。
//
//  不指定 -o 时，输出与输入同目录同名，后缀换成 .html。
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
  console.log('用法：node tools/make-html.mjs <规范.json> [-o 输出.html]')
  process.exit(argv.length === 0 ? 1 : 0)
}

const specPath = resolve(argv[0])
const oi = argv.findIndex((a) => a === '-o' || a === '--out')
const outPath = oi >= 0 && argv[oi + 1]
  ? resolve(argv[oi + 1])
  : join(dirname(specPath), basename(specPath).replace(/\.json$/i, '') + '.html')

if (!existsSync(specPath)) {
  console.error('找不到规范文件：' + specPath)
  process.exit(1)
}

let spec
try {
  spec = JSON.parse(readFileSync(specPath, 'utf8'))
} catch (e) {
  console.error('规范文件不是合法 JSON：' + e.message)
  process.exit(1)
}

// 什么时候需要重新构建引擎：
//   产物不存在，或者源码比产物新。
// 只看"产物存不存在"是不够的：改完源码不重新构建，生成出来的 HTML
// 里装的就是旧引擎，而且不报错、看不出来（踩过这个坑）。
const ENGINE_JS = resolve('dist-engine/engine.js')
const ENGINE_CSS = resolve('dist-engine/engine.css')
const SOURCES = ['src', 'vite.engine.config.js', 'package.json']

/** 取一组路径里最新的修改时间 */
function newestMtime(paths) {
  let newest = 0
  const walk = (p) => {
    if (!existsSync(p)) return
    const st = statSync(p)
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) walk(join(p, name))
    } else {
      newest = Math.max(newest, st.mtimeMs)
    }
  }
  for (const p of paths) walk(resolve(p))
  return newest
}

const force = argv.includes('--rebuild')
const built = existsSync(ENGINE_JS) && existsSync(ENGINE_CSS) ? statSync(ENGINE_JS).mtimeMs : 0
if (force || !built || newestMtime(SOURCES) > built) {
  console.log(built ? '引擎源码有改动，重新构建……' : '引擎还没构建，先构建……')
  execFileSync('npx', ['vite', 'build', '--config', 'vite.engine.config.js'], { stdio: 'inherit' })
}

const js = readFileSync(ENGINE_JS, 'utf8')
const css = readFileSync(ENGINE_CSS, 'utf8')

// 内联的两个坑：
//   1. 数据或代码里出现 </script 会提前把脚本块关掉
//   2. JSON 里的 < 一并转义最省心
const safeJson = JSON.stringify(spec).replace(/</g, '\\u003c')
const safeJs = js.replace(/<\/script/gi, '<\\/script')
const title = spec.title || '案图'
const escapeHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} · 案图</title>
<style>
html, body { margin: 0; height: 100%; font-family: system-ui, "Microsoft YaHei", sans-serif; }
#root { height: 100%; }
${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__ANTU_SPEC__ = ${safeJson};</script>
<script>${safeJs}</script>
</body>
</html>
`

writeFileSync(outPath, html)
const kb = (p) => (statSync(p).size / 1024).toFixed(0) + ' KB'
console.log(`已生成 ${outPath}`)
console.log(`  数据 ${kb(specPath)}　引擎 ${kb(ENGINE_JS)} + ${kb(ENGINE_CSS)}　成品 ${kb(outPath)}`)
console.log('  双击就能打开，不需要服务器，可以离线看')
