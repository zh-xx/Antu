// ============================================================
//  src/renderers/relationship/graph/labelOf.js — the text a relation shows on its line
//
//  Its own file so partyData.js (which the graph's layout builds its boxes from) and the layout need not import
//  each other. graph/layout.js still exports it, for the code that has always taken it from there.
// ============================================================

import { tEn } from '../../../core/i18n.js'

/**
 * The text a relation shows on its line: the one the author wrote, otherwise a default from its
 * kind and dedicated fields, in the interface language (`t`).
 */
export function labelOf(relation, t = tEn) {
  if (typeof relation.label === 'string' && relation.label.trim()) return relation.label
  return t(`rel.auto.${relation.kind}`, { share: relation.share, amount: relation.amount })
}
