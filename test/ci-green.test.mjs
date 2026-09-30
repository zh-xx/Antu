// ============================================================
//  test/ci-green.test.mjs — the release gate that asks whether a commit's checks are all green
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { judge } from '../tools/verify/ci-green.mjs'

const run = (name, status = 'completed', conclusion = 'success') => ({ name, status, conclusion })

test('every check passed: nothing stops the release', () => {
  assert.deepEqual(judge([run('verify'), run('skill-cli (ubuntu-latest, 22)'), run('skill-cli (windows-latest, 18)', 'completed', 'skipped')]), [])
})

test('a failed check stops it, and is named', () => {
  const problems = judge([run('verify', 'completed', 'failure'), run('skill-cli (ubuntu-latest, 22)')])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /verify: failure/)
})

test('a check that has not finished stops it', () => {
  const problems = judge([run('verify'), run('skill-cli (macos-latest, 20)', 'in_progress', null)])
  assert.match(problems.join('\n'), /skill-cli \(macos-latest, 20\): still in_progress/)
})

test('no verify check at all stops it, so a commit that CI never saw cannot be released', () => {
  assert.match(judge([run('skill-cli (ubuntu-latest, 22)')]).join('\n'), /no "verify" check/)
  assert.match(judge([]).join('\n'), /no "verify" check/)
})

test('the release job itself, still running, is left out; any other run is not', () => {
  const runs = [run('verify'), run('release', 'in_progress', null)]
  assert.deepEqual(judge(runs, { ignore: 'release' }), [])
  assert.equal(judge(runs).length, 1)
})
