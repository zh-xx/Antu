// Draft "lenses" (issue #107): one judgment, seen as more than one diagram.
// 1. the page is read  2. its twelve sentences turn into the timeline  3. the timeline rewinds into the page
// 4. every name in the page lights up and the mentions gather into the parties  5. the relations draw themselves.
// Everything shown comes from window.__LENS__, which build.mjs made from the case files in examples/.
const D = window.__LENS__
const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const stage = $('#stage'), paper = $('#paper')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const SVGNS = 'http://www.w3.org/2000/svg'
const ease = 'cubic-bezier(.65,0,.2,1)'
let run = 0

const rel = (el) => {
  const a = el.getBoundingClientRect(), b = stage.getBoundingClientRect()
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }
}
const el = (tag, cls, html, style) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  if (style) Object.assign(e.style, style)
  stage.appendChild(e)
  return e
}
const show = (e, ms = 400, delay = 0) => e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, delay, fill: 'both' })

function lens(i) {
  $$('.lens span').forEach((s, k) => s.classList.toggle('on', k === i))
}
function caption(text) {
  const c = $('#cap')
  c.innerHTML = text
  c.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 500, fill: 'both' })
}
function sceneTag(n, text) {
  const t = $('#scene')
  t.innerHTML = `<b>${n}</b>${text}`
  t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'both' })
}

// ---------- layouts (from the stage's size, so they fit any screen)
const CW = 144, CH = 56
function timeline() {
  const W = stage.clientWidth, H = stage.clientHeight, n = D.events.length
  const left = 150, step = (W - left - CW - 4) / (n - 1), mid = Math.round(H * 0.5)
  const yOf = (row, tier) => row === 'mid' ? mid - CH / 2
    : row === 'above' ? mid - CH / 2 - 26 - CH - tier * (CH + 10)
      : mid + CH / 2 + 26 + tier * (CH + 10)
  return {
    mid, left, W,
    cards: D.events.map((e, i) => ({ x: left + i * step, y: yOf(e.row, e.row === 'mid' ? 0 : i % 2), w: CW, h: CH, cx: left + i * step + CW / 2, row: e.row })),
    rows: [['above', yOf('above', 0) - 20], ['mid', mid - 18], ['below', yOf('below', 0) + 18]],
  }
}
function graph() {
  const W = stage.clientWidth, H = stage.clientHeight
  const P = (x, y) => ({ x: x * W, y: y * H })
  return {
    camps: [{ id: 'g-1', x: 0.02 * W, y: 0.06 * H, w: 0.47 * W, h: 0.9 * H }, { id: 'g-2', x: 0.53 * W, y: 0.06 * H, w: 0.45 * W, h: 0.9 * H }],
    at: { 'e-2': P(0.12, 0.3), 'e-3': P(0.36, 0.3), 'e-4': P(0.12, 0.62), 'e-1': P(0.3, 0.84), 'e-5': P(0.76, 0.3), 'e-6': P(0.65, 0.78), 'e-7': P(0.88, 0.78) },
  }
}

