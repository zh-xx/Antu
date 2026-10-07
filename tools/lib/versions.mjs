// ============================================================
//  tools/lib/versions.mjs — which types and which diagrams there are, and what version each has
//
//  Read from the registry (src/core/registry.js; the entries are `diagrams` in each type's knowledge), so there is
//  one source. The same data is told three ways: as text (the command line, `antu versions`, and the MCP tool
//  `antu_versions`), as JSON (`antu versions --json`) and as the table of spec/versions.md, which is written from
//  here by tools/gen/versions.mjs and checked by a test. The rules are in spec/versioning.md.
// ============================================================

import { knowledgeOf, listKnowledgeTypes, diagramsOf } from '../../src/core/registry.js'
// Registers the knowledge for each type (pure JS, no components)
import '../../src/renderers/index.js'

/**
 * @param {string} release the release number of the engine asking
 * @param {string} [type] only this type; leave out for all
 * @returns {{release: string, types: Array<{type: string, specVersion: number, diagrams: Array<{kind: string, version: number, status: string, since: string}>}>}}
 */
export function versionsReport(release, type) {
  const types = listKnowledgeTypes()
    .map((t) => t.type)
    .filter((t) => !type || t === type)
    .map((t) => ({
      type: t,
      specVersion: knowledgeOf(t).specVersion,
      diagrams: diagramsOf(t).map(({ kind, version, status, since }) => ({ kind, version, status, since })),
    }))
  return { release, types }
}

/** The text an agent or a person reads. The first diagram of a type is the one it opens in. */
export function formatVersions(r) {
  const lines = [`Antu ${r.release}`, '']
  for (const t of r.types) {
    lines.push(`${t.type}: format generation ${t.specVersion}`)
    const w = Math.max(...t.diagrams.map((d) => d.kind.length))
    t.diagrams.forEach((d, i) => lines.push(`  ${d.kind.padEnd(w)}  v${d.version}  ${d.status}  since ${d.since}${i === 0 ? '  (default)' : ''}`))
  }
  return lines.join('\n')
}

/** The table of spec/versions.md. It carries no release number, so it changes only when a type or a diagram does. */
export function versionsMarkdown(r) {
  const out = [
    '# Versions of the types and the diagrams',
    '',
    'Written by `node tools/gen/versions.mjs` from the registry (`diagrams` in `src/renderers/<type>/schema.js`); a test fails when it is out of date. Do not edit it by hand. The rules are in [versioning.md](versioning.md). The same list is told by `antu versions` (command line) and `antu_versions` (MCP).',
    '',
    '| Type | Format generation | Diagram | Version | Status | Since | Opens in |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const t of r.types) {
    t.diagrams.forEach((d, i) => out.push(`| ${i === 0 ? `\`${t.type}\`` : ''} | ${i === 0 ? t.specVersion : ''} | \`${t.type}/${d.kind}\` | ${d.version} | ${d.status} | ${d.since} | ${i === 0 ? 'yes (default)' : ''} |`))
  }
  out.push('')
  return out.join('\n')
}
