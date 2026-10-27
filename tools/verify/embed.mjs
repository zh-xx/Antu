// ============================================================
//  tools/verify/embed.mjs — a diagram mounted in a host's page (`@zh-xx/antu/embed`, issue #152)
//
//  What spec/embed.md promises, looked at in a real browser: a host page with hostile CSS of its own and
//  two diagrams side by side, the bundle the package ships (dist-embed/antu-embed.js) loaded as a module.
//  The page is served over HTTP from 127.0.0.1 (an ES module does not load over file://); any request that
//  leaves that origin fails the check, as it does for the viewer page.
//    isolation   the host's CSS does not reach the diagram, the diagram's does not reach the host
//    globals     the host's title, language, window and localStorage are untouched
//    options     kind, kinds, theme, lang, ui, cardUi (quiet chrome + wheel does not pan)
//    view state  initial, locked, persist: what a host configures and what a reader may change (issue 200)
//    events      select (with the item's sources), kindchange, invalid
//    handle      ready, update, setKind/setTheme/setLang, exportPng, destroy and mounting again
//    asking      select, focus and highlight by the spec's ids; initial.headerFolded
//    the window  keys and outside clicks: the diagram answers its own and leaves the host's alone
// ============================================================

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildProcedureGraph } from '../../src/renderers/procedure/flow/layout.js'
import { buildRouteGraph } from '../../src/renderers/procedure/route/layout.js'
import { exportFrame } from '../../src/shell/exportPng.js'
import { translate } from '../../src/core/i18n.js'
import { specKeyOf } from '../../src/shell/prefs.js'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** A static server for the test page and the bundle; resolves to its origin */
function serve(files) {
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = files[name]
    if (!file) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': file.type }).end(file.body)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })))
}

/** The host page: CSS that would wreck the diagram if it got in, two hosts, a focusable element and an input of its own */
function hostPage(specs) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Host page</title>
<style>
  * { font-family: serif !important; color: rgb(255, 0, 0); }
  div { border: 3px solid rgb(0, 255, 0); }
  .antu-app { display: none !important; }
  .react-flow__node { outline: 5px solid rgb(0, 0, 255); }
  #a, #b, #c, #d { width: 1000px; height: 640px; border: 0; }
  #probe { width: 100px; padding: 10px; border: 0; }
