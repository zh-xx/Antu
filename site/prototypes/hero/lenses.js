// Draft "lenses" (issue #107): the four kinds of diagram, each made from its document. Pick one on the left:
// the page is read, then its sentences (or names, or clauses) turn into the diagram.
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


// ---------- layouts (from the stage's size, so they fit any screen)
const CH = 56
function timeline() {
  const W = stage.clientWidth, H = stage.clientHeight, n = D.events.length
  const left = 136, mid = Math.round(H * 0.5)
  // cards of one row alternate between two tiers, so two cards in a row and tier are at least two steps apart
  const CW = Math.min(144, Math.floor((W - left - 4) / (n + 1) * 2 - 6))
  const step = (W - left - CW - 4) / (n - 1)
  const yOf = (row, tier) => row === 'mid' ? mid - CH / 2
    : row === 'above' ? mid - CH / 2 - 26 - CH - tier * (CH + 10)
      : mid + CH / 2 + 26 + tier * (CH + 10)
  const seen = { above: 0, below: 0, mid: 0 }
  return {
    mid, left, W,
    cards: D.events.map((e, i) => ({ x: left + i * step, y: yOf(e.row, e.row === 'mid' ? 0 : seen[e.row]++ % 2), w: CW, h: CH, cx: left + i * step + CW / 2, row: e.row })),
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
function reading(pg = paper, beam = '#beam') {
  const pr = pg.getBoundingClientRect()
  pg.querySelectorAll('h2,.meta,h3,p,li').forEach((e) => {
    const y = e.getBoundingClientRect().top - pr.top
    e.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 350, delay: 200 + (y / pr.height) * 1300, fill: 'both' })
  })
  $(beam).animate([{ top: '-70px', opacity: 1 }, { top: pr.height + 'px', opacity: 1 }], { duration: 1500, delay: 200, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => ($(beam).style.opacity = 0)
  return wait(1800)
}

// colours that follow the light / dark mode
const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim()
const HOT = '#f0d9cf'
const SH_A = 'inset 3px 0 0 #e8452c, inset 0 0 0 0 rgba(255,255,255,.12), 0 0 0 rgba(0,0,0,0)'
const SH_B = () => `inset 0 0 0 0 #e8452c, inset 0 0 0 1px ${tok('camp-line')}, ${tok('card-shadow')}`
const paperAway = () => (paper.classList.add('melt'), [
  ...$$('.paper > *:not(.beam)').map((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 600, fill: 'both', easing: 'ease-in' })),
  paper.animate([{ backgroundColor: tok('paper'), boxShadow: tok('paper-shadow') }, { backgroundColor: 'rgba(0,0,0,0)', boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 800, delay: 100, fill: 'both', easing: ease }),
])

async function toTimeline(alive) {
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
      { left: B.x + 'px', top: B.y + 'px', width: B.w + 'px', height: B.h + 'px', backgroundColor: tok('panel'), borderRadius: '8px', boxShadow: SH_B() },
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
  svg.innerHTML = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" style="fill:var(--edge)"/></marker><marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill="#e8452c"/></marker></defs>'
  stage.appendChild(svg)
  D.relations.forEach((r, i) => {
    const s = STYLE[r.kind] || STYLE.control, g = edgePath(r, G), color = s.color || 'var(--edge)'
    const mk = (w, extra = {}) => {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', g.d)
      p.setAttribute('fill', 'none')
      p.style.stroke = extra.stroke || color
      p.setAttribute('stroke-width', w)
      svg.appendChild(p)
      return p
    }
    const delay = 150 + i * 160
    let line
    if (s.double) { mk(4.6); line = mk(1.8, { stroke: 'var(--bg)' }) } else line = mk(s.w)
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
}

function reset() {
  $$('.actor,.mv,.spine,.rowlbl,.stub,.tdot,.camp,.ent,.edges,.rn,.chip,.trunk,.doc,.fn,.token').forEach((e) => e.remove())
  paper.classList.remove('melt')
  $$('#bul li, .paper > *:not(.beam), .nm').forEach((e) => { e.getAnimations().forEach((a) => a.cancel()); e.style.visibility = ''; e.classList.remove('lit') })
  paper.getAnimations().forEach((a) => a.cancel())
  const pg = $('#paper2')
  ;[pg, ...pg.querySelectorAll('*')].forEach((e) => e.getAnimations().forEach((a) => a.cancel()))
  pg.classList.remove('melt')
  pg.querySelectorAll('.sn').forEach((x) => x.classList.remove('lit'))
}

// ---------- ③ reasoning: the court's view becomes the root, the issues branch from it, their reasons hang below
function reasoningLayout() {
  const W = stage.clientWidth, H = stage.clientHeight, n = D.reason.issues.length
  const colW = W / n
  return {
    root: { x: W / 2 - 200, y: 4, w: 400 },
    heads: D.reason.issues.map((_, i) => ({ x: i * colW + 8, y: 0.2 * H, w: colW - 16 })),
    chipY: 0.2 * H + 82, chipStep: Math.min(19, (H - 0.2 * H - 90) / Math.max(...D.reason.issues.map((g) => g.leaves.length))),
  }
}
async function toReasoning(alive) {
  const R = reasoningLayout(), src = $('#yrw')
  // the court's view lights up, and becomes the root of the tree
  const A = rel(src)
  const root = el('div', 'rn root actor', `<small>判决结论</small><b>${D.reason.root}</b>`, { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', opacity: 1, background: '#f0d9cf' })
  root.querySelector('b').style.opacity = 0
  root.querySelector('small').style.opacity = 0
  root.animate([{ boxShadow: '0 0 0 0 rgba(232,69,44,0)' }, { boxShadow: '0 0 0 3px #e8452c, 0 0 40px rgba(232,69,44,.7)' }], { duration: 500, fill: 'both' })
  await wait(700)
  if (!alive()) return
  paperAway()
  root.animate([
    { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', backgroundColor: '#f0d9cf' },
    { left: R.root.x + 'px', top: R.root.y + 'px', width: R.root.w + 'px', backgroundColor: tok('panel') },
  ], { duration: 1000, easing: ease, fill: 'both' })
  for (const e of root.querySelectorAll('b,small')) e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 600, fill: 'both' })
  await wait(1100)
  if (!alive()) return
  // the issues branch from the root, each with what the court held on it
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('class', 'edges')
  svg.setAttribute('width', stage.clientWidth)
  svg.setAttribute('height', stage.clientHeight)
  stage.appendChild(svg)
  const rootR = rel(root), rx = rootR.x + rootR.w / 2, ry = rootR.y + rootR.h
  D.reason.issues.forEach((g, i) => {
    const h = R.heads[i], cx = h.x + h.w / 2, d = i * 140
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', `M ${rx} ${ry} C ${rx} ${ry + 30}, ${cx} ${h.y - 34}, ${cx} ${h.y}`)
    p.setAttribute('fill', 'none')
    p.style.stroke = g.against ? '#e8452c' : 'var(--edge-soft)'
    p.setAttribute('stroke-width', 1.5)
    svg.appendChild(p)
    const len = p.getTotalLength()
    p.style.strokeDasharray = `${len} ${len}`
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 600, delay: d, easing: ease, fill: 'both' }).onfinish = () => { if (g.against) p.style.strokeDasharray = '6 5' }
    const head = el('div', `rn${g.holds ? '' : ' no'}`, `<small>${g.label}</small><b>${g.head}</b><span class="mk">${g.holds ? '成立' : '不成立'}</span>`, { left: h.x + 'px', top: h.y + 'px', width: h.w + 'px' })
    head.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: d + 450, easing: 'ease-out', fill: 'both' })
    // the reasons rain down under it
    const trunk = el('div', 'trunk', null, { left: h.x + 10 + 'px', top: R.chipY - 6 + 'px', height: g.leaves.length * R.chipStep + 'px' })
    trunk.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 700, delay: d + 900, easing: ease, fill: 'both' })
    g.leaves.forEach((l, k) => {
      const c = el('div', `chip k-${l.kind}${l.holds === false ? ' no' : ''}`, `<u>${D.reason.kinds[l.kind]}</u><span>${l.label}</span>`, { left: h.x + 18 + 'px', top: R.chipY + k * R.chipStep + 'px', width: h.w - 22 + 'px' })
      c.animate([{ opacity: 0, transform: 'translateY(-26px)', filter: 'blur(3px)' }, { opacity: l.holds === false ? 0.5 : 1, transform: 'none', filter: 'blur(0)' }], { duration: 420, delay: d + 1000 + k * 55, easing: 'ease-out', fill: 'both' })
    })
  })
  await wait(D.reason.issues.length * 140 + 1000 + 15 * 55 + 500)
  if (!alive()) return
}

