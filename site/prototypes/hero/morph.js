// Variant 1, "morph": each marked sentence turns itself into its node. The rest of the page gives way.
const HOT = '#f0d9cf', PANEL = '#15171b'
const SH_A = 'inset 3px 0 0 #e8452c, inset 0 0 0 0 rgba(255,255,255,.12), 0 0 0 rgba(0,0,0,0)'
const SH_B = 'inset 0 0 0 0 #e8452c, inset 0 0 0 1px rgba(255,255,255,.14), 0 12px 34px rgba(0,0,0,.45)'

function actorFor(i) {
  const li = $$('#bul li')[idx[i]], card = $('#c' + i)
  const A = rel(li), B = rel(card)
  const el = document.createElement('div')
  el.className = 'actor'
  el.innerHTML = `<div class="txt" style="width:${A.w}px;height:${A.h}px">${li.innerHTML}</div><div class="face" style="width:${B.w}px;height:${B.h}px">${card.innerHTML}</div>`
  Object.assign(el.style, { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px' })
  stage.appendChild(el)
  li.style.visibility = 'hidden'
  return { el, A, B, t: el.querySelector('.t') }
}

window.play = async (me, alive) => {
  await reading()
  if (!alive()) return
  const n = H.shown.length, act = []
  for (let i = 0; i < n; i++) {
    const o = actorFor(i)
    act.push(o)
    o.el.animate([{ backgroundColor: 'rgba(240,217,207,0)' }, { backgroundColor: HOT }], { duration: 260, fill: 'both' })
    await wait(240)
    if (!alive()) return
  }
  await wait(350)
  const ease = 'cubic-bezier(.65,0,.2,1)', DUR = 1250, GAP = 150
  $$('.paper > *:not(.beam), #bul li').forEach((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 700, fill: 'both', easing: 'ease-in' }))
  paper.classList.add('melt')
  paper.animate([{ transform: getComputedStyle(paper).transform, backgroundColor: '#f4f0e8', boxShadow: '0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06)' }, { transform: 'none', backgroundColor: 'rgba(244,240,232,0)', boxShadow: '0 0 0 rgba(0,0,0,0),0 0 0 1px rgba(255,255,255,0)' }], { duration: 900, delay: 100, fill: 'both', easing: ease })
  $('#axis').animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: DUR + GAP * n * 0.9, delay: 500, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' })
  act.forEach((o, i) => {
    const d = i * GAP
    o.el.animate([
      { left: o.A.x + 'px', top: o.A.y + 'px', width: o.A.w + 'px', height: o.A.h + 'px', backgroundColor: HOT, borderRadius: '3px', boxShadow: SH_A },
      { left: o.A.x * 0.55 + o.B.x * 0.45 + 'px', top: o.A.y * 0.55 + o.B.y * 0.45 - 24 + 'px', offset: 0.5 },
      { left: o.B.x + 'px', top: o.B.y + 'px', width: o.B.w + 'px', height: o.B.h + 'px', backgroundColor: PANEL, borderRadius: '10px', boxShadow: SH_B },
    ], { duration: DUR, delay: d, easing: ease, fill: 'both' })
    o.el.querySelector('.txt').animate([{ opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }, { opacity: 0, filter: 'blur(5px)', transform: 'scale(.9)' }], { duration: DUR * 0.4, delay: d + 80, easing: 'ease-in', fill: 'both' })
    o.el.querySelector('.face').animate([{ opacity: 0, filter: 'blur(5px)', transform: 'scale(1.06)' }, { opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }], { duration: DUR * 0.5, delay: d + DUR * 0.45, easing: 'ease-out', fill: 'both' })
    setTimeout(() => alive() && scramble(o.t), d + DUR * 0.5)
    setTimeout(() => { if (!alive()) return; const dot = $$('.dot')[i]; dot.style.opacity = 1; dot.classList.add('ping') }, d + DUR * 0.9)
  })
  await wait(DUR + GAP * n + 150)
  if (!alive()) return
  await ending()
}
