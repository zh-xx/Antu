// ============================================================
//  src/renderers/relationship/chain/register.js — registers the relationship guarantee chain
//
//  Imported by renderers/components.js after the graph's and the focus view's register.js: registration order is the
//  order of kinds in the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipChain from './ChainRenderer.jsx'

registerRenderer('relationship', 'chain', RelationshipChain, 'graphKind.chain')