// ---------- the scenes
function reading() {
  const pr = paper.getBoundingClientRect()
  $$('.paper h2,.paper .meta,.paper h3,.paper p,#bul li').forEach((e) => {
    const y = e.getBoundingClientRect().top - pr.top
    e.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 350, delay: 200 + (y / pr.height) * 1300, fill: 'both' })
  })
  $('#beam').animate([{ top: '-70px', opacity: 1 }, { top: pr.height + 'px', opacity: 1 }], { duration: 1500, delay: 200, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => ($('#beam').style.opacity = 0)
  return wait(1800)
}

const HOT = '#f0d9cf', PANEL = '#15171b'
const SH_A = 'inset 3px 0 0 #e8452c, inset 0 0 0 0 rgba(255,255,255,.12), 0 0 0 rgba(0,0,0,0)'
const SH_B = 'inset 0 0 0 0 #e8452c, inset 0 0 0 1px rgba(255,255,255,.16), 0 10px 26px rgba(0,0,0,.45)'
const paperAway = () => (paper.classList.add('melt'), [
  ...$$('.paper > *:not(.beam)').map((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 600, fill: 'both', easing: 'ease-in' })),
  paper.animate([{ backgroundColor: '#f4f0e8', boxShadow: '0 30px 80px rgba(0,0,0,.6)' }, { backgroundColor: 'rgba(244,240,232,0)', boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 800, delay: 100, fill: 'both', easing: ease }),
])

async function toTimeline(alive) {
  lens(0)
  sceneTag('① 事实', '判决书里的经过，变成时间线')
  const L = timeline(), lis = $$('#bul li')
  // each sentence of the account becomes its own object, lit
  const acts = D.events.map((e, i) => {
    const li = lis[i], A = rel(li), B = L.cards[i]
    const a = el('div', 'actor', `<div class="txt" style="width:${A.w}px;height:${A.h}px">${li.innerHTML}</div><div class="face tl" style="width:${B.w}px;height:${B.h}px"><div class="t">${e.when}</div><div class="l">${e.label}</div></div>`,
      { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px', backgroundColor: 'transparent' })
    li.style.visibility = 'hidden'
    return { a, A, B, li }
  })
  for (const [i, o] of acts.entries()) {
    o.a.animate([{ backgroundColor: 'rgba(240,217,207,0)', boxShadow: SH_A }, { backgroundColor: HOT, boxShadow: SH_A }], { duration: 200, delay: i * 60, fill: 'both' })
  }
  await wait(12 * 60 + 400)
  if (!alive()) return
  const anims = paperAway()
  // the spine, the side labels
  const spine = el('div', 'spine', null, { left: L.left - 10 + 'px', width: L.W - L.left + 10 + 'px', top: L.mid - 1 + 'px' })
  anims.push(spine.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 1300, delay: 300, easing: ease, fill: 'both' }))
  for (const [row, y] of L.rows) {
    const r = el('div', 'rowlbl', `${D.sides[row]}<small>${D.sideNote[row]}</small>`, { top: y - 10 + 'px' })
    anims.push(show(r, 500, 700))
  }
  acts.forEach((o, i) => {
    const d = i * 70, B = o.B
    anims.push(o.a.animate([
      { left: o.A.x + 'px', top: o.A.y + 'px', width: o.A.w + 'px', height: o.A.h + 'px', backgroundColor: HOT, borderRadius: '2px', boxShadow: SH_A },
      { left: B.x + 'px', top: B.y + 'px', width: B.w + 'px', height: B.h + 'px', backgroundColor: PANEL, borderRadius: '8px', boxShadow: SH_B },
    ], { duration: 1100, delay: d, easing: ease, fill: 'both' }))
    anims.push(o.a.querySelector('.txt').animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)' }], { duration: 420, delay: d + 60, fill: 'both' }))
    anims.push(o.a.querySelector('.face').animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 500, delay: d + 600, fill: 'both' }))
    // the branch from the card to the spine, and the dot on it
    if (B.row !== 'mid') {
      const top = B.row === 'above' ? B.y + B.h : L.mid, h = B.row === 'above' ? L.mid - (B.y + B.h) : B.y - L.mid
      const s = el('div', 'stub', null, { left: B.cx + 'px', top: top + 'px', height: h + 'px' })
      anims.push(s.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 400, delay: d + 1000, fill: 'both' }))
      const dot = el('div', 'tdot', null, { left: B.cx + 'px', top: L.mid + 'px' })
      anims.push(show(dot, 200, d + 1200))
    }
  })
  await wait(12 * 70 + 1400)
  if (!alive()) return
  caption(`<strong>${D.events.length} 句经过 → ${D.events.length} 个时间节点</strong>，按当事人分在时间线两侧。&emsp;示意：由 AI 助手阅读并提取，案图负责画图。文书为虚构。`)
  await wait(2600)
  if (!alive()) return
  // rewind: the same animations, backwards, faster
  lens(-1)
  $('#cap').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'both' })
  sceneTag('↺', '同一份判决书，换一种看法')
  for (const a of anims) { a.playbackRate = -2.4 }
  await Promise.all(anims.map((a) => a.finished.catch(() => {})))
  acts.forEach((o) => { o.a.remove(); o.li.style.visibility = '' })
  paper.classList.remove('melt')
  $$('.spine,.rowlbl,.stub,.tdot').forEach((e) => e.remove())
  await wait(300)
}

