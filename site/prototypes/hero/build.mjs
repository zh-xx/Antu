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
import { captureAll } from './capture.mjs'
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
//  Draft "lenses": a typeset judgment turns into Antu's timeline, its relationship graph and its reasoning
//  tree; then a typeset contract turns into its flowchart. Each scene ends on what Antu itself draws for
//  the example (capture.mjs); the build checks that every piece that moves comes from the document.
// ------------------------------------------------------------
{
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
// "2032-04-13T11:00：" at the head of a sentence, written the way a judgment writes it
const cnDate = (s) => s.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?：/, (_, y, m, d, hh, mm) =>
  `${y}年${+m}月${+d}日${hh ? `${+hh}时${mm === '00' ? '' : `${+mm}分`}` : ''}，`)

const fact = JSON.parse(read(`${REPO}examples/fact/fang-yuan-loan-and-conflict.zh-CN.json`))
const relf = JSON.parse(read(`${REPO}examples/relationship/fang-yuan-parties.zh-CN.json`))
const just = JSON.parse(read(`${REPO}examples/justification/fang-yuan-defense-excess.zh-CN.json`))
const proc = JSON.parse(read(`${REPO}examples/procedure/02-purchase-contract.zh-CN.json`))
const jtext = read(`${REPO}examples/raw/（2032）示刑终1号-方远案-二审.md`)
const jl = jtext.split('\n')

// ---- the judgment: each sentence of the account is an event of the fact file
const sents = jl.filter((l) => l.startsWith('- 20')).map((l) => l.slice(2))
const events = fact.slots.flatMap((s) => s.events).sort((a, b) => a.date.localeCompare(b.date))
events.forEach((e, i) => {
  if (!sents[i]?.startsWith(`${e.date}：${e.label}`)) throw new Error(`sentence ${i + 1} of the judgment does not match event ${e.id}`)
})
// every party of the relationship file is named in the judgment; these are the names that light up
const terms = { 'e-5': ['钟某', '郑某'], 'e-7': ['孟某', '严某', '程某'] }
const byTerm = {}
for (const e of relf.entities) {
  for (const w of terms[e.id] ?? [e.label]) {
    if (!jtext.includes(w)) throw new Error(`${w} (${e.label}) is never named in the judgment`)
    byTerm[w] = e.id
  }
}
const nameRe = new RegExp(Object.keys(byTerm).sort((a, b) => b.length - a.length).join('|'), 'g')
const mark = (s) => esc(s).replace(nameRe, (w) => `<span class="nm" data-e="${byTerm[w]}">${w}</span>`)
const meta = Object.fromEntries(jl.filter((l) => l.startsWith('> ')).map((l) => l.slice(2)).flatMap((l) => l.split(' | ')).map((kv) => kv.split('：')).filter((p) => p.length > 1).map(([k, ...v]) => [k, v.join('：')]))
const viewAt = jl.indexOf('## 本院认为')
const viewPara = jl[viewAt + 2]
const closing = jl.slice(viewAt + 3).find((l) => l.trim())
const fiction = jl.find((l) => l.includes('本文书是虚构的')).slice(2).replace(/\*\*/g, '')
const judgmentHtml = `
  <div class="court">${esc(meta['法院'])}</div>
  <div class="kind">刑事判决书</div>
  <div class="no">${esc(jl[0].replace(/^# /, ''))}</div>
  <p class="party">${mark(meta['当事人'])}。</p>
  <p class="lead"><b>本院查明</b></p>
  ${jl.filter((l) => /^[一二三四]、/.test(l)).map((l) => `<p>${mark(l)}</p>`).join('')}
  <p>上述事实，另有如下经过：</p>
  ${sents.map((s, i) => `<p class="ev" data-id="${events[i].id}">${mark(cnDate(s))}</p>`).join('')}
  <p id="yrw"><b>本院认为</b>　${mark(viewPara)}</p>
  <p>${esc(closing)}</p>
  <p class="fiction">${esc(fiction)}</p>`

