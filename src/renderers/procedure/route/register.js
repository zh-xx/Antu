// ============================================================
//  src/renderers/procedure/route/register.js — registers the route map
//
//  Imported by renderers/components.js after the flowchart's register.js: registration order is the order of kinds in the
//  label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import ProcedureRoute from './RouteRenderer.jsx'

registerRenderer('procedure', 'route', ProcedureRoute, 'graphKind.route')
