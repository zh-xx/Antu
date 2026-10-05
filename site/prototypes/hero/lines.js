// Variant 2, "lines": every line of the page becomes a thin stroke. The strokes slide to one line:
// the marked ones open into their nodes, the rest are taken into the line.
const HOT = '#f0d9cf', PANEL = '#15171b'
const SH_A = 'inset 3px 0 0 #e8452c, inset 0 0 0 0 rgba(255,255,255,.12), 0 0 0 rgba(0,0,0,0)'
const SH_B = 'inset 0 0 0 0 #e8452c, inset 0 0 0 1px rgba(255,255,255,.14), 0 12px 34px rgba(0,0,0,.45)'

window.play = async (me, alive) => {
  await reading()
  if (!alive()) return
  const n = H.shown.length
  const axisR = rel($('#axis'))
  const axisX = axisR.x + 1
  const keyIdx = new Set(idx)

  // 1. every line of the page, key or not, becomes an object
  const pb = paper.getBoundingClientRect().bottom
  const lines = $$('.paper h2,.paper .meta,.paper h3,.paper p,#bul li').filter((el) => el.getBoundingClientRect().bottom <= pb - 4 || el.matches('#bul li') && keyIdx.has(+el.dataset.i)).map((el) => {
    const A = rel(el)
    const key = el.matches('#bul li') && keyIdx.has(+el.dataset.i)
    const k = key ? idx.indexOf(+el.dataset.i) : -1
    const actor = document.createElement('div')
    actor.className = 'actor'
    const B = key ? rel($('#c' + k)) : null
    actor.innerHTML = `<div class="txt" style="width:${A.w}px;height:${A.h}px">${el.innerHTML}</div>` + (key ? `<div class="face" style="width:${B.w}px;height:${B.h}px">${$('#c' + k).innerHTML}</div>` : '')
    Object.assign(actor.style, { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px', background: key ? HOT : 'transparent' })
    stage.appendChild(actor)
    el.style.visibility = 'hidden'
    return { el: actor, A, B, key, k, t: actor.querySelector('.t') }
  })
  await wait(300)
  if (!alive()) return

  // 2. the page lets go: text blurs out, each line becomes a stroke the length of its text
  lines.forEach((l, j) => {
    const txt = l.el.querySelector('.txt')
    txt.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(5px)' }], { duration: 420, delay: j * 25, fill: 'both', easing: 'ease-in' })
    l.el.animate([
      { height: l.A.h + 'px', top: l.A.y + 'px', backgroundColor: l.key ? HOT : 'rgba(29,27,23,0)', boxShadow: l.key ? SH_A : 'none' },
      { height: '3px', top: l.A.y + l.A.h / 2 - 1.5 + 'px', backgroundColor: l.key ? '#e8452c' : '#1d1b17', boxShadow: 'none' },
    ], { duration: 520, delay: j * 25, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'both' })
  })
  paper.classList.add('melt')
  paper.animate([{ transform: getComputedStyle(paper).transform, backgroundColor: '#f4f0e8', boxShadow: '0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06)' }, { transform: 'none', backgroundColor: 'rgba(244,240,232,0)', boxShadow: '0 0 0 rgba(0,0,0,0),0 0 0 1px rgba(255,255,255,0)' }], { duration: 900, delay: 300, fill: 'both', easing: 'cubic-bezier(.65,0,.2,1)' })
  await wait(900)
  if (!alive()) return

  // 3. the strokes slide to the line. Marked ones open into nodes, the others shrink into the line and are gone.
  const ease = 'cubic-bezier(.65,0,.2,1)', DUR = 1150, GAP = 130
  $('#axis').animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: DUR + GAP * n, delay: 150, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' })
  const others = lines.filter((l) => !l.key)
  others.forEach((l, j) => {
    const toY = axisR.y + axisR.h * ((j + 0.5) / others.length)
    l.el.animate([
      { left: l.A.x + 'px', width: l.A.w + 'px', top: l.A.y + l.A.h / 2 - 1.5 + 'px', opacity: 1 },
      { left: axisX - 3 + 'px', width: '6px', top: toY + 'px', opacity: 1, offset: 0.8 },
      { left: axisX - 3 + 'px', width: '6px', top: toY + 'px', opacity: 0 },
    ], { duration: DUR, delay: j * 40, easing: ease, fill: 'both' })
  })
  lines.filter((l) => l.key).forEach((l) => {
    const d = l.k * GAP
    l.el.animate([
      { left: l.A.x + 'px', top: l.A.y + l.A.h / 2 - 1.5 + 'px', width: l.A.w + 'px', height: '3px', backgroundColor: '#e8452c', borderRadius: '0px', boxShadow: SH_A },
      { left: axisX - 4 + 'px', top: l.B.y + l.B.h / 2 - 1.5 + 'px', width: '8px', height: '3px', backgroundColor: '#e8452c', borderRadius: '2px', boxShadow: SH_A, offset: 0.5 },
      { left: l.B.x + 'px', top: l.B.y + 'px', width: l.B.w + 'px', height: l.B.h + 'px', backgroundColor: PANEL, borderRadius: '10px', boxShadow: SH_B },
    ], { duration: DUR + 350, delay: d, easing: ease, fill: 'both' })
    l.el.querySelector('.face').animate([{ opacity: 0, filter: 'blur(5px)', transform: 'scale(1.05)' }, { opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }], { duration: 520, delay: d + DUR * 0.8, easing: 'ease-out', fill: 'both' })
    setTimeout(() => alive() && scramble(l.t), d + DUR * 0.85)
    setTimeout(() => { if (!alive()) return; const dot = $$('.dot')[l.k]; dot.style.opacity = 1; dot.classList.add('ping') }, d + DUR * 0.95)
  })
  await wait(DUR + 350 + GAP * n + 100)
  if (!alive()) return
  await ending()
}
