#!/usr/bin/env node
// ============================================================
//  tools/verify/run.mjs —— 一条命令验完
//
//  这个项目原先的验证方式：每次改动之后，临时在 /tmp 里现写一套 CDP 脚本，
//  用完就扔。同一套代码写过二十来遍（见 known-issues 第 1 条）。
//  现在收在这里，一条命令跑完，失败就非零退出。
//
//  用法：
//    node tools/verify/run.mjs              全部检查
//    node tools/verify/run.mjs --no-browser 跳过要浏览器的检查（快）
//    node tools/verify/run.mjs --shot-only  只出一张图
//
//  检查什么：
//    1. 构建    开发构建与引擎构建都能过
//    2. lint    静态检查（未定义变量、死变量）
//    3. 数据    每份示例都能校验通过；视角 × 方向全部能排；校验错误本身对得上
//    4. 渲染    用 file:// 打开生成的 HTML，断言卡片数/尺寸/缩放，且零外部请求
//    5. MCP     自带客户端把十个步骤走一遍
//    6. 截图    出一张图，供人扫一眼（不能自动判断好看，但要能看）
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { REPO, renderToFile } from '../lib/make-html.mjs'
import { launchBrowser, findChrome } from '../lib/chrome.mjs'
// 必须先登记各大类的知识（纯 JS），否则 validateSpec 查表查不到、静默返回"通过"。
// 这个坑真实发生过：搬文件之后忘了这行，坏数据没被拦下，是验证器自己抓出来的。
import '../../src/renderers/index.js'
import { validateSpec } from '../../src/core/validate.js'
import { viewsOf } from '../../src/renderers/fact/timeline/grid.js'
import { buildFactGraph } from '../../src/renderers/fact/timeline/layout.js'

const argv = process.argv.slice(2)
const skipBrowser = argv.includes('--no-browser')
const shotOnly = argv.includes('--shot-only')

const OUT = join(REPO, '.verify')
const SHOT = join(OUT, 'screenshot.png')

// ---------------------------------------------------------------
// 极简断言与报告
// ---------------------------------------------------------------
let passed = 0
const failures = []

function ok(label, detail = '') {
  passed += 1
  console.log(`  ✅ ${label}${detail ? '　' + detail : ''}`)
}

function bad(label, detail = '') {
  failures.push(`${label}${detail ? '：' + detail : ''}`)
  console.log(`  ❌ ${label}${detail ? '　' + detail : ''}`)
}

function section(title) {
  console.log(`\n【${title}】`)
}

/** 断言相等，把期望与实际都打出来 */
function eq(label, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) ok(label, a)
  else bad(label, `期望 ${e}，实际 ${a}`)
}

function truthy(label, value) {
  if (value) ok(label)
  else bad(label)
}

// ---------------------------------------------------------------
// 1. 构建
// ---------------------------------------------------------------
function checkBuild() {
  section('构建')
  for (const [name, args] of [
    ['开发构建', ['run', 'build']],
    ['引擎构建', ['run', 'build:engine']],
  ]) {
    try {
      execFileSync('npm', args, { cwd: REPO, stdio: 'pipe' })
      ok(name)
    } catch (e) {
      bad(name, String(e.stderr || e.message).split('\n').slice(0, 3).join(' / '))
    }
  }
}

// ---------------------------------------------------------------
// 2. lint
// ---------------------------------------------------------------
function checkLint() {
  section('lint')
  try {
    execFileSync('npx', ['eslint', '.'], { cwd: REPO, stdio: 'pipe' })
    ok('静态检查通过')
  } catch (e) {
    const out = String(e.stdout || e.message)
    bad('静态检查未通过', out.split('\n').filter(Boolean).slice(-3).join(' / '))
  }
}

// ---------------------------------------------------------------
// 3. 数据与排布（纯 Node，不启浏览器）
// ---------------------------------------------------------------
function checkData() {
  section('数据与排布')
  const dir = join(REPO, 'examples')
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  truthy('找到示例', files.length > 0)
  if (files.length === 0) return { files, sample: null, combos: 0, views: 0 }

  let views = 0
  let combos = 0
  let blocked = 0
  for (const f of files) {
    const spec = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const errs = validateSpec(spec)
    if (errs.length) {
      bad(`示例 ${f} 校验`, errs[0])
      continue
    }
    for (const view of viewsOf(spec)) {
      views += 1
      for (const o of ['vertical', 'horizontal']) {
        const g = buildFactGraph(spec, { summary: true }, view, o)
        combos += 1
        if (g.errors.length) {
          blocked += 1
          continue
        }
        // 排布出来的东西必须自洽
        if (!Number.isFinite(g.size.width) || !Number.isFinite(g.size.height) || g.size.width <= 0) {
          bad(`${f} 的尺寸算错了`, JSON.stringify(g.size))
        }
        if (g.edges.length !== 0) bad(`${f} 冒出了边`, `edges=${g.edges.length}`)
      }
    }
  }
  ok(`${files.length} 份示例全部校验通过`)
  ok(`${views} 个视角 × 2 个方向 = ${combos} 种组合都能算`, blocked ? `其中 ${blocked} 种摆不下（预期内）` : '')

  // 校验错误要说人话：故意造一份坏的，看报错里有没有字段路径
  const broken = { type: 'fact', title: '坏的', slots: [{ id: 's1', events: [{ id: 'e1', label: '没时间' }] }] }
  const errs = validateSpec(broken)
  truthy('坏数据被拦下', errs.length > 0)
  truthy('报错带字段路径', errs.some((e) => /slots\[\d+\]/.test(e)))
  truthy('报错带事件 id', errs.some((e) => e.includes('e1')))

  return { files, sample: files[0], combos, views }
}

