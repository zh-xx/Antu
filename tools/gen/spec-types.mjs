// ============================================================
//  tools/gen/spec-types.mjs — TypeScript interfaces for each diagram JSON
//
//  Source of truth: the same `*_FIELDS` tables that feed `describe()` / `antu_schema`
//  (plus closed enums from each type's rules). Hosts import them from `@zh-xx/antu/types`
//  (issue 294). This does not replace runtime `validate()`.
//
//    node tools/gen/spec-types.mjs          write src/types/antu-specs.d.ts
//    node tools/gen/spec-types.mjs --check  exit 1 if that file is stale
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { FACT_FIELDS, FACT_SPEC_VERSION } from '../../src/renderers/fact/schema.js'
import { PROCEDURE_FIELDS, PROCEDURE_SPEC_VERSION } from '../../src/renderers/procedure/schema.js'
import { KINDS as PROCEDURE_NODE_KINDS, OUTCOMES, DOMAINS } from '../../src/renderers/procedure/flow/rules.js'
import { RELATIONSHIP_FIELDS, RELATIONSHIP_SPEC_VERSION } from '../../src/renderers/relationship/schema.js'
import { ENTITY_KINDS, RELATION_KINDS } from '../../src/renderers/relationship/graph/rules.js'
import { JUSTIFICATION_FIELDS, JUSTIFICATION_SPEC_VERSION } from '../../src/renderers/justification/schema.js'
import { NODE_KINDS, STANCES, COMBINES } from '../../src/renderers/justification/tree/rules.js'

const REPO = join(fileURLToPath(new URL('../..', import.meta.url)))
export const MODULE = 'src/types/antu-specs.d.ts'

const lit = (values) => values.map((v) => JSON.stringify(v)).join(' | ')

/** Source-location bag: hosts use many shapes; keep it open. */
const LOC_TYPE = 'Record<string, unknown>'

/**
 * Per diagram type: which field-table groups become root arrays, which are nested
 * element shapes, and closed string enums keyed as `group.field` or `field` (root).
 */
const DIAGRAMS = [
  {
    id: 'fact',
    interfaceName: 'FactSpec',
    version: FACT_SPEC_VERSION,
    fields: FACT_FIELDS,
    /** group → exported interface name (array on the root) */
    arrays: {
      actors: 'FactActor',
      groups: 'FactGroup',
      sources: 'FactSource',
      slots: 'FactSlot',
    },
    /** group → interface used only as a nested element (not a root array) */
    nested: {
      events: 'FactEvent',
    },
    /** Resolve `ty: 'array'` fields inside a group to an element interface */
    arrayOf: {
      'slots.events': 'FactEvent',
    },
    enums: {},
  },
  {
    id: 'procedure',
    interfaceName: 'ProcedureSpec',
    version: PROCEDURE_SPEC_VERSION,
    fields: PROCEDURE_FIELDS,
    arrays: {
      actors: 'ProcedureActor',
      stages: 'ProcedureStage',
      sources: 'ProcedureSource',
      nodes: 'ProcedureNode',
      rules: 'ProcedureRule',
      edges: 'ProcedureEdge',
    },
    nested: {},
    arrayOf: {},
    /** Groups without an `id` row are hoisted onto the root (e.g. `domain`) */
    enums: {
      domain: DOMAINS,
      'nodes.kind': PROCEDURE_NODE_KINDS,
      'nodes.outcome': OUTCOMES,
      'rules.outcome': OUTCOMES,
    },
  },
  {
    id: 'relationship',
    interfaceName: 'RelationshipSpec',
    version: RELATIONSHIP_SPEC_VERSION,
    fields: RELATIONSHIP_FIELDS,
    arrays: {
      groups: 'RelationshipGroup',
      entities: 'RelationshipEntity',
      relations: 'RelationshipRelation',
      sources: 'RelationshipSource',
    },
    nested: {},
    arrayOf: {},
    enums: {
      'entities.kind': ENTITY_KINDS,
      'relations.kind': RELATION_KINDS,
    },
  },
  {
    id: 'justification',
    interfaceName: 'JustificationSpec',
    version: JUSTIFICATION_SPEC_VERSION,
    fields: JUSTIFICATION_FIELDS,
    arrays: {
      groups: 'JustificationGroup',
      nodes: 'JustificationNode',
      links: 'JustificationLink',
      sources: 'JustificationSource',
    },
    nested: {},
    arrayOf: {},
    enums: {
      'nodes.kind': NODE_KINDS,
      'nodes.holds': ['yes', 'no'],
      'nodes.combine': COMBINES,
      'links.stance': STANCES,
    },
  },
]

function tsTypeFor(ty, { enumValues, arrayElement }) {
  if (enumValues?.length) return lit(enumValues)
  const t = String(ty || 'unknown').trim()
  if (t === 'string' || t === 'ISO date') return 'string'
  if (t === 'boolean') return 'boolean'
  if (t === 'number') return 'number'
  if (t === 'string[]') return 'string[]'
  if (t === 'string|str[]' || t === 'string | str[]') return 'string | string[]'
  if (t === 'yes|no') return lit(['yes', 'no'])
  if (t === 'all|any') return lit(['all', 'any'])
  if (t === 'object') return LOC_TYPE
  if (t === 'array') return arrayElement ? `${arrayElement}[]` : 'unknown[]'
  return 'unknown'
}

