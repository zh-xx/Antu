// ============================================================
//  src/renderers/relationship/matrix/register.js — registers the relation matrix
//
//  Imported by renderers/components.js after the chain's register.js: registration order is the order of kinds in the
//  label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import RelationshipMatrix from './MatrixRenderer.jsx'

registerRenderer('relationship', 'matrix', RelationshipMatrix, 'graphKind.matrix')
