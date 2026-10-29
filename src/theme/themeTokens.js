// ============================================================
//  src/theme/themeTokens.js — host colour overlays on a named theme (issue 293)
//
//  A host may tint a small allowlist of CSS variables so an embedded diagram sits in its
//  chrome, without inventing a fifth named theme. Agent / CLI / MCP stay on named themes only.
// ============================================================

import { themeOf } from './themes.js'

/** Keys a host may set in `mount({ themeTokens })` / `setThemeTokens` */
export const THEME_TOKEN_KEYS = Object.freeze(['accent', 'canvas', 'chromeBg'])

/** Maps allowlist keys to the CSS variables `themeVars` / the stylesheet already use */
const TOKEN_TO_VAR = Object.freeze({
  accent: '--antu-accent',
  canvas: '--antu-canvas',
  chromeBg: '--antu-chrome-bg',
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

/** Hex only, for WCAG math (canvas override check). null when not a simple hex. */
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

/**
 * Whether `canvas` can replace the theme canvas: ink and both side colours stay ≥ 4.5:1 on it.
 * Non-hex canvas (rgb/hsl) cannot be checked here — accepted (host responsibility).
 */
export function canvasOverrideOk(themeId, canvas) {
  const hex = hexOf(canvas)
  if (!hex) return true
  const c = themeOf(themeId).color
  for (const key of ['ink', 'side1', 'side2']) {
    const ink = hexOf(c[key])
    if (ink && contrastRatio(ink, hex) < 4.5) return false
  }
  return true
}

/**
 * Keep only allowlisted keys with valid colours. Unknown keys and bad colours are dropped.
 * @returns {Record<string, string>}
 */
export function normalizeThemeTokens(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out = {}
  for (const key of THEME_TOKEN_KEYS) {
    if (!(key in input)) continue
    const v = input[key]
    if (v === undefined || v === null) continue
    if (!isCssColor(v)) continue
    out[key] = v.trim()
  }
  return out
}

/**
 * Merge host tokens onto a `themeVars` (or empty) map.
 * When the active theme is `document`, the overlay is skipped (black-and-white filing).
 * A `canvas` that fails contrast against the theme's ink/sides is dropped.
 * Setting `canvas` also sets `--antu-bg` to the same value so the page ground matches.
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

  if (clean.canvas && !canvasOverrideOk(themeId, clean.canvas)) {
    delete clean.canvas
  }

  for (const [key, value] of Object.entries(clean)) {
    const cssVar = TOKEN_TO_VAR[key]
    if (!cssVar) continue
    base[cssVar] = value
    if (key === 'canvas') base['--antu-bg'] = value
  }
  return base
}

/**
 * Merge a patch into current tokens. `null` / `undefined` patch clears all.
 * @returns {{ tokens: Record<string, string>, changed: boolean }}
 */
export function mergeThemeTokens(current, patch) {
  if (patch === null || patch === undefined) {
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
    if (!isCssColor(v)) continue
    const trimmed = v.trim()
    if (next[key] !== trimmed) {
      next[key] = trimmed
      changed = true
    }
  }
  return { tokens: next, changed }
}