function edgePath(r, G) {
  const a = G.at[r.from], b = G.at[r.to]
  if (r.kind === 'debt') {
    // the two loans arc over the top, one higher than the other, ending side by side
    const first = r.id === 'r-1', lift = first ? 0.2 : 0.11, off = first ? -26 : 26
    const y0 = Math.min(a.y, b.y) - 27, y = y0 - stage.clientHeight * lift
    const ax = a.x - off, bx = b.x + off
    return { d: `M ${ax} ${a.y - 27} C ${ax} ${y}, ${bx} ${y}, ${bx} ${b.y - 27}`, lx: (ax + bx) / 2, ly: y0 + (y - y0) * 0.75 }
  }
  const dx = b.x - a.x, dy = b.y - a.y
  // cut the line at the edge of each box (150 × 54)
  const cut = (p, s) => { const k = Math.min(75 / Math.abs(dx || 1e-6), 27 / Math.abs(dy || 1e-6)); return { x: p.x + s * dx * k, y: p.y + s * dy * k } }
  const p = cut(a, 1), q = cut(b, -1)
  return { d: `M ${p.x} ${p.y} L ${q.x} ${q.y}`, lx: (p.x + q.x) / 2, ly: (p.y + q.y) / 2 }
}
const STYLE = {
  debt: { w: 2.4, dash: '', arrow: true, color: '#e8452c' },
  guarantee: { w: 1.5, dash: '7 5', arrow: true },
  kinship: { w: 1.4, dash: '', double: true },
  control: { w: 2, dash: '', arrow: true },
  employment: { w: 1.4, dash: '2 5', arrow: true },
  agency: { w: 1.4, dash: '2 5', arrow: true },
}

