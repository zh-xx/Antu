// ============================================================
//  src/core/i18n.js — resolving the interface language and taking text from it
//
//  Two language lines, do not mix them:
//
//    1. **Interface language** (this file): title bar, buttons, card markers,
//       errors. The user switches it in the interface and it lives in
//       localStorage. Usable on both the browser and the Node side.
//
//    2. **Data language** (not here): the parties and event descriptions inside
//       the JSON. That is case content, decided by the data itself, independent
//       of the interface language. Paired examples: examples/fact/*.zh-CN.json
//       and *.en.json.
//
//  Why validation errors are fixed in English: errors mainly go into the
//  agent's context. English costs fewer tokens and matches MCP ecosystem
//  convention. See spec/mcp-server.md.
// ============================================================

import { MESSAGES } from './messages/index.js'

/** Supported languages. The first is the fallback language. */
export const LANGS = ['en', 'zh']
export const FALLBACK_LANG = 'en'

/** The interface language has its own storage key, not mixed into antu.prefs (which records only rendering preferences the user actually changed) */
export const LANG_KEY = 'antu.lang'

/**
 * Normalise any spelling to a supported language.
 * Accepts BCP 47 tags such as 'zh-CN' / 'zh-Hans' / 'zh' and takes the primary
 * language subtag. Anything unrecognised falls back.
 */
export function normalizeLang(tag) {
  if (!tag || typeof tag !== 'string') return FALLBACK_LANG
  const primary = tag.toLowerCase().split('-')[0]
  return primary === 'zh' ? 'zh' : primary === 'en' ? 'en' : FALLBACK_LANG
}

/** Guess one from the browser language. With nothing to go on, use the fallback language. */
export function detectLang() {
  if (typeof navigator === 'undefined') return FALLBACK_LANG
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of tags) {
    const primary = String(tag).toLowerCase().split('-')[0]
    if (primary === 'zh' || primary === 'en') return primary
  }
  return FALLBACK_LANG
}

/** Read the stored language. Never stored, stored corrupt, or unreadable in private mode all return null (the caller decides whether to detect). */
/**
 * The language asked for in the URL, e.g. `?lang=zh` or `?lang=en`.
 *
 * The URL wins over storage, because a link is an explicit instruction for this visit
 * while storage only records what was chosen last time. It also gives the verification
 * script a way to pin the interface language, which matters: assertions that look up a
 * control by its label would otherwise depend on whatever `navigator.language` the CI
 * machine happens to have.
 *
 * Returns null when the parameter is absent or not a language we support.
 */
export function readUrlLang() {
  if (typeof window === 'undefined') return null
  try {
    const raw = new URLSearchParams(window.location.search).get('lang')
    if (!raw) return null
    const primary = raw.toLowerCase().split('-')[0]
    return primary === 'zh' || primary === 'en' ? primary : null
  } catch {
    return null
  }
}

/**
 * The interface language to start with: the URL parameter first, then storage, then null
 * (meaning "detect from the browser").
 */
export function initialLang() {
  return readUrlLang() ?? readStoredLang()
}

/** Read the stored language. Returns null when nothing was stored or storage is unreadable. */
export function readStoredLang() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LANG_KEY)
    return raw ? normalizeLang(raw) : null
  } catch {
    return null
  }
}

/** Write the language. If the write fails (private mode) ignore it: the interface works as usual, it just will not remember next time. */
export function writeStoredLang(lang) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LANG_KEY, normalizeLang(lang))
  } catch {
    /* ignore */
  }
}

/**
 * Take one message.
 *
 * When the key is not found it returns the key itself, not an empty string or
 * undefined: a missing translation then shows as `dock.exportImage`, visible at
 * a glance; an empty string silently drops a piece and is hardest to trace.
 *
 * @param lang  language
 * @param key   message key, e.g. 'dock.exportImage'
 * @param vars  placeholder values, e.g. { n: 3 } for {n} in the message
 */
export function translate(lang, key, vars) {
  const dict = MESSAGES[normalizeLang(lang)] ?? MESSAGES[FALLBACK_LANG]
  const raw = dict[key] ?? MESSAGES[FALLBACK_LANG][key]
  if (raw === undefined) return key
  if (typeof raw === 'function') return raw(vars ?? {})
  if (!vars) return raw
  return String(raw).replace(/\{(\w+)\}/g, (_, name) => (vars[name] ?? `{${name}}`))
}

/**
 * A fixed-English word retriever.
 *
 * For the validation layer: errors go into the agent's context and do not follow
 * the interface language. This is **deliberate**, not a missing parameter. See
 * the file header.
 */
export const tEn = (key, vars) => translate('en', key, vars)
