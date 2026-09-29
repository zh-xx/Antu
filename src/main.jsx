import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { LangProvider } from './shell/LangContext.jsx'
import './styles.css'

// First register "knowledge" (plain JS): how each type is validated and which
// kinds it has.
// Then register "components": the React renderer for each kind.
// Adding a type = adding one line in renderers/index.js;
// adding a kind = adding one line in the corresponding register.js.
import './renderers/index.js'
import './renderers/fact/timeline/register.js'
import './renderers/procedure/flow/register.js'
import './renderers/relationship/graph/register.js'

// The language is resolved once at the outermost layer and passed down (see shell/LangContext.jsx).
createRoot(document.getElementById('root')).render(
  <LangProvider>
    <App />
  </LangProvider>,
)
