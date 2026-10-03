// ============================================================
//  src/renderers/relationship/focus/register.js — registers the relationship focus view
//
//  Imported by main.jsx after the graph's register.js: registration order is the order of kinds in
//  the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipFocus from './FocusRenderer.jsx'

registerRenderer('relationship', 'focus', RelationshipFocus, 'graphKind.focus')
