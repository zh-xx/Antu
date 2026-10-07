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
// the same, for plain text (copied from the page, never read as markup)
const elt = (tag, cls, text, style) => {
  const e = el(tag, cls, null, style)
  e.textContent = text
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
    e.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 280, delay: 120 + (y / pr.height) * 850, fill: 'both' })
  })
  $(beam).animate([{ top: '-70px', opacity: 1 }, { top: pr.height - 60 + 'px', opacity: 0 }], { duration: 1000, delay: 120, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => ($(beam).style.opacity = 0)
  return wait(1150)
}

// colours that follow the light / dark mode
const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim()
const SH_B = () => `inset 0 0 0 0 #e8452c, inset 0 0 0 1px ${tok('camp-line')}, ${tok('card-shadow')}`
const paperAway = () => (paper.classList.add('melt'), [
  ...$$('.paper > *:not(.beam)').map((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 600, fill: 'both', easing: 'ease-in' })),
  paper.animate([{ backgroundColor: tok('paper'), boxShadow: tok('paper-shadow') }, { backgroundColor: 'rgba(0,0,0,0)', boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 800, delay: 100, fill: 'both', easing: ease }),
])

// the highlighter goes over each sentence, then the date and the event's name in it are marked
async function sweep(lis, alive) {
  for (const li of lis) {
    if (!alive()) return
    li.classList.add('hl')
    setTimeout(() => alive() && li.classList.add('pick'), 260)
    await wait(110)
  }
  await wait(450)
}

async function toTimeline(alive) {
  const L = timeline(), lis = $$('#bul li')
  // mark what the timeline takes from each sentence
  await sweep(lis, alive)
  if (!alive()) return
  // each sentence becomes its own object; the two marked pieces of it fly to their places on the card
  const acts = D.events.map((e, i) => {
    const li = lis[i], A = rel(li), B = L.cards[i]
    const a = el('div', 'actor', `<div class="face tv" style="width:${B.w}px;height:${B.h}px"><div class="l">${e.label}</div>${e.summary && B.h >= 50 ? `<div class="s">${e.summary}</div>` : ''}<div class="t">${e.when}</div></div>`,
      { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px', backgroundColor: 'transparent' })
    const words = ['dt', 'lb'].map((k) => {
      const src = li.querySelector('.' + k), r = rel(src.getClientRects().length ? { getBoundingClientRect: () => src.getClientRects()[0] } : src)
      const fs = parseFloat(getComputedStyle(src).fontSize)
      const w = elt('span', 'wordfly', src.textContent, { left: r.x + 'px', top: r.y + 'px', fontSize: fs + 'px', fontFamily: 'var(--fang)' })
      return { w, r, fs, to: k === 'dt' ? '.t' : '.l' }
    })
    return { a, A, B, li, words }
  })
  // the words land on the lines of the card where they are written
  acts.forEach((o, i) => {
    const d = i * 45
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
      ], { duration: 850, delay: d, easing: ease, fill: 'both' })
    })
  })
  paperAway()
  // the column heads and the axis
  D.cols.forEach((c, k) => {
    const h = el('div', 'tl-head', `${c.head}${c.sub ? `<small>${c.sub}</small>` : ''}`, { left: L.x0 + k * L.colW + 'px', width: L.colW + 'px', top: '4px' })
    show(h, 500, 600 + k * 80)
  })
  const ax = el('div', 'vaxis', null, { left: L.axisX + 'px', top: L.top - 8 + 'px', height: L.bottom - L.top + 12 + 'px' })
  ax.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 1000, delay: 200, easing: ease, fill: 'both' })
  acts.forEach((o, i) => {
    const d = i * 45, B = o.B
    o.a.animate([
      { left: o.A.x + 'px', top: o.A.y + 'px', width: o.A.w + 'px', height: o.A.h + 'px', backgroundColor: 'rgba(240,200,180,0)', borderRadius: '2px', boxShadow: 'none', opacity: 1 },
      { backgroundColor: tok('panel'), opacity: 0.35, offset: 0.4 },
      { left: B.x + 'px', top: B.y + 'px', width: B.w + 'px', height: B.h + 'px', backgroundColor: tok('panel'), borderRadius: '8px', boxShadow: SH_B(), opacity: 1 },
    ], { duration: 850, delay: d, easing: ease, fill: 'both' })
    o.a.querySelector('.face').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: d + 780, fill: 'both' })
    // a card of one party is joined to the axis by a short line, with a dot where it meets the axis
    if (B.side) {
      const x1 = B.side < 0 ? B.x + B.w : L.axisX, x2 = B.side < 0 ? L.axisX : B.x
      const st = el('div', 'hstub', null, { left: x1 + 'px', top: B.cy + 'px', width: x2 - x1 + 'px', transformOrigin: B.side < 0 ? 'right' : 'left' })
      st.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 400, delay: d + 1000, fill: 'both' })
      const dot = el('div', 'tdot', null, { left: L.axisX + 'px', top: B.cy + 'px' })
      show(dot, 200, d + 1200)
    }
  })
  await wait(12 * 45 + 1000)
  $$('.wordfly').forEach((w) => w.remove())
  // keep the cards as they ended and drop their finished fades (a finished fade can leave a card's text unpainted)
  $$('.actor .face').forEach((f) => { f.getAnimations().forEach((a) => a.cancel()); f.style.opacity = 1 })
}

