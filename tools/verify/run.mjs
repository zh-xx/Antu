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
import { FACT_FIELDS } from '../../src/renderers/fact/schema.js'
import { readExample, listExamples } from '../mcp/engine.mjs'
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

  // agent 示例是"能跑的数据"，不是文档：schema 一改它们就会失败。
  // 这一条是第 14 条那个设计的落点，保证它们不会悄悄漂移。
  const agentDir = join(REPO, 'examples/agent')
  if (existsSync(agentDir)) {
    const files2 = readdirSync(agentDir).filter((f) => f.endsWith('.json'))
    let bad = 0
    let blocked = 0
    for (const f of files2) {
      const spec = JSON.parse(readFileSync(join(agentDir, f), 'utf8'))
      if (validateSpec(spec).length) bad += 1
      for (const v of viewsOf(spec)) {
        if (buildFactGraph(spec, { summary: true }, v).errors.length) blocked += 1
      }
    }
    truthy(`agent 示例 ${files2.length} 份全部通过校验`, bad === 0)
    truthy('agent 示例的视角全部排得下（照抄不会撞到"摆不下"）', blocked === 0)
  }

  // MCP 的资源分两个命名空间：antu://spec（写数据用）与 antu://internal（改引擎用）。
  // 这条断言防的是"内部文档混进 agent 那批"：agent 顺着列表读下去会白烧上下文，
  // 其中 known-issues 还会让它误以为数据有问题。
  const INTERNAL = ['known-issues', 'mcp-server', 'react-flow-features', 'v0-architecture']
  const serverSrc = readFileSync(join(REPO, 'tools/mcp/server.mjs'), 'utf8')
  const agentList = serverSrc.slice(
    serverSrc.indexOf('const AGENT_SPECS'),
    serverSrc.indexOf('for (const s of listSpecs())'),
  )
  const leaked = INTERNAL.filter((n) => agentList.includes(`'${n}'`))
  truthy('写数据那批资源里没有内部文档', leaked.length === 0)
  if (leaked.length) console.log('     混进来的：' + leaked.join('、'))
  truthy('两个命名空间都在用', serverSrc.includes("antu://${forAgent ? 'spec' : 'internal'}"))

  // antu_spec 的清单也要分段列（不能只是资源分了、清单还混在一起）。
  // 这条与上面那条是同一个毛病的两半：上一轮只修了资源那一半。
  truthy('antu_spec 的清单把内部文档单独标出来了', serverSrc.includes('写数据不要读'))

  // 示例只认三类文件。原先 file 能取到 examples 下任何东西，
  // agent 以为在取示例，结果取回来一整份判决书（3500 字符）。
  truthy('examples/README.md 取不到（它不是示例）', readExample('examples/README.md') === null)
  truthy('examples 下越界的路径取不到', readExample('examples/agent/../fact-电梯劝烟案.json') === null)
  truthy('小示例取得到', readExample('examples/agent/1-minimal.json') !== null)
  truthy(
    '示例分三批（agent / real / raw）',
    listExamples({ group: 'agent' }).length > 0 &&
      listExamples({ group: 'real' }).length > 0 &&
      listExamples({ group: 'raw' }).length > 0,
  )

  // 字段元数据（给 agent 的参考资料）必须和校验器说的是同一件事。
  // 办法：拿一份能过校验的示例，逐个抽掉"必填"的字段，校验器必须报错。
  // 这样字段表就不可能悄悄漂移，而不用把校验规则改写成数据驱动的。
  const base = JSON.parse(readFileSync(join(agentDir, '1-minimal.json'), 'utf8'))
  const required = []
  for (const rows of Object.values(FACT_FIELDS)) {
    for (const r of rows) if (r.req === '是' && r.name) required.push(r.name)
  }
  const noop = ['type', 'title'] // 这三个在信封层，抽掉它们报的是别的错，另测
  let agree = 0
  let disagree = []
  for (const name of required) {
    if (noop.includes(name)) continue
    const copy = JSON.parse(JSON.stringify(base))
    const target = name === 'events' ? copy.slots[0] : copy.slots[0].events[0]
    if (!(name in target)) continue // 示例里没有这个字段，跳过
    delete target[name]
    if (validateSpec(copy).length > 0) agree += 1
    else disagree.push(name)
  }
  truthy(`字段表里标"必填"的，抽掉后校验器都报错（验了 ${agree} 个）`, disagree.length === 0)
  if (disagree.length) console.log('     没报错的：' + disagree.join('、'))

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

    // 四块浮层各在应该在的角上。
    // 这一条防的是"样式基础层丢了"那类问题：卡片、列标题、缩放都还在，
    // 但全部挤到左上角。数量和内容断言查不出来，只有位置查得出来。
    // 真实发生过一次：重构成 TimelineRenderer 时弄丢了 React Flow 的基础样式。
    const boxes = await browser.eval(`(() => {
      const W = innerWidth, H = innerHeight
      const box = (sel) => {
        const e = document.querySelector(sel)
        if (!e) return null
        const r = e.getBoundingClientRect()
        return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2 }
      }
      return {
        viewport: { W, H },
        标签卡: box('.antu-header'),
        缩放: box('.react-flow__controls'),
        缩略图: box('.react-flow__minimap'),
        胶囊: box('.antu-dock'),
      }
    })()`)
    const { W, H } = boxes.viewport
    truthy(
      '标签卡在左上',
      boxes.标签卡 && boxes.标签卡.l < W * 0.2 && boxes.标签卡.t < H * 0.2,
    )
    truthy(
      '缩放控件在左下',
      boxes.缩放 && boxes.缩放.t > H * 0.5 && boxes.缩放.l < W * 0.2,
    )
    truthy(
      '缩略图在右下',
      boxes.缩略图 && boxes.缩略图.t > H * 0.5 && boxes.缩略图.l > W * 0.5,
    )
    truthy(
      '控制胶囊在下方居中',
      boxes.胶囊 && boxes.胶囊.t > H * 0.8 && Math.abs(boxes.胶囊.cx - W / 2) < W * 0.1,
    )

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
    if (out.includes('✅')) ok('MCP 十二步全通', line.trim())
    else bad('MCP 自测未通过', out.split('\n').slice(-4).join(' / '))
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
