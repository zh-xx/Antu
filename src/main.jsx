import './styles.css'

// First register "knowledge" (plain JS): how each type is validated and which
// kinds it has.
// Then register "components": the React renderer for each kind.
// Adding a type = adding one line in renderers/index.js;
// adding a kind = adding one line in renderers/components.js (and its register.js).
import './renderers/components.js'

import { renderDiagram } from './embed/core.jsx'
import { standaloneEnv } from './shell/env.js'
import { renderStartupError } from './shell/startupError.js'
import { initialLang } from './core/i18n.js'

// The viewer page: one diagram that fills the window, its data inlined into the page (window.__ANTU_SPEC__).
// It goes through the same core as a host's `mount` (src/embed/), with the window as its environment: the
// preset, the reader's localStorage, the document's title and language (shell/env.js).
// The language is resolved once at the outermost layer and passed down (see shell/LangContext.jsx).
// Starting can fail before React exists (an environment that cannot be built), and a throw here
// used to leave a blank page. Say it on the page instead; ErrorBoundary owns what fails inside.
const root = document.getElementById('root')
try {
  renderDiagram(root, { env: standaloneEnv() }).draw({
    spec: typeof window !== 'undefined' ? window.__ANTU_SPEC__ : undefined,
  })
} catch (error) {
  console.error('[antu] the page could not start', error)
  renderStartupError(root, error, initialLang())
}
