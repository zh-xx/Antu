// @ts-check
// ============================================================
//  src/shell/ErrorBoundary.jsx —— the fallback when rendering throws
//
//  Why it is needed: a renderer is the last step of "data → interface", and when it
//  throws the whole page goes blank, leaving the user with no information at all.
//  While developing, all I could do was dig through the console.
//
//  This fallback does not repair anything; it does one thing: **replace the blank page
//  with a plain sentence and a copyable error**. The boundary wraps the renderer, so the
//  validation-failure path is unaffected (App handles that path itself).
// ============================================================

import { Component } from 'react'
import { translate } from '../core/i18n.js'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the full information (including the component stack) in the console;
    // the page only gets the copyable part
    console.error('[antu] render failed', error, info)
  }

  // This is a class component and cannot call a hook (useLang), so App passes the
  // language in as a prop. This is the only piece of wording here; it is not worth
  // turning the whole boundary into a function component for it.
  render() {
    // Without @types/react, tsc has no `props` / `state` on the class; read them through one cast.
    const { error } = /** @type {any} */ (this).state
    const props = /** @type {any} */ (this).props
    const t = (key, vars) => translate(props.lang, key, vars)
    if (!error) return props.children

    return (
      <div className="antu-fallback">
        <div className="antu-error-title">{t('error.renderTitle')}</div>
        <div className="antu-error-hint">{t('error.renderHint')}</div>
        <pre className="antu-error-trace">{String(error?.stack || error)}</pre>
      </div>
    )
  }
}