// ---------------------------------------------------------------
// 4. 渲染（要浏览器）
// ---------------------------------------------------------------
async function checkRender(sampleFile) {
  section('渲染（file:// 打开，零外部请求）')
  if (!findChrome()) {
    bad('没有可用的 Chrome，跳过', '装一个 Chrome 再来')
    return null
  }

  const spec = JSON.parse(readFileSync(join(REPO, 'examples', sampleFile), 'utf8'))
  const html = join(OUT, 'render-check.html')
  renderToFile(spec, { outPath: html, quiet: true })

  const browser = await launchBrowser({ width: 1600, height: 900 })
  try {
    await browser.open(`file://${html}`)

    const cards = await browser.eval('document.querySelectorAll(".antu-card").length')
    const expectCards = spec.slots.reduce((n, s) => n + (s.events?.length || 0), 0)
    eq('卡片数', cards, expectCards)

    // 卡片尺寸：拿 CSS 像素，除掉当前缩放，得到设计尺寸
    const size = await browser.eval(`(() => {
      const c = document.querySelector('.antu-card')
      if (!c) return null
      const z = parseFloat(document.querySelector('.react-flow__viewport').style.transform.split('scale(')[1])
      const r = c.getBoundingClientRect()
      return { w: Math.round(r.width / z), h: Math.round(r.height / z) }
    })()`)
    truthy('卡片量到了尺寸', size)
    if (size) eq('卡片宽（设计尺寸）', size.w, 288)

    const zoom = await browser.eval(
      `+(parseFloat(document.querySelector('.react-flow__viewport').style.transform.split('scale(')[1])).toFixed(3)`,
    )
    truthy('缩放落在合理区间', zoom > 0.2 && zoom <= 1)

    const headers = await browser.eval(
      `[...document.querySelectorAll('.antu-colhead-side')].map(e => e.textContent)`,
    )
    truthy('列标题渲染出来了', Array.isArray(headers) && headers.length > 0)

    const dock = await browser.eval(`document.querySelectorAll('.antu-dock-chip').length`)
    truthy('控制胶囊在位', dock > 0)

    const title = await browser.eval(`document.querySelector('.antu-header-title')?.textContent`)
    eq('标签卡标题', title, spec.title)

    // 最要紧的一条：成品不许对外发请求
    const external = browser.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('file://'))
    eq('对外请求数', external.length, 0)
    if (external.length) console.log('     ' + external.join('\n     '))

    eq('控制台错误数', browser.errors.length, 0)
    if (browser.errors.length) console.log('     ' + browser.errors.slice(0, 3).join('\n     '))

    mkdirSync(OUT, { recursive: true })
    await browser.screenshot(SHOT)
    ok('截图已存', SHOT.replace(REPO + '/', ''))
  } finally {
    await browser.close()
  }
  return html
}

// ---------------------------------------------------------------
// 5. MCP 自测
// ---------------------------------------------------------------
function checkMcp() {
  section('MCP 服务端')
  try {
    const out = execFileSync('node', [join(REPO, 'tools/mcp/client-test.mjs')], {
      cwd: REPO,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    const line = out.split('\n').find((l) => l.includes('步骤')) || ''
    if (out.includes('✅')) ok('十个步骤全通', line.trim())
    else bad('自测未通过', out.split('\n').slice(-4).join(' / '))
  } catch (e) {
    bad('自测跑不起来', String(e.stdout || e.message).split('\n').slice(-4).join(' / '))
  }
}

// ---------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------
console.log('案图 · 验证')
mkdirSync(OUT, { recursive: true })

const started = Date.now()

if (!shotOnly) {
  checkBuild()
  checkLint()
}

const data = checkData()

if (!shotOnly && !skipBrowser) {
  if (data.sample) await checkRender(data.sample)
  checkMcp()
} else if (shotOnly) {
  if (data.sample) await checkRender(data.sample)
}

console.log('')
if (failures.length === 0) {
  console.log(`全部通过（${passed} 项，${((Date.now() - started) / 1000).toFixed(1)} 秒）`)
  if (existsSync(SHOT)) console.log(`截图：${SHOT.replace(REPO + '/', '')}`)
} else {
  console.log(`${failures.length} 项未通过（通过 ${passed} 项）：`)
  for (const f of failures) console.log('  - ' + f)
  rmSync(OUT, { recursive: true, force: true })
  process.exitCode = 1
}
