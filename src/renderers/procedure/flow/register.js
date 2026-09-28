// ============================================================
//  src/renderers/procedure/flow/register.js — register the procedure sub-type renderer with the engine
//
//  The flowchart is procedure's first kind. A swimlane (columns by party) would be the second,
//  added here as one more line, and every existing procedure JSON could be viewed with it at
//  once (spec/procedure/schema-draft.md §9).
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import ProcedureFlow from './FlowRenderer.jsx'

registerRenderer('procedure', 'flow', ProcedureFlow, 'graphKind.flow')
