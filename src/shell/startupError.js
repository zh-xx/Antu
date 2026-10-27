// ============================================================
//  src/shell/startupError.js — the page could not start at all
//
//  ErrorBoundary catches what throws *inside* React. Some failures happen before that:
//  the viewer builds its environment (`standaloneEnv` in shell/env.js) before mounting,
//  and an environment that cannot be built — a preset with a paper level nobody knows,
//  say — throws there, out of React's reach. The page then stayed blank: `#root` with no
//  child, the message only in the console, nothing for the person who double-clicked the
//  file (issue 123 slices; found while testing the paper preview, issue 276).
//
//  So this writes the same sentence the ErrorBoundary writes, straight into the root
//  element, and keeps the error itself copyable.
// ============================================================

import { translate } from '../core/i18n.js'

/**
 * Replace the blank page with a sentence and the copyable error.
 * @param {Element|null} root   the element the diagram would have been drawn in
 * @param {unknown} error       what the start-up threw
 * @param {'zh'|'en'} lang      the page's own language
 */
export function renderStartupError(root, error, lang) {
  if (!root) return
  const t = (key) => translate(lang, key)
  const say = (className, text) => {
    const el = document.createElement('div')
    el.className = className
    el.textContent = text
    return el
  }
  const wrap = document.createElement('div')
  wrap.className = 'antu-fallback'
  const trace = document.createElement('pre')
  trace.className = 'antu-error-trace'
  trace.textContent = String(error?.stack || error)
  wrap.append(
    say('antu-error-title', t('error.startTitle')),
    say('antu-error-hint', t('error.startHint')),
    trace,
  )
  root.replaceChildren(wrap)
}
