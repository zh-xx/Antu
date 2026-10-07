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
import { createServer } from 'vite'

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
// The relationship graph exactly as Antu lays it out (its own layout code, run here; laid out across, where its lines and labels keep clear of each other),
// with the line and outline of each kind from the document theme; the page only colours them
let vitePromise = null
const viteServer = () => (vitePromise ??= createServer({ root: REPO, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' }))
async function relGraph(spec) {
  const vite = await viteServer()
  {
    const { buildRelationshipGraph } = await vite.ssrLoadModule('/src/renderers/relationship/graph/layout.js')
    const { THEMES } = await vite.ssrLoadModule('/src/theme/themes.js')
    const T = THEMES.document
    const g = buildRelationshipGraph(spec, {}, undefined, 'horizontal')
    if (g.errors.length) throw new Error(`the relationship example does not validate: ${g.errors.map((e) => e.message ?? e).join('; ')}`)
    const ents = g.nodes.filter((n) => n.type === 'rnode').map((n) => {
      const e = n.data.entity, p = T.entity[e.kind] ?? T.entity.other
      return { id: n.id, label: e.label, role: e.role ?? '', kind: e.kind, x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h, rx: Math.min(T.radius[e.kind] ?? 0, n.data.h / 2), width: p.width, dash: p.dash ?? '' }
    })
    const links = g.connections.map((c) => {
      const p = T.relation[c.kind] ?? T.relation.other
      return { id: c.id, kind: c.kind, d: c.dCurve, directed: !!c.directed, label: c.label, lx: c.labelAt.x, ly: c.labelAt.y, lw: c.labelSize.width, lh: c.labelSize.height, width: p.width, dash: p.dash ?? '', double: !!p.double }
    })
    return { size: g.size, groups: g.groupBoxes, ents, links }
  }
}

// The 方远 reasoning tree as Antu lays it out (across, where five issues stack under the holding), every issue
// folded, as it opens, then with issue two open (the same pieces, in the places Antu gives them then). Each card keeps its kind and holds; lines take the
// width and dash of their stance from the document theme
async function reasoning() {
  const j = JSON.parse(read(`${REPO}examples/justification/fang-yuan-defense-excess.zh-CN.json`))
  const vite = await viteServer()
  const { buildJustificationGraph } = await vite.ssrLoadModule('/src/renderers/justification/tree/layout.js')
  const { THEMES } = await vite.ssrLoadModule('/src/theme/themes.js')
  const T = THEMES.document.justify
  const all = j.groups.map((g) => g.id)
  const take = (collapsed) => {
    const g = buildJustificationGraph(j, { collapsed }, undefined, 'horizontal')
    if (g.errors.length) throw new Error(`the reasoning example does not validate: ${g.errors.map((e) => e.message ?? e).join('; ')}`)
    return {
      size: g.size,
      groups: g.groupBoxes.map((x) => ({ id: x.groupId, label: x.label, x: x.x, y: x.y, w: x.w, h: x.h, folded: !!x.collapsed, hidden: x.hidden ?? 0 })),
      nodes: g.nodes.map((n) => {
        const d = n.data.node, p = T.node[d.kind] ?? T.node.fact
        return { id: n.id, kind: d.kind, holds: d.holds ?? '', label: d.label, group: n.data.groupId ?? '', copy: !!n.data.copyOf,
          x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h, textW: n.data.textW, width: p.width, dash: p.dash ?? '' }
      }),
      links: g.connections.map((c) => {
        const s = T.stance[c.stance] ?? T.stance.for
        return { from: c.from, to: c.to, stance: c.stance, d: c.dCurve, width: s.width, dash: s.dash ?? '' }
      }),
    }
  }
  const OPEN = 'g-2' // the issue the court rejected: four cards, norm to holding, a whole chain in a small space
  const folded = take(all), open = take(all.filter((x) => x !== OPEN))
  const root = j.nodes.find((n) => n.kind === 'conclusion' && !n.groupId)
  const heads = j.links.filter((l) => l.to === root.id).map((l) => j.nodes.find((n) => n.id === l.from))
  return { folded, open, openGroup: OPEN, root: root.id, heads: heads.map((n) => ({ id: n.id, label: n.label })), rootLabel: root.label,
    kinds: { conclusion: '结论', norm: '规范', element: '要件', fact: '事实', inference: '推断', judgement: '评价' }, holds: { yes: '✓ 成立', no: '✗ 否定' } }
}

// Antu's flowchart layout aligns the boxes of a stage by their tops, so a step that follows a decision can sit
// beside its point, not on its centre line, and the link leaves the decision off its tip and enters the step off
// its middle. For the home page only, those steps (and what follows them in the row) are moved onto the
// decision's centre line, and the links from the decision are drawn straight from its tip into the middle of the
// step. The product's own layout is not touched. The build stops if a link from a decision is still off line.
function tidyAfterDecisions(nodes, links, stages) {
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]))
  // which stage each box is in, before anything moves
  const stageOf = new Map(nodes.map((n) => [n.id, stages.find((s) => n.x >= s.x && n.x + n.w <= s.x + s.w && n.y >= s.y && n.y + n.h <= s.y + s.h)]))
  const cy = (n) => n.y + n.h / 2
  const rowAfter = (id, seen = new Set()) => {
    // the step and what follows it straight on, in the same row (single forward link out, to the right)
    if (seen.has(id)) return []
    seen.add(id)
    const outs = links.filter((l) => l.from === id && l.kind !== 'back' && by[l.to].x > by[id].x && Math.abs(cy(by[l.to]) - cy(by[id])) < 40)
    return [id, ...(outs.length === 1 ? rowAfter(outs[0].to, seen) : [])]
  }
  for (const dec of nodes.filter((n) => n.kind === 'decision')) {
    for (const l of links.filter((x) => x.from === dec.id && x.kind !== 'back')) {
      const t = by[l.to]
      if (t.x <= dec.x + dec.w || Math.abs(cy(t) - cy(dec)) > 40) continue // not a step beside it (a step below is entered from above)
      const dy = cy(dec) - cy(t)
      if (Math.abs(dy) < 0.5) continue
      for (const id of rowAfter(l.to)) by[id].y += dy
      l.d = `M ${dec.x + dec.w} ${cy(dec)} L ${t.x} ${cy(dec)}`
      if (l.label) l.ly = cy(dec) - 22
    }
  }
  // a step entered from a decision's bottom point sits under it (its row moves sideways), and a link that goes back
  // up from a decision into a step above comes into that step's bottom straight (that step's row moves sideways)
  const cx = (n) => n.x + n.w / 2
  for (const dec of nodes.filter((n) => n.kind === 'decision')) {
    for (const l of links.filter((x) => x.from === dec.id && x.kind !== 'back')) {
      const t = by[l.to]
      if (t.y >= dec.y + dec.h && Math.abs(cx(t) - cx(dec)) < 40) {
        const dx = cx(dec) - cx(t)
        if (Math.abs(dx) > 0.5) { for (const id of rowAfter(l.to)) by[id].x += dx; if (l.lx != null) l.lx += dx }
        l.d = `M ${cx(dec)} ${dec.y + dec.h} L ${cx(dec)} ${t.y}`
      }
    }
  }
  for (const dec of nodes.filter((n) => n.kind === 'decision')) {
    for (const l of links.filter((x) => x.from === dec.id && x.kind === 'branch' && x.d.includes('C'))) {
      const t = by[l.to]
      if (t.y + t.h > dec.y) continue
      const dx = cx(dec) - cx(t)
      if (Math.abs(dx) > 0.5) for (const id of rowAfter(l.to)) by[id].x += dx
      l.d = `M ${cx(dec)} ${dec.y} L ${cx(dec)} ${t.y + t.h}`
      if (l.lx != null) l.lx = cx(dec) + 4
    }
  }
  // a stage box grows to hold what moved into its edge, with the room it had
  for (const s of stages) {
    const inside = nodes.filter((n) => stageOf.get(n.id) === s)
    const right = Math.max(...inside.map((n) => n.x + n.w))
    if (right + 14 > s.x + s.w) s.w = right + 14 - s.x
  }
  // links between boxes of one row are straight lines between their sides
  for (const l of links) {
    const a = by[l.from], t = by[l.to]
    if (/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/.test(l.d)) {
      const y = cy(a)
      if (Math.abs(cy(t) - y) < 0.5) {
        const was = l.d
        l.d = `M ${a.x + a.w} ${y} L ${t.x} ${y}`
        if (was !== l.d && l.label && l.lw != null && a.kind === 'decision' && t.x - (a.x + a.w) > 90) l.lx = (a.x + a.w + t.x) / 2 - l.lw / 2
      }
    }
  }
  // a link that comes back into a step from below ends under its middle, wherever the step is now
  for (const l of links.filter((x) => x.kind === 'branch' && x.d.includes('C') && by[x.to].y < by[x.from].y)) {
    const t = by[l.to]
    l.d = l.d.replace(/L ([\d.]+) [\d.]+$/, `L ${t.x + t.w / 2} ${t.y + t.h}`)
  }
  for (const l of links) {
    const a = by[l.from], t = by[l.to]
    if (a.kind === 'decision' && l.kind !== 'back' && t.x > a.x + a.w && Math.abs(cy(t) - cy(a)) > 0.5) throw new Error(`link ${l.from} > ${l.to} is still off the decision's centre line`)
    if (a.kind === 'decision' && !/ [CQ] /.test(l.d) && /^M ([\d.]+) [\d.]+ L ([\d.]+) [\d.]+$/.test(l.d)) {
      const [, x1, x2] = l.d.match(/^M ([\d.]+) [\d.]+ L ([\d.]+) [\d.]+$/)
      if (x1 === x2 && (Math.abs(+x1 - cx(a)) > 0.5 || Math.abs(+x2 - cx(t)) > 0.5)) throw new Error(`link ${l.from} > ${l.to} is not straight between the two boxes`)
    }
  }
}

