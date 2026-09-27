// ============================================================
//  src/renderers/fact/timeline/register.js — register the fact sub-type renderer with the engine
//
//  One top-level type may carry several sub-types, all eating the same fact JSON.
//  The timeline is the first; to add a swimlane diagram later, add one line here and every
//  existing fact JSON can immediately be viewed as a swimlane, with no data change.
// ============================================================

import { registerRenderer } from '../../../core/registry.js'
import FactTimeline from './TimelineRenderer.jsx'

registerRenderer('fact', 'timeline', FactTimeline, 'graphKind.timeline')
