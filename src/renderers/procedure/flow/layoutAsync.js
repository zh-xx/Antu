// @ts-check
// ============================================================
//  layoutAsync.js — flowchart layout without freezing the page (issue 330)
//
//  Same idea as the relationship graph (issue 181): a full inlined Web Worker would ship a
//  second copy of ELK and push the npm pack over 4 MB. The browser path runs the same layout
//  generator as the sync API, but yields to the event loop between ELK tries, stage columns
//  and routed links so input and paint continue. Node / MCP / tests keep calling
//  `buildProcedureGraph` synchronously.
// ============================================================

import { buildProcedureGraph, buildProcedureGraphAsync } from './layout.js'

/**
 * Lay out a flowchart without blocking the UI for the whole computation.
 * @returns {Promise<object>} same shape as `buildProcedureGraph`
 */
export function layoutProcedureAsync(spec, fields = {}, orientation = 'vertical') {
  return buildProcedureGraphAsync(spec, fields, undefined, orientation)
}

export { buildProcedureGraph }