// ---------- ④ flowchart: another document, a contract; it opens into its flow, and a token runs the main line
async function toFlow(alive) {
  const F = D.flow, W = stage.clientWidth, H = stage.clientHeight
  const cols = Math.max(...Object.values(F.grid).map((g) => g[0])) + 1
  const colW = W / cols, nodeW = Math.min(118, colW - 14)
  const pos = (id) => { const [c, r] = F.grid[id]; return { x: c * colW + colW / 2, y: r === 0 ? H * 0.3 : H * 0.72 } }
  // the contract comes in, and is read
  const pg = $('#paper2')
  pg.animate([{ opacity: 0, transform: 'translateY(40px) scale(.97)' }, { opacity: 1, transform: 'rotateX(2deg) scale(.99)' }], { duration: 700, easing: ease, fill: 'both' })
  await wait(600)
  await reading(pg, '#beam2')
  if (!alive()) return
  // the clause sentences behind the steps light up, one after the other
  const sents = Object.fromEntries([...pg.querySelectorAll('.sn')].map((x) => [x.dataset.n, x]))
  for (const [i, id] of F.order.entries()) setTimeout(() => alive() && sents[id].classList.add('lit'), i * 90)
  await wait(F.order.length * 90 + 400)
  if (!alive()) return
  // each sentence turns into its step; the page gives way
  const box = {}
  F.order.forEach((id, i) => {
    const n = F.nodes[id], p = pos(id), A = rel(sents[id])
    const dec = n.kind === 'decision'
    const w = dec ? 88 : nodeW, h = dec ? 88 : 40
    const b = el('div', `fn k-${n.kind}${n.outcome === 'negative' ? ' neg' : ''}`, `<span>${n.label}</span>`, { left: A.x + 'px', top: A.y + A.h / 2 + 'px', width: A.w + 'px', height: A.h + 'px', marginTop: -A.h / 2 + 'px', opacity: 1, backgroundColor: 'transparent', borderColor: 'transparent' })
    const label = b.querySelector('span')
    label.style.opacity = 0
    const d = i * 80
    b.animate([
      { left: A.x + 'px', top: A.y + A.h / 2 + 'px', width: A.w + 'px', height: A.h + 'px', marginTop: -A.h / 2 + 'px', backgroundColor: 'rgba(240,217,207,0)', borderColor: 'rgba(232,69,44,0)' },
      { backgroundColor: 'rgba(240,217,207,.9)', borderColor: 'rgba(232,69,44,1)', offset: 0.3 },
      { left: p.x - w / 2 + 'px', top: p.y + 'px', width: w + 'px', height: h + 'px', marginTop: -h / 2 + 'px', backgroundColor: dec ? `rgba(${tok('panel-rgb')},0)` : tok('panel'), borderColor: dec ? 'rgba(0,0,0,0)' : tok('nodeline') },
    ], { duration: 1100, delay: d, easing: ease, fill: 'both' })
    label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: d + 700, fill: 'both' })
    setTimeout(() => b.classList.add('in'), d + 800)
    box[id] = b
  })
  pg.querySelectorAll('h2,.meta,p,.lbl').forEach((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 600, delay: 150, fill: 'both' }))
  pg.animate([{ backgroundColor: tok('paper'), boxShadow: tok('paper-shadow') }, { backgroundColor: 'rgba(0,0,0,0)', boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 800, delay: 200, fill: 'both', easing: ease })
  pg.classList.add('melt')
  await wait(F.order.length * 80 + 1200)
  if (!alive()) return
  // the arrows draw themselves
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('class', 'edges')
  svg.setAttribute('width', W)
  svg.setAttribute('height', H)
  svg.innerHTML = '<defs><marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" style="fill:var(--edge)"/></marker></defs>'
  stage.appendChild(svg)
  const half = (id) => (F.nodes[id].kind === 'decision' ? 44 : nodeW / 2)
  const halfH = (id) => (F.nodes[id].kind === 'decision' ? 44 : 20)
  const paths = {}
  F.edges.forEach((e, i) => {
    const a = pos(e.from), b = pos(e.to)
    let d, lx, ly
    if (Math.abs(a.y - b.y) < 1) { const x1 = a.x + half(e.from), x2 = b.x - half(e.to); d = `M ${x1} ${a.y} L ${x2} ${b.y}`; lx = (x1 + x2) / 2; ly = a.y - 8 }
    else if (Math.abs(a.x - b.x) < 1) { const dn = b.y > a.y ? 1 : -1; d = `M ${a.x} ${a.y + dn * halfH(e.from)} L ${b.x} ${b.y - dn * halfH(e.to)}`; lx = a.x + 8; ly = (a.y + b.y) / 2 }
    else { const dn = b.y > a.y ? 1 : -1; d = `M ${a.x} ${a.y + dn * halfH(e.from)} L ${a.x} ${b.y} L ${b.x - half(e.to)} ${b.y}`; lx = a.x + 8; ly = (a.y + b.y) / 2 }
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', d)
    p.setAttribute('fill', 'none')
    p.style.stroke = 'var(--edge)'
    p.setAttribute('stroke-width', e.main ? 2 : 1.3)
    svg.appendChild(p)
    const len = p.getTotalLength()
    p.style.strokeDasharray = `${len} ${len}`
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 450, delay: i * 70, fill: 'both' }).onfinish = () => { p.style.strokeDasharray = 'none'; p.setAttribute('marker-end', 'url(#fa)') }
    if (e.condition) {
      const t = document.createElementNS(SVGNS, 'text')
      t.setAttribute('class', 'cond')
      t.setAttribute('x', lx)
      t.setAttribute('y', ly)
      t.setAttribute('text-anchor', Math.abs(a.y - b.y) < 1 ? 'middle' : 'start')
      t.textContent = e.condition
      t.style.opacity = 0
      svg.appendChild(t)
      t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 70 + 350, fill: 'both' })
    }
    paths[e.from + '>' + e.to] = p
  })
  await wait(F.edges.length * 70 + 600)
  if (!alive()) return
  // a token runs the main line, lighting each step as it passes
  const token = el('div', 'token')
  const main = F.mainPath
  box[main[0]].classList.add('lit')
  for (let i = 0; i < main.length - 1; i++) {
    if (!alive()) return
    const p = paths[main[i] + '>' + main[i + 1]], len = p.getTotalLength(), t0 = performance.now(), dur = 330
    await new Promise((res) => {
      ;(function f(now) {
        const k = Math.min(1, (now - t0) / dur), pt = p.getPointAtLength(len * k)
        token.style.left = pt.x + 'px'
        token.style.top = pt.y + 'px'
        token.style.opacity = 1
        if (k < 1) requestAnimationFrame(f)
        else res()
      })(t0)
    })
    box[main[i + 1]].classList.add('lit')
  }
  token.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'both' })
}