// the relationship graph as Antu lays it out (D.rel), fitted to the stage
function relFit() {
  const R = D.rel, W = stage.clientWidth, H = stage.clientHeight
  // a little smaller than the stage, so the graph sits with room around it
  const k = Math.min((W - 24) / R.size.width, (H - 16) / R.size.height, 1.6) * 0.8
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
  visible.forEach((n, i) => setTimeout(() => alive() && n.classList.add('lit'), (i * 23) % 550))
  await wait(800)
  if (!alive()) return
  // the canvas: Antu's drawing, scaled; groups and parties wait for the names
  const layer = el('div', 'relcv', null, { left: f.ox + 'px', top: f.oy + 'px', width: R.size.width + 'px', height: R.size.height + 'px', transform: `scale(${f.k})` })
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('width', R.size.width)
  svg.setAttribute('height', R.size.height)
  svg.innerHTML = `<defs><marker id="rarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 L9 5 L0 9 Z" fill="#e8452c"/></marker></defs>`
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
    const m = elt('span', 'mv', n.textContent, { left: from.x + 'px', top: from.y + 'px', fontSize: from.h * 0.7 + 'px', color: '#fff', background: '#e8452c', padding: '0 2px', borderRadius: '2px', fontFamily: 'var(--fang)', lineHeight: 1.2 })
    n.classList.remove('lit')
    const delay = 150 + (i % 24) * 30 + Math.random() * 150
    m.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${(c.x - from.x) * 0.5 + (Math.random() - 0.5) * 120}px,${(c.y - from.y) * 0.5 + (Math.random() - 0.5) * 120}px) scale(1.15)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${c.x - from.x - from.w / 2}px,${c.y - from.y - from.h / 2}px) scale(.5)`, opacity: 0 },
    ], { duration: 900, delay, easing: ease, fill: 'both' }).onfinish = () => {
      m.remove()
      if (!alive()) return
      const box = ents[id]
      got[id] = (got[id] || 0) + 1
      if (got[id] === 1) box.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.05)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'both', easing: 'ease-out' })
      else box.animate([{ boxShadow: '0 0 0 0 rgba(232,69,44,.8)' }, { boxShadow: '0 0 0 9px rgba(232,69,44,0)' }], { duration: 400 })
    }
  })
  await wait(150 + 24 * 30 + 150 + 900 + 100)
  if (!alive()) return
  for (const e of R.ents) if (!got[e.id]) ents[e.id].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'both' })
  // the relations draw themselves, along Antu's own routes
  R.links.forEach((l, i) => {
    const delay = 80 + i * 100
    const mk = (w, color) => {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', l.d)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke-width', w)
      p.style.stroke = color
      svg.appendChild(p)
      return p
    }
    // every relation in the accent red, as the timeline's axis is; the kind still shows in its dash and weight
    const parts = l.double ? [mk(l.width, '#e8452c'), mk(l.width - 2.4, 'var(--bg)')] : [mk(l.width, '#e8452c')]
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
  await wait(80 + R.links.length * 100 + 700)
}

function reset() {
  $$('.jcv,.jghost,.flowcv,.relcv,.actor,.wordfly,.mv,.tl-head,.vaxis,.hstub,.spine,.rowlbl,.stub,.tdot,.camp,.ent,.edges,.rn,.chip,.trunk,.doc,.fn,.token').forEach((e) => e.remove())
  paper.classList.remove('melt')
  $$('#bul li, .paper > *:not(.beam), .nm').forEach((e) => { e.getAnimations().forEach((a) => a.cancel()); e.style.visibility = ''; e.classList.remove('lit', 'hl', 'pick') })
  $$('#paper .rp').forEach((p) => p.classList.remove('hl', 'pick'))
  paper.getAnimations().forEach((a) => a.cancel())
  const pg = $('#paper2')
  ;[pg, ...pg.querySelectorAll('*')].forEach((e) => e.getAnimations().forEach((a) => a.cancel()))
  pg.classList.remove('melt')
  pg.querySelectorAll('.sn').forEach((x) => x.classList.remove('lit', 'hl', 'pick'))
}

// ---------- ③ reasoning: the court's view, issue by issue, becomes Antu's reasoning tree
const JR = { conclusion: 9, norm: 3, element: 16, inference: 8, judgement: 8, fact: 3 }
// one card as Antu draws it: an outline by kind (dashed when the court held against it), the kind and holds on top
function jCard(n) {
  const R = D.reason, b = document.createElement('div')
  const rej = n.holds === 'no'
  b.className = `jcard k-${n.kind}${rej ? ' rej' : ''}`
  Object.assign(b.style, { left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' })
  const dash = rej ? ' stroke-dasharray="5 3"' : n.dash ? ` stroke-dasharray="${n.dash}"` : ''
  const rx = Math.min(JR[n.kind] ?? 3, (n.h - 2) / 2)
  b.innerHTML = `<svg width="${n.w}" height="${n.h}"><rect class="sh" x="1" y="1" width="${n.w - 2}" height="${n.h - 2}" rx="${rx}" stroke-width="${n.width}"${dash}/></svg>` +
    `<div class="jb" style="width:${n.textW}px"><div class="jt"><span>${R.kinds[n.kind] ?? ''}</span>${n.holds ? `<em class="h-${n.holds}">${R.holds[n.holds]}</em>` : ''}</div><div class="jl">${n.label}</div></div>`
  return b
}
function jLayer(L, fit) {
  const layer = el('div', 'jcv', null, { left: fit.ox + 'px', top: fit.oy + 'px', width: L.size.width + 'px', height: L.size.height + 'px', transform: `scale(${fit.k})` })
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('width', L.size.width)
  svg.setAttribute('height', L.size.height)
  svg.innerHTML = '<defs><marker id="jarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 L9 5 L0 9 Z" fill="#e8452c"/></marker></defs>'
  layer.appendChild(svg)
  const groups = L.groups.map((g) => {
    const b = document.createElement('div')
    b.className = `jgroup${g.folded ? ' folded' : ''}`
    Object.assign(b.style, { left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' })
    b.innerHTML = `<span>${g.folded ? '▸' : '▾'} ${g.label}${g.folded ? ` · 已收起 ${g.hidden} 个` : ''}</span>`
    layer.appendChild(b)
    return b
  })
  const cards = {}
  for (const n of L.nodes) { cards[n.id] = jCard(n); layer.appendChild(cards[n.id]) }
  // Antu sizes a card from its own estimate of the text; a card that comes up a line short grows down to hold it
  for (const n of L.nodes) {
    const c = cards[n.id], need = c.querySelector('.jb').offsetHeight + 18
    if (need > n.h + 0.5) {
      c.style.height = need + 'px'
      c.querySelector('svg').setAttribute('height', need)
      c.querySelector('rect.sh').setAttribute('height', need - 2)
    }
  }
  return { layer, svg, groups, cards }
}
function jLinks(L, svg, delay0 = 0, step = 90) {
  L.links.forEach((l, i) => {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', l.d)
    p.setAttribute('fill', 'none')
    p.setAttribute('class', 'ln')
    p.setAttribute('stroke-width', l.width)
    p.style.stroke = '#e8452c'
    svg.appendChild(p)
    const len = p.getTotalLength()
    p.style.strokeDasharray = `${len} ${len}`
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 600, delay: delay0 + i * step, easing: ease, fill: 'both' }).onfinish = () => {
      p.style.strokeDasharray = l.dash || 'none'
      p.setAttribute('marker-end', 'url(#jarr)')
    }
  })
  return delay0 + L.links.length * step + 600
}
// fit a box of a layout (or all of it) to the stage
function jFit(L, box, scale) {
  const W = stage.clientWidth, H = stage.clientHeight
  const b = box ?? { x: 0, y: 0, w: L.size.width, h: L.size.height }
  const k = scale ?? Math.min((W - 32) / b.w, (H - 24) / b.h, 1.3)
  return { k, ox: (W - b.w * k) / 2 - b.x * k, oy: (H - b.h * k) / 2 - b.y * k }
}
// the scale that fits the larger of the tree's two states, so it can be kept from one state to the other
const jScale = (...Ls) => Math.min(...Ls.map((L) => jFit(L).k))

async function toReasoning(alive) {
  const R = D.reason, F1 = R.folded
  const paras = $$('#paper .rp')
  // the highlighter goes over each paragraph of the court's view, then marks what the court holds in it
  for (const p of paras) {
    if (!alive()) return
    p.classList.add('hl')
    if (p.classList.contains('has')) setTimeout(() => alive() && p.classList.add('pick'), 260)
    await wait(170)
  }
  await wait(450)
  if (!alive()) return
  // Antu's tree, every issue folded: the marked words fly to their cards
  const k1 = jScale(F1, R.open), f1 = jFit(F1, null, k1), A = jLayer(F1, f1)
  Object.values(A.cards).forEach((c) => (c.style.opacity = 0))
  A.groups.forEach((g, i) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 400 + i * 120, fill: 'both' }))
  paperAway()
  const marked = $$('#paper .jh')
  marked.forEach((src, i) => {
    const id = src.dataset.n, n = F1.nodes.find((x) => x.id === id), r = rel(src.getClientRects()[0] ? { getBoundingClientRect: () => src.getClientRects()[0] } : src)
    const fs = parseFloat(getComputedStyle(src).fontSize)
    const w = elt('span', 'wordfly', src.textContent, { left: r.x + 'px', top: r.y + 'px', fontSize: fs + 'px', fontFamily: 'var(--fang)' })
    const cx = f1.ox + (n.x + n.w / 2) * f1.k, cy = f1.oy + (n.y + n.h / 2) * f1.k
    const k = Math.min((n.w - 24) * f1.k / w.offsetWidth, 13 * f1.k / fs, 1.4)
    const tx = cx - r.x - (w.offsetWidth * k) / 2, ty = cy - r.y - (r.h * k) / 2, d = 100 + i * 80
    w.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${tx * 0.5}px,${ty * 0.5 - 40}px) scale(${(1 + k) / 2})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx}px,${ty}px) scale(${k})`, opacity: 1, offset: 0.9 },
      { transform: `translate(${tx}px,${ty}px) scale(${k})`, opacity: 0 },
    ], { duration: 1150, delay: d, easing: ease, fill: 'both' })
    A.cards[id].animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 420, delay: d + 980, easing: 'ease-out', fill: 'both' })
  })
  await wait(100 + marked.length * 80 + 950)
  if (!alive()) return
  $$('.wordfly').forEach((w) => w.remove())
  await wait(jLinks(F1, A.svg, 0, 70) + 450)
  if (!alive()) return
  // issue two opens, where the court turned the argument down: the cards both states share move to their new
  // places, the rest of the chain comes in, and the lines draw again. One scale for both states, so nothing zooms
  const F2 = R.open, B = jLayer(F2, jFit(F2, null, k1))
  B.layer.style.opacity = 0
  const fit1 = jFit(F1, null, k1), fit2 = jFit(F2, null, k1)
  const scr = (f, n) => ({ x: f.ox + n.x * f.k, y: f.oy + n.y * f.k })
  const shared = F1.nodes.filter((n) => F2.nodes.some((m) => m.id === n.id))
  const ghosts = shared.map((n) => {
    const m = F2.nodes.find((x) => x.id === n.id), a = scr(fit1, n), b = scr(fit2, m)
    const g = jCard(n)
    Object.assign(g.style, { left: '0px', top: '0px', transformOrigin: '0 0', zIndex: 6 })
    g.classList.add('jghost')
    stage.appendChild(g)
    g.animate([{ transform: `translate(${a.x}px,${a.y}px) scale(${k1})` }, { transform: `translate(${b.x}px,${b.y}px) scale(${k1})` }], { duration: 800, easing: ease, fill: 'both' })
    return g
  })
  A.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'both' })
  await wait(800)
  if (!alive()) return
  B.layer.style.opacity = 1
  ghosts.forEach((g) => g.remove())
  const fresh = F2.nodes.filter((n) => !shared.some((s) => s.id === n.id))
  B.groups.forEach((g) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, fill: 'both' }))
  Object.values(B.cards).forEach((c) => (c.style.opacity = 1))
  fresh.forEach((n, i) => B.cards[n.id].animate([{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 350, delay: 100 + i * 80, easing: 'ease-out', fill: 'both' }))
  await wait(jLinks(F2, B.svg, 150, 55))
}

