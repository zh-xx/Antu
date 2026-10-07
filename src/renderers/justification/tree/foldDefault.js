// ============================================================
//  src/renderers/justification/tree/foldDefault.js — which issues a justification diagram opens with folded
//
//  A diagram of several issues can be so big that, fitted to a screen, its text cannot be read (issue 139). Folding every issue
//  up to its conclusion makes it readable; the reader unfolds the one being read. So a diagram opens folded when
//  (1) it has more than one issue, (2) its text, fitted to the reference screen, is under TEXT_MIN_PX, and (3) folding makes
//  the text larger. Judged at the reference screen, not at the window, so that `layout` can say how the diagram
//  opens and the page does as said. A choice the reader (or a preset) has made is not touched by this.
// ============================================================

import { REFERENCE_CANVAS, TEXT_MIN_PX, fitZoom, textPx } from '../../../core/canvas.js'
import { NODE_FONT } from './metrics.js'

/**
 * @param spec   the diagram
 * @param layout the layout function of the type (spec, fields, view, orientation) => graph with `size`
 * @returns {{ issues: string[], open: number, folded: number }} `issues`: what to fold when it opens ([] for none);
 *   `open` and `folded`: the fit zoom unfolded and folded, horizontal, at the reference screen
 */
export function foldDefault(spec, layout) {
  const issues = Array.isArray(spec?.groups) ? spec.groups.map((g) => g?.id).filter(Boolean) : []
  if (issues.length < 2) return { issues: [], open: 1, folded: 1 }
  const open = fitZoom(layout(spec, {}, undefined, 'horizontal').size, REFERENCE_CANVAS)
  const folded = fitZoom(layout(spec, { collapsed: issues }, undefined, 'horizontal').size, REFERENCE_CANVAS)
  const fold = textPx(NODE_FONT, open) < TEXT_MIN_PX && folded > open
  return { issues: fold ? issues : [], open, folded }
}
