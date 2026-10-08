// ============================================================
//  src/embed/core.jsx — one diagram drawn into one element (issue 152)
//
//  The one way a diagram is put on a page: the viewer page (src/main.jsx) and a host's `mount`
//  (src/embed/mount.js) both come through here, so the providers around App are written once and what the
//  viewer page shows is what a host gets. What differs between the two is the environment (shell/env.js):
//  the window's own on the viewer page, the host's choices in a mounted diagram.
// ============================================================

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

import App from '../App.jsx'
import { EnvContext } from '../shell/env.js'
import { LangProvider } from '../shell/LangContext.jsx'
import { ThemeProvider } from '../theme/ThemeContext.jsx'

/**
 * @param container  the element the diagram fills
 * @param env        standaloneEnv() or embeddedEnv(…) (shell/env.js)
 * @returns {{ draw(props): void, unmount(): void }}  `draw` (re)draws with { spec, kind, kinds, theme, lang };
 *          `theme` and `lang` are where it opens, read once
 */
export function renderDiagram(container, { env }) {
  const root = createRoot(container)
  const tree = ({ spec, kind = null, kinds = null, theme, lang }) => (
    <EnvContext.Provider value={env}>
      <LangProvider lang={lang}>
        <ThemeProvider initialTheme={theme}>
          <App spec={spec} kind={kind} kinds={kinds} />
        </ThemeProvider>
      </LangProvider>
    </EnvContext.Provider>
  )
  let first = true
  return {
    draw(props) {
      // The first drawing is committed at once, so a host that calls the handle right after `mount` finds the
      // diagram's commands registered; later ones go the usual way
      if (first) {
        first = false
        flushSync(() => root.render(tree(props)))
      } else root.render(tree(props))
    },
    unmount: () => root.unmount(),
  }
}
