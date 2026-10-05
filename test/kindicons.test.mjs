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

test('every registered kind has its sketch as a file for the README, and the files are what the source gives', async () => {
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const process = (await import('node:process')).default
  const registered = walk('src/renderers')
    .filter((f) => f.endsWith('register.js'))
    .map((f) => readFileSync(f, 'utf8').match(/registerRenderer\('([a-z]+)', '([a-z]+)'/))
    .filter(Boolean)
    .map((m) => m[2])
  const missing = registered.filter((k) => !existsSync(`assets/kinds/${k}.svg`))
  assert.deepEqual(missing, [], 'run node tools/gen/kind-icons.mjs')
  const r = spawnSync(process.execPath, ['tools/gen/kind-icons.mjs', '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  // and the README shows only sketches that exist
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    const text = readFileSync(readme, 'utf8')
    const shown = [...text.matchAll(/src="(assets\/kinds\/[a-z]+\.svg)"/g)].map((m) => m[1])
    assert.deepEqual(shown.filter((f) => !existsSync(f)), [], `${readme} shows a sketch that is not there`)
    assert.deepEqual(registered.filter((k) => !shown.includes(`assets/kinds/${k}.svg`)), [], `${readme} leaves out a way of drawing`)
  }
})
