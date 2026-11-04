// Release attaches the WorkBuddy skill zip, not the retired connector zip.
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const release = readFileSync('.github/workflows/release.yml', 'utf8')

test('the release builds and attaches the WorkBuddy skill zip, not the connector', () => {
  assert.equal(existsSync('tools/workbuddy/build.mjs'), true, 'tools/workbuddy/build.mjs is present')
  assert.match(release, /tools\/workbuddy\/build\.mjs/)
  assert.match(release, /antu-workbuddy-skill-\$\{\{ steps\.check\.outputs\.version \}\}\.zip/)
  assert.doesNotMatch(release, /antu-workbuddy-\$\{\{ steps\.check\.outputs\.version \}\}\.zip/)
  assert.doesNotMatch(release, /connector-meta\.json/)
  assert.match(release, /antu-skill-\$\{\{ steps\.check\.outputs\.version \}\}\.zip/)
  const create = release.slice(release.indexOf('gh release create'))
  assert.ok(create.includes('antu-skill-${{ steps.check.outputs.version }}.zip'))
  assert.ok(create.includes('antu-workbuddy-skill-${{ steps.check.outputs.version }}.zip'))
  assert.ok(!create.includes('antu-workbuddy-${{ steps.check.outputs.version }}.zip'))
})