// ---- the contract: each step of the flowchart is named, word for word, in a sentence of a clause
const csrc = proc.sources[0]
const stem = csrc.loc.file.replace(/\.[^.]+$/, '')
const craw = readdirSync(`${REPO}examples/raw`).find((f) => f.startsWith(`${stem}-`))
if (!craw) throw new Error(`no contract text for ${csrc.loc.file} in examples/raw/`)
const cl = read(`${REPO}examples/raw/${craw}`).split('\n')
const clauses = cl.filter((l) => /^第.+条 /.test(l)).map((l) => {
  const [head, ...rest] = l.split('：')
  return { head, sents: rest.join('：').match(/[^。；]+[。；]?/g) }
})
const taken = {}
for (const n of proc.nodes) {
  let hit = null
  clauses.forEach((c, ci) => {
    const pieces = [c.head + '：' + c.sents[0], ...c.sents.slice(1)]
    pieces.forEach((s, si) => { if (!hit && !taken[`${ci}.${si}`] && s.includes(n.label)) hit = `${ci}.${si}` })
  })
  if (!hit) throw new Error(`flow step "${n.label}" is in no sentence of ${craw}`)
  taken[hit] = n.id
}
const cmeta = cl.filter((l) => l.startsWith('> ')).map((l) => l.slice(2))
const contractHtml = `
  <div class="ctitle">${esc(cl[0].replace(/^# /, ''))}</div>
  <div class="no">${esc(cmeta[0])}</div>
  ${cmeta[1].split(' | ').map((p) => `<p class="party">${esc(p)}</p>`).join('')}
  ${clauses.map((c, ci) => {
    const head = `<b>${esc(c.head.replace(' ', '　'))}</b>　`
    // the clause head belongs to its first sentence: when that sentence names a step, the head moves with it
    const body = c.sents.map((s, si) => {
      const id = taken[`${ci}.${si}`], text = (si === 0 ? head : '') + esc(s)
      return id ? `<span class="sn" data-n="${id}">${text}</span>` : text
    }).join('')
    return `<p class="cl">${body}</p>`
  }).join('')}
  <p class="fiction">${esc(cmeta.find((l) => l.includes('本文书是虚构的')).replace(/\*\*/g, ''))}</p>`
// ---- what Antu draws for each, captured from the real engine
const shots = await captureAll([
  { name: 'fact', spec: fact, preset: { theme: 'document', orientation: 'horizontal', viewIndex: 0 }, dpr: 3 },
  { name: 'rel', spec: relf, preset: { theme: 'document', orientation: 'horizontal' } },
  { name: 'just', spec: just, preset: { theme: 'document', orientation: 'horizontal', fields: { collapsed: just.groups.map((g) => g.id) } }, dpr: 3 },
  { name: 'flow', spec: proc, preset: { theme: 'document', orientation: 'horizontal' }, dpr: 3 },
])
const need = { fact: events.map((e) => e.id), rel: relf.entities.map((e) => e.id), just: ['c-1', ...just.links.filter((l) => l.to === 'c-1').map((l) => l.from)], flow: proc.nodes.map((n) => n.id) }
for (const [k, ids] of Object.entries(need)) for (const id of ids) if (!shots[k].nodes[id]) throw new Error(`${k}: Antu drew no card for ${id}`)

const mainPath = [proc.nodes.find((n) => n.kind === 'start').id]
for (;;) { const e = proc.edges.find((x) => x.main && x.from === mainPath.at(-1)); if (!e) break; mainPath.push(e.to) }
const L = {
  frame: { w: 1200, h: 600 },
  fact: { nodes: shots.fact.nodes, order: need.fact },
  rel: { nodes: shots.rel.nodes },
  just: { nodes: shots.just.nodes, root: 'c-1', heads: need.just.slice(1) },
  flow: { nodes: shots.flow.nodes, order: proc.nodes.map((n) => n.id), mainPath },
}
const img = (b64) => `data:image/webp;base64,${b64}`
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>案图 · 首页动画草稿</title>
<style>${read(`${HERE}lenses.css`)}</style></head><body>
<span class="logo">案图</span><div class="glowlay"></div>
<main class="stage" id="stage">
 <div class="spread" id="spread"><div class="pg"></div><div class="pg"></div>
  <div class="doc" id="judgment">${judgmentHtml}</div>
  <div class="doc" id="contract">${contractHtml}</div>
  <div class="beam" id="beam"></div></div>
 <div class="canvas" id="canvas"><div class="cam">${Object.keys(shots).map((k) => `<img class="lines" data-k="${k}" src="${img(shots[k].lines)}" alt=""><img class="full" data-k="${k}" src="${img(shots[k].full)}" alt="">`).join('')}</div></div>
</main>
<footer class="foot"><div class="dots"><i></i><i></i><i></i><i></i></div>
 <button id="replay" aria-label="重播" title="重播"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg></button></footer>
<script>window.__LENS__ = ${JSON.stringify(L).replace(/</g, '\\u003c')}</script>
<script>${read(`${HERE}lenses.js`)}</script>
</body></html>
`
writeFileSync(`${HERE}lenses.html`, html)
console.log(`lenses.html  ${(html.length / 1024).toFixed(0)} KB`)
}
