// Unit tests for host theme token overlays (issue 293)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { themeOf } from '../src/theme/themes.js'
import {
  applyThemeTokens,
  canvasOverrideOk,
  isCssColor,
  mergeThemeTokens,
  normalizeThemeTokens,
} from '../src/theme/themeTokens.js'

/** Minimal stand-in for `themeVars(theme)` (avoid importing the JSX ThemeContext in Node) */
const baseVars = (id) => {
  const c = themeOf(id).color
  return {
    '--antu-accent': c.side1,
    '--antu-canvas': c.canvas,
    '--antu-bg': c.bg,
    '--antu-text': c.ink,
  }
}

test('isCssColor accepts hex and rgb/hsl, refuses junk', () => {
  assert.equal(isCssColor('#1a6b4a'), true)
  assert.equal(isCssColor('#abc'), true)
  assert.equal(isCssColor('rgb(26, 107, 74)'), true)
  assert.equal(isCssColor('rgba(0,0,0,0.5)'), true)
  assert.equal(isCssColor('hsl(150, 60%, 30%)'), true)
  assert.equal(isCssColor('url(x)'), false)
  assert.equal(isCssColor('red'), false)
  assert.equal(isCssColor('var(--x)'), false)
})

test('normalizeThemeTokens keeps the allowlist and drops bad values', () => {
  assert.deepEqual(
    normalizeThemeTokens({ accent: '#1a6b4a', canvas: 'nope', navy: '#000', chromeBg: 'rgba(255,255,255,0.8)' }),
    { accent: '#1a6b4a', chromeBg: 'rgba(255,255,255,0.8)' },
  )
  assert.deepEqual(normalizeThemeTokens(null), {})
  assert.deepEqual(normalizeThemeTokens('x'), {})
})

test('applyThemeTokens is a no-op on document', () => {
  const base = baseVars('document')
  const out = applyThemeTokens(base, { accent: '#1a6b4a', canvas: '#f7faf8' }, 'document')
  assert.equal(out['--antu-accent'], base['--antu-accent'])
  assert.equal(out['--antu-canvas'], base['--antu-canvas'])
})

test('applyThemeTokens overlays accent and canvas on modern', () => {
  const base = baseVars('modern')
  assert.equal(base['--antu-accent'], themeOf('modern').color.side1)
  const out = applyThemeTokens(base, { accent: '#1a6b4a', canvas: '#f7faf8' }, 'modern')
  assert.equal(out['--antu-accent'], '#1a6b4a')
  assert.equal(out['--antu-canvas'], '#f7faf8')
  assert.equal(out['--antu-bg'], '#f7faf8')
})

test('a canvas that fails contrast against theme ink is dropped', () => {
  assert.equal(canvasOverrideOk('modern', '#0f172a'), false)
  const base = baseVars('modern')
  const out = applyThemeTokens(base, { canvas: '#0f172a', accent: '#1a6b4a' }, 'modern')
  assert.equal(out['--antu-canvas'], base['--antu-canvas'])
  assert.equal(out['--antu-accent'], '#1a6b4a')
})

test('mergeThemeTokens merges, clears null keys, and null patch clears all', () => {
  const a = mergeThemeTokens({}, { accent: '#111111', navy: '#000' })
  assert.deepEqual(a.tokens, { accent: '#111111' })
  assert.equal(a.changed, true)
  const b = mergeThemeTokens(a.tokens, { accent: null, canvas: '#f7faf8' })
  assert.deepEqual(b.tokens, { canvas: '#f7faf8' })
  const c = mergeThemeTokens(b.tokens, null)
  assert.deepEqual(c.tokens, {})
  assert.equal(c.changed, true)
})
