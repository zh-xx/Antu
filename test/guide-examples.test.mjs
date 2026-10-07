// The guide of each type names the examples an agent can open, and the names are the files of examples/agent/<type>/:
// the guides are written by hand, the examples by the build, and a name that is not a file made a model guess (#138).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const TYPES = ['fact', 'procedure', 'relationship', 'justification']

for (const type of TYPES) {
  const files = new Set(readdirSync(`examples/agent/${type}`).filter((f) => f.endsWith('.en.json')).map((f) => f.replace('.en.json', '')))
  const guide = readFileSync(`spec/agent/${type}/guide.md`, 'utf8')
  const named = new Set((guide.match(/`(\d+-[a-z][a-z0-9-]*)`/g) ?? []).map((m) => m.slice(1, -1)))

  test(`${type}: the guide names every example, and only examples that exist`, () => {
    assert.ok(files.size > 0, 'there are examples')
    for (const f of files) assert.ok(named.has(f), `spec/agent/${type}/guide.md does not name \`${f}\``)
    for (const n of named) assert.ok(files.has(n), `spec/agent/${type}/guide.md names \`${n}\`, which is not a file of examples/agent/${type}/`)
  })

  test(`${type}: each example has its two languages`, () => {
    const zh = new Set(readdirSync(`examples/agent/${type}`).filter((f) => f.endsWith('.zh-CN.json')).map((f) => f.replace('.zh-CN.json', '')))
    assert.deepEqual([...zh].sort(), [...files].sort())
  })
}
