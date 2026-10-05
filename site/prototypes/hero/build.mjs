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

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
  // the contract text: each clause split into sentences; each node takes the first free sentence holding its label
  const stem = src.loc.file.replace(/\.[^.]+$/, '')
  const rawName = readdirSync(`${REPO}examples/raw`).find((f) => f.startsWith(`${stem}-`))
  if (!rawName) throw new Error(`no contract text for ${src.loc.file} in examples/raw/`)
  const ctext = read(`${REPO}examples/raw/${rawName}`).split('\n')
  const clauses = ctext.filter((l) => /^第.+条 /.test(l)).map((l) => l.match(/[^。；]+[。；]?/g))
  const taken = new Set()
  const sentenceOf = {}
  for (const n of p.nodes) {
    let hit = null
    clauses.forEach((ss, ci) => ss.forEach((s, si) => { if (!hit && !taken.has(`${ci}.${si}`) && s.includes(n.label)) hit = `${ci}.${si}` }))
    if (!hit) throw new Error(`flow node "${n.label}" is in no sentence of ${rawName}`)
    taken.add(hit)
    sentenceOf[hit] = n.id
  }
  const contract = {
    title: ctext[0].replace(/^# /, ''),
    meta: ctext.filter((l) => l.startsWith('> ')).slice(0, 2).map((l) => l.slice(2)),
    clauses: clauses.map((ss, ci) => ss.map((s, si) => ({ s, n: sentenceOf[`${ci}.${si}`] }))),
  }
  return {
    contract,
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
  // Antu's vertical timeline for this view: one column per party (side one mirrored, so its first party is next
  // to the axis), the axis between the sides; an event of one party sits in that party's column, an event of
  // both sides (or of nobody) on the axis
  const actorName = Object.fromEntries(fact.actors.map((a) => [a.id, a.name]))
  const cols = [
    ...[...view.side1.actors].reverse().map((a) => ({ key: a, head: view.side1.label, sub: actorName[a] })),
    { key: 'axis', head: view.axis.label, sub: '' },
    ...view.side2.actors.map((a) => ({ key: a, head: view.side2.label, sub: actorName[a] === view.side2.label ? '' : actorName[a] })),
  ]
  const colOf = (ids) => {
    const s1 = ids.filter((a) => view.side1.actors.includes(a)), s2 = ids.filter((a) => view.side2.actors.includes(a))
    if (!ids.length || (s1.length && s2.length)) return cols.findIndex((c) => c.key === 'axis')
    if (ids.length > 1) throw new Error(`event with several parties of one side: ${ids}`)
    return cols.findIndex((c) => c.key === ids[0])
  }
  const cnDate = (s) => s.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?：/, (_, y, m, d, hh, mm) =>
    `${y}年${+m}月${+d}日${hh ? `${+hh}时${mm === '00' ? '' : `${+mm}分`}` : ''}，`)
  const sents = lines.filter((l) => l.startsWith('- 20')).map((l) => l.slice(2))
  const events = fact.slots.flatMap((s) => s.events).sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => {
    if (!sents[i] || !sents[i].startsWith(`${e.date}：${e.label}`)) throw new Error(`sentence ${i + 1} of the judgment does not match event ${e.id}`)
    return { id: e.id, label: e.label, summary: e.summary ?? '', when: e.date.replace('T', ' '), col: colOf(e.actorIds) }
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
    cols,
    entities,
    groups: Object.fromEntries(relf.groups.map((g) => [g.id, g.label])),
    relations: relf.relations.map((r) => ({ id: r.id, from: r.from, to: r.to, kind: r.kind, label: r.label, amount: r.amount })),
    totalMentions: entities.reduce((n, e) => n + e.mentions, 0),
    judgmentName: `${lines[0].replace(/^# /, '')} · ${lines[2].replace(/^> /, '').replace('（虚构）', '')}`,
    reason: reasoning(),
    flow: flowchart(),
  }
  // the four kinds on the left, each with Antu's own sketch of it (assets/kinds), drawn in the page's colours
  const KINDS = [
    { id: 'fact', label: '事实', icon: 'timeline' },
    { id: 'relationship', label: '关系', icon: 'graph' },
    { id: 'procedure', label: '程序', icon: 'flow' },
    { id: 'justification', label: '证成', icon: 'tree' },
  ]
  const sketch = (name) => read(`${REPO}assets/kinds/${name}.svg`)
    .replace(/ width="\d+" height="\d+"/, '')
    .replace(/stroke="#64748b"/g, 'stroke="currentColor"').replace(/fill="#64748b"/g, 'fill="currentColor"').replace(/fill="#e2e8f0"/g, 'class="skf"')
  const facts = lines.filter((l) => /^[一二三四]、/.test(l))
  const meta = Object.fromEntries(lines.filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).flatMap((l) => l.split(' | ')).map((kv) => kv.split('：')).filter((p) => p.length > 1).map(([k, ...v]) => [k, v.join('：')]))
  const fiction = lines.find((l) => l.includes('本文书是虚构的')).slice(2).replace(/\*\*/g, '')
  const view2 = lines[lines.indexOf('## 本院认为') + 2]
  const closing = lines.slice(lines.indexOf('## 本院认为') + 3).find((l) => l.trim())
  if (!view2) throw new Error('the judgment has no 本院认为 paragraph')
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>案图 Antu · 法律文书，一眼看清</title>
<style>${css}
${read(`${HERE}lenses.css`)}</style>
<script>try { const t = localStorage.getItem('antu.site.theme'); if (t) document.documentElement.dataset.theme = t } catch {}</script></head><body class="lx">
<header class="nav">
 <a class="brand" href="#"><b>案图</b><span>Antu</span></a>
 <p class="motto">法律文书，<em>一眼看清</em></p>
 <nav class="links">
  <a href="https://antu.nervonly.cn/" data-i18n="examples">示例</a>
  <a class="gh" href="https://github.com/zh-xx/Antu" aria-label="GitHub"><svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg><span>GitHub</span></a>
  <span class="sep" aria-hidden="true"></span>
  <div class="lang" role="radiogroup" aria-label="Language"><i class="knob" aria-hidden="true"></i><button role="radio" aria-checked="true" data-lang="zh">中文</button><button role="radio" aria-checked="false" data-lang="en">EN</button></div>
  <button class="mode" id="mode" aria-label="切换明暗" title="切换明暗"><svg class="moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button>
  <button class="start" id="startBtn" data-i18n="start">开始使用</button>
 </nav>
 <div class="pop" id="pop" hidden><b data-i18n="popTitle">交给你的 AI 助手</b><p data-i18n="popBody">复制下面这段话，发给你常用的 AI 助手，它会自己装好案图。</p><pre>（提示词正在整理，下一步放进来）</pre><button disabled data-i18n="copy">复制</button></div>
