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
//  不指定 -o 时，输出与输入同目录同名，后缀换成 .html。
//
//  真正的生成逻辑在 tools/lib/make-html.mjs，MCP 服务端调的是同一份。
// ============================================================

import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { renderToFile, REPO } from './lib/make-html.mjs'

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
  console.log('用法：node tools/make-html.mjs <规范.json> [-o 输出.html] [--rebuild]')
  process.exit(argv.length === 0 ? 1 : 0)
}

const specPath = resolve(argv[0])
const oi = argv.findIndex((a) => a === '-o' || a === '--out')
const outPath =
  oi >= 0 && argv[oi + 1]
    ? resolve(argv[oi + 1])
    : join(dirname(specPath), basename(specPath).replace(/\.json$/i, '') + '.html')
const force = argv.includes('--rebuild')

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

const kb = (p) => Math.round(statSync(p).size / 1024) + ' KB'

const { path, bytes } = renderToFile(spec, { outPath, force })

console.log(`已生成 ${path}`)
console.log(
  `  数据 ${kb(specPath)}　引擎 ${kb(join(REPO, 'dist-engine/engine.js'))} + ` +
    `${kb(join(REPO, 'dist-engine/engine.css'))}　成品 ${Math.round(bytes / 1024)} KB`,
)
console.log('  双击就能打开，不需要服务器，可以离线看')
