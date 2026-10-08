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
import { usePrefs, usePreset } from '../shell/env.js'
import { DEFAULT_THEME, THEME_IDS, isTheme, themeOf } from './themes.js'

const ThemeContext = createContext({ id: DEFAULT_THEME, theme: themeOf(DEFAULT_THEME), setTheme: () => {}, forced: false })

/** The CSS variables of a theme (the stylesheet's :root holds the defaults these replace) */
export function themeVars(theme) {
  const c = theme.color
  return {
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
    '--antu-axis': c.axis,
    '--antu-bg': c.bg,
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

export function ThemeProvider({ children, theme: forcedTheme, initialTheme }) {
  const prefs = usePrefs()
  const preset = usePreset()
  const [stored, setStored] = useState(() => {
    if (isTheme(initialTheme)) return initialTheme
    const id = prefs.read().theme
    return isTheme(id) ? id : null
  })
  const forced = isTheme(forcedTheme) ? forcedTheme : isTheme(preset?.theme) ? preset.theme : null
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

/** { id, theme, setTheme, forced } */
export const useTheme = () => useContext(ThemeContext)

export { THEME_IDS }
