import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, THEME_IDS, DEFAULT_THEME, isTheme, themeOf } from '../src/theme/themes.js'

const keysOf = (o) => Object.keys(o).sort().join(',')
const RELATIONS = ['equity', 'control', 'contract', 'debt', 'guarantee', 'kinship', 'employment', 'agency', 'other']

test('the document theme is the default and every id is known', () => {
  assert.equal(DEFAULT_THEME, 'document')
  assert.deepEqual(THEME_IDS, ['document', 'modern', 'legal'])
  for (const id of THEME_IDS) assert.ok(isTheme(id))
  assert.equal(isTheme('neon'), false)
  assert.equal(themeOf('neon').id, DEFAULT_THEME)
})

test('every theme answers every role the first theme answers', () => {
  const base = THEMES[THEME_IDS[0]]
  for (const id of THEME_IDS) {
    const t = THEMES[id]
    for (const group of ['chrome', 'font', 'color', 'radius', 'entity', 'relation', 'group', 'pill']) {
      assert.equal(keysOf(t[group]), keysOf(base[group]), `${id}.${group}`)
    }
    assert.equal(t.camp.length, base.camp.length, `${id}.camp`)
    for (const r of RELATIONS) assert.ok(t.relation[r], `${id} has ${r}`)
  }
})

test('in black and white every relation kind is told apart by width, dash or double line', () => {
  for (const id of THEME_IDS) {
    const seen = new Map()
    for (const r of RELATIONS) {
      const { width, dash, double } = THEMES[id].relation[r]
      const key = [width, dash ?? '', !!double].join('|')
      assert.ok(!seen.has(key), `${id}: ${r} looks like ${seen.get(key)}`)
      seen.set(key, r)
    }
  }
})
