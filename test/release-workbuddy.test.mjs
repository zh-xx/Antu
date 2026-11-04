// WorkBuddy open-platform packaging is retired: the release must not build or attach those zips.
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const release = readFileSync('.github/workflows/release.yml', 'utf8')

test('the release no longer builds or attaches WorkBuddy packages', () => {
  assert.equal(existsSync('tools/workbuddy'), false, 'tools/workbuddy/ is gone')
  assert.doesNotMatch(release, /tools\/workbuddy/)
  assert.doesNotMatch(release, /antu-workbuddy/)
  assert.doesNotMatch(release, /WorkBuddy/)
  assert.match(release, /antu-skill-\$\{\{ steps\.check\.outputs\.version \}\}\.zip/)
  const create = release.slice(release.indexOf('gh release create'))
  assert.ok(create.includes('antu-skill-${{ steps.check.outputs.version }}.zip'))
  assert.ok(!create.includes('antu-workbuddy'))
})
