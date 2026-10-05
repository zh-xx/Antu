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
// Antu's vertical timeline, fitted to the stage: a row per event, a column per party, the axis in between
function timeline() {
  const W = stage.clientWidth, H = stage.clientHeight, n = D.events.length, m = D.cols.length
  const headH = 40, top = headH + 14, rowH = (H - top - 16) / n
  const colW = Math.min(270, (W - 20) / m), x0 = (W - colW * m) / 2
  const CH = Math.min(54, rowH - 6), CW = colW - 12
  const axisCol = D.cols.findIndex((c) => c.key === 'axis'), axisX = x0 + axisCol * colW + colW / 2
  return {
    axisX, top, bottom: top + rowH * n, headH, x0, colW,
    cards: D.events.map((e, i) => {
      const cy = top + rowH * i + rowH / 2, x = x0 + e.col * colW + 9
      return { x, y: cy - CH / 2, w: CW, h: CH, cy, col: e.col, side: e.col < axisCol ? -1 : e.col > axisCol ? 1 : 0 }
    }),
  }
}

// ---------- the scenes
function reading(pg = paper, beam = '#beam') {
  const pr = pg.getBoundingClientRect()
  pg.querySelectorAll('h2,.meta,h3,p,li,.court,.ttl,.no').forEach((e) => {
    const y = e.getBoundingClientRect().top - pr.top
    e.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 350, delay: 200 + (y / pr.height) * 1300, fill: 'both' })
  })
  $(beam).animate([{ top: '-70px', opacity: 1 }, { top: pr.height - 60 + 'px', opacity: 0 }], { duration: 1500, delay: 200, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => ($(beam).style.opacity = 0)
  return wait(1800)
}

// colours that follow the light / dark mode
const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim()
const SH_B = () => `inset 0 0 0 0 #e8452c, inset 0 0 0 1px ${tok('camp-line')}, ${tok('card-shadow')}`
const paperAway = () => (paper.classList.add('melt'), [
  ...$$('.paper > *:not(.beam)').map((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 600, fill: 'both', easing: 'ease-in' })),
  paper.animate([{ backgroundColor: tok('paper'), boxShadow: tok('paper-shadow') }, { backgroundColor: 'rgba(0,0,0,0)', boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 800, delay: 100, fill: 'both', easing: ease }),
])

// the camera on the judgment: the paper is moved and scaled so that the given lines fill the stage
let cam = { z: 1, tx: 0, ty: 0 }
function zoomTo(els, ms) {
  const pr = paper.getBoundingClientRect(), rs = els.map((e) => e.getBoundingClientRect())
  const x1 = Math.min(...rs.map((r) => r.left)), y1 = Math.min(...rs.map((r) => r.top)), x2 = Math.max(...rs.map((r) => r.right)), y2 = Math.max(...rs.map((r) => r.bottom))
  const R = { x: (x1 - pr.left) / cam.z, y: (y1 - pr.top) / cam.z, w: (x2 - x1) / cam.z, h: (y2 - y1) / cam.z }
  const W = stage.clientWidth, H = stage.clientHeight
  const z = Math.min(W * 0.84 / R.w, H * 0.8 / R.h, 2.3)
  const next = { z, tx: W / 2 - paper.offsetLeft - z * (R.x + R.w / 2), ty: H / 2 - paper.offsetTop - z * (R.y + R.h / 2) }
  const T = (c) => `translate(${c.tx}px,${c.ty}px) scale(${c.z})`
  paper.animate([{ transform: T(cam) }, { transform: T(next) }], { duration: ms, easing: 'cubic-bezier(.6,0,.25,1)', fill: 'forwards' })
  cam = next
  return wait(ms)
}
// the highlighter goes over each sentence, then the date and the event's name in it are marked
async function sweep(lis, alive) {
  for (const li of lis) {
    if (!alive()) return
    li.classList.add('hl')
    setTimeout(() => alive() && li.classList.add('pick'), 380)
    await wait(240)
  }
  await wait(520)
}

async function toTimeline(alive) {
  const L = timeline(), lis = $$('#bul li')
  cam = { z: 1, tx: 0, ty: 0 }
  // move in on the account, page by page, and mark what the timeline takes from each sentence
  const mid = paper.getBoundingClientRect().left + paper.getBoundingClientRect().width / 2
  const leftLis = lis.filter((li) => li.getBoundingClientRect().left < mid), rightLis = lis.filter((li) => !leftLis.includes(li))
  await zoomTo(leftLis, 1000)
  if (!alive()) return
  await sweep(leftLis, alive)
  if (!alive()) return
  await zoomTo(rightLis, 900)
  if (!alive()) return
  await sweep(rightLis, alive)
  if (!alive()) return
  // back to the whole spread, so every sentence is in sight when it leaves
  paper.animate([{ transform: `translate(${cam.tx}px,${cam.ty}px) scale(${cam.z})` }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.6,0,.25,1)', fill: 'forwards' })
  cam = { z: 1, tx: 0, ty: 0 }
  await wait(950)
  if (!alive()) return
  // each sentence becomes its own object; the two marked pieces of it fly to their places on the card
  const acts = D.events.map((e, i) => {
    const li = lis[i], A = rel(li), B = L.cards[i]
    const a = el('div', 'actor', `<div class="face tv" style="width:${B.w}px;height:${B.h}px"><div class="l">${e.label}</div>${e.summary && B.h >= 50 ? `<div class="s">${e.summary}</div>` : ''}<div class="t">${e.when}</div></div>`,
      { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px', backgroundColor: 'transparent' })
    const words = ['dt', 'lb'].map((k) => {
      const src = li.querySelector('.' + k), r = rel(src.getClientRects().length ? { getBoundingClientRect: () => src.getClientRects()[0] } : src)
      const fs = parseFloat(getComputedStyle(src).fontSize) * cam.z
      const w = el('span', 'wordfly', src.textContent, { left: r.x + 'px', top: r.y + 'px', fontSize: fs + 'px', fontFamily: 'var(--fang)' })
      return { w, r, fs, to: k === 'dt' ? '.t' : '.l' }
    })
    return { a, A, B, li, words }
  })
  // the words land on the lines of the card where they are written
  acts.forEach((o, i) => {
    const d = i * 70
    o.words.forEach((w) => {
      const t = o.a.querySelector(w.to), tfs = parseFloat(getComputedStyle(t).fontSize)
      const tx = o.B.x + t.offsetLeft + o.a.querySelector('.face').offsetLeft, ty = o.B.y + t.offsetTop
      // as large as the card writes it, but never wider than the card
      const k = Math.min(tfs / w.fs, (o.B.w - 20) / w.w.offsetWidth)
      w.w.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${(tx - w.r.x) * 0.5}px,${(ty - w.r.y) * 0.5 - 30}px) scale(${(1 + k) / 2})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${tx - w.r.x}px,${ty - w.r.y}px) scale(${k})`, opacity: 1, offset: 0.92 },
        { transform: `translate(${tx - w.r.x}px,${ty - w.r.y}px) scale(${k})`, opacity: 0 },
      ], { duration: 1150, delay: d, easing: ease, fill: 'both' })
    })
  })
  paperAway()
  // the column heads and the axis
  D.cols.forEach((c, k) => {
    const h = el('div', 'tl-head', `${c.head}${c.sub ? `<small>${c.sub}</small>` : ''}`, { left: L.x0 + k * L.colW + 'px', width: L.colW + 'px', top: '4px' })
    show(h, 500, 600 + k * 80)
  })
  const ax = el('div', 'vaxis', null, { left: L.axisX + 'px', top: L.top - 8 + 'px', height: L.bottom - L.top + 12 + 'px' })
  ax.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 1500, delay: 350, easing: ease, fill: 'both' })
  acts.forEach((o, i) => {
    const d = i * 70, B = o.B
    o.a.animate([
      { left: o.A.x + 'px', top: o.A.y + 'px', width: o.A.w + 'px', height: o.A.h + 'px', backgroundColor: 'rgba(240,200,180,0)', borderRadius: '2px', boxShadow: 'none', opacity: 1 },
      { backgroundColor: tok('panel'), opacity: 0.35, offset: 0.4 },
      { left: B.x + 'px', top: B.y + 'px', width: B.w + 'px', height: B.h + 'px', backgroundColor: tok('panel'), borderRadius: '8px', boxShadow: SH_B(), opacity: 1 },
    ], { duration: 1100, delay: d, easing: ease, fill: 'both' })
    o.a.querySelector('.face').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: d + 1040, fill: 'both' })
    // a card of one party is joined to the axis by a short line, with a dot where it meets the axis
    if (B.side) {
      const x1 = B.side < 0 ? B.x + B.w : L.axisX, x2 = B.side < 0 ? L.axisX : B.x
      const st = el('div', 'hstub', null, { left: x1 + 'px', top: B.cy + 'px', width: x2 - x1 + 'px', transformOrigin: B.side < 0 ? 'right' : 'left' })
      st.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 400, delay: d + 1000, fill: 'both' })
      const dot = el('div', 'tdot', null, { left: L.axisX + 'px', top: B.cy + 'px' })
      show(dot, 200, d + 1200)
    }
  })
  await wait(12 * 70 + 1400)
  $$('.wordfly').forEach((w) => w.remove())
}

// the relationship graph as Antu lays it out (D.rel), fitted to the stage
function relFit() {
  const R = D.rel, W = stage.clientWidth, H = stage.clientHeight
  const k = Math.min((W - 24) / R.size.width, (H - 16) / R.size.height, 1.6)
  return { k, ox: (W - R.size.width * k) / 2, oy: (H - R.size.height * k) / 2 }
}

async function toGraph(alive) {
  const R = D.rel, f = relFit(), P = (x, y) => ({ x: f.ox + x * f.k, y: f.oy + y * f.k })
  // every name in the page lights up
  const pr = paper.getBoundingClientRect()
  const visible = $$('#paper .nm').filter((n) => {
    const r = n.getBoundingClientRect()
    return r.width > 0 && r.bottom <= pr.bottom - 10 && r.top >= pr.top
  })
  visible.forEach((n, i) => setTimeout(() => alive() && n.classList.add('lit'), (i * 37) % 900))
  await wait(1300)
  if (!alive()) return
  // the canvas: Antu's drawing, scaled; groups and parties wait for the names
  const layer = el('div', 'relcv', null, { left: f.ox + 'px', top: f.oy + 'px', width: R.size.width + 'px', height: R.size.height + 'px', transform: `scale(${f.k})` })
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('width', R.size.width)
  svg.setAttribute('height', R.size.height)
  svg.innerHTML = `<defs><marker id="rarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 L9 5 L0 9 Z" style="fill:var(--edge)"/></marker></defs>`
  layer.appendChild(svg)
  const groups = R.groups.map((g) => {
    const b = document.createElement('div')
    b.className = 'rgroup'
    Object.assign(b.style, { left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' })
    b.innerHTML = `<span>${g.label}</span>`
    layer.appendChild(b)
    return b
  })
  const ents = {}
  for (const e of R.ents) {
    const b = document.createElement('div')
    b.className = `rent k-${e.kind}`
    Object.assign(b.style, { left: e.x + 'px', top: e.y + 'px', width: e.w + 'px', height: e.h + 'px', borderRadius: e.rx + 'px', borderWidth: Math.max(1, e.width) + 'px', borderStyle: e.dash ? (e.dash.startsWith('1') || e.dash.startsWith('2') ? 'dotted' : 'dashed') : 'solid' })
    b.innerHTML = `<b>${e.label}</b>${e.role ? `<i>${e.role}</i>` : ''}`
    layer.appendChild(b)
    ents[e.id] = b
  }
  groups.forEach((g, i) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 400 + i * 120, fill: 'both' }))
  paperAway()
  // each name flies to its party; the party comes up with the first one and pulses at each one after
  const got = {}
  visible.forEach((n, i) => {
    const id = n.dataset.e, from = rel(n), e = R.ents.find((x) => x.id === id), c = P(e.x + e.w / 2, e.y + e.h / 2)
    const m = el('span', 'mv', n.textContent, { left: from.x + 'px', top: from.y + 'px', fontSize: from.h * 0.7 + 'px', color: '#fff', background: '#e8452c', padding: '0 2px', borderRadius: '2px', fontFamily: 'var(--fang)', lineHeight: 1.2 })
    n.classList.remove('lit')
    const delay = 200 + (i % 24) * 45 + Math.random() * 200
    m.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${(c.x - from.x) * 0.5 + (Math.random() - 0.5) * 120}px,${(c.y - from.y) * 0.5 + (Math.random() - 0.5) * 120}px) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${c.x - from.x - from.w / 2}px,${c.y - from.y - from.h / 2}px) scale(.5)`, opacity: 0 },
    ], { duration: 1100, delay, easing: ease, fill: 'both' }).onfinish = () => {
      m.remove()
      if (!alive()) return
      const box = ents[id]
      got[id] = (got[id] || 0) + 1
      if (got[id] === 1) box.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.05)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'both', easing: 'ease-out' })
      else box.animate([{ boxShadow: '0 0 0 0 rgba(232,69,44,.8)' }, { boxShadow: '0 0 0 9px rgba(232,69,44,0)' }], { duration: 400 })
    }
  })
  await wait(200 + 24 * 45 + 200 + 1100 + 200)
  if (!alive()) return
  for (const e of R.ents) if (!got[e.id]) ents[e.id].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'both' })
  // the relations draw themselves, along Antu's own routes
  R.links.forEach((l, i) => {
    const delay = 100 + i * 150
    const mk = (w, color) => {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', l.d)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke-width', w)
      p.style.stroke = color
      svg.appendChild(p)
      return p
    }
    const parts = l.double ? [mk(l.width, 'var(--edge)'), mk(l.width - 2.4, 'var(--bg)')] : [mk(l.width, l.kind === 'debt' ? '#e8452c' : 'var(--edge)')]
    const len = parts[0].getTotalLength()
    parts.forEach((p, k) => {
      p.style.strokeDasharray = `${len} ${len}`
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 750, delay, easing: ease, fill: 'both' }).onfinish = () => {
        p.style.strokeDasharray = k === 0 && l.dash ? l.dash : 'none'
        if (k === 0 && l.directed) p.setAttribute('marker-end', 'url(#rarr)')
      }
    })
    const t = document.createElement('span')
    t.className = 'rlab'
    t.textContent = l.label
    Object.assign(t.style, { left: l.lx + 'px', top: l.ly + 'px', width: l.lw + 'px', height: l.lh + 'px' })
    layer.appendChild(t)
    t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 550, fill: 'both' })
  })
  await wait(100 + R.links.length * 150 + 900)
}

function reset() {
  $$('.relcv,.actor,.wordfly,.mv,.tl-head,.vaxis,.hstub,.spine,.rowlbl,.stub,.tdot,.camp,.ent,.edges,.rn,.chip,.trunk,.doc,.fn,.token').forEach((e) => e.remove())
  paper.classList.remove('melt')
  $$('#bul li, .paper > *:not(.beam), .nm').forEach((e) => { e.getAnimations().forEach((a) => a.cancel()); e.style.visibility = ''; e.classList.remove('lit', 'hl', 'pick') })
  cam = { z: 1, tx: 0, ty: 0 }
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

// the judgment's type is as large as fits on its spread
function fitPaper() {
  let fs = 13
  paper.style.setProperty('--fs', fs + 'px')
  while (fs > 8 && paper.scrollWidth > paper.clientWidth + 1) { fs -= 0.25; paper.style.setProperty('--fs', fs + 'px') }
}
fitPaper()
addEventListener('resize', fitPaper)

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