// the four kinds: each plays on its own, from its document
const SCENES = {
  fact: async (alive) => { await reading(); if (alive()) await toTimeline(alive) },
  relationship: async (alive) => { await reading(); if (alive()) await toGraph(alive) },
  procedure: async (alive) => { paper.style.opacity = 0; await toFlow(alive) },
  justification: async (alive) => { await reading(); if (alive()) await toReasoning(alive) },
}
// the thin line under the chosen kind fills while its scene plays
const SCENE_MS = { fact: 5200, relationship: 7200, procedure: 9500, justification: 6800 }
async function play(kind) {
  const me = ++run, alive = () => me === run
  $$('.kind').forEach((k) => {
    const on = k.dataset.kind === kind, bar = k.querySelector('.prog')
    k.classList.toggle('on', on)
    bar.getAnimations({ subtree: true }).forEach((a) => a.cancel())
    bar.style.setProperty('--p', 0)
  })
  const bar = $(`.kind[data-kind="${kind}"] .prog`)
  reset()
  paper.style.opacity = ''
  if (reduce) { bar.style.setProperty('--p', 1); return }
  const t0 = performance.now()
  ;(function tick(now) {
    if (!alive()) return
    bar.style.setProperty('--p', Math.min(0.96, (now - t0) / SCENE_MS[kind]))
    requestAnimationFrame(tick)
  })(t0)
  await SCENES[kind](alive)
  if (alive()) { run++; bar.style.setProperty('--p', 1) }
}
$$('.kind').forEach((k) => (k.onclick = () => play(k.dataset.kind)))
// `#kind=procedure` in the address starts with that kind (for checking one alone)
const FIRST = (location.hash.match(/kind=(\w+)/) || [])[1] || 'fact'
const start = () => play(FIRST)

