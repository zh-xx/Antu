// ============================================================
//  layoutAsync.js — relationship graph layout without freezing the page (issue 181)
//
//  A full inlined Web Worker would ship a second copy of ELK and push the npm pack over
//  4 MB. Instead the browser path runs the same layout generator as the sync API, but
//  yields to the event loop between ELK tries and routed links so input and paint continue.
//  Node / MCP / tests keep calling `buildRelationshipGraph` synchronously.
// ============================================================

import { buildRelationshipGraph, buildRelationshipGraphAsync } from './layout.js'

/**
 * Lay out a relationship graph without blocking the UI for the whole computation.
 * @returns {Promise<object>} same shape as `buildRelationshipGraph`
 */
export function layoutRelationshipAsync(spec, fields = {}, orientation = 'vertical') {
  return buildRelationshipGraphAsync(
    spec,
    { groups: fields?.groups, lang: fields?.lang, t: fields?.t },
    undefined,
    orientation,
  )
}

/** Sync path kept for callers that must not go async (tests of this module, etc.) */
export { buildRelationshipGraph }