</style>
</head>
<body>
<div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div>
<div id="probe" tabindex="0"></div><input id="host-input">
<script type="module">
import { mount, validate, kindsOf, cardUi, kindIcon, kindLabel } from './antu-embed.js'
const SPECS = ${JSON.stringify(specs).replace(/</g, '\\u003c')}
window.__events = { a: [], b: [], c: [], d: [] }
window.__api = { mount, validate, kindsOf, cardUi, kindIcon, kindLabel, SPECS }
const on = (k) => (e) => window.__events[k].push(JSON.parse(JSON.stringify(e)))
const a = mount(document.getElementById('a'), SPECS.flow, { lang: 'zh', onEvent: on('a') })
const b = mount(document.getElementById('b'), SPECS.other, { lang: 'en', kind: 'route', theme: 'legal', ui: { header: false, minimap: false }, onEvent: on('b') })
const c = mount(document.getElementById('c'), { type: 'procedure', title: 'broken' }, { onEvent: on('c') })
const d = mount(document.getElementById('d'), SPECS.flow, { lang: 'zh', ui: { ...cardUi }, onEvent: on('d') })
window.__h = { a, b, c, d }
window.__invalid = await c.ready.then(() => null, (e) => e.errors ?? [])
await Promise.all([a.ready, b.ready, d.ready])
window.__drawn = true
</script>
</body>
</html>
`
}

/**
 * @param t  the verifier's assertions and its browser: { ok, bad, eq, truthy, section, launchBrowser, findChrome, OUT, REPO }
 */
export async function checkEmbed(t) {
  const { bad, eq, truthy, section, launchBrowser, findChrome, OUT, REPO } = t
  section('embed: a diagram mounted in a host page (@zh-xx/antu/embed)')
  if (!findChrome()) {
    bad('no usable Chrome, skipped', 'install Chrome, or point ANTU_CHROME at the browser you already have')
    return
  }
  let bundle
  try {
    bundle = readFileSync(join(REPO, 'dist-embed/antu-embed.js'))
  } catch {
    bad('embed: the bundle is not built', 'npm run build:embed')
    return
  }
  const read = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'))
  // a flowchart with rules and sources whose loc names clauses, and a second diagram to sit beside it
  const flow = read('examples/procedure/01-software-development-contract.zh-CN.json')
  const flowKey = specKeyOf(flow)
  const other = read('examples/procedure/02-purchase-contract.en.json')
  const renamed = { ...flow, title: `${flow.title} (v2)` }
  const page = hostPage({ flow, other, renamed })
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'embed-host.html'), page)
  const { server, origin } = await serve({
    '/': { type: 'text/html; charset=utf-8', body: page },
    '/antu-embed.js': { type: 'text/javascript; charset=utf-8', body: bundle },
  })
  const browser = await launchBrowser({ width: 1200, height: 1500 })
  // Every check reads inside the hosts' shadow roots; `S(id)` is that root. The expressions are fixed text:
  // no value is spliced into code sent to the page (data the page needs is in its own SPECS)
  const ROOTS = {
    a: "document.getElementById('a').shadowRoot",
    b: "document.getElementById('b').shadowRoot",
    c: "document.getElementById('c').shadowRoot",
    d: "document.getElementById('d').shadowRoot",
  }
  const S = (id) => ROOTS[id]
  try {
    await browser.open(`${origin}/`, { waitFor: 'window.__drawn === true' })
    truthy('embed: both diagrams report ready', await browser.eval('window.__drawn === true'))
    eq('embed: no request leaves the page\'s own origin', browser.requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:')), [])

    // ---- drawn, each in its own shadow root ----
    const g = buildProcedureGraph(flow, {})
    const pnodes = g.nodes.filter((n) => n.type === 'pnode').length
    eq('embed: the flowchart draws one box per node, inside its shadow root', await browser.eval(`${S('a')}.querySelectorAll('.antu-pn').length`), pnodes)
    eq('embed: nothing of the diagram is in the host\'s document', await browser.eval(`document.querySelectorAll('.antu-app, .react-flow, .antu-pn').length`), 0)
    truthy('embed: the second diagram opens in the kind it was given (route)', (await browser.eval(`${S('b')}.querySelectorAll('.antu-rt-label').length`)) > 0)
    eq('embed: the second diagram is in the theme it was given', await browser.eval(`${S('b')}.querySelector('.antu-app')?.dataset.theme`), 'legal')

    // ---- isolation both ways ----
    const style = await browser.eval(`(() => {
      const app = ${S('a')}.querySelector('.antu-app'), node = ${S('a')}.querySelector('.react-flow__node')
      const cs = (el) => getComputedStyle(el)
      return { display: cs(app).display, font: cs(app).fontFamily, colour: cs(${S('a')}.querySelector('.antu-pn')).color,
        border: cs(${S('a')}.querySelector('.antu-pn')).borderTopColor, outline: cs(node).outlineColor,
        height: app.getBoundingClientRect().height, probe: cs(document.getElementById('probe')).boxSizing }
    })()`)
    truthy('embed: the host\'s `.antu-app { display: none }` does not reach in', style.display !== 'none', style.display)
    truthy('embed: the host\'s font does not reach in', !/^serif$/i.test(style.font.trim()), style.font)
    truthy('embed: the host\'s colour does not reach in', style.colour !== 'rgb(255, 0, 0)', style.colour)
    truthy('embed: the host\'s div border does not reach in', style.border !== 'rgb(0, 255, 0)', style.border)
    truthy('embed: the host\'s node outline does not reach in', style.outline !== 'rgb(0, 0, 255)', style.outline)
    eq('embed: the diagram is as tall as its host element, not the window', Math.round(style.height), 640)
    eq('embed: the diagram\'s `* { box-sizing }` does not reach the host', style.probe, 'content-box')

    // ---- globals ----
    const globals = await browser.eval(`({ title: document.title, lang: document.documentElement.lang, antuLang: document.documentElement.dataset.antuLang ?? null,
      spec: typeof window.__ANTU_SPEC__, preset: typeof window.__ANTU_PRESET__, stored: localStorage.length })`)
    eq('embed: the host\'s title, language, window and storage are untouched', globals, { title: 'Host page', lang: 'fr', antuLang: null, spec: 'undefined', preset: 'undefined', stored: 0 })

    // ---- options ----
    const ui = await browser.eval(`({ aHeader: !!${S('a')}.querySelector('.antu-header'), bHeader: !!${S('b')}.querySelector('.antu-header'),
      bMinimap: !!${S('b')}.querySelector('.react-flow__minimap'), bZoom: !!${S('b')}.querySelector('.react-flow__controls'),
      aDock: !!${S('a')}.querySelector('.antu-dock') })`)
    eq('embed: `ui` leaves out what the host turned off, and only that', ui, { aHeader: true, bHeader: false, bMinimap: false, bZoom: true, aDock: true })
    truthy('embed: `lang` sets the page\'s own words (zh)', (await browser.eval(`${S('a')}.querySelector('.antu-header')?.textContent || ''`)).includes(translate('zh', 'graphKind.flow')))

    // ---- cardUi: quiet chrome + wheel does not pan or cancel (spec/dsh-plugin.md P1) ----
    const card = await browser.eval(`(() => {
      const root = ${S('d')}
      const chrome = {
        header: !!root.querySelector('.antu-header'),
        capsule: !!root.querySelector('.antu-dock'),
        minimap: !!root.querySelector('.react-flow__minimap'),
        zoom: !!root.querySelector('.react-flow__controls'),
        nodes: root.querySelectorAll('.antu-pn').length,
      }
      const pane = root.querySelector('.react-flow__pane')
      const vp = root.querySelector('.react-flow__viewport')
      const before = vp?.style.transform || ''
      // dispatchEvent returns false when a listener called preventDefault — that would
      // block the host page from scrolling even when the diagram itself does not pan.
      const wheelOk = pane
        ? pane.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }))
        : false
      const after = vp?.style.transform || ''
      return { chrome, before, after, wheelOk, cardUi: window.__api.cardUi }
    })()`)
    eq('embed: cardUi turns off the page chrome', card.chrome, {
      header: false, capsule: false, minimap: false, zoom: false, nodes: pnodes,
    })
    eq('embed: cardUi.panOnScroll is false', card.cardUi?.panOnScroll, false)
    eq('embed: with cardUi a wheel over the pane does not pan the diagram', card.after, card.before)
    eq('embed: with cardUi a wheel over the pane is not cancelled (host page can scroll)', card.wheelOk, true)

    // ---- the host's own kind picker: a sketch and a name for each kind of the type (issue 210) ----
    const picker = await browser.eval(`(() => {
      const kinds = window.__api.kindsOf('relationship')
      return {
        kinds,
        icons: kinds.map((k) => /^<svg [^>]*viewBox="0 0 80 48"/.test(window.__api.kindIcon(k) || '')),
        zh: kinds.map((k) => window.__api.kindLabel(k, 'zh')),
        en: kinds.map((k) => window.__api.kindLabel(k, 'en')),
        unknown: [window.__api.kindIcon('nope'), window.__api.kindLabel('nope', 'en')],
      }
    })()`)
    truthy('embed: kindIcon and kindLabel are exported: a sketch and a name, in both languages, for every kind of a type', picker.kinds.length > 1 && picker.icons.every(Boolean) && picker.zh.every(Boolean) && picker.en.every(Boolean) && picker.zh.join() !== picker.en.join(), JSON.stringify(picker).slice(0, 200))
    eq('embed: an unknown kind gives null for both', picker.unknown, [null, null])

    // ---- themechange: told for the host's own setTheme and for the reader's click, not for what did not change ----
    const themeEvents = () => browser.eval(`window.__events.a.filter((e) => e.type === 'themechange').map((e) => e.theme)`)
    await browser.eval(`window.__h.a.setTheme('modern'); window.__h.a.setTheme('modern')`)
    await new Promise((r) => setTimeout(r, 400))
    const afterHost = await themeEvents()
    await browser.eval(`(() => { const btn = [...${S('a')}.querySelectorAll('.antu-header-themeopt')].find((b) => b.getAttribute('aria-pressed') === 'false'); btn?.click() })()`)
    await new Promise((r) => setTimeout(r, 400))
    const afterReader = await themeEvents()
    eq('embed: setTheme tells the host once, and a theme it already has tells nothing', afterHost, ['modern'])
    truthy('embed: the reader picking another theme in the label card tells the host too', afterReader.length === 2 && afterReader[1] !== 'modern', JSON.stringify(afterReader))

    // ---- fit after a host resize: the fit reads the element's own size, not React Flow's observed one ----
    // The host narrows the element and asks for a fit in the same tick, before React Flow's own observer has run
    // (a side panel that goes from full screen to a split does the same one frame apart). A fit taken from React
    // Flow's old width left the picture cut off on the right.
    await browser.eval(`(() => {
      document.getElementById('d').style.width = '300px'
      window.__h.d.fitView()
    })()`)
    await new Promise((r) => setTimeout(r, 900))
    const refit = await browser.eval(`(() => {
      const el = document.getElementById('d')
      const root = ${S('d')}
      const rights = [...root.querySelectorAll('.antu-pn')].map((n) => n.getBoundingClientRect().right)
      return { over: Math.round(Math.max(...rights) - el.getBoundingClientRect().right), nodes: rights.length }
    })()`)
    truthy('embed: a fit asked in the tick a host narrows the element still shows the whole diagram', refit.nodes > 0 && refit.over <= 0, `${refit.over}px past the right edge`)

    // ---- invalid ----
    const invalid = await browser.eval('window.__invalid')
    truthy('embed: an invalid spec refuses `ready` with its problems', Array.isArray(invalid) && invalid.length > 0, JSON.stringify(invalid)?.slice(0, 120))
    eq('embed: and the host hears `invalid` with the same problems', await browser.eval(`window.__events.c.filter((e) => e.type === 'invalid').map((e) => e.errors)`), [invalid])
    eq('embed: and draws no diagram', await browser.eval(`${S('c')}.querySelectorAll('.react-flow').length`), 0)

    // ---- a type that is a way of drawing, and kinds that are not the type's (review of #153) ----
    const wrong = await browser.eval(`(async () => {
      const host = document.createElement('div')
      host.style.height = '300px'
      document.body.append(host)
      const events = []
      const h = window.__api.mount(host, { type: 'flow', title: 'kind as type' }, { onEvent: (e) => events.push(e.type) })
      const timeout = new Promise((r) => setTimeout(() => r('still waiting after 5 s'), 5000))
      const settled = await Promise.race([h.ready.then(() => 'resolved', (e) => (e.errors ?? []).join(' ')), timeout])
      h.destroy()
      const refuse = (spec, options) => { try { window.__api.mount(host, spec, options); return 'mounted' } catch (e) { return e.message } }
      const flow = window.__api.SPECS.flow
      const out = {
        settled, events,
        kind: refuse(flow, { kind: 'matrix' }),
        kinds: refuse(flow, { kinds: ['flow', 'nope'] }),
        notIn: refuse(flow, { kind: 'route', kinds: ['flow'] }),
        left: host.shadowRoot.childElementCount,
      }
      host.remove()
      return out
    })()`, { awaitPromise: true })
    truthy('embed: a way of drawing written as the type refuses ready at once, naming the type', wrong.settled.includes('"type": "procedure"'), wrong.settled)
    eq('embed: and the host hears invalid', wrong.events, ['invalid'])
    eq('embed: a kind that is not the type\'s makes mount throw, naming the field', [wrong.kind, wrong.kinds, wrong.notIn].map((m) => m.split(':')[1]?.trim().split(' ')[0]), ['options.kind', 'options.kinds', 'options.kind'])
    truthy('embed: and says which kinds there are', wrong.kind.includes('flow, route'), wrong.kind)
    eq('embed: a refused mount leaves nothing on the element', wrong.left, 0)
    const recovered = await browser.eval(`(async () => {
      const c = window.__h.c
      const refused = await c.exportPng().then(() => false, (e) => Array.isArray(e.errors) && e.errors.length > 0)
      c.update(window.__api.SPECS.other)
      const blob = await c.exportPng()
      return { refused, png: blob.type, drawn: ${S('c')}.querySelectorAll('.antu-pn').length > 0 }
    })()`, { awaitPromise: true })
    eq('embed: exportPng is refused while the spec is invalid, and works once update gives a valid one', recovered, { refused: true, png: 'image/png', drawn: true })

    // ---- select ----
    // the node is named by its place in the page's own copy of the spec, so its id is never written into the code
    const at = flow.nodes.findIndex((n) => Array.isArray(n.sourceIds) && n.sourceIds.length)
    const withSource = flow.nodes[at]
    const clicked = await browser.eval(`((i) => {
      const id = window.__api.SPECS.flow.nodes[i].id
      const el = [...${S('a')}.querySelectorAll('.react-flow__node')].find((n) => n.dataset.id === id)
      el?.click()
      return !!el
    })(${Number(at)})`)
    await wait(200)
    const sel = await browser.eval(`window.__events.a.filter((e) => e.type === 'select').at(-1) ?? null`)
    truthy('embed: a node is there to click', clicked)
    eq('embed: clicking a node tells the host which item it is, with its sources', sel && { id: sel.id, collection: sel.collection, sourceIds: sel.sourceIds, locs: sel.sources.map((s) => s.loc) },
      { id: withSource.id, collection: 'nodes', sourceIds: withSource.sourceIds, locs: withSource.sourceIds.map((id) => flow.sources.find((s) => s.id === id)?.loc) })
    await browser.eval(`${S('a')}.querySelector('.react-flow__pane')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
    await wait(200)
    eq('embed: clicking the empty canvas tells the host nothing is pinned', await browser.eval(`(() => { const e = window.__events.a.filter((e) => e.type === 'select').at(-1); return e ? e.id : 'no event' })()`), null)
    if (Array.isArray(flow.rules) && flow.rules.length) {
      // the rule table is off by default (issue 235): switch it on in this diagram first
      await browser.eval(`[...${S('a')}.querySelectorAll('.antu-dock-chip')].find((c) => c.textContent.trim() === ${JSON.stringify(translate('zh', 'flow.rules'))})?.click()`, { userGesture: true })
      await wait(300)
      await browser.eval(`${S('a')}.querySelector('.antu-rtable-row')?.click()`)
      await wait(200)
      const rule = await browser.eval(`window.__events.a.filter((e) => e.type === 'select').at(-1) ?? null`)
      eq('embed: a row of the rule table is told as a rule', rule && [rule.collection, flow.rules.some((r) => r.id === rule.id)], ['rules', true])
    } else bad('embed: the flowchart example has no rules to click')

    // ---- what the host asks for: select, focus, highlight (issue 164), initial (issue 165) ----
    // on a diagram of its own, so the counts of the checks above and below stay as they are
    const ruleAt = Array.isArray(flow.rules) && flow.rules.length ? 0 : -1
    const asked = await browser.eval(`(async (at, ruleAt, key) => {
      const pause = (ms) => new Promise((r) => setTimeout(r, ms))
      const host = document.createElement('div')
      host.style.cssText = 'width: 1000px; height: 640px'
      document.body.append(host)
      const flow = window.__api.SPECS.flow
      const id = flow.nodes[at].id, last = flow.nodes[flow.nodes.length - 1].id, rule = ruleAt < 0 ? null : flow.rules[ruleAt].id
      const events = []
      const refuse = (initial) => { try { window.__api.mount(host, flow, { initial }).destroy(); return 'mounted' } catch (e) { return e.message } }
      const refused = [refuse({ folded: true }), refuse({ headerFolded: 'yes' }), refuse([])]
      // the host's store says unfolded; initial says folded and wins (and the rule table is asked for, issue 235)
      const h = window.__api.mount(host, flow, { initial: { headerFolded: true, view: { flow: { rules: true } } }, prefs: { read: () => ({ headerFolded: { [key]: false } }), write: () => {} }, onEvent: (e) => events.push(e) })
      const early = h.select(id)
      await h.ready
      await pause(300)
      const root = host.shadowRoot
      const nodeEl = (x) => [...root.querySelectorAll('.react-flow__node')].find((n) => n.dataset.id === x)
      const ruleEl = (x) => [...root.querySelectorAll('.antu-rtable-row')].find((n) => n.dataset.pinId === 'rule:' + x)
      const ring = (el) => (el ? getComputedStyle(el).outlineStyle : 'missing')
      const lastSelect = () => events.filter((e) => e.type === 'select').at(-1)?.id
      const out = { refused, early, folded: !!root.querySelector('.antu-header-card.is-folded') }
      out.earlyPinned = [lastSelect() === id, nodeEl(id)?.querySelector('.antu-pn')?.getAttribute('aria-expanded')]
      out.unknown = h.select('no such item')
      out.unpin = [h.select(null), (await pause(200), lastSelect())]
      if (rule) {
        out.rule = [h.select(rule), (await pause(200), events.filter((e) => e.type === 'select').at(-1)?.collection), ruleEl(rule)?.getAttribute('aria-expanded')]
        h.select(null)
      }
      // focus: the item ends up in the middle of the host
      const box = host.getBoundingClientRect()
      out.focus = h.focus(last)
      await pause(600)
      const r = nodeEl(last).getBoundingClientRect()
      out.centred = Math.abs(r.left + r.width / 2 - (box.left + box.width / 2)) < 30 && Math.abs(r.top + r.height / 2 - (box.top + box.height / 2)) < 30
      out.focusUnknown = h.focus('no such item')
      // highlight: a ring on these and on nothing else, through a change of theme, until cleared; never in the export
      const bytes = async () => new Uint8Array(await (await h.exportPng({ pixelRatio: 1 })).arrayBuffer()).join(',')
      const plain = await bytes()
      h.highlight(rule ? [id, rule, 'no such item'] : [id, 'no such item'])
      await pause(200)
      out.ring = [ring(nodeEl(id)), rule ? ring(ruleEl(rule)) : 'solid', ring(nodeEl(last))]
      out.exportSame = (await bytes()) === plain
      h.setTheme('legal')
      await pause(300)
      out.ringAfterTheme = ring(nodeEl(id))
      out.ringColour = getComputedStyle(nodeEl(id)).outlineColor !== 'rgb(0, 0, 255)'
      h.highlight([])
      await pause(200)
      out.cleared = ring(nodeEl(id))
      out.badIds = (() => { try { h.highlight('x'); return 'accepted' } catch (e) { return e.name } })()
      // a kind no reader can pin anything in
      h.setKind('route')
      await pause(600)
      out.routeSelect = h.select(id)
      h.destroy()
      host.remove()
      return out
    })(${Number(at)}, ${Number(ruleAt)}, ${JSON.stringify(flowKey)})`, { awaitPromise: true })
    truthy('embed: initial refuses an unknown key, a value that is not a boolean, and a non-object', asked.refused.every((m) => m.includes('options.initial')), asked.refused.join(' | '))
    truthy('embed: initial.headerFolded opens the label card folded, over the stored choice', asked.folded)
    eq('embed: select before the diagram is drawn is kept, answered from the spec, then pins the card', [asked.early, ...asked.earlyPinned], [true, true, 'true'])
    eq('embed: select refuses an id that names no item', asked.unknown, false)
    eq('embed: select(null) unpins, and the host hears it', asked.unpin, [true, null])
    if (ruleAt >= 0) eq('embed: select pins a rule\'s row of the table', asked.rule, [true, 'rules', 'true'])
    eq('embed: focus brings the item to the middle of the view', [asked.focus, asked.centred], [true, true])
    eq('embed: focus refuses an id that names no item', asked.focusUnknown, false)
    eq('embed: highlight rings the items named (a node and a rule row) and nothing else', asked.ring, ['solid', 'solid', 'none'])
    eq('embed: the ring stays through a change of theme, in the diagram\'s colour, until highlight([])', [asked.ringAfterTheme, asked.ringColour, asked.cleared], ['solid', true, 'none'])
    eq('embed: the ring is not in exportPng', asked.exportSame, true)
    eq('embed: highlight refuses what is not an array of ids', asked.badIds, 'TypeError')
    eq('embed: in a kind that pins nothing (the route map) select says false', asked.routeSelect, false)

    // ---- the window is shared: keys and outside clicks ----
    const kindsBefore = await browser.eval(`window.__events.a.filter((e) => e.type === 'kindchange').length`)
    await browser.eval(`document.getElementById('probe').focus(); document.getElementById('probe').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }))`)
    await wait(300)
    eq('embed: the arrow keys in the host\'s page do not switch the diagram', await browser.eval(`window.__events.a.filter((e) => e.type === 'kindchange').length`), kindsBefore)
    await browser.eval(`${S('a')}.querySelector('.antu-app').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }))`)
    await wait(300)
    eq('embed: inside the diagram the arrow keys do', await browser.eval(`window.__events.a.filter((e) => e.type === 'kindchange').map((e) => e.kind)`), ['route'])
    // the kind picker: a press inside it must not count as outside (its target is the host, seen from the document)
    const picked = await browser.eval(`(async () => {
      const root = ${S('a')}
      root.querySelector('.antu-header-current')?.click()
      await new Promise((r) => setTimeout(r, 150))
      const cell = [...root.querySelectorAll('.antu-header-cell')].find((c) => !c.classList.contains('is-on'))
      if (!cell) return 'no panel'
      cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
      await new Promise((r) => setTimeout(r, 150))
      if (!cell.isConnected) return 'closed on press'
      cell.click()
      await new Promise((r) => setTimeout(r, 300))
      return window.__events.a.filter((e) => e.type === 'kindchange').at(-1)?.kind
    })()`, { awaitPromise: true })
    eq('embed: the kind picker inside the diagram takes a click', picked, 'flow')

    // ---- the handle ----
    eq('embed: setKind refuses a kind the type does not have', await browser.eval(`window.__h.a.setKind('timeline')`), false)
    eq('embed: setKind switches to one it has', await browser.eval(`window.__h.a.setKind('route')`), true)
    await wait(600)
    eq('embed: and the host hears it', await browser.eval(`window.__events.a.filter((e) => e.type === 'kindchange').at(-1)?.kind`), 'route')
    eq('embed: the other diagram did not move', await browser.eval(`window.__events.b.filter((e) => e.type === 'kindchange').length`), 0)
    eq('embed: setTheme', await browser.eval(`(async () => { window.__h.a.setTheme('modern'); await new Promise((r) => setTimeout(r, 200)); return ${S('a')}.querySelector('.antu-app').dataset.theme })()`, { awaitPromise: true }), 'modern')
    truthy('embed: setLang', await browser.eval(`(async () => { window.__h.a.setLang('en'); await new Promise((r) => setTimeout(r, 200)); return ${S('a')}.querySelector('.antu-header').textContent })()`, { awaitPromise: true }).then((s) => s.includes(translate('en', 'graphKind.route'))))
    const png = await browser.eval(`(async () => {
      const blob = await window.__h.a.exportPng()
      const head = [...new Uint8Array(await blob.slice(0, 8).arrayBuffer())]
      const bmp = await createImageBitmap(blob)
      return { type: blob.type, head, width: bmp.width, height: bmp.height }
    })()`, { awaitPromise: true })
    const rg = buildRouteGraph(flow, { t: (k, v) => translate('en', k, v) })
    const frame = exportFrame(rg.size.width, rg.size.height)
    eq('embed: exportPng hands back a PNG', [png.type, png.head.slice(0, 4)], ['image/png', [137, 80, 78, 71]])
    eq('embed: of the size the page\'s own export has: (content + padding) × 2', [png.width, png.height], [frame.width * 2, frame.height * 2])
    truthy('embed: and no download was started for it', (await browser.eval(`document.querySelectorAll('a[download]').length`)) === 0)
    eq('embed: update draws the new spec', await browser.eval(`(async () => { window.__h.a.update(window.__api.SPECS.renamed); await new Promise((r) => setTimeout(r, 400)); return ${S('a')}.querySelector('.antu-header-title')?.textContent })()`, { awaitPromise: true }), renamed.title)
    eq('embed: after all this the host\'s storage is still empty', await browser.eval('localStorage.length'), 0)
    eq('embed: the host page threw nothing', browser.errors ?? [], [])

    // ---- the host's element narrows and widens again (src/shell/dockPlace.js): the minimap gives way and comes back ----
    const resized = await browser.eval(`(async () => {
      const host = document.getElementById('a'), root = ${S('a')}
      const look = () => {
        const r = (s) => { const e = root.querySelector(s); if (!e) return null; const x = e.getBoundingClientRect(); return x.width ? x : null }
        const cap = r('.antu-dock-capsule .antu-dock-bar'), mini = r('.react-flow__minimap'), zoom = r('.react-flow__controls'), box = host.getBoundingClientRect()
        const hit = (a, b) => !!(a && b && a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5)
        return { minimap: !!mini, wrapped: !!root.querySelector('.antu-dock-capsule.is-wrapped'), clear: !hit(cap, mini) && !hit(cap, zoom), inside: !!cap && cap.left >= box.left - 0.5 && cap.right <= box.right + 0.5 }
      }
      const settle = () => new Promise((r) => setTimeout(r, 300))
      // Earlier steps turn Rules on, which brings the long "Restore…" chip (~200 px). Clear it first:
      // this check is about dockPlace, not about that chip staying on the bar.
      root.querySelector('.antu-dock-reset')?.click()
      await settle()
      // English flowchart capsule (conditions…rules + Sources + export) is ~1100 px; 1600 leaves room
      // for the minimap (same "wide" floor as checkDockClearance after issue 124).
      host.style.width = '520px'; await settle()
      const narrow = look()
      host.style.width = '1600px'; await settle()
      const wide = look()
      host.style.width = '1000px'
      return { narrow, wide }
    })()`, { awaitPromise: true })
    eq('embed: the host narrows to 520 px: the minimap gives way, the capsule wraps, clear and on the canvas', resized.narrow, { minimap: false, wrapped: true, clear: true, inside: true })
    eq('embed: and widens to 1600 px: the capsule is on one line again and the minimap comes back', resized.wide, { minimap: true, wrapped: false, clear: true, inside: true })

    // ---- a host configuring what the reader sees: initial, locked, persist (issue 200) ----
    const viewState = await browser.eval(`(async () => {
      const pause = (ms) => new Promise((r) => setTimeout(r, ms))
      const flow = window.__api.SPECS.flow
      const start = (options) => {
        const host = document.createElement('div')
        host.style.cssText = 'width: 1000px; height: 640px'
        document.body.append(host)
        return { host, h: window.__api.mount(host, flow, { lang: 'en', ...options }) }
      }
      const chip = (host, label) => [...host.shadowRoot.querySelectorAll('.antu-dock-chip')].find((c) => c.textContent.trim() === label)
      const off = ({ host, h }) => { h.destroy(); host.remove() }
      const out = {}

      // initial wins over the stored choice
      {
        const it = start({ initial: { view: { flow: { states: true } } }, prefs: { read: () => ({ flowFieldsByDiagram: { [${JSON.stringify(flowKey)}]: { states: false } } }), write: () => {} } })
        await it.h.ready; await pause(200)
        out.initialOn = !!chip(it.host, ${JSON.stringify(translate('en', 'flow.states'))})?.classList.contains('is-on')
        off(it)
      }

      // a locked switch offers no control
      {
        const it = start({ locked: { view: { flow: { states: true } } } })
        await it.h.ready; await pause(200)
        out.lockedHidden = !chip(it.host, ${JSON.stringify(translate('en', 'flow.states'))})
        off(it)
      }

      // the dock opens folded, and its one button brings the bar back
      {
        const it = start({ initial: { shell: { dockFolded: true } } })
        await it.h.ready; await pause(200)
        const root = it.host.shadowRoot
        out.folded = [!!root.querySelector('.antu-dock-open'), !!root.querySelector('.antu-dock-capsule .antu-dock-bar')]
        root.querySelector('.antu-dock-open')?.click()
        await pause(300)
        out.unfolded = [!!root.querySelector('.antu-dock-open'), !!root.querySelector('.antu-dock-capsule .antu-dock-bar')]
        off(it)
      }

      // persist false: the reader's click changes the screen but writes nothing to the host's store
      {
        const writes = []
        const it = start({ persist: false, prefs: { read: () => ({}), write: (p) => writes.push(p) } })
        await it.h.ready; await pause(200)
        // the rule table is off by default (issue 235), so the click turns it on
        chip(it.host, ${JSON.stringify(translate('en', 'flow.rules'))})?.click()
        await pause(200)
        out.persist = [writes.length, !!chip(it.host, ${JSON.stringify(translate('en', 'flow.rules'))})?.classList.contains('is-on')]
        off(it)
      }

      // "restore this diagram's defaults" (issue 236): it appears once the reader has changed something, forgets
      // the change, shows the built-in default again, and disappears
      {
        const it = start({})
        await it.h.ready; await pause(200)
        const restoreLabel = ${JSON.stringify(translate('en', 'dock.restore'))}
        const restore = () => [...it.host.shadowRoot.querySelectorAll('.antu-dock-chip')].find((c) => c.textContent.trim() === restoreLabel)
        const rules = () => chip(it.host, ${JSON.stringify(translate('en', 'flow.rules'))})
        // one switch that opens off (rules) and one that opens on (conditions): both must come back to their default
        const conditions = () => chip(it.host, ${JSON.stringify(translate('en', 'flow.conditions'))})
        const on = (c) => !!c?.classList.contains('is-on')
        const before = [!!restore(), on(rules()), on(conditions())]
        rules()?.click()
        await pause(300)
        conditions()?.click()
        await pause(300)
        const changed = [!!restore(), on(rules()), on(conditions())]
        restore()?.click()
        await pause(800)
        out.restore = [before, changed, [!!restore(), on(rules()), on(conditions())]]
        off(it)
      }

      // a locked key that is not one makes mount throw, naming options.locked
      {
        const host = document.createElement('div')
        host.style.height = '300px'
        document.body.append(host)
        out.badLocked = (() => { try { window.__api.mount(host, flow, { locked: { nope: true } }); return 'mounted' } catch (e) { return e.message } })()
        host.remove()
      }
      return out
    })()`, { awaitPromise: true })
    eq('embed: `initial` opens a switch on over the store\'s off', viewState.initialOn, true)
    eq('embed: a locked switch renders no control', viewState.lockedHidden, true)
    eq('embed: `initial` opens the dock folded (one button, no bar), and the button brings the bar back', [viewState.folded, viewState.unfolded], [[true, false], [false, true]])
    eq('embed: `persist: false` keeps the reader\'s change on screen and off the host\'s store', viewState.persist, [0, true])
    eq('embed: "restore defaults" shows once a choice is made, forgets it, and goes away', viewState.restore, [[false, false, true], [true, true, false], [false, false, true]])
    truthy('embed: an unknown `locked` key makes mount throw, naming options.locked', viewState.badLocked.includes('options.locked'), viewState.badLocked)

    // ---- destroy, and mount again on the same element ----
    const again = await browser.eval(`(async () => {
      window.__h.a.destroy()
      const left = ${S('a')}.childElementCount
      let twice = null
      const h = window.__api.mount(document.getElementById('a'), window.__api.SPECS.other, {})
      try { window.__api.mount(document.getElementById('a'), window.__api.SPECS.other, {}) } catch (e) { twice = e.message }
      await h.ready
      const drawn = ${S('a')}.querySelectorAll('.antu-pn').length
      h.destroy()
      return { left, twice: !!twice, drawn }
    })()`, { awaitPromise: true })
    eq('embed: destroy takes the diagram off; it mounts again; a second mount on a mounted element is refused', [again.left, again.twice, again.drawn > 0], [0, true, true])
    eq('embed: validate and kindsOf come with the bundle', await browser.eval(`[window.__api.validate(window.__api.SPECS.flow).ok, window.__api.validate({}).ok, window.__api.kindsOf('procedure')]`), [true, false, ['flow', 'route']])
  } catch (e) {
    bad('embed: the check itself failed', e.message)
  } finally {
    await browser.close()
    server.close()
  }
}
