// ============================================================
//  src/shell/env.js — what one diagram on a page may take from around it (issue 152)
//
//  The viewer page is one diagram per window, so it used to read what it needs straight from the window: the
//  preset (window.__ANTU_PRESET__), the reader's preferences and the interface language (localStorage), the
//  document's title and language. Inside another application's window (`mount`, src/embed/) none of that is
//  Antu's to read or write: two diagrams on one page each have their own, and the host decides what is kept.
//
//  So every component asks this context instead of the window. The viewer page gets the window's behaviour
//  (`standaloneEnv`, also the default when there is no provider, so nothing changes for it); an embedded
//  diagram gets what its host passed to `mount` (`embeddedEnv`).
// ============================================================

import { createContext, useContext } from 'react'
import { initialLang, writeStoredLang } from '../core/i18n.js'
import { localPrefs, memoryPrefs } from './prefs.js'

const noop = () => {}

/**
 * The commands a host sends to a mounted diagram (src/embed/mount.js); App and the canvas shell answer them.
 * A command sent before anything answers it (right after `mount`, before the diagram is drawn) is held, the
 * last one of each name, and run when its handler comes.
 */
function commandBus() {
  const handlers = new Map()
  const held = new Map()
  return {
    /** Register the handler of `name`; returns the function that removes it */
    on(name, fn) {
      handlers.set(name, fn)
      if (held.has(name)) {
        const args = held.get(name)
        held.delete(name)
        fn(...args)
      }
      return () => {
        if (handlers.get(name) === fn) handlers.delete(name)
      }
    },
    /** Whether something answers `name` now */
    has(name) {
      return handlers.has(name)
    },
    /** Run `name` and return what it returns; undefined when it was held */
    run(name, ...args) {
      const fn = handlers.get(name)
      if (fn) return fn(...args)
      held.set(name, args)
      return undefined
    },
  }
}

/**
 * The items a host marked (`highlight`, issue 164): kept here rather than in the canvas, so the marks stay on
 * through `update`, a change of kind or theme, until the host changes them. Read with useSyncExternalStore.
 */
function markStore() {
  let ids = []
  const listeners = new Set()
  return {
    get: () => ids,
    set(next) {
      ids = next
      listeners.forEach((fn) => fn())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

/** The viewer page: the window is the diagram's own */
export function standaloneEnv({ preset } = {}) {
  const fromWindow = typeof window !== 'undefined' ? window.__ANTU_PRESET__ ?? null : null
  return {
    embedded: false,
    preset: preset === undefined ? fromWindow : preset,
    prefs: localPrefs,
    lang: { read: initialLang, write: writeStoredLang },
    emit: noop,
    commands: commandBus(),
    highlight: markStore(),
    /** How the diagram opens, ahead of the reader's stored choices (`mount(…, { initial })`); nothing on the page */
    initial: {},
    /** Called by the canvas once the diagram has been drawn and fitted (a host's `ready`) */
    drawn: noop,
    /** Where the diagram's elements are looked up (the whole document on the viewer page) */
    root: typeof document !== 'undefined' ? document : null,
  }
}

/**
 * A diagram mounted in a host's window.
 * @param prefs   'none' (default: remembered while it is mounted, nothing written), 'local' (the viewer's
 *                localStorage key), or a store { read(): object, write(patch): void }
 * @param emit    the host's onEvent
 * @param root    the shadow root (or element) the diagram is drawn in
 * @param ui      which pieces of the page's own chrome show
 * @param initial how it opens, ahead of the stored choices: { headerFolded? }
 */
export function embeddedEnv({ prefs = 'none', emit = noop, drawn = noop, root = null, ui = {}, initial = {} } = {}) {
  const store = prefs === 'local' ? localPrefs : prefs && typeof prefs === 'object' ? prefs : memoryPrefs()
  return {
    embedded: true,
    preset: null,
    prefs: store,
    // the interface language is one more preference of the host's store, not the viewer's own key
    lang: { read: () => store.read().lang ?? null, write: (lang) => store.write({ lang }) },
    emit,
    commands: commandBus(),
    highlight: markStore(),
    initial,
    drawn,
    root,
    ui,
  }
}

export const EnvContext = createContext(standaloneEnv())

/** The spec now drawn (App provides it), so the canvas can find the nodes of an item a host names */
export const ShownSpecContext = createContext(null)

export const useEnv = () => useContext(EnvContext)

/** The reader's preferences of this diagram: { read(), write(patch) } */
export const usePrefs = () => useContext(EnvContext).prefs

/** How this page was asked to open (a screenshot, `render --kind`); null when embedded */
export const usePreset = () => useContext(EnvContext).preset

/** Whether a piece of the page's chrome shows: on unless the host turned it off */
export const useUi = (name) => useContext(EnvContext).ui?.[name] !== false

/**
 * Whether an event happened inside `el`. An event from inside a shadow root reaches a listener on the document
 * retargeted to the shadow host, so `el.contains(e.target)` would say "outside" for every click in a mounted
 * diagram; the composed path still names the element the event went through.
 */
export function isInside(el, e) {
  if (!el) return false
  const path = typeof e.composedPath === 'function' ? e.composedPath() : null
  return path && path.length ? path.includes(el) : el.contains(e.target)
}