async function toGraph(alive) {
  lens(1)
  sceneTag('② 关系', '全文的人名，汇聚成当事人和关系')
  const G = graph()
  // every name in the page lights up
  const pr = paper.getBoundingClientRect()
  const visible = $$('#paper .nm').filter((n) => {
    const r = n.getBoundingClientRect(), box = n.closest('p,li').getBoundingClientRect()
    return r.width > 0 && r.bottom <= box.bottom + 1 && r.right <= box.right + 1 && r.bottom <= pr.bottom - 30
  })
  visible.forEach((n, i) => setTimeout(() => alive() && n.classList.add('lit'), (i * 37) % 900))
  await wait(1300)
  if (!alive()) return
  // the camps and the parties' places
  G.camps.forEach((c) => {
    const box = el('div', 'camp', `<span>${D.groups[c.id]}</span>`, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' })
    show(box, 700, 500)
  })
  const ents = {}
  for (const e of D.entities) {
    const p = G.at[e.id]
    ents[e.id] = el('div', `ent ${e.kind === 'company' ? 'co' : ''} ${e.kind === 'other' ? 'grp' : ''}`, `<b>${e.label}</b><i>${e.role}</i><em>0</em>`, { left: p.x + 'px', top: p.y + 'px' })
  }
  paperAway()
  // each mention flies to its party; the party appears with the first one and counts them in
  const got = {}
  visible.forEach((n, i) => {
    const id = n.dataset.e, from = rel(n), to = G.at[id]
    const m = el('span', 'mv', n.textContent, { left: from.x + 'px', top: from.y + 'px', fontSize: '12px', color: '#fff', background: '#e8452c', padding: '0 2px', borderRadius: '2px', fontFamily: 'var(--serif)' })
    n.classList.remove('lit')
    const delay = 200 + (i % 24) * 45 + Math.random() * 200
    const fly = m.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${(to.x - from.x) * 0.5 + (Math.random() - 0.5) * 120}px,${(to.y - from.y) * 0.5 + (Math.random() - 0.5) * 120}px) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${to.x - from.x - from.w / 2}px,${to.y - from.y - from.h / 2}px) scale(.5)`, opacity: 0 },
    ], { duration: 1100, delay, easing: ease, fill: 'both' })
    fly.onfinish = () => {
      m.remove()
      if (!alive()) return
      const box = ents[id]
      got[id] = (got[id] || 0) + 1
      if (got[id] === 1) box.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, fill: 'both', easing: 'ease-out' })
      else box.animate([{ boxShadow: '0 0 0 0 rgba(232,69,44,.8)' }, { boxShadow: '0 0 0 10px rgba(232,69,44,0)' }], { duration: 400 })
      box.querySelector('em').textContent = got[id]
    }
  })
  await wait(200 + 24 * 45 + 200 + 1100 + 200)
  if (!alive()) return
  // parties no visible mention reached still come up, and every count settles on the whole judgment's
  for (const e of D.entities) {
    const box = ents[e.id]
    if (!got[e.id]) show(box, 400)
    box.querySelector('em').textContent = '×' + e.mentions
  }
  // the relations draw themselves
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('class', 'edges')
  svg.setAttribute('width', stage.clientWidth)
  svg.setAttribute('height', stage.clientHeight)
  svg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill="#cfcac0"/></marker><marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill="#e8452c"/></marker></defs>'
  stage.appendChild(svg)
  D.relations.forEach((r, i) => {
    const s = STYLE[r.kind] || STYLE.control, g = edgePath(r, G), color = s.color || '#cfcac0'
    const mk = (w, extra = {}) => {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', g.d)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', extra.stroke || color)
      p.setAttribute('stroke-width', w)
      svg.appendChild(p)
      return p
    }
    const delay = 150 + i * 160
    let line
    if (s.double) { mk(4.6); line = mk(1.8, { stroke: '#0d0e11' }) } else line = mk(s.w)
    const len = line.getTotalLength()
    for (const p of [...svg.querySelectorAll('path')].slice(-(s.double ? 2 : 1))) {
      p.style.strokeDasharray = `${len} ${len}`
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 700, delay, easing: ease, fill: 'both' }).onfinish = () => {
        p.style.strokeDasharray = s.dash || 'none'
        if (s.arrow && p === line) p.setAttribute('marker-end', s.color ? 'url(#ahr)' : 'url(#ah)')
      }
    }
    const text = r.label + (r.amount ? ` ${r.amount}` : '')
    const t = document.createElementNS(SVGNS, 'g')
    const w = text.length * 11.5 + 12
    t.innerHTML = `<rect class="labbg" x="${g.lx - w / 2}" y="${g.ly - 10}" width="${w}" height="20" rx="4"/><text class="lab" x="${g.lx}" y="${g.ly + 4}" text-anchor="middle">${text}</text>`
    t.style.opacity = 0
    svg.appendChild(t)
    t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 500, fill: 'both' })
  })
  await wait(150 + D.relations.length * 160 + 900)
  if (!alive()) return
  caption(`<strong>全文 ${D.totalMentions} 处人名 → ${D.entities.length} 个当事人、${D.relations.length} 条关系</strong>，数字是判决书里实际出现的次数。&emsp;示意：由 AI 助手阅读并提取，案图负责画图。文书为虚构。`)
}

function reset() {
  $$('.actor,.mv,.spine,.rowlbl,.stub,.tdot,.camp,.ent,.edges').forEach((e) => e.remove())
  paper.classList.remove('melt')
  $$('#bul li, .paper > *:not(.beam), .nm').forEach((e) => { e.getAnimations().forEach((a) => a.cancel()); e.style.visibility = ''; e.classList.remove('lit') })
  ;[paper, $('#cap'), $('#scene')].forEach((e) => e.getAnimations().forEach((a) => a.cancel()))
  $('#cap').style.opacity = 0
  lens(-1)
}

async function start() {
  const me = ++run, alive = () => me === run
  reset()
  if (reduce) { lens(1); return }
  await reading()
  if (!alive()) return
  await toTimeline(alive)
  if (!alive()) return
  await toGraph(alive)
}

$('#replay').onclick = start
if (location.hash === '#manual') window.start = start
else setTimeout(start, 500)
