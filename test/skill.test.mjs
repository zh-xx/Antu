// ============================================================
//  test/skill.test.mjs — the agent skill (skills/antu/) and the viewer page it carries
//
//  The skill folder is the state of the last release (tools/build-skill.mjs): rebuilt in the release pull
//  request, not in every change. So here it is checked for being complete and stamped with the version in
//  package.json, not for being byte-equal to a build of today's sources (the release workflow does that).
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SPEC_MARKER, buildHtml, buildViewerHtml, engineVersion, escapeForScript } from '../tools/lib/make-html.mjs'
import { checkSkill, skillFiles } from '../tools/build-skill.mjs'

const fakeEngine = { js: 'window.__engine = 1', css: '' }

test('the viewer template is the page buildHtml makes, with the marker where the data goes', () => {
  const spec = { type: 'fact', title: '含 </script> 与 "引号" 的标题', actors: [], events: [] }
  const template = buildViewerHtml(fakeEngine)
  assert.equal(template.split(SPEC_MARKER).length, 2, 'exactly one marker')
  // filling the marker with the data, the way the filler does, gives the page buildHtml makes for that data
  // (apart from the <title>, which buildHtml takes from the data)
  const filled = template.replace(SPEC_MARKER, escapeForScript(JSON.stringify(spec)))
  const direct = buildHtml(spec, fakeEngine)
  const body = (html) => html.slice(html.indexOf('</style>'))
  assert.equal(body(filled), body(direct))
  assert.ok(direct.includes(`<meta name="generator" content="antu ${engineVersion()}">`))
})

test('an unfilled template is valid JavaScript for the data: the page says no data was found', () => {
  const template = buildViewerHtml(fakeEngine)
  const m = /window\.__ANTU_SPEC__ = ([^;]*);/.exec(template)
  assert.equal(m[1], SPEC_MARKER)
  assert.equal(new Function(`return ${m[1]}`)(), null)
})

test('the skill folder is complete and carries the version of package.json', () => {
  const problems = checkSkill().filter((p) => !p.startsWith('differs from a build'))
  assert.deepEqual(problems, [])
  const version = engineVersion()
  assert.equal(readFileSync('skills/antu/VERSION', 'utf8').trim(), version)
  assert.ok(readFileSync('skills/antu/SKILL.md', 'utf8').includes(`version: "${version}"`))
})

test('SKILL.md is a valid skill: name = folder, a description within the limit, no placeholder left', () => {
  const text = readFileSync('skills/antu/SKILL.md', 'utf8')
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)
  assert.ok(front, 'front matter')
  assert.match(front[1], /^name: antu$/m)
  const description = front[1].replace(/\n {2,}/g, ' ').match(/^description: >-? ?(.*)$/m)?.[1] ?? ''
  assert.ok(description.length > 100 && description.length <= 1024, `description is ${description.length} characters`)
  assert.ok(!text.includes('{{'), 'no {{placeholder}} left')
  // every file SKILL.md points at exists
  const files = skillFiles()
  for (const ref of text.match(/references\/[\w.<>-]+\.md/g) ?? []) {
    if (ref.includes('<')) continue
    assert.ok(files.has(ref), `${ref} is part of the skill`)
  }
  for (const type of ['fact', 'procedure', 'relationship', 'justification']) {
    assert.ok(files.has(`references/guide-${type}.md`), type)
    assert.ok(files.has(`references/fields-${type}.md`), type)
    assert.ok(files.has(`examples/${type}/1-minimal.zh-CN.json`), type)
  }
})

test('the Python filler makes a page whose data is the JSON it was given, and refuses what is not a diagram', (t) => {
  const py = spawnSync('python3', ['--version'])
  if (py.error || py.status !== 0) return t.skip('python3 is not available')
  const dir = mkdtempSync(join(tmpdir(), 'antu-skill-'))
  const spec = JSON.parse(readFileSync('examples/agent/justification/1-minimal.zh-CN.json', 'utf8'))
  spec.nodes[0].label = '含 </script> 的文字'
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec))
  const out = join(dir, 'out.html')
  // the script finds the viewer beside itself (skills/antu/assets/), so it is the copy in the skill folder that runs
  execFileSync('python3', ['skills/antu/scripts/make_html.py', join(dir, 'spec.json'), '-o', out])
  const html = readFileSync(out, 'utf8')
  const m = /window\.__ANTU_SPEC__ = (.*?);<\/script>/s.exec(html)
  assert.deepEqual(JSON.parse(m[1]), spec)
  assert.ok(!html.includes(SPEC_MARKER), 'the marker is replaced')

  writeFileSync(join(dir, 'bad.json'), '{"type":"nope"}')
  const bad = spawnSync('python3', ['skills/antu/scripts/make_html.py', join(dir, 'bad.json')])
  assert.notEqual(bad.status, 0)
  assert.match(String(bad.stderr), /must be one of/)
})
