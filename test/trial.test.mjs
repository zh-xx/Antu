// The trial's tools keep a model in its folders, the script's checks find what they are meant to, and the whole flow
// runs with the stand-in model (tools/trial/, spec/trial.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { join, resolve } from 'node:path'

import { makeTools, runAgent } from '../tools/trial/agent.mjs'
import { makeFake } from '../tools/trial/fake.mjs'
import { coverage, datesNotInMaterial, numbersNotInMaterial } from '../tools/trial/score.mjs'

const skillDir = resolve('skills/antu')

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'antu-trial-'))
  const work = join(root, 'work')
  const materialDir = join(root, 'material')
  mkdirSync(work)
  mkdirSync(materialDir)
  writeFileSync(join(materialDir, 'case.md'), '2030年6月2日，钱敏充电。第三条。')
  writeFileSync(join(root, 'secret.txt'), 'outside')
  return { root, work, tools: makeTools({ work, skillDir, materialDir }) }
}

test('the tools read the skill, the material and the working folder, and nothing else', () => {
  const { root, tools } = sandbox()
  try {
    assert.match(tools.read_file({ path: 'skill/SKILL.md' }), /Antu/)
    assert.match(tools.read_file({ path: 'material/case.md' }), /钱敏/)
    assert.throws(() => tools.read_file({ path: '../secret.txt' }), /outside the allowed folder/)
    assert.throws(() => tools.read_file({ path: 'skill/../../secret.txt' }), /outside the allowed folder/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a folder can be listed, inside the same limits', () => {
  const { root, tools } = sandbox()
  try {
    assert.match(tools.list_files({ path: 'skill/examples' }), /fact\//)
    assert.match(tools.list_files({ path: 'material' }), /case\.md/)
    assert.match(tools.list_files({ path: '.' }), /^$/)
    assert.match(tools.list_files({ path: 'nope' }), /no such folder/)
    assert.throws(() => tools.list_files({ path: '..' }), /outside the allowed folder/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a file can be written only inside the working folder', () => {
  const { root, work, tools } = sandbox()
  try {
    assert.match(tools.write_file({ path: 'a/b.json', content: '{}' }), /^wrote /)
    assert.ok(existsSync(join(work, 'a/b.json')))
    assert.throws(() => tools.write_file({ path: '../escape.txt', content: 'x' }), /outside the allowed folder/)
    assert.throws(() => tools.write_file({ path: '/tmp/escape.txt', content: 'x' }), /outside the allowed folder/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the command line tool runs only the four subcommands, on relative file names', () => {
  const { root, tools } = sandbox()
  try {
    assert.match(tools.antu({ args: ['--version'] }), /must be one of/)
    assert.match(tools.antu({ args: ['validate', '/etc/passwd'] }), /relative to your working folder/)
    assert.match(tools.antu({ args: ['validate', '../x.json'] }), /relative to your working folder/)
    assert.match(tools.antu({ args: ['rm', '-rf', '.'] }), /must be one of/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the command line gets a clean environment: a variable of this process does not reach it', () => {
  const { root, work, tools } = sandbox()
  process.env.ANTU_TRIAL_PROBE = 'must-not-be-seen'
  try {
    writeFileSync(join(work, 'probe.json'), '{"type":"fact"}')
    const out = tools.antu({ args: ['validate', 'probe.json'] })
    assert.ok(!out.includes('must-not-be-seen'))
  } finally {
    delete process.env.ANTU_TRIAL_PROBE
    rmSync(root, { recursive: true, force: true })
  }
})

test('the stand-in model writes the reference, checks it and makes the page', async () => {
  const { root, work, tools } = sandbox()
  try {
    const referenceText = readFileSync('examples/fact/neighbour-corridor-charging.zh-CN.json', 'utf8')
    const r = await runAgent({ provider: makeFake({ referenceText }), system: 's', user: 'u', tools, maxTurns: 8 })
    assert.equal(r.stopped, 'done')
    assert.ok(existsSync(join(work, 'spec.json')) && existsSync(join(work, 'diagram.html')))
    const validate = r.messages.filter((m) => m.role === 'tool').map((m) => m.content).find((c) => c.includes('Validation passed'))
    assert.ok(validate, 'validate passed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a loop that never stops asking for tools ends at the turn limit', async () => {
  const forever = async () => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'read_file', arguments: '{"path":"skill/VERSION"}' } }] } }] })
  const { root, tools } = sandbox()
  try {
    const r = await runAgent({ provider: forever, system: 's', user: 'u', tools, maxTurns: 3 })
    assert.equal(r.turns, 3)
    assert.equal(r.stopped, 'turns')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('dates and numbers that the material does not have are found, the others are not', () => {
  const material = '2030年6月2日，钱敏充电。依据第三条，（2031）示民终1号。'
  const spec = { events: [{ date: '2030-06-02' }, { date: '2030-06-03T10:00' }, { dateEnd: '2030-06' }], note: '第三条和第九条，（2031）示民终1号，（2031）示民终2号' }
  assert.deepEqual(datesNotInMaterial(spec, material), ['2030-06-03T10:00'])
  assert.deepEqual(numbersNotInMaterial(spec, material).sort(), ['第九条', '（2031）示民终2号'].sort())
})

test('the coverage counts the names of the reference that the diagram has and the lists both have', () => {
  const reference = { actors: [{ name: '钱敏' }, { name: '孙浩' }], sources: [{ name: '不计入' }], slots: [1, 2, 3] }
  const spec = { actors: [{ name: '钱敏' }], slots: [1, 2] }
  const c = coverage(spec, reference)
  assert.deepEqual(c.names, { have: 1, of: 2, missing: ['孙浩'] })
  assert.deepEqual(c.lists.slots, { diagram: 2, reference: 3 })
})
