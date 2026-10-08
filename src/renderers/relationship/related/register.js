// ============================================================
//  src/renderers/relationship/related/register.js — registers the related-party list
//
//  Imported by renderers/components.js after the authority chart's register.js: registration order is the order of kinds
//  in the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipRelated from './RelatedRenderer.jsx'

registerRenderer('relationship', 'related', RelationshipRelated, 'graphKind.related')
