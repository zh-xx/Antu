// ============================================================
//  test/cli-schema.test.mjs — the command line explains the fields at run time (#113 stage 1)
//
//  schema / guide / examples / version are the same reference material the MCP tools give, and the source command
//  line must answer without the skill's built copies. The update notice is off here, so a JSON output carries none.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const CLI = 'tools/cli/antu.mjs'
const run = (...args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ANTU_NO_UPDATE_NOTIFIER: '1' },
  })

test('schema <type> prints a non-trivial field table, and defaults to fact', () => {
  const r = run('schema', 'fact')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^Fields of a fact spec/)
  assert.match(r.stdout, /\[envelope\]/)
  assert.match(r.stdout, /specVersion/)
  assert.ok(r.stdout.length > 1000, 'the table is more than a heading')
  assert.equal(run('schema').stdout, r.stdout, 'no type means fact, as in MCP')
})

test('guide <type> prints the mechanism notes', () => {
  const r = run('guide', 'fact')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^# Mechanism notes for an agent/)
  assert.match(r.stdout, /chronicle/)
})

test('examples --type fact lists the small examples, starting with 1-minimal', () => {
  const r = run('examples', '--type', 'fact')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^Small examples: \d+/)
  assert.match(r.stdout, /examples\/agent\/fact\/1-minimal\.en\.json/)
  assert.match(r.stdout, /1-minimal/)
})

test('examples <name> fetches one in full, and --lang picks the Chinese copy', () => {
  const one = run('examples', '1-minimal.en.json', '--type', 'fact')
  assert.equal(one.status, 0, one.stderr)
  assert.match(one.stdout, /^# 1-minimal\.en\.json/)
  assert.match(one.stdout, /"type": "fact"/)
  const zh = run('examples', '--type', 'fact', '--lang', 'zh-CN')
  assert.equal(zh.status, 0, zh.stderr)
  assert.match(zh.stdout, /1-minimal\.zh-CN\.json/)
})

test('version and version --json say the program version; JSON carries no _notice when the notifier is off', () => {
  const plain = run('version')
  assert.equal(plain.status, 0, plain.stderr)
  assert.match(plain.stdout, /^antu \S+/)
  const json = run('version', '--json')
  assert.equal(json.status, 0, json.stderr)
  const parsed = JSON.parse(json.stdout)
  assert.equal(typeof parsed.version, 'string')
  assert.ok(parsed.version.length > 0)
  assert.ok(!('_notice' in parsed), 'nothing to say, so the key is absent (not null)')
  // schema --json gets the same treatment
  const schema = JSON.parse(run('schema', 'fact', '--json').stdout)
  assert.equal(schema.type, 'fact')
  assert.ok(schema.text.length > 1000)
  assert.ok(!('_notice' in schema))
})

test('an unknown type is the command being wrong: exit code 2, with the types that exist', () => {
  const schema = run('schema', 'nope')
  assert.equal(schema.status, 2)
  assert.match(schema.stderr, /Available: fact, procedure, relationship, justification/)
  assert.equal(run('guide', 'nope').status, 2)
  assert.equal(run('examples', '--type', 'nope').status, 2)
})

test('the old commands still answer', () => {
  assert.match(run('--version').stdout, /^antu /)
  assert.match(run('versions').stdout, /^Antu \S+/)
  assert.equal(run('frob').status, 2)
})
