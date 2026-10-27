// In-page source overview rows (issue 124).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { locTextOf, sourceTypesIn, traceRowsOf } from '../src/core/trace.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'))

test('fact: one row per event, with the sources it names', () => {
  const spec = load('examples/fact/neighbour-corridor-charging.zh-CN.json')
  const rows = traceRowsOf(spec)
  assert.equal(rows.length, spec.slots.reduce((n, s) => n + s.events.length, 0))
  assert.ok(rows.every((r) => r.collection === 'events' && r.id && r.label))
  const withSrc = rows.filter((r) => r.sources.length > 0)
  assert.ok(withSrc.length >= 5, `expected several sourced events, got ${withSrc.length}`)
  assert.ok(withSrc[0].sources[0].name)
  assert.deepEqual(sourceTypesIn(rows), ['case', 'evidence'])
})

test('procedure: nodes and rules each become a row', () => {
  const spec = load('examples/procedure/01-software-development-contract.zh-CN.json')
  const rows = traceRowsOf(spec)
  assert.equal(
    rows.length,
    (spec.nodes?.length || 0) + (spec.rules?.length || 0),
  )
  assert.ok(rows.some((r) => r.collection === 'nodes'))
})

test('relationship: entities and relations', () => {
  const spec = load('examples/relationship/fang-yuan-parties.zh-CN.json')
  const rows = traceRowsOf(spec)
  assert.equal(rows.length, (spec.entities?.length || 0) + (spec.relations?.length || 0))
  assert.ok(rows.some((r) => r.collection === 'entities'))
  assert.ok(rows.some((r) => r.collection === 'relations'))
})

test('justification: walks the tree of nodes', () => {
  const spec = load('examples/justification/neighbour-corridor-liability.zh-CN.json')
  const rows = traceRowsOf(spec)
  assert.ok(rows.length >= 3, `expected a tree of rows, got ${rows.length}`)
  assert.ok(rows.every((r) => r.id && r.label))
})

test('locTextOf summarises each material kind', () => {
  assert.equal(
    locTextOf({ type: 'evidence', loc: { file: '监控.mp4', page: 1 } }),
    '监控.mp4 · p. 1',
  )
  assert.equal(
    locTextOf({ type: 'case', loc: { caseNo: '（2031）示民终1号', court: '中院' } }),
    '（2031）示民终1号 · 中院',
  )
  assert.match(
    locTextOf({ type: 'statute', loc: { lawName: '民法典', article: 585 } }),
    /民法典/,
  )
  assert.equal(locTextOf({ type: 'web', loc: { url: 'https://example.com' } }), 'https://example.com')
})

test('unknown or empty spec yields no rows', () => {
  assert.deepEqual(traceRowsOf(null), [])
  assert.deepEqual(traceRowsOf({ type: 'unknown' }), [])
})
