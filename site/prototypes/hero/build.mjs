// ============================================================
//  site/prototypes/hero/build.mjs — three drafts of the home-page animation (issue #107)
//
//  Each draft is one self-contained HTML file, made from the fictional case in examples/ (the structured
//  data and the judgment text next to it). Nothing in the pictures is typed by hand: the six nodes are the
//  first six timed events of the case, and each one is matched to the sentence of the judgment it comes from.
//  The build stops if a sentence cannot be found, so a marked sentence always exists in the document.
//
//  Run:  node site/prototypes/hero/build.mjs
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const read = (p) => readFileSync(p, 'utf8')

const spec = JSON.parse(read(`${REPO}examples/fact/neighbour-corridor-charging.zh-CN.json`))
const raw = read(`${REPO}examples/raw/（2031）示民终1号-楼道充电劝阻案-二审.md`).split('\n')
const sources = Object.fromEntries(spec.sources.map((s) => [s.id, s]))
const events = spec.slots.flatMap((s) => s.events).filter((e) => e.date.length > 10).sort((a, b) => a.date.localeCompare(b.date))
const bullets = raw.filter((l) => l.startsWith('- 20')).map((l) => l.slice(2))
const hhmmss = (d) => d.slice(11)

const SHOWN = 6
const shown = events.slice(0, SHOWN).map((e) => {
  const line = bullets.find((l) => l.startsWith(`${e.date}：`))
  if (!line) throw new Error(`no sentence of the judgment for event ${e.id}`)
  if (!line.includes(e.label)) throw new Error(`the sentence for ${e.id} does not contain its label`)
  return {
    id: e.id,
    time: hhmmss(e.date) + (e.dateEnd ? ' – ' + hhmmss(e.dateEnd) : ''),
    label: e.label,
    sources: e.sourceIds.map((i) => sources[i].name),
    line,
  }
})

