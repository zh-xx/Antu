// ============================================================
//  src/core/labels.js — display names for enum values and canvas accessibility text
//
//  Principle: **code always uses English enum values** (easy to validate, easy
//  for a machine), **the interface displays them in the current language**. All
//  user-facing enum text is gathered here; do not scatter it through the
//  components, so that changing a word touches this one file only.
//
//  The text itself lives in core/messages/{en,zh}.js; this file only maps
//  "enum -> message key" and then looks the word up by language. So there is no
//  need for one table per language here.
//
//  The language is passed in as a parameter, not read from global state here.
//  Reason: the Node side (MCP, validation) also uses labelOf, and it has no
//  window.
// ============================================================

import { translate } from './i18n.js'

/** Source type -> message key (the 7 classes in spec/source-schema-draft.md) */
export const SOURCE_TYPE_KEYS = {
  statute: 'sourceType.statute',
  case: 'sourceType.case',
  contract: 'sourceType.contract',
  evidence: 'sourceType.evidence',
  document: 'sourceType.document',
  web: 'sourceType.web',
  other: 'sourceType.other',
}

/** Diagram type (the envelope-layer type) -> message key */
export const GRAPH_TYPE_KEYS = {
  fact: 'graphType.fact',
  relationship: 'graphType.relationship',
  procedure: 'graphType.procedure',
  justification: 'graphType.justification',
}

/**
 * Get the display name of one enum value.
 *
 * When the lookup fails it returns the enum value itself rather than an empty
 * string: showing `fact` on screen makes a missing mapping obvious at a glance,
 * whereas a blank is the hardest thing to trace. This is the same convention as
 * i18n.translate for a missing key.
 */
export const labelOf = (keyMap, value, lang) => {
  const key = keyMap[value]
  return key ? translate(lang, key) : value
}

// The key naming a source in the interface is `dock.sources`. It is looked up where it is
// used (ControlDock's field map and EventNode) rather than re-exported from here: a constant
// that nothing imports drifts silently, and this one had a comment claiming three call sites.

/**
 * React Flow's prompts and accessibility text, generated for the current
 * language. The key names come from @xyflow/system's defaultAriaLabelConfig and
 * must match one to one or they have no effect, so only the values change here,
 * never the keys.
 */
export function ariaLabelConfig(lang) {
  const t = (key, vars) => translate(lang, key, vars)
  return {
    'node.a11yDescription.default': t('aria.nodeDefault'),
    'node.a11yDescription.keyboardDisabled': t('aria.nodeKeyboardDisabled'),
    'node.a11yDescription.ariaLiveMessage': ({ x, y }) => t('aria.nodeMoved', { x, y }),
    'edge.a11yDescription.default': t('aria.edgeDefault'),

    'controls.ariaLabel': t('aria.controls'),
    'controls.zoomIn.ariaLabel': t('aria.zoomIn'),
    'controls.zoomOut.ariaLabel': t('aria.zoomOut'),
    'controls.fitView.ariaLabel': t('aria.fitView'),
    'controls.interactive.ariaLabel': t('aria.interactive'),

    'minimap.ariaLabel': t('aria.minimap'),

    'handle.ariaLabel': t('aria.handle'),
  }
}
