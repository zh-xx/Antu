// Three versions the label card can show (issue 131).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import '../src/renderers/index.js'
import { diagramAboutOf } from '../src/core/diagramAbout.js'
import { engineVersion } from '../src/core/engineVersion.js'
import { knowledgeOf } from '../src/core/registry.js'

const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version

test('engineVersion falls back to dev when the Vite define is not injected', () => {
  // Unit tests run the source modules, not a Vite build: no __ANTU_VERSION__.
  assert.equal(engineVersion(), 'dev')
})

test('diagramAboutOf names the format generation and the diagram entry from the registry', () => {
  const about = diagramAboutOf('fact', 'timeline')
  const k = knowledgeOf('fact')
  assert.equal(about.engine, 'dev')
  assert.equal(about.format, k.specVersion)
  assert.deepEqual(about.diagram, {
    version: k.diagrams.timeline.version,
    status: k.diagrams.timeline.status,
    since: k.diagrams.timeline.since,
  })
  assert.equal(about.diagram.status, 'experimental')
})

test('diagramAboutOf tolerates a missing type or kind', () => {
  assert.deepEqual(diagramAboutOf(null, 'timeline'), { engine: 'dev', format: null, diagram: null })
  assert.equal(diagramAboutOf('fact', 'nope').diagram, null)
  assert.equal(diagramAboutOf('fact', 'nope').format, knowledgeOf('fact').specVersion)
})

test('package.json release is what the built page will inject (sanity)', () => {
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/)
})
