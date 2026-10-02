// Every registered type has a design document whose status line says the release it was last checked against,
// and the document is covered by the leak check. The rules are in spec/versioning.md ("The status of a design document").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import '../src/renderers/index.js'
import { listKnowledgeTypes } from '../src/core/registry.js'

const release = JSON.parse(readFileSync('package.json', 'utf8')).version
const parts = (v) => v.split('.').map(Number)
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}
const head = (file) => readFileSync(file, 'utf8').split('\n').slice(0, 8).join('\n')
const runSource = readFileSync('tools/verify/run.mjs', 'utf8')

for (const { type } of listKnowledgeTypes()) {
  test(`${type}: the design document says which release its status line was checked against`, () => {
    for (const [file, re] of [
      [`spec/${type}/schema-draft.md`, /status line checked against (\d+\.\d+\.\d+)/],
      [`spec/${type}/schema-draft.zh-CN.md`, /状态行对照 (\d+\.\d+\.\d+) 检查过/],
    ]) {
      assert.ok(existsSync(file), `${file} is missing`)
      const m = head(file).match(re)
      assert.ok(m, `${file}: the status line has no "checked against X.Y.Z"`)
      assert.ok(!newer(m[1], release), `${file}: checked against ${m[1]}, newer than the release ${release}`)
    }
  })

  test(`${type}: its guide for agents exists and its design document is in the leak check`, () => {
    assert.ok(existsSync(`spec/agent/${type}/guide.md`), `spec/agent/${type}/guide.md is missing`)
    assert.ok(runSource.includes(`'spec/${type}/schema-draft'`), `tools/verify/run.mjs humanDocs lacks spec/${type}/schema-draft`)
  })
}

test('the version comparison can tell newer from older', () => {
  assert.ok(newer('0.6.0', '0.5.9'))
  assert.ok(newer('1.0.0', '0.9.9'))
  assert.ok(!newer('0.5.1', '0.5.1'))
  assert.ok(!newer('0.5.0', '0.5.1'))
})
