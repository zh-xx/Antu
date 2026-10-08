// ============================================================
//  src/renderers/fact/scale/register.js — registers the fact time scale
//
//  Imported by renderers/components.js after the timeline and the chronicle: registration order is the order
//  of kinds in the label card.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import FactScale from './ScaleRenderer.jsx'

registerRenderer('fact', 'scale', FactScale, 'graphKind.scale')
