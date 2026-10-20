// The release workflow builds the two WorkBuddy packages and attaches them to the release (tools/workbuddy/build.mjs).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const release = readFileSync('.github/workflows/release.yml', 'utf8')
const build = readFileSync('tools/workbuddy/build.mjs', 'utf8')

test('the release builds the WorkBuddy packages, tests them, and attaches both zips under the names build.mjs gives them', () => {
  assert.match(release, /run: node tools\/workbuddy\/build\.mjs/)
  assert.match(release, /Test the packed WorkBuddy skill zip/)
  assert.match(release, /antu-workbuddy-skill-\$\{\{ steps\.check\.outputs\.version \}\}\.zip/)
  // the file names the release attaches are the ones the script writes
  assert.match(build, /`antu-workbuddy-\$\{version\}\.zip`/)
  assert.match(build, /`antu-workbuddy-skill-\$\{version\}\.zip`/)
  const create = release.slice(release.indexOf('gh release create'))
  assert.ok(create.includes('tools/workbuddy/antu-workbuddy-${{ steps.check.outputs.version }}.zip'), 'the connector zip is attached')
  assert.ok(create.includes('tools/workbuddy/antu-workbuddy-skill-${{ steps.check.outputs.version }}.zip'), 'the skill zip is attached')
})

test('the WorkBuddy zips are built and checked before the release is created, and a dry run still builds them', () => {
  const order = ['Build the WorkBuddy packages', 'Check the WorkBuddy skill zip is two folders deep', 'Test the packed WorkBuddy skill zip', 'Create the tag and the release']
  const at = order.map((name) => release.indexOf(name))
  assert.ok(at.every((i) => i > 0), 'every step is there')
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in this order')
  // only the last of them is skipped on a dry run
  assert.match(release, /- name: Create the tag and the release\n\s+if: \$\{\{ inputs\.dry_run != true \}\}/)
  assert.doesNotMatch(release.slice(release.indexOf('Build the WorkBuddy packages'), release.indexOf('Create the tag and the release')), /dry_run/)
})

test('the depth rule is for the skill zip only: the connector\'s own layout keeps its skill at skills/<name>/SKILL.md', () => {
  const step = release.slice(release.indexOf('Check the WorkBuddy skill zip is two folders deep'), release.indexOf('Test the packed WorkBuddy skill zip'))
  assert.match(step, /antu-workbuddy-skill-/)
  assert.doesNotMatch(step, /antu-workbuddy-\$\{\{ steps\.check\.outputs\.version \}\}\.zip/)
  assert.doesNotMatch(step, /antu-workbuddy-\*\.zip/)
})
