// ============================================================
//  tools/verify/embed.mjs — a diagram mounted in a host's page (`@zh-xx/antu/embed`, issue #152)
//
//  What spec/embed.md promises, looked at in a real browser: a host page with hostile CSS of its own and
//  two diagrams side by side, the bundle the package ships (dist-embed/antu-embed.js) loaded as a module.
//  The page is served over HTTP from 127.0.0.1 (an ES module does not load over file://); any request that
//  leaves that origin fails the check, as it does for the viewer page.
//    isolation   the host's CSS does not reach the diagram, the diagram's does not reach the host
//    globals     the host's title, language, window and localStorage are untouched
//    options     kind, kinds, theme, lang, ui
//    events      select (with the item's sources), kindchange, invalid
//    handle      ready, update, setKind/setTheme/setLang, exportPng, destroy and mounting again
//    the window  keys and outside clicks: the diagram answers its own and leaves the host's alone
// ============================================================

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildProcedureGraph } from '../../src/renderers/procedure/flow/layout.js'
import { buildRouteGraph } from '../../src/renderers/procedure/route/layout.js'
import { exportFrame } from '../../src/shell/exportPng.js'
import { translate } from '../../src/core/i18n.js'

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
  #a, #b, #c { width: 1000px; height: 640px; border: 0; }
  #probe { width: 100px; padding: 10px; border: 0; }
</style>
</head>
<body>
<div id="a"></div><div id="b"></div><div id="c"></div>
<div id="probe" tabindex="0"></div><input id="host-input">
<script type="module">
import { mount, validate, kindsOf } from './antu-embed.js'
const SPECS = ${JSON.stringify(specs).replace(/</g, '\\u003c')}
window.__events = { a: [], b: [], c: [] }
window.__api = { mount, validate, kindsOf, SPECS }
const on = (k) => (e) => window.__events[k].push(JSON.parse(JSON.stringify(e)))
const a = mount(document.getElementById('a'), SPECS.flow, { lang: 'zh', onEvent: on('a') })
const b = mount(document.getElementById('b'), SPECS.other, { lang: 'en', kind: 'route', theme: 'legal', ui: { header: false, minimap: false }, onEvent: on('b') })
const c = mount(document.getElementById('c'), { type: 'procedure', title: 'broken' }, { onEvent: on('c') })
window.__h = { a, b, c }
window.__invalid = await c.ready.then(() => null, (e) => e.errors ?? [])
await Promise.all([a.ready, b.ready])
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
      await browser.eval(`${S('a')}.querySelector('.antu-rtable-row')?.click()`)
      await wait(200)
      const rule = await browser.eval(`window.__events.a.filter((e) => e.type === 'select').at(-1) ?? null`)
      eq('embed: a row of the rule table is told as a rule', rule && [rule.collection, flow.rules.some((r) => r.id === rule.id)], ['rules', true])
    } else bad('embed: the flowchart example has no rules to click')

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