// the top bar: the start button opens the prompt box; the language switch (the top bar's labels only, in
// this draft); light / dark, remembered in this browser
$('#startBtn').onclick = (e) => { e.stopPropagation(); $('#pop').hidden = !$('#pop').hidden }
document.addEventListener('click', (e) => { if (!$('#pop').contains(e.target)) $('#pop').hidden = true })
const EN = { examples: 'Examples', start: 'Get started', popTitle: 'Hand it to your AI assistant', popBody: 'Copy the text below and send it to the AI assistant you use; it installs Antu by itself.', copy: 'Copy' }
const ZH = Object.fromEntries($$('[data-i18n]').map((e) => [e.dataset.i18n, e.textContent]))
$$('.lang button').forEach((b) => (b.onclick = () => {
  const lang = b.dataset.lang
  $('.lang').dataset.on = lang
  $$('.lang button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
  const dict = lang === 'en' ? EN : ZH
  $$('[data-i18n]').forEach((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).onfinish = () => { e.textContent = dict[e.dataset.i18n]; e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }) })
}))
$('#mode').onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
  document.documentElement.dataset.theme = next
  try { localStorage.setItem('antu.site.theme', next) } catch { /* not remembered */ }
}

if (location.hash.includes('manual')) window.start = start
else setTimeout(start, 500)
