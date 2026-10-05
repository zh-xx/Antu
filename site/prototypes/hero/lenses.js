// Draft "lenses" (issue #107). A typeset judgment turns into Antu's timeline, then its relationship graph,
// then its reasoning tree; a typeset contract turns into its flowchart. Every scene lands on the places
// and the picture Antu itself drew (window.__LENS__, made by build.mjs with capture.mjs).
const D = window.__LENS__, F = D.frame
const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const stage = $('#stage'), spread = $('#spread'), canvas = $('#canvas')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = 'cubic-bezier(.65,0,.2,1)'
const PAPER = '#fbf9f4'
let run = 0, frame = { x: 0, y: 0, k: 1 }, canvasColor = '#f7f8fa'

// ---------- geometry
function layout() {
  const sw = stage.clientWidth, sh = stage.clientHeight
  const s1 = Math.min(sw / 880, sh / 612)
  spread.style.transform = `translate(${(sw - 860 * s1) / 2}px,${(sh - 600 * s1) / 2}px) scale(${s1})`
  const k = Math.min(sw / F.w, sh / F.h)
  frame = { x: (sw - F.w * k) / 2, y: (sh - F.h * k) / 2, k }
  Object.assign(canvas.style, { left: frame.x + 'px', top: frame.y + 'px', width: F.w * k + 'px', height: F.h * k + 'px' })
}
// where an element is on the stage; a paragraph that runs into the next column counts by its first part
const rel = (el) => {
  const a = el.getClientRects()[0] || el.getBoundingClientRect(), b = stage.getBoundingClientRect()
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }
}
const T = (scene, id) => { const n = D[scene].nodes[id], k = frame.k; return { x: frame.x + n.x * k, y: frame.y + n.y * k, w: n.w * k, h: n.h * k } }
const flipFrom = (from, to) => `translate(${from.x - to.x}px,${from.y - to.y}px) scale(${from.w / to.w},${from.h / to.h})`
const img = (scene, which) => $(`.canvas img.${which}[data-k="${scene}"]`)

// a card exactly as Antu drew it: a window onto the full picture, placed where the card is
function card(scene, id, hot = true) {
  const t = T(scene, id), n = D[scene].nodes[id], k = frame.k
  const a = document.createElement('div')
  a.className = 'actor'
  Object.assign(a.style, {
    left: t.x + 'px', top: t.y + 'px', width: t.w + 'px', height: t.h + 'px',
    backgroundImage: `url(${img(scene, 'full').src})`, backgroundSize: `${F.w * k}px ${F.h * k}px`, backgroundPosition: `${-n.x * k}px ${-n.y * k}px`,
  })
  if (hot) a.innerHTML = '<div class="hot"></div>'
  stage.appendChild(a)
  return { a, t, n }
}
// the words themselves ride on the card for the first part of the flight, set as on the page
function words(o, el) {
  const s1 = spread.getBoundingClientRect().width / 860
  const w = document.createElement('div')
  w.className = 'words'
  w.innerHTML = el.innerHTML
  const cs = getComputedStyle(el.closest('.doc'))
  Object.assign(w.style, { fontSize: parseFloat(cs.fontSize) * s1 + 'px', lineHeight: cs.lineHeight === 'normal' ? '1.64' : parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), textIndent: el.matches('.ev,#yrw') ? '2em' : '0' })
  o.a.appendChild(w)
  return w
}
// fly a card from where its words were to where Antu put it: its box changes size (nothing is stretched),
// lit like the words at first, and Antu's card shows through as it lands
function fly(o, from, { delay = 0, duration = 1100 } = {}) {
  const t = o.t, n = o.n, k = frame.k
  o.a.style.transform = ''
  o.a.animate([
    { left: from.x + 'px', top: from.y + 'px', width: from.w + 'px', height: from.h + 'px', backgroundPosition: `${-n.x * k - (from.x - t.x)}px ${-n.y * k - (from.y - t.y)}px` },
    { left: t.x + 'px', top: t.y + 'px', width: t.w + 'px', height: t.h + 'px', backgroundPosition: `${-n.x * k}px ${-n.y * k}px` },
  ], { duration, delay, easing: ease, fill: 'both' })
  const hot = o.a.querySelector('.hot')
  if (hot) hot.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration, delay, fill: 'both' })
  const w = o.a.querySelector('.words')
  if (w) w.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(2px)', offset: 0.45 }, { opacity: 0 }], { duration, delay, fill: 'both' })
}
// park a card where its words are, before it flies
function park(o, from) {
  Object.assign(o.a.style, { left: from.x + 'px', top: from.y + 'px', width: from.w + 'px', height: from.h + 'px' })
}

