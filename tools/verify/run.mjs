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
//    1. 构建        开发构建与引擎构建都能过
//    2. lint        静态检查（未定义变量、死变量）
//    3. 数据        每份示例都能校验通过；视角 × 方向全部能排；校验错误本身对得上
//    4. 浏览器查找  ANTU_CHROME 优先、指错了不瞎返回（不要浏览器，所以在 verify:fast 里）
//    5. 渲染        用 file:// 打开生成的 HTML，断言卡片数/尺寸/缩放/位置，且零外部请求
//    6. 导出        点导出真能落盘 PNG；尺寸 = 内容 × 2；不是白图；轴末端有箭头
//    7. MCP         自带客户端把十二个步骤走一遍
//    8. 截图        出一张图，供人扫一眼（不能自动判断好看，但要能看）
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPO, renderToFile } from '../lib/make-html.mjs'
import { launchBrowser, findChrome } from '../lib/chrome.mjs'
// 必须先登记各大类的知识（纯 JS），否则 validateSpec 查表查不到、静默返回"通过"。
// 这个坑真实发生过：搬文件之后忘了这行，坏数据没被拦下，是验证器自己抓出来的。
import '../../src/renderers/index.js'
import { validateSpec } from '../../src/core/validate.js'
import { FACT_FIELDS } from '../../src/renderers/fact/schema.js'
import { readExample, listExamples, listAgentGuides, describeSchema } from '../mcp/engine.mjs'
import { listKnowledgeTypes } from '../../src/core/registry.js'
import { CELL_W, ARROW_EXTENT } from '../../src/renderers/fact/timeline/metrics.js'
import { EXPORT_PAD, exportFrame } from '../../src/shell/exportPng.js'
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
// 这一轮有没有真出截图。--no-browser 时不能把上一轮残留的那张当成自己的产物报出来。
let shotWritten = false

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