// ---------- ④ flowchart: a contract; the step named in each clause flies to Antu's own flowchart
function flowFit() {
  const F = D.flow, W = stage.clientWidth, H = stage.clientHeight
  const k = Math.min((W - 24) / F.size.width, (H - 16) / F.size.height, 1.4)
  return { k, ox: (W - F.size.width * k) / 2, oy: (H - F.size.height * k) / 2 }
}
// outline of one step, as Antu draws its kind: a pill for a start, a double pill for an end, a diamond for a decision
function flowShape(n) {
  const W = n.w - 2, H = n.h - 2, dash = n.dash ? ` stroke-dasharray="${n.dash}"` : ''
  const st = `class="sh" style="fill:${n.kind === 'start' ? 'var(--chipbg)' : 'var(--panel)'};stroke:var(--nodeline)" stroke-width="${n.width}"${dash}`
  if (n.kind === 'decision') return `<polygon ${st} points="${n.w / 2},1 ${n.w - 1},${n.h / 2} ${n.w / 2},${n.h - 1} 1,${n.h / 2}"/>`
  if (n.kind === 'start') return `<rect ${st} x="1" y="1" width="${W}" height="${H}" rx="${H / 2}"/>`
  if (n.kind === 'end') return `<rect ${st} x="1" y="1" width="${W}" height="${H}" rx="${H / 2}"/><rect fill="none" style="stroke:var(--nodeline)" stroke-width="1" x="5" y="5" width="${W - 8}" height="${H - 8}" rx="${(H - 8) / 2}"/>`
  return `<rect ${st} x="1" y="1" width="${W}" height="${H}" rx="6"/>`
}