// ---------- the page and the canvas
function dots(i) { $$('.dots i').forEach((d, k) => d.classList.toggle('on', i === 'all' || k === i)) }
const docOf = (which) => $(which === 'contract' ? '#contract' : '#judgment')

function reading(doc) {
  const pr = spread.getBoundingClientRect()
  doc.querySelectorAll('p,div').forEach((e) => {
    const r = e.getBoundingClientRect(), y = (r.top - pr.top) / pr.height
    e.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 380, delay: 150 + y * 1300, fill: 'both' })
  })
  const b = $('#beam').animate([{ top: '-60px', opacity: 1 }, { top: '600px', opacity: 1 }], { duration: 1400, delay: 150, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'backwards' })
  b.onfinish = () => b.cancel()
  return wait(1650)
}
function light(els, step = 70) {
  els.forEach((e, i) => setTimeout(() => e.classList.add('lit'), i * step))
  return wait(els.length * step + 350)
}
// the spread gives way to Antu's canvas
function toCanvas(doc) {
  const from = rel(spread), to = { x: frame.x, y: frame.y, w: F.w * frame.k, h: F.h * frame.k }
  canvas.style.opacity = 1
  canvas.animate([{ transform: flipFrom(from, to), backgroundColor: PAPER, borderRadius: '2px' }, { transform: 'none', backgroundColor: canvasColor, borderRadius: '12px' }], { duration: 1000, delay: 200, easing: ease, fill: 'both' })
  $$('.pg').forEach((p) => p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 250, fill: 'both' }))
  doc.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(5px)' }], { duration: 500, fill: 'both' })
}
function reveal(scene, at, { delay = 0, duration = 1300 } = {}) {
  const im = img(scene, 'lines')
  const c = at ? `${at.x}px ${at.y}px` : null
  im.animate(c
    ? [{ opacity: 1, clipPath: `circle(0% at ${c})` }, { opacity: 1, clipPath: `circle(140% at ${c})` }]
    : [{ opacity: 1, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], { duration, delay, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' })
}
async function settle(scene) {
  img(scene, 'full').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, fill: 'both' })
  await wait(380)
  $$('.actor,.chipfly').forEach((e) => e.remove())
}
// move in close on one card of the picture, hold, and move back out
async function pushIn(scene, id, z, hold) {
  const n = D[scene].nodes[id], k = frame.k, cam = canvas.querySelector('.cam')
  const cx = (n.x + n.w / 2) * k, cy = (n.y + n.h / 2) * k, W = F.w * k, H = F.h * k
  const tx = Math.min(0, Math.max(W - W * z, W / 2 - cx * z)), ty = Math.min(0, Math.max(H - H * z, H / 2 - cy * z))
  const a = cam.animate([{ transform: 'none' }, { transform: `translate(${tx}px,${ty}px) scale(${z})`, offset: 0.35 }, { transform: `translate(${tx}px,${ty}px) scale(${z})`, offset: 0.75 }, { transform: 'none' }], { duration: hold, easing: 'cubic-bezier(.6,0,.3,1)' })
  await a.finished.catch(() => {})
}

async function backToDoc(scene, doc) {
  const to = rel(spread), from = { x: frame.x, y: frame.y, w: F.w * frame.k, h: F.h * frame.k }
  for (const w of ['full', 'lines']) img(scene, w).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'both' })
  canvas.getAnimations().forEach((a) => a.cancel())
  canvas.animate([{ transform: 'none', backgroundColor: canvasColor, borderRadius: '12px', opacity: 1 }, { transform: flipFrom(to, from), backgroundColor: PAPER, borderRadius: '2px', opacity: 1 }], { duration: 900, delay: 250, easing: ease, fill: 'both' })
  await wait(1050)
  $$('.pg').forEach((p) => { p.getAnimations().forEach((a) => a.cancel()) })
  canvas.getAnimations().forEach((a) => a.cancel())
  canvas.style.opacity = 0
  $$('.lit').forEach((e) => e.classList.remove('lit'))
  doc.getAnimations().forEach((a) => a.cancel())
  doc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'both' })
  await wait(600)
}