/** 递归列出某个后缀的文件（跳过不该扫的目录） */
function listFilesUnder(dir, exts) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.git', '.verify', 'dist', 'dist-engine', 'dist-html'].includes(e.name)) continue
        walk(p)
      } else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
    }
  }
  walk(dir)
  return out
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
// 2.5 单元测试（纯 Node，秒级）
// ---------------------------------------------------------------
// 集成测试走端到端，慢；单元测试盯纯函数，快。
// 两边都要：比如"箭头那 6px 有没有算进内容尺寸"是纯函数层面的事，
// 单元测试一眼钉住，不必等到导出成图再数像素。
function checkUnit() {
  section('单元测试')
  try {
    const out = execFileSync('node', ['--test', 'test/*.test.mjs'], {
      cwd: REPO,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    const pass = out.match(/# pass (\d+)/)?.[1] ?? '?'
    const fail = out.match(/# fail (\d+)/)?.[1] ?? '?'
    if (fail === '0') ok(`纯函数测试 ${pass} 项全通`)
    else bad(`纯函数测试有 ${fail} 项未通过`)
  } catch (e) {
    const out = String(e.stdout || e.message)
    const fails = out.split('\n').filter((l) => l.includes('not ok')).slice(0, 3)
    bad('单元测试未通过', fails.join(' / '))
  }
}

// ---------------------------------------------------------------
// 3. 数据与排布（纯 Node，不启浏览器）
// ---------------------------------------------------------------
function checkData() {
  section('数据与排布')
  // 示例按大类分目录：examples/<type>/*.json。每个已登记知识的大类扫一遍。
  // 加新大类时这里不用改，它会自己多扫一个目录。
  const files = []
  for (const { type } of listKnowledgeTypes()) {
    const dir = join(REPO, 'examples', type)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      files.push(`examples/${type}/${f}`)
    }
  }
  truthy('找到示例', files.length > 0)
  if (files.length === 0) return { files, sample: null, combos: 0, views: 0 }

  let views = 0
  let combos = 0
  let blocked = 0
  for (const f of files) {
    const spec = JSON.parse(readFileSync(join(REPO, f), 'utf8'))
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
  const agentDir = join(REPO, 'examples/agent/fact')
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

  // 给 agent 的规格与给人的设计文档必须分开。这一条防的是"把人类文档端给 agent"：
  // 那些文档讲的是"当初为什么这么定"，一份上万字符，agent 读了纯属白烧上下文。
  // 曾经的做法就是原样挂出去、只加了个"写数据用得上"的标签，等于没分。
  const serverSrc = readFileSync(join(REPO, 'tools/mcp/server.mjs'), 'utf8')
  // 用带目录的路径查，避免拿 schema-draft 这种通用词去误判
  const humanDocs = ['spec/fact/schema-draft', 'spec/fact/timeline-rules', 'spec/fact/rendering',
    'spec/source-schema-draft', 'spec/v0-architecture', 'spec/known-issues', 'spec/mcp-server',
    'spec/react-flow-features']
  const leaked2 = humanDocs.filter((n) => serverSrc.includes(n))
  truthy('MCP 里没有任何"给人看的"设计文档', leaked2.length === 0)
  if (leaked2.length) console.log('     混进来的：' + leaked2.join('、'))
  truthy('antu_spec 这个工具已撤掉', !serverSrc.includes("'antu_spec'"))
  truthy('资源只暴露 antu://agent/', serverSrc.includes('antu://agent/'))

  // 给 agent 的参考资料必须**按大类**分发，不能把 fact 写死在工具里。
  // 原先 antu_schema 直接调 describeFactSchema()、antu_guide 直接读一个固定文件：
  // 等关系图做出来整条路要返工。现在三个工具都有 type 入参，从注册表取。
  const hasTypeArg = (tool) =>
    new RegExp(`registerTool\\(\\s*'${tool}'[\\s\\S]{0,1500}?type: z`).test(serverSrc)
  truthy('antu_schema 有 type 入参', hasTypeArg('antu_schema'))
  truthy('antu_guide 有 type 入参', hasTypeArg('antu_guide'))
  truthy('antu_examples 有 type 入参', hasTypeArg('antu_examples'))
  truthy('MCP 里没有写死 factKnowledge 之类', !/from '.*renderers\/fact\/schema\.js'/.test(serverSrc))
  truthy('字段表按大类取得到', describeSchema('fact').ok === true)
  truthy('没有的大类会明说"还没有"，不是空表', describeSchema('relationship').ok === false)
  truthy('机制说明按大类取', listAgentGuides().includes('fact'))

  // 示例只认三类文件。原先 file 能取到 examples 下任何东西，
  // agent 以为在取示例，结果取回来一整份判决书（3500 字符）。
  truthy('examples/README.md 取不到（它不是示例）', readExample('examples/README.md') === null)
  truthy('examples 下越界的路径取不到', readExample('examples/agent/../fact-电梯劝烟案.json') === null)
  truthy('小示例取得到', readExample('examples/agent/fact/1-minimal.json') !== null)
  truthy('示例按大类分目录', listExamples({ type: 'fact' }).length > 0)
  truthy(
    '示例分三批（agent / real / raw）',
    listExamples({ group: 'agent' }).length > 0 &&
      listExamples({ group: 'real' }).length > 0 &&
      listExamples({ group: 'raw' }).length > 0,
  )

  // 文档里的路径引用必须指向真实存在的文件。
  // 这条是补上的：文件搬过几次（core → renderers、fact → fact/timeline、
  // 根目录 → 按大类分目录），每次都留下没跟上的引用，靠人翻是翻不干净的。
  const refMissing = []
  for (const f of listFilesUnder(REPO, ['.md', '.mjs', '.js', '.jsx'])) {
    if (f.includes('node_modules') || f.includes('/dist')) continue
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/`((?:spec|examples|src|tools)\/[\w./\u4e00-\u9fff-]+\.(?:md|json|js|mjs|jsx))`/g)) {
      if (!existsSync(join(REPO, m[1]))) refMissing.push(`${f.replace(REPO + '/', '')} → ${m[1]}`)
    }
  }
  truthy('文档里的路径引用都指向真实文件', refMissing.length === 0)
  for (const r of refMissing.slice(0, 5)) console.log('     ' + r)

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

  // 渲染检查**固定用这一份**，不用 files[0]。
  // 原先取"排序后第一份"，于是往 examples/fact/ 里加一份文件名排在前面的示例，
  // 渲染断言的对象就跟着换了——两次验证的卡片数根本不可比（实测：7 张 vs 12 张）。
  // 固定之后，"卡片数""标签卡标题"这些断言才说明得了问题。
  const sample = 'examples/fact/电梯劝烟案.json'
  truthy('渲染样本存在', existsSync(join(REPO, sample)))

  return { files, sample, combos, views }
}

// ---------------------------------------------------------------
// 4. 浏览器查找（不要浏览器，所以能进 verify:fast）
// ---------------------------------------------------------------
/**
 * findChrome 的三条行为。
 *
 * 为什么单独立一项：它是"仓库里不堆厂商路径"这个决定的支点——用户机器上
 * 换了别的 Chromium 内核浏览器（麒麟／统信上很常见），全靠 ANTU_CHROME 接进来。
 * 这条链断了，预览和上面的渲染检查会一起哑掉，而症状只是"本机没找到 Chrome"，
 * 看不出是环境变量根本没被读到。所以这里只断言"读到了、且不瞎返回"。
 */
function checkBrowserLookup() {
  section('浏览器查找')
  const probe = join(REPO, 'package.json') // 一个确定存在的文件，借它当"浏览器路径"
  const prev = process.env.ANTU_CHROME
  try {
    process.env.ANTU_CHROME = probe
    eq('ANTU_CHROME 优先于已知路径', findChrome(), probe)

    process.env.ANTU_CHROME = '/nope/not-a-browser'
    truthy('ANTU_CHROME 指向不存在的路径时不当成浏览器', findChrome() !== '/nope/not-a-browser')

    process.env.ANTU_CHROME = REPO
    truthy('ANTU_CHROME 指向目录时不当成浏览器', findChrome() !== REPO)
  } finally {
    if (prev === undefined) delete process.env.ANTU_CHROME
    else process.env.ANTU_CHROME = prev
  }
}

/**
 * 导出图片的检查。
 *
 * 四条要害，都是这套机制最容易悄悄坏掉的地方：
 *   1. 点了按钮真能落盘（浏览器会拦"同一页面的第二次自动下载"，
 *      所以点击要标成用户手势，见 lib/chrome.mjs 的 eval）；
 *   2. 尺寸正好是（内容 + 四周留白）× 2 —— 多了说明框错了范围（比如用了
 *      getNodesBounds，会把两个 1×1 的装饰节点算进去）；
 *   3. 不是一张白图；
 *   4. **四周真留出白边**：只量总尺寸查不出"留白加在一边"或者"内容被拉伸
 *      填满了整张图"，所以四条边各采一圈像素，必须全是白的；
 *   5. **轴末端有箭头**。这条是两个真缺陷换来的：箭头原先用 CSS 边框三角画
 *      （width:0 + 三边 transparent），导出时被整个丢掉；换成内联 SVG 之后
 *      还得把它多占的 6px 算进内容尺寸，否则会被裁在框外。
 *      只量尺寸查不出这两种，所以在箭头应该在的位置采一个像素。
 *
 * 导出不带题头（那个开关已取消，见 rendering §10.2），所以只有一次导出。
 */
async function checkExport(browser, spec) {
  section('导出图片')
  const dir = join(OUT, 'downloads')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await browser.setDownloadDir(dir)

  const clickChip = (label) =>
    browser.eval(
      `(() => {
        const el = [...document.querySelectorAll('.antu-dock-bar button')]
          .find((b) => b.textContent.trim() === ${JSON.stringify(label)})
        if (!el) return false
        el.click()
        return true
      })()`,
      { userGesture: true },
    )

  const grab = async (hint) => {
    let file = null
    for (let i = 0; i < 40 && !file; i++) {
      await new Promise((r) => setTimeout(r, 250))
      file = readdirSync(dir).find((f) => f.endsWith('.png')) ?? null
    }
    if (!file) {
      bad(`${hint}：点了导出但没有文件落盘`)
      return null
    }
    const path = join(dir, file)
    const buf = readFileSync(path)
    rmSync(path, { force: true }) // 挪走，好让下一次落盘看得见
    return { name: file, buf, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  if (!(await clickChip('导出图片'))) {
    bad('导出图片：底部胶囊里没有这个按钮')
    return
  }
  const shot = await grab('导出')
  if (!shot) return
  truthy('点了导出会落盘一张 PNG', shot.buf.slice(1, 4).toString() === 'PNG')
  // 留一份下来，和人看截图一个道理：尺寸对不代表内容对
  const EXPORT_SHOT = join(OUT, 'export.png')
  writeFileSync(EXPORT_SHOT, shot.buf)
  ok('导出成功', `${shot.width}×${shot.height}　${EXPORT_SHOT.replace(REPO + '/', '')}`)

  // 页面用的一定是默认呈现状态（新开的浏览器配置里没有偏好）：
  // 字段只开摘要、方向按槽数、看第一个视角。
  const orientation = spec.slots.length >= 5 ? 'vertical' : 'horizontal'
  const graph = buildFactGraph(
    spec,
    { sources: false, actors: false, summary: true },
    viewsOf(spec)[0],
    orientation,
  )
  eq('尺寸 = (内容 + 留白) × 2', [shot.width, shot.height], [
    exportFrame(graph.size.width, graph.size.height).width * 2,
    exportFrame(graph.size.width, graph.size.height).height * 2,
  ])
  ok('留白', `每边 ${EXPORT_PAD}px（设计像素）`)

  // 采样：一张纯白的图会缩得极小，但那是旁证；这里直接数非白像素。
  const sample = async (x, y) =>
    browser.eval(
      `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${shot.buf.toString('base64')}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(${x}, ${y}, 1, 1).data
        return [d[0], d[1], d[2]]
      })()`,
      { awaitPromise: true },
    )

  const ink = await browser.eval(
    `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${shot.buf.toString('base64')}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n += 1
        return n
      })()`,
    { awaitPromise: true },
  )
  truthy('导出图不是一张白纸', ink > 5000, `非白像素 ${ink}`)

  // 留白：四条边各取一圈像素，必须全是白的；同一张图里内容区必须有墨。
  // 两条要一起看：只看"边上全白"的话，一张整白图也能过；只看"里面有墨"的话，
  // 留白加在一边、内容被拉满整张图也能过。
  //
  // 先判前提再采样：留白为 0 时这四个取像素的矩形会有一条边是 0，
  // getImageData 直接抛错，症状是一堆堆栈盖住"其实就是留白没了"。
  const pad = EXPORT_PAD * 2 // 设备像素
  truthy('每边留白大于 0（设备像素）', pad > 0, `${pad}px`)
  const bands = !pad
    ? null
    : await browser.eval(
        `(async () => {
        const img = new Image()
        img.src = 'data:image/png;base64,${shot.buf.toString('base64')}'
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const count = (x, y, w, h) => {
          const d = ctx.getImageData(x, y, w, h).data
          let n = 0
          for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n += 1
          return n
        }
        const p = ${pad}
        return {
          w: c.width,
          h: c.height,
          top: count(0, 0, c.width, p),
          bottom: count(0, c.height - p, c.width, p),
          left: count(0, p, p, c.height - p * 2),
          right: count(c.width - p, p, p, c.height - p * 2),
          inner: count(p, p, c.width - p * 2, c.height - p * 2),
        }
      })()`,
        { awaitPromise: true },
      )
  // 先确认这四圈确实在图内，别在越界的坐标上"数出 0 个非白像素"
  truthy(
    '留白采样范围在导出图之内',
    !!bands && pad * 2 < bands.w && pad * 2 < bands.h,
    bands ? `图 ${bands.w}×${bands.h}，每边留白 ${pad}px` : '没有采到像素',
  )
  if (bands) {
    truthy('内容区里有墨', bands.inner > 5000, `内容区非白像素 ${bands.inner}`)
    eq('上边留白是纯白', bands.top, 0)
    eq('下边留白是纯白', bands.bottom, 0)
    eq('左边留白是纯白', bands.left, 0)
    eq('右边留白是纯白', bands.right, 0)
  }

  // 轴末端那个箭头：算准它该在哪，采一个像素看是不是深色。
  // 竖向：轴在 x = 轴列中心，箭头挂在轴末端下方 ARROW_EXTENT 之内；
  // 横向：轴在 y = 轴行中心，箭头挂在轴右端。
  // 坐标是内容坐标，成品图上要再加上留白（EXPORT_PAD）。
  const axisAt = graph.grid.axisColumnIndex * CELL_W + CELL_W / 2
  const [px, py] =
    orientation === 'vertical'
      ? [axisAt, graph.size.height - ARROW_EXTENT / 2]
      : [graph.size.width - ARROW_EXTENT / 2, axisAt]
  const sx = Math.round((px + EXPORT_PAD) * 2)
  const sy = Math.round((py + EXPORT_PAD) * 2)
  // 先确认采样点在图内。少了这一步，箭头被裁掉时 getImageData 会返回全黑的全透明像素，
  // 看上去"是深色"就放行了 —— 这条断言本身就抓不住那个 bug（实测过）。
  truthy(
    '箭头采样点在导出图范围内',
    sx >= 0 && sy >= 0 && sx < shot.width && sy < shot.height,
    `采样点 (${sx},${sy})，图 ${shot.width}×${shot.height}`,
  )
  const rgb = await sample(sx, sy)
  // 不只是"深色"：要是轴那条线的颜色（半透明采样时允许偏一点）
  const near = Math.abs(rgb[0] - 178) < 40 && Math.abs(rgb[1] - 192) < 40 && Math.abs(rgb[2] - 208) < 40
  truthy('导出图里时间轴末端有箭头', near, `在 (${sx},${sy}) 采到 rgb(${rgb})，轴色约 rgb(178,192,208)`)
}

// ---------------------------------------------------------------
// 5. 渲染（要浏览器）
// ---------------------------------------------------------------
async function checkRender(sampleFile) {
  section('渲染（file:// 打开，零外部请求）')
  if (!findChrome()) {
    bad('没有可用的 Chrome，跳过', '装一个 Chrome，或者设 ANTU_CHROME 指到你已有的浏览器')
    return null
  }

  const spec = JSON.parse(readFileSync(join(REPO, sampleFile), 'utf8'))
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

    // 胶囊里控件的形态规则（rendering §4.2）。这几条都是"看画面也未必看得出、
    // 但一旦破了整个胶囊就乱"的规则，所以按颜色和样式表查，不靠人看。
    const shape = await browser.eval(`(() => {
      const bar = document.querySelector('.antu-dock-bar')
      if (!bar) return null
      const btns = [...bar.querySelectorAll('button')]
      const text = (b) => b.textContent.trim()
      // 关键：12% 灰的开关按 rgba 读出来也很"深"（15,23,42），但它压在
      // 近白的胶囊底上，看着是浅的。所以必须按 alpha 合成一次再比亮度，
      // 不然会把"开着的开关"误判成实心。
      const lum = (b) => {
        const m = getComputedStyle(b).backgroundColor.match(/[\\d.]+/g).map(Number)
        const a = m.length === 4 ? m[3] : 1
        return a * ((m[0] + m[1] + m[2]) / 3) + (1 - a) * 255
      }
      const dark = btns.filter((b) => lum(b) < 128).map(text)

      // 样式表里查按下态与焦点圈：这两个状态没法在静态页面上"采"出来，
      // 只能查规则在不在。查的是"在不在"，不是"好不好看"。
      const css = [...document.styleSheets].flatMap((s) => {
        try {
          return [...s.cssRules].map((r) => r.selectorText || '')
        } catch {
          return []
        }
      }).join(' || ')
      const hasRule = (sel) => css.includes(sel)
      const classes = ['.antu-dock-chip', '.antu-dock-seg-item', '.antu-dock-action']
      const focusSel = css
        .split(' || ')
        .find((s) => s.includes('.antu-dock-action:focus-visible')) || ''

      const action = bar.querySelector('.antu-dock-action')
      const icon = action?.querySelector('svg')
      const r = icon?.getBoundingClientRect()
      return {
        total: btns.length,
        dark,
        hasIcon: !!icon,
        iconW: r ? Math.round(r.width) : 0,
        iconH: r ? Math.round(r.height) : 0,
        missingActive: classes.filter((c) => !hasRule(c + ':active')),
        focusCovered: classes.filter((c) => !focusSel.includes(c + ':focus-visible')),
      }
    })()`)
    truthy('量到了胶囊控件的形态', shape)
    if (shape) {
      eq('胶囊里只有导出按钮是深底', shape.dark, ['导出图片'])
      truthy('导出按钮带下载符号', shape.hasIcon)
      truthy(
        '下载符号有真实尺寸（不是零尺寸元素，那种导出时会被整个丢掉）',
        shape.iconW > 0 && shape.iconH > 0,
        `${shape.iconW}×${shape.iconH}`,
      )
      eq('每个控件都有按下态', shape.missingActive, [])
      eq('每个控件都在统一的焦点圈规则里', shape.focusCovered, [])
    }

    const title = await browser.eval(`document.querySelector('.antu-header-title')?.textContent`)
    eq('标签卡标题', title, spec.title)

    // 标签卡常显（「题头」开关已取消，见 rendering §10.2）
    truthy('屏幕上标签卡常显', await browser.eval(`!!document.querySelector('.antu-header-card')`))
    truthy(
      '胶囊里没有「题头」开关了',
      !(await browser.eval(
        `[...document.querySelectorAll('.antu-dock-bar button')].some((b) => b.textContent.trim() === '题头')`,
      )),
    )

    // 时间轴末端的箭头必须是**有真实尺寸的 SVG**。
    // 这条防两件事：箭头改回零尺寸的 CSS 边框三角（导出时会被整个丢掉），
    // 以及"改了源码但没生效"——我犯过一次：报告说改成 SVG 了，文件里还是 span 0×0。
    const arrow = await browser.eval(`(() => {
      const el = document.querySelector('.antu-axis-arrow')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { tag: el.tagName.toLowerCase(), w: r.width, h: r.height, poly: !!el.querySelector('polygon') }
    })()`)
    truthy('时间轴末端有箭头', arrow)
    if (arrow) {
      eq('箭头是 svg', arrow.tag, 'svg')
      truthy('箭头有多边形（有真实形状，不是零尺寸边框三角）', arrow.poly)
      truthy('箭头有真实尺寸', arrow.w > 0 && arrow.h > 0, `${arrow.w}×${arrow.h}`)
    }

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
    shotWritten = true
    ok('截图已存', SHOT.replace(REPO + '/', ''))

    await checkExport(browser, spec)
  } finally {
    await browser.close()
  }
  return html
}

// ---------------------------------------------------------------
// 7. MCP 自测
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
  checkUnit()
}

const data = checkData()

checkBrowserLookup()

if (!shotOnly && !skipBrowser) {
  if (data.sample) await checkRender(data.sample)
  checkMcp()
} else if (shotOnly) {
  if (data.sample) await checkRender(data.sample)
}

console.log('')
if (failures.length === 0) {
  console.log(`全部通过（${passed} 项，${((Date.now() - started) / 1000).toFixed(1)} 秒）`)
  if (shotWritten) console.log(`截图：${SHOT.replace(REPO + '/', '')}`)
  if (existsSync(join(OUT, 'export.png'))) console.log(`导出样本：${join(OUT, 'export.png').replace(REPO + '/', '')}`)
} else {
  console.log(`${failures.length} 项未通过（通过 ${passed} 项）：`)
  for (const f of failures) console.log('  - ' + f)
  rmSync(OUT, { recursive: true, force: true })
  process.exitCode = 1
}
