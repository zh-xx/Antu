// ============================================================
//  test/kindicons.test.mjs — every registered way of drawing has a sketch in the picker's panel
//  (src/shell/KindIcon.jsx). Read as text: the sketches are JSX, which Node's test runner does not load.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

test('every registered kind has a sketch in KindIcon', () => {
  const registered = walk('src/renderers')
    .filter((f) => f.endsWith('register.js'))
    .map((f) => readFileSync(f, 'utf8').match(/registerRenderer\('([a-z]+)', '([a-z]+)'/))
    .filter(Boolean)
    .map((m) => ({ type: m[1], kind: m[2] }))
  assert.ok(registered.length >= 10, 'found the registrations')
  const icons = readFileSync('src/shell/KindIcon.jsx', 'utf8')
  const sketched = new Set([...icons.matchAll(/^ {2}([a-z]+): \(/gm)].map((m) => m[1]))
  const missing = registered.filter((r) => !sketched.has(r.kind)).map((r) => `${r.type}/${r.kind}`)
  assert.deepEqual(missing, [], 'a kind without a sketch shows an empty frame in the panel')
})
