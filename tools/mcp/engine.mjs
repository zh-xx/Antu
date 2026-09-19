// ============================================================
//  tools/mcp/engine.mjs —— MCP 服务端要用的引擎能力
//
//  关键事实：**校验和排布是纯 JS，不需要浏览器**。
//  所以 agent 不截图也能问出：JSON 过不过、内容多大、该用哪个方向、
//  有几个视角摆不下。真正需要浏览器的只有最后那一眼"好不好看"。
//
//  这一层只做"给定 JSON，返回事实"，不做任何生成 JSON 的事——
//  引擎不生成 JSON，那是 agent 的职责。
// ============================================================

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateSpec } from '../../src/core/validate.js'
import { viewsOf, buildGrid } from '../../src/core/factGrid.js'
import { buildFactGraph } from '../../src/renderers/fact/timelineLayout.js'

/** 仓库根目录（服务端可能从任何 cwd 启动，所以一律相对这个位置解析） */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 画布尺寸的默认假设：用来算"适配缩放"，和浏览器里实测的画布大小一致 */
const CANVAS = { width: 1600, height: 857 }

/** 排布函数的分发表。目前只有 fact 的时间图一个子类。 */
const LAYOUTS = { fact: { timeline: buildFactGraph } }

/** 某大类某子类能不能算几何 */
export function layoutOf(type, kind) {
  return LAYOUTS[type]?.[kind] ?? null
}

/** 校验。返回逐条错误（已经是给人和 agent 看的中文） */
export function validate(spec) {
  try {
    return validateSpec(spec)
  } catch (e) {
    return [`校验层自己抛错了：${e.message}`]
  }
}

/** 适配缩放：视口 ÷ (内容 × 1.12)，封顶 1。和渲染器里的算法一致。 */
export function fitZoom(size, canvas = CANVAS) {
  const zx = canvas.width / (size.width * 1.12)
  const zy = canvas.height / (size.height * 1.12)
  return Math.min(zx, zy, 1)
}

/**
 * 几何报告：不渲染，只算。
 * 这是 agent 判断"这张图会不会太宽/太空"的主要依据。
 */
export function layoutReport(spec, { orientation, fields = { summary: true } } = {}) {
  const type = spec?.type
  const kind = spec?.kindHint ?? 'timeline'
  const layout = layoutOf(type, kind)
  if (!layout) {
    return { ok: false, reason: `还没有 type="${type}" 子类 "${kind}" 的几何计算` }
  }

  const views = viewsOf(spec)
  const rows = views.map((view, i) => {
    const graph = layout(spec, fields, view, orientation ?? 'vertical')
    const grid = buildGrid(spec, view)
    const cols = { side1: 0, axis: 0, side2: 0 }
    grid.columns.forEach((c) => {
      cols[c.side] += 1
    })
    return {
      index: i,
      label: view.label,
      events: graph.eventCount ?? grid.eventCount ?? 0,
      slots: grid.rows.length,
      columns: cols,
      blocked: graph.errors.length > 0,
      blockReason: graph.errors[0] ?? null,
    }
  })

  // 两个方向都算一遍，好给"该用哪个"的建议（和渲染层按槽数取默认值的规则一致）
  const byOrientation = {}
  for (const o of ['vertical', 'horizontal']) {
    const g = layout(spec, fields, undefined, o)
    byOrientation[o] = { size: g.size, fit: Number(fitZoom(g.size).toFixed(3)) }
  }
  const slotCount = Array.isArray(spec.slots) ? spec.slots.length : 0
  const suggested = slotCount >= 5 ? 'vertical' : 'horizontal'

  return {
    ok: true,
    type,
    views,
    counts: {
      slots: slotCount,
      events: (spec.slots ?? []).reduce((n, s) => n + (s?.events?.length || 0), 0),
      actors: spec.actors?.length ?? 0,
      sources: spec.sources?.length ?? 0,
    },
    byOrientation,
    suggestedOrientation: suggested,
    blockedViews: rows.filter((r) => r.blocked).map((r) => ({ label: r.label, reason: r.blockReason })),
    rows,
  }
}

