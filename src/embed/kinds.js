// ============================================================
//  src/embed/kinds.js — what a host needs to offer the choice of a kind itself (issue 210)
//
//  `kindsOf(type)` names the kinds; these two give a host a picture and a name for each, so it can draw its own
//  picker (the DSH chat card's strip) without a copy of the page's sketches and words. The sketches are strings
//  generated from shell/KindIcon.jsx (tools/gen/kind-icons.mjs; test/kindicons.test.mjs checks they are current).
// ============================================================

import { KIND_ICONS } from './kindIcons.generated.js'
import { translate } from '../core/i18n.js'

/**
 * A small sketch of a kind, as one `<svg viewBox="0 0 80 48">` string (the same drawing the page's picker shows).
 * Its colours are CSS variables the host sets where it puts the markup: `--antu-text-3` (the ink), `--antu-line`
 * (the tint of the boxes) and `--antu-bg` (the ground it sits on; a few sketches paint with it, white if unset).
 * A kind without a sketch gives `null`.
 * @returns {string | null}
 */
export function kindIcon(kind) {
  return typeof kind === 'string' && Object.hasOwn(KIND_ICONS, kind) ? KIND_ICONS[kind] : null
}

/**
 * The name of a kind in the page's own words, as the picker shows it (`zh` or `en`; another value gives English).
 * An unknown kind gives `null`.
 * @returns {string | null}
 */
export function kindLabel(kind, lang) {
  if (typeof kind !== 'string') return null
  const key = `graphKind.${kind}`
  const label = translate(lang === 'zh' ? 'zh' : 'en', key)
  return label === key ? null : label
}
