import { test } from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, THEME_IDS, DEFAULT_THEME, isTheme, themeOf } from '../src/theme/themes.js'

const keysOf = (o) => Object.keys(o).sort().join(',')
const RELATIONS = ['equity', 'control', 'contract', 'debt', 'guarantee', 'kinship', 'employment', 'agency', 'other']

test('the document theme is the default and every id is known', () => {
  assert.equal(DEFAULT_THEME, 'document')
  assert.deepEqual(THEME_IDS, ['document', 'modern', 'legal', 'dark'])
  for (const id of THEME_IDS) assert.ok(isTheme(id))
  assert.equal(isTheme('neon'), false)
  assert.equal(themeOf('neon').id, DEFAULT_THEME)
})

test('every theme answers every role the first theme answers', () => {
  const base = THEMES[THEME_IDS[0]]
  for (const id of THEME_IDS) {
    const t = THEMES[id]
    for (const group of ['chrome', 'font', 'color', 'radius', 'entity', 'relation', 'group', 'pill', 'flow']) {
      assert.equal(keysOf(t[group]), keysOf(base[group]), `${id}.${group}`)
    }
    assert.equal(keysOf(t.flow.outcome), keysOf(base.flow.outcome), `${id}.flow.outcome`)
    assert.equal(keysOf(t.justify.node), keysOf(base.justify.node), `${id}.justify.node`)
    assert.equal(keysOf(t.justify.stance), keysOf(base.justify.stance), `${id}.justify.stance`)
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

test('the three outcomes, the six node kinds and the three stances differ in weight, dash or fill (so they read in black and white)', () => {
  for (const id of THEME_IDS) {
    const { flow, justify } = THEMES[id]
    for (const [name, table] of [['outcome', flow.outcome], ['node', justify.node], ['stance', justify.stance]]) {
      const seen = new Set()
      for (const [k, p] of Object.entries(table)) {
        const key = [p.width, p.dash ?? '', p.fill ?? ''].join('|')
        assert.ok(!seen.has(key), `${id}: ${name} ${k} looks like another`)
        seen.add(key)
      }
    }
  }
})

// ---- the dark theme (issue #209) ----
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('only the dark theme has a dark scheme, and it carries the colours the shell and the export read', () => {
  assert.deepEqual(THEME_IDS.filter((id) => THEMES[id].scheme === 'dark'), ['dark'])
  for (const id of THEME_IDS) for (const k of ['dots', 'mini', 'miniGhost', 'exportBg', 'labelBg']) assert.ok(THEMES[id].color[k], `${id}.color.${k}`)
  // a light theme exports on white and leaves the shell as it was
  for (const id of ['document', 'modern', 'legal']) assert.equal(THEMES[id].color.exportBg, '#ffffff')
})

test('dark: text, borders and the four procedure states stay readable on the dark ground', () => {
  const t = THEMES.dark
  const ground = t.color.bg
  assert.ok(contrast(t.color.ink, ground) >= 7, 'ink on the ground')
  assert.ok(contrast(t.color.ink2, ground) >= 4.5, 'ink2 on the ground')
  assert.ok(contrast(t.color.ink3, ground) >= 3, 'ink3 on the ground')
  for (const [name, s] of Object.entries(t.flow.state)) {
    assert.ok(contrast(s.stroke, s.fill) >= 3, `${name} stroke on its fill`)
    assert.ok(contrast(s.stroke, ground) >= 3, `${name} stroke on the ground`)
  }
  // the three states can be told apart by colour as well as by line style
  const strokes = Object.values(t.flow.state).map((s) => s.stroke)
  assert.equal(new Set(strokes).size, 3)
  // every box reads against the ground: ink on its own fill
  for (const e of Object.values(t.entity)) assert.ok(contrast(t.color.ink, e.fill) >= 7, 'ink on a party box')
  for (const n of Object.values(t.justify.node)) assert.ok(contrast(t.color.ink, n.fill) >= 7, 'ink on a justification box')
  for (const c of t.camp) assert.ok(contrast(c.text, c.fill) >= 4.5, 'camp text on its fill')
})
