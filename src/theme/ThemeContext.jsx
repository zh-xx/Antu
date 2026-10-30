// ============================================================
//  src/theme/ThemeContext.jsx — which theme the page is in, for every component (issue #97)
//
//  The order the theme comes from, as for the language:
//    1. a preset (window.__ANTU_PRESET__.theme: `render --theme`, a screenshot) names it outright and the
//       reader's own choice is not touched
//    2. a mounted diagram opens in the theme its host gave (`mount(…, { theme })`, issue 152); the reader can
//       still switch
//    3. the reader picked one in the page → the preferences (shell/env.js `usePrefs`, `theme`)
//    4. otherwise the default (the document black-and-white theme)
//  `themeVars` turns a theme into the CSS variables the stylesheet reads; they are set on the app's root so
//  the exported picture (which copies computed styles) carries them.
// ============================================================

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useEnv, usePrefs, usePreset } from '../shell/env.js'
import { typeVars } from './scale.js'
import { DEFAULT_THEME, THEME_IDS, isTheme, themeOf } from './themes.js'

const ThemeContext = createContext({ id: DEFAULT_THEME, theme: themeOf(DEFAULT_THEME), setTheme: () => {}, forced: false })

/**
 * A theme read-only override for one subtree: the Print action lays a diagram out on paper, and a
 * printed sheet is always the document theme (issue 123). It overrides what `useTheme` reads and
 * nothing else, so the page keeps one theme state (no second provider, no lost switch).
 */
const ThemeOverrideContext = createContext(null)
export const ThemeOverrideProvider = ThemeOverrideContext.Provider

/** The CSS variables of a theme (the stylesheet's :root holds the defaults these replace) */
export function themeVars(theme) {
  const c = theme.color
  // Type sizes sit with the colours: the viewport (the layer an export copies) carries them, and they
  // are the same in every theme. `:root` holds the same defaults, so the shell outside the viewport
  // reads them too (scale.js `typeVars`).
  return {
    ...typeVars(),
    '--antu-text': c.ink,
    '--antu-text-2': c.ink2,
    '--antu-text-3': c.ink3,
    '--antu-text-4': c.ink4,
    '--antu-canvas': c.canvas,
    '--antu-line': c.line,
    '--antu-line-soft': c.line,
    '--antu-chip': c.chip,
    '--antu-side1': c.side1,
    '--antu-side2': c.side2,
    // Host highlight / brand mark (issue 293); defaults to side1 until a host sets themeTokens.accent
    '--antu-accent': c.side1,
    '--antu-axis': c.axis,
    '--antu-bg': c.bg,
    '--antu-label-bg': c.labelBg,
    '--antu-bad': theme.flow.outcome.negative.stroke,
    '--antu-shadow-rgb': theme.shadowRgb,
    '--antu-chrome-radius': `${theme.chrome.radius}px`,
    '--antu-capsule-radius': `${theme.chrome.capsule}px`,
    '--antu-chip-radius': `${theme.chrome.chip}px`,
    '--antu-pill-radius': `${theme.radius.pill}px`,
    '--antu-chrome-bg': theme.chrome.bg,
    '--antu-chrome-bg-pop': theme.chrome.bgPop,
    '--antu-chrome-border': theme.chrome.border,
    '--antu-chrome-shadow': theme.chrome.shadow,
    '--antu-chrome-blur': theme.chrome.blur,
    '--antu-font': theme.font.body,
    '--antu-font-head': theme.font.head,
  }
}

/**
 * The variables of the shell round the diagram (dock, header card, zoom, minimap, page ground). The shell keeps one
 * light look in every theme (issue #48), so a light theme answers nothing here; only a dark theme darkens it, or a
 * dark diagram would sit in a pale frame.
 */
export function shellVars(theme) {
  if (theme.scheme !== 'dark') return {}
  const rest = themeVars(theme)
  const keep = ['--antu-text', '--antu-text-2', '--antu-text-3', '--antu-text-4', '--antu-canvas', '--antu-line', '--antu-line-soft', '--antu-chip', '--antu-axis', '--antu-bg', '--antu-shadow-rgb', '--antu-chrome-bg', '--antu-chrome-bg-pop', '--antu-chrome-border', '--antu-chrome-shadow', '--antu-chrome-blur']
  return { colorScheme: 'dark', ...Object.fromEntries(keep.map((k) => [k, rest[k]])) }
}

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.theme]  forces the theme for this diagram (locked / preset path)
 * @param {string} [props.initialTheme]  where it opens when not forced (`renderDiagram` / mount theme)
 */
export function ThemeProvider({ children, theme: forcedTheme, initialTheme }) {
  const prefs = usePrefs()
  const preset = usePreset()
  // A host locking the theme (`mount(…, { locked: { theme } })`) forces it and hides the switch (issue 200)
  const { locked } = useEnv()
  const [stored, setStored] = useState(() => {
    if (isTheme(initialTheme)) return initialTheme
    const id = prefs.read().theme
    return isTheme(id) ? id : null
  })
  const forced = isTheme(locked?.theme) ? locked.theme : isTheme(forcedTheme) ? forcedTheme : isTheme(preset?.theme) ? preset.theme : null
  const id = forced ?? stored ?? DEFAULT_THEME
  const setTheme = useCallback(
    (next) => {
      if (!isTheme(next) || forced) return
      setStored(next)
      prefs.write({ theme: next })
    },
    [forced, prefs],
  )
  const value = useMemo(() => ({ id, theme: themeOf(id), setTheme, forced: !!forced }), [id, setTheme, forced])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** { id, theme, setTheme, forced }; a theme override wins for reading only */
export const useTheme = () => {
  const base = useContext(ThemeContext)
  const override = useContext(ThemeOverrideContext)
  if (!isTheme(override) || override === base.id) return base
  return { ...base, id: override, theme: themeOf(override) }
}

export { THEME_IDS }