</header>
<section class="hero">
<div class="show">
 <nav class="kinds" aria-label="四类图">
  ${KINDS.map((k, i) => `<button class="kind${i === 0 ? ' on' : ''}" data-kind="${k.id}"><span class="sk">${sketch(k.icon)}</span><b>${k.label}</b><i class="prog"></i></button>`).join('\n  ')}
 </nav>
 <div class="stage" id="stage">
 <div class="paper" id="paper"><span class="lbl">判决书 · 虚构</span><div class="beam" id="beam"></div>
  <div class="court">${meta['法院']}</div><div class="ttl">刑事判决书</div><div class="no">${lines[0].replace(/^# /, '')}</div>
  <p class="party">${mark(meta['当事人'])}。</p>
  <h3>本院查明</h3>${facts.map((f) => `<p>${mark(f)}</p>`).join('')}
  <p>上述事实，另有如下经过：</p><ul id="bul">${sents.map((b) => `<li>${mark(cnDate(b))}</li>`).join('')}</ul>
  <h3>本院认为</h3><p id="yrw">${mark(view2)}</p>
  <p>${closing}</p>
  <p class="fiction">${fiction}</p></div>
 <div class="paper paper2" id="paper2"><span class="lbl">合同 · 虚构</span><div class="beam" id="beam2"></div>
  <h2>${L.flow.contract.title}</h2>${L.flow.contract.meta.map((m) => `<p class="meta">${m}</p>`).join('')}
  ${L.flow.contract.clauses.map((ss) => `<p class="cl">${ss.map((x) => (x.n ? `<span class="sn" data-n="${x.n}">${x.s}</span>` : x.s)).join('')}</p>`).join('')}</div>
</div>
</div>
</section>
<script>window.__LENS__ = ${JSON.stringify(L).replace(/</g, '\\u003c')}</script>
<script>${read(`${HERE}lenses.js`)}</script>
</body></html>
`
  writeFileSync(`${HERE}lenses.html`, html)
  console.log(`lenses.html  ${html.length} chars  (${events.length} events, ${L.totalMentions} mentions)`)
}
