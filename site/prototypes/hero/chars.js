// Variant 3, "chars": the words of the marked sentence take apart and put themselves together as the node's text.
// Only characters that are really in the sentence move. What is not in the node falls away.
const HOT = '#f0d9cf', PANEL = '#15171b'
const SH_A = 'inset 3px 0 0 #e8452c, inset 0 0 0 0 rgba(255,255,255,.12), 0 0 0 rgba(0,0,0,0)'
const SH_B = 'inset 0 0 0 0 #e8452c, inset 0 0 0 1px rgba(255,255,255,.14), 0 12px 34px rgba(0,0,0,.45)'
const rnd = (a) => (Math.random() - 0.5) * 2 * a

// wrap each character of an element's text in a span (once), so each can be measured
function wrapChars(el) {
  if (el.dataset.w) return [...el.querySelectorAll('span.c')]
  const text = el.textContent
  el.textContent = ''
  for (const ch of text) { const s = document.createElement('span'); s.className = 'c'; s.textContent = ch; el.appendChild(s) }
  el.dataset.w = 1
  return [...el.querySelectorAll('span.c')]
}

window.play = async (me, alive) => {
  await reading()
  if (!alive()) return
  const n = H.shown.length, acts = []
  for (let i = 0; i < n; i++) {
    const li = $$('#bul li')[idx[i]], card = $('#c' + i)
    const A = rel(li), B = rel(card)
    // the sentence, again, on its own layer, each character in its own span, laid out exactly as it was
    const el = document.createElement('div')
    el.className = 'actor'
    el.innerHTML = `<div class="txt" style="width:${A.w}px;height:${A.h}px">${li.innerHTML}</div><div class="face" style="width:${B.w}px;height:${B.h}px">${card.innerHTML}</div>`
    Object.assign(el.style, { left: A.x + 'px', top: A.y + 'px', width: A.w + 'px', height: A.h + 'px' })
    stage.appendChild(el)
    const txt = el.querySelector('.txt')
    const src = wrapChars(txt)
    const sentence = [...li.textContent].join('')
    // where the node's time and label sit in the sentence (if they do)
    const pieces = []
    for (const key of ['t', 'l']) {
      const target = card.querySelector('.' + key)
      const text = target.dataset.t ?? target.textContent
      const at = [...sentence].join('').indexOf(text)
      pieces.push({ key, text, at, target, faceEl: el.querySelector('.face .' + key) })
    }
    li.style.visibility = 'hidden'
    acts.push({ el, A, B, src, sentence, pieces, li })
    el.animate([{ backgroundColor: 'rgba(240,217,207,0)' }, { backgroundColor: HOT }], { duration: 260, fill: 'both' })
    await wait(240)
    if (!alive()) return
  }
  await wait(350)

  const ease = 'cubic-bezier(.65,0,.2,1)', DUR = 1300, GAP = 150
  $$('.paper > *:not(.beam), #bul li').forEach((e) => e.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(6px)' }], { duration: 700, fill: 'both', easing: 'ease-in' }))
  paper.classList.add('melt')
  paper.animate([{ transform: getComputedStyle(paper).transform, backgroundColor: '#f4f0e8', boxShadow: '0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06)' }, { transform: 'none', backgroundColor: 'rgba(244,240,232,0)', boxShadow: '0 0 0 rgba(0,0,0,0),0 0 0 1px rgba(255,255,255,0)' }], { duration: 900, delay: 100, fill: 'both', easing: ease })
  $('#axis').animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: DUR + GAP * n * 0.9, delay: 500, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' })

  acts.forEach((o, i) => {
    const d = i * GAP
    // measure: where each character of the sentence is now, and where the node's characters will be
    const startPos = o.src.map((s) => rel(s))
    const used = new Set()
    // the box turns into the node
    o.el.animate([
      { left: o.A.x + 'px', top: o.A.y + 'px', width: o.A.w + 'px', height: o.A.h + 'px', backgroundColor: HOT, borderRadius: '3px', boxShadow: SH_A },
      { left: o.A.x * 0.55 + o.B.x * 0.45 + 'px', top: o.A.y * 0.55 + o.B.y * 0.45 - 24 + 'px', offset: 0.5 },
      { left: o.B.x + 'px', top: o.B.y + 'px', width: o.B.w + 'px', height: o.B.h + 'px', backgroundColor: PANEL, borderRadius: '10px', boxShadow: SH_B },
    ], { duration: DUR, delay: d, easing: ease, fill: 'both' })

    const moving = []
    for (const p of o.pieces) {
      if (p.at < 0) {
        // not in the sentence word for word (a range of times): this piece simply comes up
        p.faceEl.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 450, delay: d + DUR * 0.7, fill: 'both' })
        if (p.key === 't') setTimeout(() => alive() && scramble(p.faceEl), d + DUR * 0.7)
        continue
      }
      const tchars = wrapChars(p.target)
      const label = [...p.text]
      p.faceEl.style.opacity = 0
      label.forEach((ch, k) => {
        const si = [...o.sentence.slice(0, p.at)].length + k
        used.add(si)
        const from = startPos[si], to = rel(tchars[k])
        const m = document.createElement('span')
        m.className = 'mv'
        m.textContent = ch
        const big = p.key === 'l'
        Object.assign(m.style, { left: from.x + 'px', top: from.y + 'px', fontFamily: 'var(--sans)', fontSize: '12px', color: '#000', fontWeight: 500 })
        stage.appendChild(m)
        const cd = d + k * 22
        m.animate([
          { transform: 'translate(0,0)', fontSize: '12px', color: '#000', opacity: 0 },
          { transform: 'translate(0,0)', fontSize: '12px', color: '#000', opacity: 1, offset: 0.08 },
          { transform: `translate(${(to.x - from.x) * 0.5 + rnd(30)}px,${(to.y - from.y) * 0.5 - 30 + rnd(24)}px)`, fontSize: big ? '14px' : '12px', color: big ? '#f2efe9' : '#e8452c', offset: 0.5 },
          { transform: `translate(${to.x - from.x}px,${to.y - from.y}px)`, fontSize: big ? '15px' : '12px', color: big ? '#f2efe9' : '#e8452c', fontWeight: big ? 600 : 600, opacity: 1 },
        ], { duration: DUR, delay: cd, easing: ease, fill: 'both' })
        moving.push(m)
      })
      const done = d + DUR + label.length * 22
      setTimeout(() => {
        if (!alive()) return
        p.faceEl.style.opacity = 1
        if (p.key === 't') p.faceEl.textContent = p.text
      }, done)
      setTimeout(() => moving.forEach((m) => m.remove()), done + 90)
    }
    // everything else in the sentence falls away
    o.src.forEach((s, si) => {
      if (used.has(si)) { s.style.opacity = 0; return }
      s.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translate(${rnd(26)}px,${18 + Math.random() * 26}px) rotate(${rnd(25)}deg)`, filter: 'blur(4px)' }], { duration: 650, delay: d + Math.random() * 250, easing: 'ease-in', fill: 'both' })
    })
    // whatever is left of the sentence (its ellipsis too) is gone by the time the node has settled
    o.el.querySelector('.txt').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: d + 700, fill: 'both' })
    // the used characters leave their place at once, they are on the move
    o.src.forEach((s, si) => { if (used.has(si)) s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: d, fill: 'both' }) })
    // the rest of the node (sources) comes up last
    o.el.querySelector('.face .s').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: d + DUR * 0.8, fill: 'both', easing: 'ease-out' })
    o.el.querySelector('.face').animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, fill: 'both' })
    setTimeout(() => { if (!alive()) return; const dot = $$('.dot')[i]; dot.style.opacity = 1; dot.classList.add('ping') }, d + DUR * 0.9)
  })
  await wait(DUR + GAP * n + 800)
  if (!alive()) return
  await ending()
}
