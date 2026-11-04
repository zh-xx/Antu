// The WorkBuddy skill package (tools/workbuddy): platform header fields, size cap, gzipped viewer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import {
  buildSkillFolder,
  checkSkillFolder,
  repoVersion,
  SKILL_MAX_BYTES,
  DISPLAY_NAME_ZH,
  DISPLAY_NAME_EN,
  DISPLAY_NAME_SLIM_ZH,
  DESCRIPTION_ZH,
  DESCRIPTION_EN,
} from '../tools/workbuddy/build.mjs'

const version = repoVersion()

const bytesOf = (d) =>
  readdirSync(d, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? bytesOf(join(d, e.name)) : statSync(join(d, e.name)).size),
    0,
  )

test("the skill package is the general skill with WorkBuddy's header and section, and passes its checks", () => {
  const skillDir = buildSkillFolder()
  assert.deepEqual(checkSkillFolder(skillDir, version), [])
  const text = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
  assert.match(text, new RegExp(`^display_name: ${DISPLAY_NAME_ZH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  assert.match(text, new RegExp(`^display_name_en: ${DISPLAY_NAME_EN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  assert.match(text, new RegExp(`^description_zh: ${DESCRIPTION_ZH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  assert.match(text, new RegExp(`^description_en: ${DESCRIPTION_EN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  assert.match(text, /^author: Jicheng$/m)
  assert.equal(readFileSync(join(skillDir, 'icon.svg'), 'utf8'), readFileSync('tools/workbuddy/src/icon.svg', 'utf8'))
  const general = readFileSync('skills/antu/SKILL.md', 'utf8')
  assert.ok(text.includes('## 2. Write the JSON'), 'the body of the general skill is kept')
  assert.ok(general.includes('## 2. Write the JSON'))
  for (const f of ['references/guide-fact.md', 'references/fields-relationship.md', 'examples/justification-1-minimal.en.json']) {
    assert.equal(readFileSync(join(skillDir, f), 'utf8'), readFileSync(join('skills/antu', f), 'utf8'), f)
  }
})

test('the skill package checks catch a missing field, a nested header, a deeper folder and the old update command', () => {
  const skillDir = buildSkillFolder()
  const file = join(skillDir, 'SKILL.md')
  const good = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, good.replace(/^author: .*\n/m, ''))
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('author')))
    writeFileSync(file, good.replace('license: AGPL-3.0-or-later', 'metadata:\n  version: "1"'))
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('metadata')))
    writeFileSync(file, good + '\n`npx skills update antu -g`\n')
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('npx skills update')))
    writeFileSync(file, good)
    mkdirSync(join(skillDir, 'examples/deep'), { recursive: true })
    writeFileSync(join(skillDir, 'examples/deep/x.json'), '{}')
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('deeper than')))
  } finally {
    writeFileSync(file, good)
    rmSync(join(skillDir, 'examples/deep'), { recursive: true, force: true })
  }
})

test('the skill package carries the developer name registered on the platform (Jicheng)', () => {
  assert.match(readFileSync(join(buildSkillFolder(), 'SKILL.md'), 'utf8'), /^author: Jicheng$/m)
})

test('the skill package is under what the platform takes unzipped, with its viewer page compressed', () => {
  const skillDir = buildSkillFolder()
  assert.ok(bytesOf(skillDir) <= SKILL_MAX_BYTES, `${bytesOf(skillDir)} bytes`)
  const gz = readFileSync(join(skillDir, 'assets/viewer.html.gz'))
  assert.equal(gunzipSync(gz).toString('utf8'), readFileSync('skills/antu/assets/viewer.html', 'utf8'), 'the page is the same, only compressed')
  assert.throws(() => statSync(join(skillDir, 'assets/viewer.html')), 'no plain copy beside it')
})

