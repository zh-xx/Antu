// ============================================================
//  src/renderers/fact/chronicle/register.js — registers the fact chronicle
//
//  Imported by main.jsx after the timeline's register.js: registration order is the order of
//  kinds in the label card, and the first is the default.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import FactChronicle from './ChronicleRenderer.jsx'

registerRenderer('fact', 'chronicle', FactChronicle, 'graphKind.chronicle')