// ---------- the four scenes
async function factScene(alive) {
  dots(0)
  const doc = docOf('judgment'), evs = [...doc.querySelectorAll('.ev')]
  await light(evs)
  if (!alive()) return
  const cards = evs.map((p) => ({ o: card('fact', p.dataset.id), from: rel(p), p }))
  cards.forEach(({ o, from, p }) => { park(o, from); words(o, p) })
  toCanvas(doc)
  cards.forEach(({ o, from }, i) => fly(o, from, { delay: 250 + i * 60 }))
  reveal('fact', null, { delay: 700, duration: 1500 })
  await wait(250 + cards.length * 60 + 1150)
  if (!alive()) return
  await settle('fact')
  await pushIn('fact', 'ev-11', 2.1, 3400)
  if (!alive()) return
  await backToDoc('fact', doc)
}

async function relScene(alive) {
  dots(1)
  const doc = docOf('judgment'), box = spread.getBoundingClientRect()
  const names = [...doc.querySelectorAll('.nm')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.right <= box.right && r.bottom <= box.bottom })
  names.forEach((n, i) => setTimeout(() => alive() && n.classList.add('lit'), (i * 41) % 1000))
  await wait(1300)
  if (!alive()) return
  const starts = names.map((n) => ({ n, from: rel(n) }))
  toCanvas(doc)
  const shown = {}
  starts.forEach(({ n, from }, i) => {
    const id = n.dataset.e, t = T('rel', id)
    const c = document.createElement('span')
    c.className = 'chipfly'
    c.textContent = n.textContent
    Object.assign(c.style, { left: from.x + 'px', top: from.y + 'px', fontSize: from.h * 0.62 + 'px' })
    stage.appendChild(c)
    const tx = t.x + t.w / 2 - from.x - from.w / 2, ty = t.y + t.h / 2 - from.y - from.h / 2
    const delay = 300 + (i % 28) * 38 + Math.random() * 180
    const f = c.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${tx * 0.5 + (Math.random() - 0.5) * 140}px,${ty * 0.5 + (Math.random() - 0.5) * 140}px) scale(1.2)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx}px,${ty}px) scale(.4)`, opacity: 0 },
    ], { duration: 1050, delay, easing: ease, fill: 'both' })
    f.onfinish = () => {
      c.remove()
      if (!alive()) return
      if (!shown[id]) {
        shown[id] = card('rel', id, false)
        shown[id].a.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'ease-out', fill: 'both' })
      } else shown[id].a.animate([{ boxShadow: '0 0 0 0 rgba(232,69,44,.8)' }, { boxShadow: '0 0 0 9px rgba(232,69,44,0)' }], { duration: 380 })
    }
  })
  await wait(300 + 28 * 38 + 180 + 1050 + 100)
  if (!alive()) return
  for (const id of Object.keys(D.rel.nodes)) if (!shown[id]) { shown[id] = card('rel', id, false); shown[id].a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' }) }
  const mid = { x: F.w * frame.k / 2, y: F.h * frame.k / 2 }
  reveal('rel', mid, { duration: 1200 })
  await wait(1250)
  if (!alive()) return
  await settle('rel')
  await wait(2600)
  if (!alive()) return
  await backToDoc('rel', doc)
}

async function justScene(alive) {
  dots(2)
  const doc = docOf('judgment'), view = $('#yrw')
  await light([view], 0)
  await wait(300)
  if (!alive()) return
  const root = card('just', D.just.root), from = rel(view)
  park(root, from)
  words(root, view)
  toCanvas(doc)
  fly(root, from, { delay: 250, duration: 1200 })
  await wait(1350)
  if (!alive()) return
  D.just.heads.forEach((id, i) => fly(card('just', id, false), root.t, { delay: i * 110, duration: 900 }))
  const n = D.just.nodes[D.just.root]
  reveal('just', { x: (n.x + n.w / 2) * frame.k, y: (n.y + n.h / 2) * frame.k }, { delay: 150, duration: 1300 })
  await wait(D.just.heads.length * 110 + 1100)
  if (!alive()) return
  await settle('just')
  await wait(2600)
}

async function flowScene(alive) {
  dots(3)
  // the judgment's turn is over: the canvas folds back into a fresh spread, and the contract is on it
  const judg = docOf('judgment'), con = docOf('contract')
  const to = rel(spread), from = { x: frame.x, y: frame.y, w: F.w * frame.k, h: F.h * frame.k }
  for (const w of ['full', 'lines']) img('just', w).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'both' })
  canvas.getAnimations().forEach((a) => a.cancel())
  canvas.animate([{ transform: 'none', backgroundColor: canvasColor, opacity: 1 }, { transform: flipFrom(to, from), backgroundColor: PAPER, opacity: 1 }], { duration: 900, delay: 250, easing: ease, fill: 'both' })
  await wait(1100)
  canvas.getAnimations().forEach((a) => a.cancel())
  canvas.style.opacity = 0
  $$('.pg').forEach((p) => p.getAnimations().forEach((a) => a.cancel()))
  $$('.lit').forEach((e) => e.classList.remove('lit'))
  judg.getAnimations().forEach((a) => a.cancel())
  judg.style.visibility = 'hidden'
  con.style.visibility = 'visible'
  con.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: ease, fill: 'both' })
  await wait(500)
  await reading(con)
  if (!alive()) return
  const sn = Object.fromEntries([...con.querySelectorAll('.sn')].map((x) => [x.dataset.n, x]))
  await light(D.flow.order.map((id) => sn[id]), 80)
  if (!alive()) return
  const cards = D.flow.order.map((id) => ({ o: card('flow', id), from: rel(sn[id]), p: sn[id] }))
  cards.forEach(({ o, from, p }) => { park(o, from); words(o, p) })
  toCanvas(con)
  cards.forEach(({ o, from }, i) => fly(o, from, { delay: 250 + i * 70 }))
  reveal('flow', null, { delay: 800, duration: 1500 })
  await wait(250 + cards.length * 70 + 1150)
  if (!alive()) return
  await settle('flow')
  // walk the main line once
  const ring = document.createElement('div')
  ring.className = 'ring'
  stage.appendChild(ring)
  const pad = 5
  for (const [i, id] of D.flow.mainPath.entries()) {
    if (!alive()) return
    const t = T('flow', id)
    const box = { left: t.x - pad + 'px', top: t.y - pad + 'px', width: t.w + pad * 2 + 'px', height: t.h + pad * 2 + 'px' }
    if (i === 0) { Object.assign(ring.style, box); ring.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'both' }) }
    else ring.animate([{ left: ring.style.left, top: ring.style.top, width: ring.style.width, height: ring.style.height }, box], { duration: 300, easing: ease, fill: 'forwards' }).onfinish = () => Object.assign(ring.style, box)
    await wait(360)
  }
  ring.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 300, fill: 'both' })
  dots('all')
}

// ---------- running it
function reset() {
  $$('.actor,.chipfly,.ring').forEach((e) => e.remove())
  for (const e of [canvas, spread, ...spread.querySelectorAll('*'), ...canvas.querySelectorAll('img,.cam')]) e.getAnimations().forEach((a) => a.cancel())
  canvas.style.opacity = 0
  $$('.lit').forEach((e) => e.classList.remove('lit'))
  docOf('judgment').style.visibility = 'visible'
  docOf('contract').style.visibility = 'hidden'
  dots(-1)
  layout()
}

// `#from=3` in the address starts at that scene, for checking one scene alone
const FROM = +((location.hash.match(/from=(\d)/) || [])[1] || 1)

async function start() {
  const me = ++run, alive = () => me === run
  reset()
  if (reduce) { toCanvas(docOf('judgment')); img('fact', 'full').style.opacity = 1; return }
  if (FROM <= 3) await reading(docOf('judgment'))
  if (alive() && FROM <= 1) await factScene(alive)
  if (alive() && FROM <= 2) await relScene(alive)
  if (alive() && FROM <= 3) await justScene(alive)
  if (alive()) await flowScene(alive)
}

// the canvas colour is the colour of Antu's own canvas, read off the picture
const probe = new Image()
probe.onload = () => {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    const g = c.getContext('2d')
    g.drawImage(probe, 0, 0, 4, 4, 0, 0, 4, 4)
    const [r, gg, b] = g.getImageData(1, 1, 1, 1).data
    canvasColor = `rgb(${r},${gg},${b})`
  } catch { /* keep the default */ }
}
probe.src = img('fact', 'full').src

$('#replay').onclick = start
addEventListener('resize', () => { if (!run) layout() })
layout()
if (location.hash.includes('manual')) window.start = start
else setTimeout(start, 600)