test('the size check fails when the package is too large or the viewer is not compressed', () => {
  const skillDir = buildSkillFolder()
  const big = join(skillDir, 'references/big.bin')
  try {
    writeFileSync(big, Buffer.alloc(SKILL_MAX_BYTES))
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('WorkBuddy takes 3 MB at most')))
    rmSync(big)
    writeFileSync(join(skillDir, 'assets/viewer.html'), 'x')
    assert.ok(checkSkillFolder(skillDir, version).some((p) => p.includes('must ship compressed')))
  } finally {
    rmSync(big, { force: true })
    rmSync(join(skillDir, 'assets/viewer.html'), { force: true })
  }
})

test('the packed skill still renders with its own command line and Python fallback', () => {
  const skillDir = buildSkillFolder()
  const out = mkdtempSync(join(tmpdir(), 'antu-wb-skill-'))
  try {
    const spec = join(skillDir, 'examples/fact-1-minimal.zh-CN.json')
    const node = spawnSync(process.execPath, [join(skillDir, 'scripts/antu.mjs'), 'render', spec, '-o', join(out, 'node.html')], { encoding: 'utf8' })
    assert.equal(node.status, 0, node.stderr || node.stdout)
    assert.match(readFileSync(join(out, 'node.html'), 'utf8'), /antu 0\.\d+\.\d+/)
    const py = spawnSync('python3', ['-I', join(skillDir, 'scripts/make_html.py'), spec, '-o', join(out, 'py.html')], { encoding: 'utf8' })
    assert.equal(py.status, 0, py.stderr || py.stdout)
    assert.match(readFileSync(join(out, 'py.html'), 'utf8'), /antu 0\.\d+\.\d+/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('the slim skill carries no command line, runs the pinned npm package with npx, and passes its checks', () => {
  const slim = buildSkillFolder(version, { slim: true })
  assert.deepEqual(checkSkillFolder(slim, version, { slim: true }), [])
  assert.throws(() => statSync(join(slim, 'scripts/antu.mjs')))
  assert.ok(bytesOf(slim) < 1_500_000, `${bytesOf(slim)} bytes`)
  const text = readFileSync(join(slim, 'SKILL.md'), 'utf8')
  assert.match(text, new RegExp(`^display_name: ${DISPLAY_NAME_SLIM_ZH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  assert.equal(readFileSync(join(slim, 'icon.svg'), 'utf8'), readFileSync('tools/workbuddy/src/icon.svg', 'utf8'))
  assert.ok(text.includes(`npx -y -p @zh-xx/antu@${version} antu `))
  assert.ok(!/node <skill-dir>\/scripts\/antu\.mjs/.test(text))
  assert.ok(statSync(join(buildSkillFolder(), 'scripts/antu.mjs')).size > 1_000_000)
})

test('the slim checks catch a command line left inside and a command that is not pinned', () => {
  const slim = buildSkillFolder(version, { slim: true })
  const file = join(slim, 'SKILL.md')
  const good = readFileSync(file, 'utf8')
  try {
    writeFileSync(join(slim, 'scripts/antu.mjs'), 'x')
    assert.ok(checkSkillFolder(slim, version, { slim: true }).some((p) => p.includes('carries no command line')))
    rmSync(join(slim, 'scripts/antu.mjs'))
    writeFileSync(file, good.replaceAll(`npx -y -p @zh-xx/antu@${version} antu `, 'npx antu '))
    assert.ok(checkSkillFolder(slim, version, { slim: true }).some((p) => p.includes('with npx')))
  } finally {
    writeFileSync(file, good)
    rmSync(join(slim, 'scripts/antu.mjs'), { force: true })
  }
})

test('the slim skill still makes a page with the Python fallback, from its compressed viewer', () => {
  const slim = buildSkillFolder(version, { slim: true })
  const out = mkdtempSync(join(tmpdir(), 'antu-wb-slim-'))
  try {
    const py = spawnSync('python3', ['-I', join(slim, 'scripts/make_html.py'), join(slim, 'examples/fact-1-minimal.zh-CN.json'), '-o', join(out, 'p.html')], { encoding: 'utf8' })
    assert.equal(py.status, 0, py.stderr || py.stdout)
    assert.match(readFileSync(join(out, 'p.html'), 'utf8'), /antu 0\.\d+\.\d+/)
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})