/** 把几何报告写成人能读的短文本（工具返回给 agent 的那段） */
export function formatLayoutReport(r) {
  if (!r.ok) return r.reason
  const lines = []
  lines.push(`数据：${r.counts.events} 条事件 / ${r.counts.slots} 个时间点 / ${r.counts.actors} 个主体 / ${r.counts.sources} 个来源`)
  const v = r.byOrientation.vertical
  const h = r.byOrientation.horizontal
  lines.push(`竖向：内容 ${v.size.width}×${v.size.height}，适配缩放 ${v.fit}`)
  lines.push(`横向：内容 ${h.size.width}×${h.size.height}，适配缩放 ${h.fit}`)
  lines.push(`建议方向：${r.suggestedOrientation === 'vertical' ? '竖向' : '横向'}（按槽数规则${r.counts.slots} ≥ 5 → 竖向）`)
  lines.push(`视角 ${r.views.length} 个：`)
  for (const row of r.rows) {
    const c = row.columns
    const mark = row.blocked ? `摆不下（${row.blockReason}）` : '可排'
    lines.push(`  ${row.index}. ${row.label}：左${c.side1}/轴${c.axis}/右${c.side2}，${row.events} 条事件 → ${mark}`)
  }
  if (r.blockedViews.length > 0) {
    lines.push('')
    lines.push(`注意：有 ${r.blockedViews.length} 个视角摆不下，它们不会出现在界面的视角选项里。`)
    lines.push('常见原因：同一个时间点里有两件以上事件落在同一条车道上（网格是一格一事件）。')
    lines.push('改法：把那个时间点拆成两个更细的时间，或者调整分组/主体让它们落到不同车道。')
  }
  return lines.join('\n')
}

/**
 * 生成自包含 HTML。复用 tools/make-html.mjs 的逻辑（构建 → 内联）。
 * preset 可选：开局就用指定的方向/字段/视角渲染（MCP 预览要能指定这些）。
 */
export function renderHtml(spec, { outPath, preset } = {}) {
  const engineJs = join(REPO, 'dist-engine/engine.js')
  const engineCss = join(REPO, 'dist-engine/engine.css')
  const needsBuild = !existsSync(engineJs) || !existsSync(engineCss) || newestSourceMtime() > statSync(engineJs).mtimeMs
  if (needsBuild) {
    execFileSync('npx', ['vite', 'build', '--config', 'vite.engine.config.js'], { cwd: REPO, stdio: 'pipe' })
  }
  const js = readFileSync(engineJs, 'utf8')
  const css = readFileSync(engineCss, 'utf8')
  const safeJson = JSON.stringify(spec).replace(/</g, '\\u003c')
  const safeJs = js.replace(/<\/script/gi, '<\\/script')
  const title = (spec.title || '案图').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const html = `<!DOCTYPE html>
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
<script>window.__ANTU_SPEC__ = ${safeJson};</script>
${preset ? `<script>window.__ANTU_PRESET__ = ${JSON.stringify(preset).replace(/</g, '\\u003c')};</script>` : ''}
<script>${safeJs}</script>
</body>
</html>
`
  const target = resolve(outPath || join(REPO, 'dist-html', `${slug(spec.title || 'antu')}.html`))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, html)
  return { path: target, bytes: Buffer.byteLength(html) }
}

function newestSourceMtime() {
  let newest = 0
  const walk = (p) => {
    if (!existsSync(p)) return
    const st = statSync(p)
    if (st.isDirectory()) for (const n of readdirSync(p)) walk(join(p, n))
    else newest = Math.max(newest, st.mtimeMs)
  }
  for (const p of ['src', 'vite.engine.config.js']) walk(join(REPO, p))
  return newest
}

const slug = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60)

/** 示例清单：给 agent 看"别人是怎么写的" */
export function listExamples() {
  const dir = join(REPO, 'examples')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const spec = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const slots = Array.isArray(spec.slots) ? spec.slots : []
      return {
        file: `examples/${f}`,
        path: join(dir, f),
        title: spec.title,
        events: slots.reduce((n, s) => n + (s?.events?.length || 0), 0),
        slots: slots.length,
        actors: spec.actors?.length ?? 0,
        views: viewsOf(spec).map((v) => v.label),
      }
    })
}

export function readExample(file) {
  const name = String(file).split('/').pop()
  const p = join(REPO, 'examples', name)
  if (!existsSync(p)) return null
  return { path: p, text: readFileSync(p, 'utf8') }
}

/** 规范文档清单 */
export function listSpecs() {
  const dir = join(REPO, 'spec')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ name: f.replace(/\.md$/, ''), file: `spec/${f}`, path: join(dir, f) }))
}

export function readSpec(name) {
  const p = join(REPO, 'spec', `${String(name).replace(/\.md$/, '')}.md`)
  if (!existsSync(p)) return null
  return readFileSync(p, 'utf8')
}

export { CANVAS }
