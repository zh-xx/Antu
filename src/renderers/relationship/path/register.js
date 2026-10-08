// ============================================================
//  src/renderers/relationship/path/register.js — registers the relation path
//
//  Imported by renderers/components.js after the related-party list's register.js: registration order is the order of
//  kinds in the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipPath from './PathRenderer.jsx'

registerRenderer('relationship', 'path', RelationshipPath, 'graphKind.path')
