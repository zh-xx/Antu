// ============================================================
//  src/renderers/justification/tree/register.js — register the justification sub-type renderer with the engine
//
//  The tree is justification's first kind. A second (a table of the elements and what meets each, say)
//  would be added here as one more line, and every existing justification JSON could be viewed with it
//  at once: sub-types differ in the rendering layer only (spec/v0-architecture.md §3).
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import JustificationTree from './JustificationRenderer.jsx'

registerRenderer('justification', 'tree', JustificationTree, 'graphKind.tree')