const data = {
  title: raw[0].replace(/^# /, ''),
  meta: raw[2].replace(/^> /, ''),
  facts: raw.filter((l) => /^[一二三四五]、/.test(l)).map((l) => l.slice(0, 54) + '…'),
  bullets,
  shown,
}

const css = read(`${HERE}page.css`)
const body = (name, note) => `<section class="hero">
<span class="tag">${name}</span>
<div class="top">
 <div><p class="eyebrow">案图 · ANTU</p><h1>一份判决书，<br><em>一张看得见的图</em></h1></div>
 <p class="lede">AI 助手读判决书，案图把事实、程序、关系、说理画成图。每个点，都能回到原文出处。</p>
</div>
<div class="stage" id="stage">
 <div class="paper" id="paper"><span class="lbl">判决书 · 虚构</span><div class="beam" id="beam"></div>
  <h2>${data.title}</h2><p class="meta">${data.meta}</p>
  <h3>本院查明</h3>${data.facts.slice(0, 2).map((f) => `<p>${f}</p>`).join('')}
  <h3>上述事实，另有如下经过：</h3><ul id="bul">${data.bullets.map((b, i) => `<li data-i="${i}">${b}</li>`).join('')}</ul></div>
 <div class="big" id="big"><b>${shown.length}</b><span>句判决原文<br>变成 ${shown.length} 个节点<br>每个都能回到出处</span></div>
 <div class="board" id="board"><span class="lbl" style="left:34px">案图画出的时间图</span><div class="axis" id="axis"></div>
  ${shown.map((s, i) => `<div class="slot"><div class="dot"></div><div class="card" id="c${i}"><div class="t" data-t="${s.time}">${s.time}</div><div class="l">${s.label}</div><div class="s"><u>出处</u>${s.sources.map((x) => `<b>${x}</b>`).join('')}</div></div></div>`).join('')}
  <div class="stamp" id="stamp">案图</div></div>
</div>
<div class="bottom"><p class="cap" id="cap"><strong>${shown.length} 句关键事实 → ${shown.length} 个节点，每个节点都有出处。</strong>&emsp;示意：由 AI 助手阅读并提取，案图负责画图。文书为虚构。</p><button id="replay">↻ 重播</button></div>
<p class="note">${note}</p>
</section>`

const VARIANTS = [
  { file: 'morph', name: '方案 A · 变形', js: 'morph.js', note: '草稿：每个被标出的句子，自己变形成时间图上的节点。右侧的提示词框、安装方式会放在这一屏，草稿暂未画出。' },
  { file: 'lines', name: '方案 B · 汇线', js: 'lines.js', note: '草稿：整页的每一行先变成一道细线，再滑向时间轴；被标出的展开成节点，其余的被收进轴里。' },
  { file: 'chars', name: '方案 C · 拆字', js: 'chars.js', note: '草稿：被标出的句子拆成一个个字，重新拼成节点上的时间和事件。节点里没有的字散落消失。' },
]

for (const v of VARIANTS) {
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>案图 · 首页动画草稿 ${v.name}</title>
<style>${css}</style></head><body>
${body(v.name, v.note)}
<script>window.__HERO__ = ${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>${read(`${HERE}${v.js}`)}</script>
<script>${read(`${HERE}common.js`)}</script>
</body></html>
`
  writeFileSync(`${HERE}${v.file}.html`, html)
  console.log(`${v.file}.html  ${html.length} chars`)
}

// ------------------------------------------------------------
//  Draft "lenses": one judgment (the 方远 case), shown as the timeline and then as the relationship graph.
//  The timeline is all twelve events of the fact file, each matched to its sentence; the graph is the
//  relationship file, and every highlighted name is a real mention in the judgment.
// ------------------------------------------------------------
// the 方远 reasoning file, reduced to what a first screen can show: the holding, the five issues with the
// point the court ruled on for each (and whether it held), and every other node of the issue as one line
function reasoning() {
  const j = JSON.parse(read(`${REPO}examples/justification/fang-yuan-defense-excess.zh-CN.json`))
  const byId = Object.fromEntries(j.nodes.map((n) => [n.id, n]))
  const root = j.nodes.find((n) => n.kind === 'conclusion' && !n.groupId)
  const ORDER = ['norm', 'element', 'judgement', 'inference', 'fact', 'conclusion']
  const issues = j.groups.map((g) => {
    const link = j.links.find((l) => l.to === root.id && byId[l.from].groupId === g.id)
    if (!link) throw new Error(`issue ${g.id} has no point linked to the holding`)
    const head = byId[link.from]
    const leaves = j.nodes.filter((n) => n.groupId === g.id && n !== head)
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
      .map((n) => ({ kind: n.kind, label: n.label, holds: n.holds === 'no' ? false : undefined }))
    return { label: g.label, head: head.label, holds: head.holds !== 'no', against: link.stance === 'against', leaves }
  })
  return {
    root: root.label, issues, nodes: j.nodes.length, links: j.links.length,
    kinds: { norm: '规范', element: '要件', judgement: '判断', inference: '推论', fact: '事实', conclusion: '结论' },
  }
}

// the purchase-contract flow; the file has no positions, so the draft places each node on a small grid here
// (column, row 0 = the main line, row 1 = the branch) and stops if a node is left out
function flowchart() {
  const p = JSON.parse(read(`${REPO}examples/procedure/02-purchase-contract.zh-CN.json`))
  const grid = { 'n-1': [0, 0], 'n-2': [1, 0], 'n-3': [2, 0], 'n-4': [3, 0], 'n-5': [4, 0], 'n-6': [6, 0], 'n-11': [8, 0],
    'n-7': [4, 1], 'n-8': [5, 1], 'n-9': [6, 1], 'n-10': [7, 1], 'n-12': [8, 1] }
  for (const n of p.nodes) if (!grid[n.id]) throw new Error(`flow node ${n.id} has no place on the grid`)
  const startId = p.nodes.find((n) => n.kind === 'start').id
  const mainPath = [startId]
  for (;;) { const e = p.edges.find((x) => x.main && x.from === mainPath.at(-1)); if (!e) break; mainPath.push(e.to) }
  const src = p.sources[0]
  return {
    nodes: Object.fromEntries(p.nodes.map((n) => [n.id, { kind: n.kind, label: n.label, outcome: n.outcome }])),
    order: [...p.nodes].sort((a, b) => grid[a.id][1] - grid[b.id][1] || grid[a.id][0] - grid[b.id][0]).map((n) => n.id),
    edges: p.edges.map((e) => ({ from: e.from, to: e.to, condition: e.condition, main: !!e.main })),
    grid, mainPath, sourceName: src.name, sourceFile: src.loc?.file ?? '',
  }
}

{
  const fact = JSON.parse(read(`${REPO}examples/fact/fang-yuan-loan-and-conflict.zh-CN.json`))
  const relf = JSON.parse(read(`${REPO}examples/relationship/fang-yuan-parties.zh-CN.json`))
  const text = read(`${REPO}examples/raw/（2032）示刑终1号-方远案-二审.md`)
  const lines = text.split('\n')
  const view = fact.views[0]
  const side = (ids) => {
    const one = ids.length > 0 && ids.every((a) => view.side1.actors.includes(a))
    const two = ids.length > 0 && ids.every((a) => view.side2.actors.includes(a))
    return one ? 'above' : two ? 'below' : 'mid'
  }
  const sents = lines.filter((l) => l.startsWith('- 20')).map((l) => l.slice(2))
  const events = fact.slots.flatMap((s) => s.events).sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => {
    if (!sents[i] || !sents[i].startsWith(`${e.date}：${e.label}`)) throw new Error(`sentence ${i + 1} of the judgment does not match event ${e.id}`)
    return { id: e.id, label: e.label, when: e.date.replace('T', ' '), row: side(e.actorIds) }
  })
  // the names to light up: each party's label, or its parts when it names several people
  const terms = { 'e-5': ['钟某', '郑某'], 'e-7': ['孟某', '严某', '程某'] }
  const entities = relf.entities.map((e) => {
    const t = terms[e.id] ?? [e.label]
    const mentions = t.reduce((n, w) => n + (text.split(w).length - 1), 0)
    if (!mentions) throw new Error(`${e.label} is never named in the judgment`)
    return { id: e.id, label: e.label, role: e.role, kind: e.kind, terms: t, mentions }
  })
  const byTerm = Object.fromEntries(entities.flatMap((e) => e.terms.map((w) => [w, e.id])))
  const re = new RegExp(Object.keys(byTerm).sort((a, b) => b.length - a.length).join('|'), 'g')
  const mark = (s) => s.replace(re, (w) => `<span class="nm" data-e="${byTerm[w]}">${w}</span>`)
  const L = {
    events,
    sides: { above: view.side1.label, mid: view.axis.label, below: view.side2.label },
    sideNote: { above: '方远、梁某', mid: '双方都在场，或无人', below: '钟某、郑某等' },
    entities,
    groups: Object.fromEntries(relf.groups.map((g) => [g.id, g.label])),
    relations: relf.relations.map((r) => ({ id: r.id, from: r.from, to: r.to, kind: r.kind, label: r.label, amount: r.amount })),
    totalMentions: entities.reduce((n, e) => n + e.mentions, 0),
    reason: reasoning(),
    flow: flowchart(),
  }
  const facts = lines.filter((l) => /^[一二三四]、/.test(l))
  const view2 = lines[lines.indexOf('## 本院认为') + 2]
  if (!view2) throw new Error('the judgment has no 本院认为 paragraph')
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>案图 · 首页动画草稿 · 一份判决书，几种图</title>
<style>${css}
${read(`${HERE}lenses.css`)}</style></head><body class="lx">
<section class="hero">
<span class="tag">草稿 · 一份判决书，几种图</span>
<div class="top">
 <div><p class="eyebrow">案图 · ANTU</p><h1>一份判决书，<br><em>几种看得见的图</em></h1></div>
 <p class="lede">AI 助手读判决书，案图把事实、关系、说理、流程画成图。每个点，都能回到原文出处。</p>
</div>
<div class="stage" id="stage"><div class="scene-tag" id="scene"></div>
 <div class="paper" id="paper"><span class="lbl">判决书 · 虚构</span><div class="beam" id="beam"></div>
  <h2>${lines[0].replace(/^# /, '')}</h2><p class="meta">${mark(lines[2].replace(/^> /, ''))}</p>
  <h3>本院查明</h3>${facts.map((f) => `<p>${mark(f)}</p>`).join('')}
  <h3>上述事实，另有如下经过：</h3><ul id="bul">${sents.map((b) => `<li>${mark(b)}</li>`).join('')}</ul>
  <h3>本院认为</h3><p id="yrw">${mark(view2)}</p></div>
</div>
<div class="bottom"><div class="lens"><span>① 事实 · 时间线</span><span>② 关系 · 关系图</span><span>③ 说理 · 论证图</span><span>④ 流程 · 流程图</span></div><button id="replay">↻ 重播</button></div>
<p class="cap" id="cap" style="margin-top:1.2vh"></p>
</section>
<script>window.__LENS__ = ${JSON.stringify(L).replace(/</g, '\\u003c')}</script>
<script>${read(`${HERE}lenses.js`)}</script>
</body></html>
`
  writeFileSync(`${HERE}lenses.html`, html)
  console.log(`lenses.html  ${html.length} chars  (${events.length} events, ${L.totalMentions} mentions)`)
}
