// ============================================================
//  test/dsh-engines-compatibility.test.mjs — engines.dsh vs peers (#360)
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'

const pkgDir = 'tools/dsh/package'
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const enginesDsh = pkg.engines?.dsh
const peerDshTools = pkg.peerDependencies?.['@deepseek-ai/dsh-tools']

/** Issue #360 example range — must not ship: npm semver excludes other 0.2.y-rc tuples */
const LEXCAB_BAD_EXAMPLE = '>=0.2.0-rc.2 <0.3.0'

const shouldSupport = [
  '0.2.0-rc.2',
  '0.2.0-rc.3',
  '0.2.1-rc.0',
  '0.2.1-rc.5',
  '0.2.2-rc.1',
  '0.2.0', // semver-only: stable 0.2.x not host-smoke-tested (#360)
  '0.2.1',
  '0.2.2',
]

const shouldReject = [
  '0.2.0-rc.1',
  '0.2.3-rc.0',
  '0.3.0-rc.1',
  '0.3.0',
  '0.1.9',
]

test('LexCab bad example range excludes 0.2.2-rc.1 (npm semver prerelease rule)', () => {
  assert.equal(
    semver.satisfies('0.2.2-rc.1', LEXCAB_BAD_EXAMPLE),
    false,
    `${LEXCAB_BAD_EXAMPLE} must not be used when 0.2.2-rc.1 is supported`,
  )
  assert.equal(semver.satisfies('0.2.1-rc.5', LEXCAB_BAD_EXAMPLE), false)
  assert.equal(semver.satisfies('0.2.0-rc.3', LEXCAB_BAD_EXAMPLE), true)
})

test('engines.dsh is declared and equals peerDependencies["@deepseek-ai/dsh-tools"]', () => {
  assert.ok(enginesDsh, 'engines.dsh required for LexCab format 1')
  assert.ok(peerDshTools)
  assert.equal(enginesDsh, peerDshTools)
})

test('declared range accepts supported DSH versions and rejects out-of-range', () => {
  for (const version of shouldSupport) {
    assert.ok(semver.satisfies(version, enginesDsh), `${version} should match engines.dsh`)
  }
  for (const version of shouldReject) {
    assert.equal(semver.satisfies(version, enginesDsh), false, `${version} should not match engines.dsh`)
  }
})
