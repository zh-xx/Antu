// ============================================================
//  src/embed/mount.js — a diagram inside a host's own window (issue 152)
//
//  `mount(el, spec, options)` draws one diagram into `el`, the same diagram the viewer page shows, and gives
//  back a handle. What it promises the host:
//    - its own React inside (the bundle carries it): the host's framework and React version do not matter;
//    - a shadow root on `el`, the stylesheet inside it: the host's CSS does not reach the diagram, and the
//      diagram's does not reach the host;
//    - no globals: nothing read from or written to the window, the document's title or language, or
//      localStorage unless `prefs` asks for it; two diagrams on one page do not know of each other;
//    - what the reader does reaches the host as events (`onEvent`).
//  The spec is the same JSON as everywhere else; the kind and the theme stay parameters of the drawing.
//  The contract is in spec/embed.md.
// ============================================================

import { listKinds } from '../core/registry.js'
import { isTheme } from '../theme/themes.js'
import { normalizeLang } from '../core/i18n.js'
import { itemOf } from '../core/items.js'
import { embeddedEnv } from '../shell/env.js'
import { renderDiagram } from './core.jsx'
import { toShadowCss } from './shadowCss.js'
import css from '../styles.css?inline'

let sheet = null
/** The stylesheet for a mounted diagram, made once per page */
const shadowCss = () => (sheet ??= toShadowCss(css))

/** The mark on the element a diagram is drawn into, so a second `mount` on the same host is refused */
const MOUNTED = 'antu-embed-root'

/**
 * What is wrong with `kind` and `kinds` for this spec ('' when nothing is): a name that is not a way of drawing
 * this type is refused, as `renderHtml` and `setKind` refuse it, rather than quietly drawn as another (issue 152).
 * A spec whose type is not known is left to the validation, which reports it as `invalid`.
 */
function kindOptionProblem(spec, { kind, kinds }) {
  const type = spec && typeof spec === 'object' ? spec.type : undefined
  const known = listKinds(type).map((k) => k.kind)
  if (!known.length) return ''
  const not = (name) => `"${name}" is not a kind of ${type}: ${known.join(', ')}`
  if (kind !== undefined && kind !== null && !known.includes(kind)) return `options.kind ${not(kind)}`
  if (kinds !== undefined) {
    if (!Array.isArray(kinds) || kinds.length === 0) return 'options.kinds must be a non-empty array of kinds'
    const bad = kinds.find((k) => !known.includes(k))
    if (bad !== undefined) return `options.kinds: ${not(bad)}`
    if (kind != null && !kinds.includes(kind)) return `options.kind "${kind}" is not in options.kinds (${kinds.join(', ')})`
  }
  return ''
}

/** What can be asked of how a diagram opens (`initial`), each with the test of its value */
const INITIAL = { headerFolded: (v) => typeof v === 'boolean' }

/** What is wrong with `initial` ('' when nothing is): an unknown key or a wrong value is refused, not ignored (issue 165) */
function initialProblem(initial) {
  if (initial === undefined) return ''
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) return 'options.initial must be an object'
  for (const [key, value] of Object.entries(initial)) {
    if (!INITIAL[key]) return `options.initial.${key} is not an option: ${Object.keys(INITIAL).join(', ')}`
    if (value !== undefined && !INITIAL[key](value)) return `options.initial.${key} must be a boolean`
  }
  return ''
}

/** Whether `id` is the id of an item of `spec` (a select or focus sent before the diagram is drawn is answered so) */
const isItem = (spec, id) => itemOf(spec, id)?.item.id === id

/**
 * @param {HTMLElement} el   the host's element; the diagram fills it, so it needs a height
 * @param {object} spec      the Antu JSON
 * @param {object} [options]
 * @param {string} [options.kind]       the kind it opens in, until the reader picks another
 * @param {string[]} [options.kinds]    the kinds the reader may pick from (one: the kind is fixed)
 * @param {'document'|'modern'|'legal'} [options.theme]  the theme it opens in
 * @param {'zh'|'en'} [options.lang]   the language of the page's own words (the case is never translated)
 * @param {{header?: boolean, capsule?: boolean, minimap?: boolean, zoom?: boolean}} [options.ui]
 *                                      pieces of the page's chrome to leave out (all shown by default)
 * @param {'none'|'local'|{read(): object, write(patch: object): void}} [options.prefs]
 *                                      where the reader's choices are kept: 'none' (default) while mounted
 *                                      only, 'local' in the viewer page's localStorage key, or the host's store
 * @param {{headerFolded?: boolean}} [options.initial]  how it opens, ahead of the reader's stored choices
 * @param {(event: object) => void} [options.onEvent]   select, kindchange, invalid (spec/embed.md)
 */