// the purchase-contract flow, laid out by Antu's own procedure layout (across), with the outline of each kind and
// outcome and the line of each link from the document theme; and the contract it comes from, each step named
// word for word in one of its sentences
async function flowchart() {
  const p = JSON.parse(read(`${REPO}examples/procedure/02-purchase-contract.zh-CN.json`))
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
  // each sentence that names a step, with the step's name marked inside it
  const contract = {
    title: ctext[0].replace(/^# /, ''),
    no: ctext.find((l) => l.startsWith('> 合同编号')).slice(2),
    parties: ctext.find((l) => l.startsWith('> 甲方')).slice(2).split(' | '),
    fiction: ctext.find((l) => l.includes('本文书是虚构的')).slice(2).replace(/\*\*/g, ''),
    clauses: clauses.map((ss, ci) => ss.map((s, si) => {
      const id = sentenceOf[`${ci}.${si}`]
      if (!id) return { s }
      const label = p.nodes.find((n) => n.id === id).label, at = s.indexOf(label)
      return { n: id, pre: s.slice(0, at), label, post: s.slice(at + label.length) }
    })),
  }
  const vite = await viteServer()
  const { buildProcedureGraph } = await vite.ssrLoadModule('/src/renderers/procedure/flow/layout.js')
  const { THEMES } = await vite.ssrLoadModule('/src/theme/themes.js')
  const T = THEMES.document.flow
  const g = buildProcedureGraph(p, {}, undefined, 'horizontal')
  const stages = (g.stageBoxes ?? []).map((s) => ({ label: s.label, x: s.x, y: s.y, w: s.w, h: s.h }))
  if (g.errors.length) throw new Error(`the procedure example does not validate: ${g.errors.map((e) => e.message ?? e).join('; ')}`)
  const nodes = g.nodes.filter((n) => n.type === 'pnode').map((n) => {
    const k = n.data.node.kind, o = n.data.node.outcome ?? 'neutral', paint = T.outcome[o] ?? T.outcome.neutral
    return { id: n.id, kind: k, outcome: o, label: n.data.node.label, detail: n.data.node.detail ? String(n.data.node.detail).split('\n')[0] : '',
      x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h, width: paint.width, dash: paint.dash ?? '' }
  })
  const links = g.connections.map((c) => {
    const lp = c.kind === 'back' ? T.link.back : c.kind === 'main' ? T.link.main : T.link.plain
    return { id: c.id, from: c.from, to: c.to, kind: c.kind, d: c.dCurve, label: c.label ?? '', lx: c.labelAt?.x, ly: c.labelAt?.y, lw: c.labelSize?.width, lh: c.labelSize?.height, width: lp.width, dash: lp.dash ?? '' }
  })
  tidyAfterDecisions(nodes, links, stages)
  return { contract, size: g.size, stages, nodes, links, mainPath, order: [...nodes].sort((a, b) => a.x - b.x || a.y - b.y).map((n) => n.id) }
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
    rel: await relGraph(relf),
    totalMentions: entities.reduce((n, e) => n + e.mentions, 0),
    judgmentName: `${lines[0].replace(/^# /, '')} · ${lines[2].replace(/^> /, '').replace('（虚构）', '')}`,
    reason: await reasoning(),
    flow: await flowchart(),
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
  const reasonParas = lines.slice(lines.indexOf('## 本院认为') + 3).filter((l) => l.trim())
  for (const h of [...L.reason.heads, { id: L.reason.root, label: L.reason.rootLabel }]) {
    if (!reasonParas.some((p) => p.includes(h.label))) throw new Error(`the judgment's reasoning does not state "${h.label}" (${h.id})`)
  }
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
  <a href="#start" data-i18n="examples">示例</a>
  <a class="gh" href="https://github.com/zh-xx/Antu" aria-label="GitHub"><svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg><span>GitHub</span></a>
  <span class="sep" aria-hidden="true"></span>
  <div class="lang" role="radiogroup" aria-label="Language"><i class="knob" aria-hidden="true"></i><button role="radio" aria-checked="true" data-lang="zh">中文</button><button role="radio" aria-checked="false" data-lang="en">EN</button></div>
  <button class="mode" id="mode" aria-label="切换明暗" title="切换明暗"><svg class="moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button>
  <button class="start" id="startBtn" data-i18n="start">开始使用</button>
 </nav>
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
  <p>上述事实，另有如下经过：</p><ul id="bul">${sents.map((b, i) => {
    // the date and the event's name, word for word at the head of its sentence, are what the card takes
    const e = events[i], s = cnDate(b), dt = s.slice(0, s.indexOf('，') + 1), rest = s.slice(dt.length)
    if (!rest.startsWith(e.label)) throw new Error(`sentence ${i + 1}: the event name is not at its head`)
    return `<li><span class="dt">${dt.slice(0, -1)}</span>，<span class="lb">${mark(e.label)}</span>${mark(rest.slice(e.label.length))}</li>`
  }).join('')}</ul>
  <h3>本院认为</h3><p id="yrw">${mark(view2)}</p>
  ${reasonParas.map((para) => {
    const hit = [...L.reason.heads, { id: L.reason.root, label: L.reason.rootLabel }].filter((h) => para.includes(h.label))
    let html = mark(para)
    for (const h of hit) html = html.replace(mark(h.label), `<span class="jh" data-n="${h.id}">${mark(h.label)}</span>`)
    return `<p class="rp${hit.length ? ' has' : ''}">${html}</p>`
  }).join('')}
  <p class="fiction">${fiction}</p></div>
 <div class="paper paper2" id="paper2"><span class="lbl">合同 · 虚构</span><div class="beam" id="beam2"></div>
  <div class="ctitle">${L.flow.contract.title}</div><div class="no">${L.flow.contract.no}</div>
  ${L.flow.contract.parties.map((x) => `<p class="party">${x}</p>`).join('')}
  ${L.flow.contract.clauses.map((ss) => `<p class="cl">${ss.map((x, si) => {
    const text = (s) => (si === 0 ? s.replace(/^(第.+?条) /, '<b>$1</b>　') : s)
    return x.n ? `<span class="sn" data-n="${x.n}">${text(x.pre)}<span class="lb">${x.label}</span>${x.post}</span>` : text(x.s)
  }).join('')}</p>`).join('')}
  <p class="fiction">${L.flow.contract.fiction}</p></div>
</div>
</div>
</section>

<section class="start" id="start" aria-labelledby="startT">
 <p class="eyebrow">GET STARTED</p>
 <h2 class="start-t" id="startT" data-i18n="startT">开始使用</h2>
 <p class="start-s" data-i18n="startS">两种方式，任选其一。</p>
 <div class="ways">
  <div class="way">
   <div class="way-h"><span class="num">01</span><h3>Skill</h3><span class="chip" data-i18n="chip1">一句话</span></div>
   <p class="way-d" data-i18n="skillT">把下面这句话发给你的 Agent。</p>
   <div class="copybox"><div class="cb-bar"><span class="cb-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="cb-name">prompt</span><button class="copy" data-for="skillText" data-i18n="copy">复制</button></div><code id="skillText" data-i18n="skillText">请安装案图（Antu）这个 Skill：运行 npx skills add zh-xx/Antu -g -y，然后用它为我的案件材料画图。</code></div>
  </div>
  <div class="way">
   <div class="way-h"><span class="num">02</span><h3>MCP</h3><span class="chip" data-i18n="chip2">一段配置</span></div>
   <p class="way-d" data-i18n="mcpT">把这段配置加入你的 MCP 客户端。</p>
   <div class="copybox"><div class="cb-bar"><span class="cb-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="cb-name">json</span><button class="copy" data-for="mcpText" data-i18n="copy">复制</button></div><pre id="mcpText">{
  "mcpServers": {
    "antu": {
      "command": "npx",
      "args": ["-y", "-p", "@zh-xx/antu@latest", "antu-mcp"]
    }
  }
}</pre></div>
  </div>
 </div>
 <p class="eyebrow why-e">WHY ANTU</p>
 <h2 class="start-t" data-i18n="whyT">为什么适合法律工作</h2>
 <ol class="why">
  <li><span class="no">一</span><b data-i18n="w1t">材料不出本机。</b><span class="wd" data-i18n="w1">案件材料和生成的图都不上传到任何服务器。图是单个 HTML 文件，页面打开时不发起网络请求，离线可用。</span></li>
  <li><span class="no">二</span><b data-i18n="w2t">每个节点可追溯到原文。</b><span class="wd" data-i18n="w2">事实、条款、争点都可以记录出处并附原文摘录；点击节点即可查看，便于核对。</span></li>
  <li><span class="no">三</span><b data-i18n="w3t">只依据材料，不替当事人补充。</b><span class="wd" data-i18n="w3">Skill 要求 Agent 不得编造日期、条文序号、案号和人名；材料没有的写“日期不详”，不确定的法律问题不入图，并向用户说明。</span></li>
  <li><span class="no">四</span><b data-i18n="w4t">先校验，后成图。</b><span class="wd" data-i18n="w4">数据有问题时，系统按字段路径指出，并拒绝生成，不会输出一张看似完整却有错的图。</span></li>
  <li><span class="no">五</span><b data-i18n="w5t">可存档、可打印、可转发。</b><span class="wd" data-i18n="w5">默认的黑白方正样式适合打印和归档；图可以作为附件发送，收件人无需安装任何软件。</span></li>
 </ol>
</section>

<footer class="pfoot">
 <span>案图 Antu · 开源（AGPL-3.0-or-later）· 0.x 早期版本，仍在变化</span>
 <a href="https://github.com/zh-xx/Antu">GitHub</a>
</footer>
<script>window.__LENS__ = ${JSON.stringify(L).replace(/</g, '\\u003c')}</script>
<script>${read(`${HERE}lenses.js`)}</script>
</body></html>
`
  writeFileSync(`${HERE}lenses.html`, html)
  console.log(`lenses.html  ${html.length} chars  (${events.length} events, ${L.totalMentions} mentions)`)
}

if (vitePromise) await (await vitePromise).close()
