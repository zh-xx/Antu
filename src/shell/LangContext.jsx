// ============================================================
//  src/shell/LangContext.jsx —— the React context for interface language
//
//  The language is **resolved once, at the top**, and then passed down the Context.
//  It is not re-read from localStorage in every component: that would mean handling
//  "what if it cannot be read" everywhere, and one render could see different values.
//
//  Why it is separate from core/i18n.js: that layer is also used on the Node side
//  (MCP, validation), so it must not import React. This one serves the browser only.
//
//  The order the language comes from:
//    1. the user picked one in the interface → localStorage
//    2. no choice yet → guess from the browser language
//    3. neither is available → fall back to English (FALLBACK_LANG in core/i18n.js)
// ============================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  detectLang,
  initialLang,
  normalizeLang,
  writeStoredLang,
  translate,
} from '../core/i18n.js'
import { ariaLabelConfig } from '../core/labels.js'

const LangContext = createContext(null)

/** Interface language + lookup function + number formatting. Every user-facing string comes from here. */
export function LangProvider({ children, lang: forcedLang }) {
  // A forced language (a test or an embed) beats the URL, which beats storage, which
  // beats detecting from the browser. See core/i18n.js.
  const [lang, setLangState] = useState(
    () => (forcedLang ? normalizeLang(forcedLang) : null) ?? initialLang() ?? detectLang(),
  )

  // Keep the document language in step with the interface language.
  // The self-contained HTML ships with lang="en" (English is the default), but the code
  // that reads the title is not the UI: a correct lang attribute matters for screen
  // readers and font fallback, so it must follow whatever the user picked.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.dataset.antuLang = lang
  }, [lang])

  const setLang = useCallback((next) => {
    const normalized = normalizeLang(next)
    setLangState(normalized)
    writeStoredLang(normalized)
  }, [])

  const value = useMemo(() => {
    const t = (key, vars) => translate(lang, key, vars)
    return {
      lang,
      setLang,
      t,
      /** Look up an enum's display name: labelOf(GRAPH_TYPE_KEYS, spec.type) */
      labelOf: (keyMap, val) => {
        const key = keyMap[val]
        return key ? t(key) : val
      },
      /** Format a number in the current language. English uses thousands separators (1,234), Chinese follows Chinese convention. */
      formatNumber: (n) => new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(n),
      /** The React Flow aria label config, rebuilt with the language */
      ariaLabels: ariaLabelConfig(lang),
    }
  }, [lang, setLang])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

/**
 * Get the current language environment.
 *
 * Throws when the Provider is missing instead of falling back to some default
 * language. Reason: a silent fallback makes people think the wording mechanism is
 * working, while in fact the whole subtree shows key names. That kind of problem is
 * far harder to track down than a direct error.
 */
export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>')
  return ctx
}

export default LangContext
