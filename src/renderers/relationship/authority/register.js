// ============================================================
//  src/renderers/relationship/authority/register.js — registers the authority chart
//
//  Imported by renderers/components.js after the equity tree's register.js: registration order is the order of kinds in
//  the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipAuthority from './AuthorityRenderer.jsx'

registerRenderer('relationship', 'authority', RelationshipAuthority, 'graphKind.authority')
