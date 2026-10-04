// ============================================================
//  src/renderers/relationship/equity/register.js — registers the equity tree
//
//  Imported by main.jsx after the matrix's register.js: registration order is the order of kinds in the
//  label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipEquity from './EquityRenderer.jsx'

registerRenderer('relationship', 'equity', RelationshipEquity, 'graphKind.equity')
