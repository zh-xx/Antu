// ============================================================
//  src/renderers/relationship/summary/register.js — registers the camp summary
//
//  Imported by renderers/components.js after the relation path's register.js: registration order is the order of kinds in
//  the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipSummary from './SummaryRenderer.jsx'

registerRenderer('relationship', 'summary', RelationshipSummary, 'graphKind.summary')
