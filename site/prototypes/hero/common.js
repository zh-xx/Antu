// Shared by the three hero animations: the page, the reset, the final picture, replay and autoplay.
// Each variant file defines `play(me)`; this file runs it.
const H = window.__HERO__
const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const stage = $('#stage'), paper = $('#paper')
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const idx = H.shown.map((s) => H.bullets.indexOf(s.line))
let run = 0

const cancel = (e) => e.getAnimations().forEach((a) => a.cancel())
const rel = (el) => {
  const a = el.getBoundingClientRect(), b = stage.getBoundingClientRect()
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }
}

function reset() {
  $$('.actor, .mv, .rule').forEach((e) => e.remove())
  $$('#bul li, .paper > *:not(.beam)').forEach((e) => { cancel(e); e.style.visibility = ''; e.style.opacity = 1; e.classList.remove('on', 'done') })
  $$('.dot').forEach((d) => { cancel(d); d.style.opacity = 0; d.classList.remove('ping') })
  ;[$('#big'), $('#axis'), $('#stamp'), $('#cap'), paper].forEach(cancel)
  $('#axis').style.transform = 'scaleY(0)'
  for (const id of ['#stamp', '#cap', '#big']) $(id).style.opacity = 0
  paper.classList.remove('melt')
  $$('.card').forEach((c) => (c.style.visibility = 'hidden'))
}

function final() {
  $$('.dot').forEach((d) => (d.style.opacity = 1))
  $('#axis').style.transform = 'none'
  for (const id of ['#cap', '#big']) $(id).style.opacity = 1
  $('#stamp').style.opacity = 0.95
  paper.style.opacity = 0
  $$('.card').forEach((c) => (c.style.visibility = 'visible'))
}

// the page is read: a beam sweeps down it and the text comes up as the beam passes
async function reading() {
  const pr = paper.getBoundingClientRect()
  $$('.paper h2,.paper .meta,.paper h3,.paper p,#bul li').forEach((e) => {
    const y = e.getBoundingClientRect().top - pr.top
    e.animate([{ opacity: 0.12 }, { opacity: 1 }], { duration: 350, delay: 300 + (y / pr.height) * 1500, fill: 'both' })
  })
  $('#beam').animate([{ top: '-70px', opacity: 1 }, { top: pr.height + 'px', opacity: 1 }], { duration: 1800, delay: 300, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => ($('#beam').style.opacity = 0)
  await wait(2200)
}

// the last beat: the stamp, the number, the caption
async function ending() {
  $('#stamp').animate([{ opacity: 0, transform: 'rotate(-9deg) scale(2.2)' }, { opacity: 0.95, transform: 'rotate(-9deg) scale(.94)', offset: 0.7 }, { opacity: 0.95, transform: 'rotate(-9deg) scale(1)' }], { duration: 520, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'both' })
  $('#big').animate([{ opacity: 0, transform: 'translateY(-46%)' }, { opacity: 1, transform: 'translateY(-50%)' }], { duration: 800, easing: 'ease-out', fill: 'both' })
  await wait(300)
  $('#cap').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'both' })
}

// digits roll for a moment, then settle on the real time
async function scramble(el) {
  const to = el.dataset.t, t0 = performance.now()
  await new Promise((res) => {
    ;(function f(now) {
      const k = Math.min(1, (now - t0) / 420)
      el.textContent = [...to].map((ch, i) => (/[0-9]/.test(ch) && i / to.length > k ? Math.floor(Math.random() * 10) : ch)).join('')
      if (k < 1) requestAnimationFrame(f)
      else res()
    })(t0)
  })
}

async function start() {
  const me = ++run
  reset()
  if (reduce) return final()
  await window.play(me, () => me === run)
}

$('#replay').onclick = start
if (location.hash === '#manual') window.start = start
else if (innerHeight > stage.getBoundingClientRect().top + 200) setTimeout(start, 500)
else {
  const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { io.disconnect(); setTimeout(start, 400) } }, { threshold: 0.3 })
  io.observe(stage)
}