async function toFlow(alive) {
  const F = D.flow, f = flowFit(), pg = $('#paper2')
  paper.style.opacity = 0
  // the contract comes in, and is read
  pg.animate([{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: ease, fill: 'both' })
  await wait(300)
  await reading(pg, '#beam2')
  if (!alive()) return
  // the highlighter goes over each sentence that names a step; then the step's name in it is marked
  const sn = Object.fromEntries([...pg.querySelectorAll('.sn')].map((x) => [x.dataset.n, x]))
  const inDoc = [...pg.querySelectorAll('.sn')]
  for (const x of inDoc) {
    if (!alive()) return
    x.classList.add('hl')
    setTimeout(() => alive() && x.classList.add('pick'), 240)
    await wait(90)
  }
  await wait(400)
  if (!alive()) return
  // Antu's canvas
  const layer = el('div', 'flowcv', null, { left: f.ox + 'px', top: f.oy + 'px', width: F.size.width + 'px', height: F.size.height + 'px', transform: `scale(${f.k})` })
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('width', F.size.width)
  svg.setAttribute('height', F.size.height)
  svg.innerHTML = '<defs><marker id="farr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 L9 5 L0 9 Z" fill="#e8452c"/></marker></defs>'
  layer.appendChild(svg)
  // Antu's stage bands, under everything
  F.stages.forEach((st, i) => {
    const b = document.createElement('div')
    b.className = 'fstage'
    Object.assign(b.style, { left: st.x + 'px', top: st.y + 'px', width: st.w + 'px', height: st.h + 'px' })
    b.innerHTML = `<span>${st.label}</span>`
    layer.appendChild(b)
    b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 300 + i * 150, fill: 'both' })
  })
  const box = {}
  for (const n of F.nodes) {
    const b = document.createElement('div')
    b.className = `fnode k-${n.kind}`
    Object.assign(b.style, { left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' })
    b.innerHTML = `<svg width="${n.w}" height="${n.h}">${flowShape(n)}</svg><b>${n.label}</b>${n.detail ? `<i>${n.detail}</i>` : ''}`
    layer.appendChild(b)
    box[n.id] = b
  }
  // the marked names leave the page and land on their steps
  const P = (x, y) => ({ x: f.ox + x * f.k, y: f.oy + y * f.k })
  pg.classList.add('melt')
  pg.querySelectorAll('.ctitle,.no,p,.lbl').forEach((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(5px)' }], { duration: 650, delay: 250, fill: 'both' }))
  F.order.forEach((id, i) => {
    const n = F.nodes.find((x) => x.id === id), src = sn[id].querySelector('.lb'), r = rel(src)
    const fs = parseFloat(getComputedStyle(src).fontSize)
    const w = elt('span', 'wordfly', src.textContent, { left: r.x + 'px', top: r.y + 'px', fontSize: fs + 'px', fontFamily: 'var(--fang)' })
    const c = P(n.x + n.w / 2, n.y + n.h / 2), k = Math.min(13 * f.k / fs, 1.2)
    const tx = c.x - r.x - (r.w * k) / 2, ty = c.y - r.y - (r.h * k) / 2, d = i * 55
    w.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${tx * 0.5}px,${ty * 0.5 - 40}px) scale(${(1 + k) / 2})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx}px,${ty}px) scale(${k})`, opacity: 1, offset: 0.9 },
      { transform: `translate(${tx}px,${ty}px) scale(${k})`, opacity: 0 },
    ], { duration: 1150, delay: d, easing: ease, fill: 'both' })
    box[id].animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 420, delay: d + 980, easing: 'ease-out', fill: 'both' })
  })
  await wait(F.order.length * 55 + 1000)
  if (!alive()) return
  $$('.wordfly').forEach((w) => w.remove())
  // the links draw themselves along Antu's routes, with their conditions
  F.links.forEach((l, i) => {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', l.d)
    p.setAttribute('fill', 'none')
    p.setAttribute('class', 'ln')
    p.setAttribute('stroke-width', l.width)
    p.style.stroke = '#e8452c'
    svg.appendChild(p)
    const len = p.getTotalLength()
    p.style.strokeDasharray = `${len} ${len}`
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 450, delay: i * 60, easing: ease, fill: 'both' }).onfinish = () => {
      p.style.strokeDasharray = l.dash || 'none'
      p.setAttribute('marker-end', 'url(#farr)')
    }
    if (l.label && l.lx != null) {
      const t = document.createElement('span')
      t.className = 'flab'
      t.textContent = l.label
      Object.assign(t.style, { left: l.lx + 'px', top: l.ly + 'px', width: l.lw + 'px', height: l.lh + 'px' })
      layer.appendChild(t)
      t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 60 + 300, fill: 'both' })
    }
  })
  await wait(F.links.length * 60 + 500)
  if (!alive()) return
  // the main line lights up, step by step, in place
  for (const id of F.mainPath) {
    if (!alive()) return
    box[id].classList.add('lit')
    await wait(110)
  }
}


// the judgment's type is as large as fits on its spread
function fitPaper() {
  let fs = 13
  paper.style.setProperty('--fs', fs + 'px')
  while (fs > 8 && paper.scrollWidth > paper.clientWidth + 1) { fs -= 0.25; paper.style.setProperty('--fs', fs + 'px') }
}
// and the contract's, so its whole text is on its page
function fitContract() {
  const pg = $('#paper2')
  let fs = 14
  pg.style.setProperty('--cfs', fs + 'px')
  // the last line of text must end above the folio
  const fits = () => pg.querySelector('.fiction').getBoundingClientRect().bottom <= pg.getBoundingClientRect().bottom - 30
  while (fs > 8 && !fits()) { fs -= 0.25; pg.style.setProperty('--cfs', fs + 'px') }
}
fitPaper()
fitContract()
addEventListener('resize', () => { fitPaper(); fitContract() })

// the four kinds: each plays on its own, from its document
const SCENES = {
  fact: async (alive) => { await reading(); if (alive()) await toTimeline(alive) },
  relationship: async (alive) => { await reading(); if (alive()) await toGraph(alive) },
  procedure: async (alive) => { await toFlow(alive) },
  justification: async (alive) => { await reading(); if (alive()) await toReasoning(alive) },
}
// the thin line under the chosen kind fills while its scene plays
const SCENE_MS = { fact: 6500, relationship: 5500, procedure: 6500, justification: 8500 }
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
  // a plain switch, so a name taken from the page or the address can only reach one of the four
  switch (kind) {
    case 'fact': await SCENES.fact(alive); break
    case 'relationship': await SCENES.relationship(alive); break
    case 'procedure': await SCENES.procedure(alive); break
    case 'justification': await SCENES.justification(alive); break
  }
  if (alive()) { run++; bar.style.setProperty('--p', 1) }
}
$$('.kind').forEach((k) => (k.onclick = () => play(k.dataset.kind)))
// `#kind=procedure` in the address starts with that kind (for checking one alone)
const asked = (location.hash.match(/kind=(\w+)/) || [])[1]
const FIRST = ['fact', 'relationship', 'procedure', 'justification'].includes(asked) ? asked : 'fact'
const start = () => play(FIRST)

// the top bar: the start button and Examples go to the under-construction notice for now; the language
// switch (the top bar's labels and the notice only, in this draft); light / dark, remembered in this browser
$('#startBtn').onclick = () => $('#start').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
const EN = {
  examples: 'Examples', start: 'Get started', startT: 'Get started',
  skillT: 'Skill: send this sentence to your Agent',
  skillText: 'Please install the Antu skill: run npx skills add zh-xx/Antu -g -y, then use it to draw diagrams from my case material.',
  mcpT: 'MCP: add this configuration to your MCP client',
  copy: 'Copy', whyT: 'Why it suits legal work',
  w1t: 'Your material stays on your machine.', w1: 'Neither the case material nor the diagram is uploaded to any server. The diagram is a single HTML file; the page makes no network request when it opens and works offline.',
  w2t: 'Every node can be traced to the original text.', w2: 'Facts, clauses and issues can record their sources with an excerpt of the original; click a node to see it, for checking.',
  w3t: 'Only what the material says; nothing added on the parties’ behalf.', w3: 'The Skill requires the Agent not to invent dates, article numbers, case numbers or names; what the material does not give is shown as “date unknown”, and a legal point that is uncertain is left out and the user is told.',
  w4t: 'Checked first, drawn after.', w4: 'When the data has a problem, the system names the field path and refuses to draw, rather than produce a diagram that looks complete but is wrong.',
  w5t: 'Archived, printed, forwarded.', w5: 'The default black-and-white, square-cornered style suits printing and filing; the diagram can be sent as an attachment and the recipient needs to install nothing.',
}
const ZH = Object.fromEntries($$('[data-i18n]').map((e) => [e.dataset.i18n, e.textContent]))
$$('.lang button').forEach((b) => (b.onclick = () => {
  const lang = b.dataset.lang
  $('.lang').dataset.on = lang
  $$('.lang button').forEach((x) => x.setAttribute('aria-checked', String(x === b)))
  const dict = lang === 'en' ? EN : ZH
  $$('[data-i18n]').forEach((e) => e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).onfinish = () => { e.textContent = dict[e.dataset.i18n]; e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }) })
}))
$$('.copy').forEach((b) => (b.onclick = async () => {
  const done = $('.lang').dataset.on === 'en' ? 'Copied' : '已复制'
  try { await navigator.clipboard.writeText($('#' + b.dataset.for).textContent) } catch { return }
  const before = b.textContent
  b.textContent = done
  setTimeout(() => { b.textContent = before }, 1500)
}))
$('#mode').onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
  document.documentElement.dataset.theme = next
  try { localStorage.setItem('antu.site.theme', next) } catch { /* not remembered */ }
}

if (location.hash.includes('manual')) window.start = start
else setTimeout(start, 500)