export function mount(el, spec, options = {}) {
  if (!el || typeof el.attachShadow !== 'function') throw new TypeError('antu mount: the first argument must be an element')
  // checked before anything is put on the element, so a refused mount leaves nothing behind
  const optionProblem = kindOptionProblem(spec, options) || initialProblem(options.initial)
  if (optionProblem) throw new Error(`antu mount: ${optionProblem}`)
  const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
  if (shadow.querySelector(`.${MOUNTED}`)) throw new Error('antu mount: a diagram is already mounted on this element; destroy it first')

  const style = document.createElement('style')
  style.textContent = shadowCss()
  const container = document.createElement('div')
  container.className = MOUNTED
  shadow.append(style, container)

  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null
  // a host's handler that throws must not break the drawing
  const emit = (event) => {
    if (!onEvent) return
    try {
      onEvent(event)
    } catch (e) {
      console.error('[antu] the onEvent handler threw:', e)
    }
  }

  let settle
  const ready = new Promise((resolve, reject) => {
    settle = { resolve, reject }
  })
  // nobody may be waiting on `ready`; a refusal no-one listens to must not be reported as unhandled
  ready.catch(() => {})
  const notValid = (errors) => Object.assign(new Error('antu: the diagram is not valid'), { errors })

  // `ready` is about the first drawing; what is on the element now is followed here, so that after an invalid
  // spec is replaced by a valid one (`update`), `exportPng` waits for the new drawing and does not fail for good.
  // An invalid spec takes the canvas away, so a valid one after it is a new canvas and reports `drawn` again.
  let settled = false
  let drawnNow = false
  let invalidNow = null
  let waiting = []
  const wake = (fn) => {
    const list = waiting
    waiting = []
    list.forEach(fn)
  }
  const whenDrawn = () => {
    if (drawnNow) return Promise.resolve()
    if (invalidNow) return Promise.reject(notValid(invalidNow))
    return new Promise((resolve, reject) => waiting.push({ resolve, reject }))
  }

  const env = embeddedEnv({
    prefs: options.prefs ?? 'none',
    root: shadow,
    ui: { ...(options.ui || {}) },
    initial: { ...(options.initial || {}) },
    emit: (event) => {
      if (event?.type === 'invalid') {
        drawnNow = false
        invalidNow = event.errors
        if (!settled) {
          settled = true
          settle.reject(notValid(event.errors))
        }
        wake((w) => w.reject(notValid(event.errors)))
      }
      emit(event)
    },
    drawn: () => {
      drawnNow = true
      invalidNow = null
      if (!settled) {
        settled = true
        settle.resolve()
      }
      wake((w) => w.resolve())
    },
  })

  const view = renderDiagram(container, { env })
  let current = {
    spec,
    kind: options.kind ?? null,
    kinds: Array.isArray(options.kinds) ? [...options.kinds] : null,
    theme: isTheme(options.theme) ? options.theme : undefined,
    lang: options.lang ? normalizeLang(options.lang) : undefined,
  }
  view.draw(current)

  let destroyed = false
  const alive = (what) => {
    if (destroyed) throw new Error(`antu: ${what} after destroy()`)
  }

  return {
    /** Resolves once the diagram is drawn and fitted; refused (with `.errors`) when the spec is not valid */
    ready,
    /** Draw another spec in the same place; the reader's choices for it are kept by its title */
    update(next) {
      alive('update')
      // the old spec's problems are not the new one's: wait for its drawing or its own `invalid`
      invalidNow = null
      current = { ...current, spec: next }
      view.draw(current)
    },
    /** Switch to a kind of the diagram's type (and of `kinds`, if given); false when it is not one */
    setKind(kind) {
      alive('setKind')
      const type = current.spec?.type
      const ok = listKinds(type).some((k) => k.kind === kind) && (!current.kinds || current.kinds.includes(kind))
      if (ok) env.commands.run('setKind', kind)
      return ok
    },
    /** Switch the theme; false when it is not one of the themes */
    setTheme(theme) {
      alive('setTheme')
      if (!isTheme(theme)) return false
      env.commands.run('setTheme', theme)
      return true
    },
    /** Switch the language of the page's own words; false when it is not one Antu speaks */
    setLang(lang) {
      alive('setLang')
      if (lang !== 'zh' && lang !== 'en') return false
      env.commands.run('setLang', lang)
      return true
    },
    /**
     * Pin the card of the item `id` of the spec, as if the reader had clicked it (the host hears `select`);
     * `null` unpins. False when no card of that item is drawn in this kind.
     */
    select(id) {
      alive('select')
      if (id !== null && typeof id !== 'string') return false
      const done = env.commands.run('select', id)
      // held until the diagram is drawn: answered from the spec
      return done === undefined ? id === null || isItem(current.spec, id) : done
    },
    /** Move the view to the item `id`, keeping the zoom unless it would not show it; false when it is not drawn */
    focus(id) {
      alive('focus')
      if (typeof id !== 'string') return false
      const done = env.commands.run('focus', id)
      return done === undefined ? isItem(current.spec, id) : done
    },
    /** Ring these items in the theme's colour until called again; `[]` clears. Ids that name no item are passed over */
    highlight(ids) {
      alive('highlight')
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new TypeError('antu highlight: ids must be an array of strings')
      env.highlight.set([...new Set(ids)])
    },
    /** Fit the whole diagram into view again */
    fitView() {
      alive('fitView')
      env.commands.run('fitView')
    },
    /**
     * The PNG of the diagram, as the page's own export makes it (no label card, a white margin), without
     * saving it. Waits until the spec now mounted is drawn; refused (with `.errors`) while it is not valid.
     * @param {{pixelRatio?: number}} [opts]  device pixels per design pixel, 2 by default
     * @returns {Promise<Blob>}
     */
    async exportPng({ pixelRatio } = {}) {
      alive('exportPng')
      await whenDrawn()
      const done = env.commands.run('exportPng', { pixelRatio })
      if (!done) throw new Error('antu: this kind has no picture to export')
      return (await done).blob
    },
    /** Take the diagram off the element; the element and its (empty) shadow root stay */
    destroy() {
      if (destroyed) return
      destroyed = true
      view.unmount()
      style.remove()
      container.remove()
    },
  }
}
