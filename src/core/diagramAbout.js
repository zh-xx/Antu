// ============================================================
//  src/core/diagramAbout.js — the three versions the label card can show (issue 131)
//
//  Release (engine), format generation (type JSON), diagram version (way of drawing).
//  Plain JS so unit tests assert the shape without React.
// ============================================================

import { engineVersion } from './engineVersion.js'
import { knowledgeOf } from './registry.js'

/**
 * @param {string} type
 * @param {string} kind
 * @returns {{
 *   engine: string,
 *   format: number | null,
 *   diagram: { version: number, status: string, since: string } | null,
 * }}
 */
export function diagramAboutOf(type, kind) {
  const k = type ? knowledgeOf(type) : null
  const d = k?.diagrams?.[kind]
  return {
    engine: engineVersion(),
    format: Number.isInteger(k?.specVersion) ? k.specVersion : null,
    diagram: d
      ? { version: d.version, status: d.status, since: d.since }
      : null,
  }
}
