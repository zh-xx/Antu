// @ts-check
// ============================================================
//  src/theme/themeTokens.js — host colour / font overlays on a named theme (issue 293)
//
//  A host may tint a small allowlist of CSS variables so an embedded diagram sits in its
//  chrome, without inventing a fifth named theme. Agent / CLI / MCP stay on named themes only.
// ============================================================

import { themeOf } from './themes.js'

/** Keys a host may set in `mount({ themeTokens })` / `setThemeTokens` */
export const THEME_TOKEN_KEYS = Object.freeze([
  'accent',
  'canvas',
  'chromeBg',
  'text',
  'textMuted',
  'line',
  'chromeBorder',
  'font',
  'fontHead',
])

/** Colour keys (validated with `isCssColor`) */
const COLOR_KEYS = new Set(['accent', 'canvas', 'chromeBg', 'text', 'textMuted', 'line', 'chromeBorder'])

/** Font-family keys (validated with `isCssFontFamily`) */
const FONT_KEYS = new Set(['font', 'fontHead'])

/**
 * Maps allowlist keys to the CSS variables `themeVars` / the stylesheet already use.
 * `chromeBorder` is a colour; apply wraps it as `1px solid <colour>` to match theme shape.
 */
const TOKEN_TO_VAR = Object.freeze({
  accent: '--antu-accent',
  canvas: '--antu-canvas',
  chromeBg: '--antu-chrome-bg',
  text: '--antu-text',
  textMuted: '--antu-text-2',
  line: '--antu-line',
  chromeBorder: '--antu-chrome-border',
  font: '--antu-font',
  fontHead: '--antu-font-head',
})

/**
 * A colour string the browser can paint with. Hex (3/4/6/8) or rgb(a)/hsl(a).
 * Deliberately narrow: no `url()`, `var()`, or `expression`.
 */
export function isCssColor(value) {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s || s.length > 64) return false
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true
  if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+\s*)?\)$/i.test(s)) return true
  if (/^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+\s*)?\)$/i.test(s)) return true
  return false
}

/**
 * A font-family list safe to put in a CSS variable: quoted names, identifiers, commas, spaces.
 * No `url()`, `@import`, `expression`, or semicolons (declaration injection).
 */
export function isCssFontFamily(value) {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s || s.length > 256) return false
  if (/[;{}\\]|url\s*\(|@import|expression\s*\(/i.test(s)) return false
  // Allow: "Foo Bar", 'Baz', system-ui, sans-serif, Noto Sans CJK SC, commas between
  return /^[\w\s"'.,-]+$/u.test(s)
}

/** Hex only, for WCAG math. null when not a simple hex. */
function hexOf(value) {
  if (typeof value !== 'string') return null
  const s = value.trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return `#${h.toLowerCase()}`
}

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** True when both are hex and contrast ≥ 4.5:1; non-hex pairs cannot be checked here → true. */
function contrastOk(fg, bg) {
  const a = hexOf(fg)
  const b = hexOf(bg)
  if (!a || !b) return true
  return contrastRatio(a, b) >= 4.5
}

/**
 * Whether `canvas` can replace the theme canvas: both side colours stay ≥ 4.5:1 on it, and
 * at least one of (theme ink, host `text`) does too — so a dark branded ground can pass when
 * the host also sets a light `text`, without a bad `text` dragging a fine canvas down.
 * Non-hex canvas (rgb/hsl) cannot be checked here — accepted (host responsibility).
 * @param {string} themeId
 * @param {string} canvas
 * @param {string} [hostText]  host `text` token, if any
 */
export function canvasOverrideOk(themeId, canvas, hostText) {
  const hex = hexOf(canvas)
  if (!hex) return true
  const c = themeOf(themeId).color
  const inkOk = contrastOk(c.ink, canvas) || (hostText ? contrastOk(hostText, canvas) : false)
  if (!inkOk) return false
  for (const key of ['side1', 'side2']) {
    if (!contrastOk(c[key], canvas)) return false
  }
  return true
}

/**
 * Keep only allowlisted keys with valid values. Unknown keys and bad values are dropped.
 * @returns {Record<string, string>}
 */
export function normalizeThemeTokens(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const key of THEME_TOKEN_KEYS) {
    if (!(key in input)) continue
    const v = input[key]
    if (v === undefined || v === null) continue
    if (COLOR_KEYS.has(key)) {
      if (!isCssColor(v)) continue
      out[key] = v.trim()
    } else if (FONT_KEYS.has(key)) {
      if (!isCssFontFamily(v)) continue
      out[key] = v.trim()
    }
  }
  return out
}

/**
 * Merge host tokens onto a `themeVars` (or empty) map.
 * When the active theme is `document`, the overlay is skipped (black-and-white filing).
 * A `canvas` that fails contrast against ink/sides is dropped; a `text` / `textMuted` that
 * fails against the effective canvas is dropped.
 * Setting `canvas` also sets `--antu-bg` to the same value so the page ground matches.
 * Setting `line` also sets `--antu-line-soft`. `chromeBorder` is stored as `1px solid <colour>`.
 *
 * @param {Record<string, string>} baseVars  from `themeVars(theme)` (or `{}`)
 * @param {Record<string, string>} tokens      already normalized, or raw (will be normalized)
 * @param {string} themeId
 * @returns {Record<string, string>}
 */
export function applyThemeTokens(baseVars, tokens, themeId) {
  const base = { ...(baseVars || {}) }
  if (themeId === 'document') return base
  const clean = normalizeThemeTokens(tokens)
  if (!Object.keys(clean).length) return base

  const themeCanvas = themeOf(themeId).color.canvas
  if (clean.canvas && !canvasOverrideOk(themeId, clean.canvas, clean.text)) {
    delete clean.canvas
  }

  const effectiveCanvas = clean.canvas || themeCanvas
  if (clean.text && !contrastOk(clean.text, effectiveCanvas)) {
    delete clean.text
  }
  if (clean.textMuted && !contrastOk(clean.textMuted, effectiveCanvas)) {
    delete clean.textMuted
  }

  for (const [key, value] of Object.entries(clean)) {
    const cssVar = TOKEN_TO_VAR[key]
    if (!cssVar) continue
    if (key === 'chromeBorder') {
      base[cssVar] = `1px solid ${value}`
    } else {
      base[cssVar] = value
    }
    if (key === 'canvas') base['--antu-bg'] = value
    if (key === 'line') base['--antu-line-soft'] = value
  }
  return base
}

/**
 * Merge a patch into current tokens. `null` / `undefined` patch clears all.
 * @returns {{ tokens: Record<string, string>, changed: boolean }}
 */
export function mergeThemeTokens(current, patch) {
  if (patch === null || patch === undefined) {
    /** @type {Record<string, string>} */
    const empty = {}
    return { tokens: empty, changed: Object.keys(current || {}).length > 0 }
  }
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return { tokens: { ...(current || {}) }, changed: false }
  }
  const next = { ...(current || {}) }
  let changed = false
  for (const key of THEME_TOKEN_KEYS) {
    if (!(key in patch)) continue
    const v = patch[key]
    if (v === null || v === undefined || v === '') {
      if (key in next) {
        delete next[key]
        changed = true
      }
      continue
    }
    if (COLOR_KEYS.has(key)) {
      if (!isCssColor(v)) continue
    } else if (FONT_KEYS.has(key)) {
      if (!isCssFontFamily(v)) continue
    } else continue
    const trimmed = v.trim()
    if (next[key] !== trimmed) {
      next[key] = trimmed
      changed = true
    }
  }
  return { tokens: next, changed }
}
