// ============================================================
//  src/renderers/relationship/graph/register.js — register the relationship sub-type renderer with the engine
//
//  The graph is relationship's first kind. A second (a matrix of the same relations, say) would be
//  added here as one more line, and every existing relationship JSON could be viewed with it at
//  once: sub-types differ in the rendering layer only (spec/v0-architecture.md §3).
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipGraph from './RelationshipRenderer.jsx'

registerRenderer('relationship', 'graph', RelationshipGraph, 'graphKind.graph')
