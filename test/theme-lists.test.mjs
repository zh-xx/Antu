// Every place that lists the themes by hand must list the ones THEME_IDS has (issue #209: the dark theme was added
// to src/ and the lists elsewhere were left at three). The DSH Host tools are the one deliberate exception, below.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEME_IDS } from '../src/theme/themes.js'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('the lists in code follow THEME_IDS', () => {
  const dts = read('src/embed/antu-embed.d.ts').match(/export type AntuTheme = ([^\n]+)/)?.[1] ?? ''
  assert.deepEqual([...dts.matchAll(/'(\w+)'/g)].map((m) => m[1]), THEME_IDS, 'AntuTheme in antu-embed.d.ts')
  const htmlTheme = read('tools/api/html.d.ts').match(/theme\?:\s*([^\n)]+)/)?.[1] ?? ''
  assert.deepEqual([...htmlTheme.matchAll(/'(\w+)'/g)].map((m) => m[1]), THEME_IDS, 'theme union in html.d.ts')
  const vs = read('src/shell/viewState.js').match(/const THEMES = \[([^\]]+)\]/)?.[1] ?? ''
  assert.deepEqual([...vs.matchAll(/'(\w+)'/g)].map((m) => m[1]), THEME_IDS, 'THEMES in shell/viewState.js')
  assert.match(read('tools/mcp/server.mjs'), /z\s*\.enum\(THEME_IDS\)/, 'the MCP theme argument is built from THEME_IDS')
})

test('the docs and the skill name every theme id', () => {
  for (const file of ['spec/theme.md', 'spec/embed.md', 'spec/embed.zh-CN.md', 'spec/mcp-server.md', 'spec/mcp-server.zh-CN.md', 'spec/agent/README.md', 'tools/skill/SKILL.md', 'README.md', 'README.zh-CN.md']) {
    const text = read(file)
    for (const id of THEME_IDS) assert.ok(text.includes(`\`${id}\``), `${file} does not name \`${id}\``)
  }
})

test('the DSH plugin offers the model the light themes only: dark is the host\'s mode, not a choice made in a call', () => {
  const light = THEME_IDS.filter((id) => id !== 'dark')
  const host = read('tools/dsh/src/host.mjs')
  const listed = host.match(/enum: \[([^\]]+)\]/g)?.map((m) => [...m.matchAll(/'(\w+)'/g)].map((x) => x[1])).find((l) => l.includes('document'))
  assert.deepEqual(listed, light, 'the Host tool theme enum')
})