function fieldsOf(rows) {
  return rows.filter((r) => r.name)
}

function isOptional(req) {
  // '*' = depends on other data; TS cannot express that — optional, runtime validate decides
  return req !== 'yes'
}

function emitInterface(name, rows, { enums = {}, arrayOf = {}, typeLiteral, extraLines = [] }) {
  const lines = [`export interface ${name} {`]
  if (typeLiteral) {
    lines.push(`  type: ${JSON.stringify(typeLiteral)}`)
  }
  for (const r of fieldsOf(rows)) {
    if (typeLiteral && r.name === 'type') continue
    const key = r.name
    const enumValues = enums[key]
    const arrayElement = arrayOf[key]
    let ts = tsTypeFor(r.ty, { enumValues, arrayElement })
    if (r.name === 'specVersion' && typeof enums.specVersion === 'number') {
      ts = String(enums.specVersion)
    }
    const opt = isOptional(r.req) ? '?' : ''
    const note = (r.note || '').replace(/\s+/g, ' ').trim()
    if (note) lines.push(`  /** ${note.replace(/\*\//g, '* /')} */`)
    lines.push(`  ${key}${opt}: ${ts}`)
  }
  for (const line of extraLines) lines.push(line)
  lines.push('}')
  return lines.join('\n')
}

function expectedFileText() {
  const parts = [
    '// Generated by tools/gen/spec-types.mjs from each type\'s `*_FIELDS` (and closed enums in rules).',
    '// Do not edit by hand. Hosts: `import type { ProcedureSpec } from \'@zh-xx/antu/types\'` (issue 294).',
    '// These types are structural hints for editors; runtime validation remains `validate()`.',
    '',
  ]

  const rootNames = []

  for (const d of DIAGRAMS) {
    parts.push(`// ---------- ${d.id} (specVersion ${d.version}) ----------`)
    parts.push('')

    // Nested element interfaces first (referenced by array groups)
    for (const [group, iface] of Object.entries(d.nested)) {
      const rows = d.fields[group] || []
      const enums = {}
      for (const [k, v] of Object.entries(d.enums)) {
        if (k.startsWith(`${group}.`)) enums[k.slice(group.length + 1)] = v
      }
      parts.push(emitInterface(iface, rows, { enums }))
      parts.push('')
    }

    // Array element interfaces
    for (const [group, iface] of Object.entries(d.arrays)) {
      const rows = d.fields[group] || []
      const enums = {}
      for (const [k, v] of Object.entries(d.enums)) {
        if (k.startsWith(`${group}.`)) enums[k.slice(group.length + 1)] = v
      }
      const arrayOf = {}
      for (const [k, v] of Object.entries(d.arrayOf)) {
        if (k.startsWith(`${group}.`)) arrayOf[k.slice(group.length + 1)] = v
      }
      parts.push(emitInterface(iface, rows, { enums, arrayOf }))
      parts.push('')
    }

    // Root: envelope + hoisted scalar groups + array props
    const envelope = d.fields.envelope || []
    const rootEnums = { specVersion: d.version }
    for (const [k, v] of Object.entries(d.enums)) {
      if (!k.includes('.')) rootEnums[k] = v
    }
    const extraLines = []
    for (const [group, iface] of Object.entries(d.arrays)) {
      extraLines.push(`  ${group}?: ${iface}[]`)
    }

    // Hoist non-envelope, non-array, non-nested groups onto the root (e.g. procedure.domain)
    const used = new Set(['envelope', ...Object.keys(d.arrays), ...Object.keys(d.nested)])
    const hoistRows = []
    for (const [group, rows] of Object.entries(d.fields)) {
      if (used.has(group)) continue
      for (const r of fieldsOf(rows)) {
        hoistRows.push(r)
        if (d.enums[r.name]) rootEnums[r.name] = d.enums[r.name]
        else if (d.enums[`${group}.${r.name}`]) rootEnums[r.name] = d.enums[`${group}.${r.name}`]
      }
    }

    parts.push(
      emitInterface(d.interfaceName, [...envelope, ...hoistRows], {
        enums: rootEnums,
        typeLiteral: d.id,
        extraLines,
      }),
    )
    parts.push('')
    rootNames.push(d.interfaceName)
  }

  parts.push('/** Any of the four diagram JSON shapes */')
  parts.push(`export type AntuDiagramSpec = ${rootNames.join(' | ')}`)
  parts.push('')
  return parts.join('\n')
}

export function expectedModuleText() {
  return expectedFileText()
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const text = expectedModuleText()
  const path = join(REPO, MODULE)
  if (process.argv.includes('--check')) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      process.stderr.write(`out of date (run node tools/gen/spec-types.mjs): ${MODULE}\n`)
      process.exitCode = 1
    }
  } else {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    process.stdout.write(`wrote ${MODULE} (${DIAGRAMS.length} diagram types)\n`)
  }
}
