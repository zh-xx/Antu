// ============================================================
//  test/versioning.test.mjs — the format generation (`specVersion`) and the release number
//  The rules are spec/versioning.md.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import '../src/renderers/index.js'
import { validateSpec } from '../src/core/validate.js'
import { knowledgeOf, listKnowledgeTypes, registerKnowledge } from '../src/core/registry.js'

const TYPES = ['fact', 'procedure', 'relationship', 'justification']
const example = (type) => JSON.parse(readFileSync(`examples/agent/${type}/${readdirSync(`examples/agent/${type}`).sort()[0]}`, 'utf8'))

test('every registered type states the generation of its format, a whole number', () => {
  assert.deepEqual(listKnowledgeTypes().map((t) => t.type).sort(), [...TYPES].sort())
  for (const t of TYPES) assert.ok(Number.isInteger(knowledgeOf(t).specVersion) && knowledgeOf(t).specVersion >= 1, t)
})

test('registering a type without a specVersion is refused', () => {
  const k = { validate: () => [], describe: () => '', layouts: {} }
  assert.throws(() => registerKnowledge('no-such-type', k), /specVersion/)
  assert.throws(() => registerKnowledge('no-such-type', { ...k, specVersion: '1' }), /specVersion/)
})

test('the examples say which generation they follow, and it is the one the engine knows', () => {
  for (const dir of ['examples', 'examples/agent']) {
    for (const t of TYPES) {
      for (const f of readdirSync(`${dir}/${t}`).filter((f) => f.endsWith('.json'))) {
        const spec = JSON.parse(readFileSync(`${dir}/${t}/${f}`, 'utf8'))
        assert.equal(spec.specVersion, knowledgeOf(t).specVersion, `${dir}/${t}/${f}`)
      }
    }
  }
})

test('specVersion: absent is fine; the current one is fine; a newer one is an error; a malformed one is an error', () => {
  for (const t of TYPES) {
    const spec = example(t)
    const known = knowledgeOf(t).specVersion
    const errors = (v) => validateSpec({ ...spec, specVersion: v })
    const noVersion = { ...spec }
    delete noVersion.specVersion
    assert.deepEqual(validateSpec(noVersion), [], `${t}: absent`)
    assert.deepEqual(errors(known), [], `${t}: current`)
    assert.ok(errors(known + 1).some((e) => e.includes('specVersion') && e.includes('newer')), `${t}: newer`)
    for (const bad of ['1', 1.5, 0, -1, null, true]) {
      assert.ok(errors(bad).some((e) => e.includes('specVersion')), `${t}: ${JSON.stringify(bad)}`)
    }
  }
})

test('the release number is written once: package.json, and the lock file and the changelog agree with it', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages[''].version, pkg.version)
  const log = readFileSync('CHANGELOG.md', 'utf8')
  assert.ok(log.includes(`## ${pkg.version}`), `CHANGELOG.md has a section for ${pkg.version}`)
  // the MCP server reads the version from package.json rather than keeping a copy
  const server = readFileSync('tools/mcp/server.mjs', 'utf8')
  assert.ok(!/version:\s*'\d/.test(server), 'no literal version in the MCP server')
})
