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
import process from 'node:process'
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
  // (apart from the static <title>, which buildHtml takes from the data; the page sets the tab's title itself when
  // it opens, and tools/verify checks that for the page the Python filler makes)
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

test('SKILL.md commands name the skill folder, so they run from any directory (#49)', () => {
  const text = readFileSync('skills/antu/SKILL.md', 'utf8')
  assert.ok(text.includes('<skill-dir>'), 'says what <skill-dir> is')
  assert.ok(!/\bnode scripts\//.test(text) && !/\bpython3 scripts\//.test(text), 'no command relies on the current directory being the skill folder')
  // and the command line does run from elsewhere: tools/verify/skill-cli.mjs runs it with another directory as cwd
})

test('SKILL.md tells an agent that a fact diagram of two parties needs groups or views (#49)', () => {
  const text = readFileSync('skills/antu/SKILL.md', 'utf8')
  assert.match(text, /two or more parties/)
  assert.match(text, /groups/)
  assert.match(text, /3-groups/)
})

test('SKILL.md says what the page bar switches and that some are off by default, and what to do when layout says the text is small (#49 C, F)', () => {
  const text = readFileSync('skills/antu/SKILL.md', 'utf8')
  assert.match(text, /\*\*Parties\*\* \(off\)/)
  assert.match(text, /\*\*Sources\*\* \(off\)/)
  assert.match(text, /off until the reader/)
  assert.match(text, /split the diagram the way the note says/)
  assert.match(text, /under 11 px/)
  assert.match(text, /under 9 px/)
  assert.match(text, /Never drop\s+facts to make it fit/)
  assert.match(text, /by issue/)
  assert.match(text, /by stage/)
  assert.match(text, /by group/)
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

// ---- the command line in the skill (skills/antu/scripts/antu.mjs): one bundled file, run by Node ----

import { existsSync, readdirSync } from 'node:fs'
import { fillViewer } from '../tools/lib/fill.mjs'
import { layoutMessage, validationMessage } from '../tools/lib/report.mjs'

const CLI = 'skills/antu/scripts/antu.mjs'
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
const EXAMPLE_DIRS = ['examples/agent', 'examples']
const examples = () =>
  EXAMPLE_DIRS.flatMap((dir) =>
    ['fact', 'procedure', 'relationship', 'justification'].flatMap((type) =>
      existsSync(`${dir}/${type}`) ? readdirSync(`${dir}/${type}`).filter((f) => f.endsWith('.json')).map((f) => `${dir}/${type}/${f}`) : [],
    ),
  )

test('the command line says its version, and has a help', () => {
  assert.equal(run('--version').stdout.trim(), `antu ${engineVersion()}`)
  assert.match(run('--help').stdout, /validate .*layout .*render/s)
  assert.equal(run('frob', 'x.json').status, 2)
  assert.equal(run('validate').status, 2, 'no file named')
  assert.equal(run('validate', 'no-such-file.json').status, 2)
})

test('validate: every example passes, in the same words as the MCP side', () => {
  // the zh-CN copy of each (the en copy has the same structure): a process per file
  for (const file of examples().filter((f) => f.endsWith('.zh-CN.json'))) {
    const r = run('validate', file)
    assert.equal(r.status, 0, `${file}: ${r.stderr}`)
    assert.equal(r.stdout.trim(), validationMessage(JSON.parse(readFileSync(file, 'utf8'))).text.trim(), file)
  }
})

test('validate and render refuse a diagram with a problem, and name it; render writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'antu-cli-'))
  const spec = JSON.parse(readFileSync('examples/agent/justification/3-issues.zh-CN.json', 'utf8'))
  spec.links[0].from = '不存在'
  writeFileSync(join(dir, 'bad.json'), JSON.stringify(spec))
  const v = run('validate', join(dir, 'bad.json'))
  assert.equal(v.status, 1)
  assert.match(v.stderr, /Validation failed, 1 problem/)
  assert.match(v.stderr, /不存在/)
  const r = run('render', join(dir, 'bad.json'), '-o', join(dir, 'bad.html'))
  assert.equal(r.status, 1)
  assert.equal(existsSync(join(dir, 'bad.html')), false)
  writeFileSync(join(dir, 'notjson.json'), '{ nope')
  assert.equal(run('validate', join(dir, 'notjson.json')).status, 2)
})

test('layout: the same report as the MCP side, for the small examples and a real case of each kind', () => {
  const files = examples().filter((f) => f.startsWith('examples/agent/') && f.endsWith('.zh-CN.json'))
  for (const f of ['examples/fact/neighbour-corridor-charging.zh-CN.json', 'examples/procedure/05-premises-lease.zh-CN.json', 'examples/relationship/fang-yuan-parties.zh-CN.json']) {
    if (existsSync(f)) files.push(f)
  }
  // The committed skill is the last release (rebuilt only in a release pull request), so a change to a layout
  // between two releases would always differ from it. This compares the report of a build of the current source.
  const built = mkdtempSync(join(tmpdir(), 'antu-built-skill-'))
  execFileSync('node', ['tools/build-skill.mjs', '--out', built], { stdio: 'ignore' })
  const cli = join(built, 'scripts', 'antu.mjs')
  for (const file of files) {
    const r = spawnSync(process.execPath, [cli, 'layout', file], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${file}: ${r.stderr}`)
    assert.equal(r.stdout.trim(), layoutMessage(JSON.parse(readFileSync(file, 'utf8'))).text.trim(), file)
  }
  // --theme names the look of the page (the page is fixed to it); an unknown name is refused
  const themed = join(built, 'themed.html')
  const rel = 'examples/agent/relationship/1-minimal.zh-CN.json'
  const t = spawnSync(process.execPath, [cli, 'render', rel, '--theme', 'legal', '-o', themed], { encoding: 'utf8' })
  assert.equal(t.status, 0, t.stderr)
  assert.match(readFileSync(themed, 'utf8'), /"theme":"legal"/)
  assert.equal(spawnSync(process.execPath, [cli, 'render', rel, '--theme', 'neon', '-o', themed], { encoding: 'utf8' }).status, 2)
  const v = run('layout', 'examples/agent/fact/1-minimal.zh-CN.json', '--orientation', 'vertical')
  assert.equal(v.status, 0)
  assert.equal(run('layout', 'examples/agent/fact/1-minimal.zh-CN.json', '--orientation', 'sideways').status, 2)
})

test('render: the page is the viewer with the data in it, the same as the Python filler makes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'antu-cli-'))
  const file = 'examples/agent/relationship/1-minimal.zh-CN.json'
  const out = join(dir, 'out.html')
  const r = run('render', file, '-o', out)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim().split('\n')[0], out)
  assert.match(r.stdout, /^Text on one screen \(1600×900\)/m, 'render also says how big the text is (#43)')
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(readFileSync(out, 'utf8'), fillViewer(readFileSync('skills/antu/assets/viewer.html', 'utf8'), spec))
  // and the Python way makes a page whose data is the same JSON
  const py = spawnSync('python3', ['--version'])
  if (!py.error && py.status === 0) {
    const out2 = join(dir, 'py.html')
    execFileSync('python3', ['skills/antu/scripts/make_html.py', file, '-o', out2])
    const data = (html) => JSON.parse(/window\.__ANTU_SPEC__ = (.*?);<\/script>/s.exec(html)[1])
    assert.deepEqual(data(readFileSync(out2, 'utf8')), data(readFileSync(out, 'utf8')))
  } else t.diagnostic('python3 not available: the comparison with the Python filler was skipped')
})

test('the command line needs nothing beside it: no import of a package, only built-in modules', () => {
  const code = readFileSync(CLI, 'utf8')
  const imported = [...code.matchAll(/(?:^|[;\n])import\s*(?:[^"';]*?from\s*)?"([^"]+)"/g)].map((m) => m[1])
  assert.ok(imported.length > 0)
  for (const name of imported) assert.ok(name.startsWith('node:'), `${name} is imported: the file would need it installed`)
})

test('fillViewer: a preset is written right after the data, in the same script, and only when given', () => {
  const template = '<script>window.__ANTU_SPEC__ = /*ANTU_SPEC*/null;</script><script>engine()</script>'
  const spec = { type: 'fact', title: 'a </script> b' }
  const plain = fillViewer(template, spec)
  assert.equal(plain.includes('__ANTU_PRESET__'), false, 'no preset, no preset line')
  const page = fillViewer(template, spec, { preset: { orientation: 'horizontal' } })
  const code = /<script>(window\.__ANTU_SPEC__ = .*?)<\/script>/s.exec(page)[1]
  assert.equal(code.includes('</script'), false, 'nothing in the data or the preset can close the script')
  const window = {}
  new Function('window', code)(window)
  assert.deepEqual(window.__ANTU_SPEC__, spec)
  assert.deepEqual(window.__ANTU_PRESET__, { orientation: 'horizontal' })
  assert.ok(page.indexOf('__ANTU_PRESET__') < page.indexOf('engine()'), 'the preset is there before the engine runs')
})
