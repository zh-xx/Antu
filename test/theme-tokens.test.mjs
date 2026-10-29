// Unit tests for host theme token overlays (issue 293)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { themeOf } from '../src/theme/themes.js'
import {
  applyThemeTokens,
  canvasOverrideOk,
  isCssColor,
  isCssFontFamily,
  mergeThemeTokens,
  normalizeThemeTokens,
} from '../src/theme/themeTokens.js'

/** Minimal stand-in for `themeVars(theme)` (avoid importing the JSX ThemeContext in Node) */
const baseVars = (id) => {
  const t = themeOf(id)
  const c = t.color
  return {
    '--antu-accent': c.side1,
    '--antu-canvas': c.canvas,
    '--antu-bg': c.bg,
    '--antu-text': c.ink,
    '--antu-text-2': c.ink2,
    '--antu-line': c.line,
    '--antu-line-soft': c.line,
    '--antu-chrome-bg': t.chrome.bg,
    '--antu-chrome-border': t.chrome.border,
    '--antu-font': t.font.body,
    '--antu-font-head': t.font.head,
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

test('isCssFontFamily accepts family lists, refuses injection', () => {
  assert.equal(isCssFontFamily('"Source Han Sans SC", system-ui, sans-serif'), true)
  assert.equal(isCssFontFamily("Georgia, 'Times New Roman', serif"), true)
  assert.equal(isCssFontFamily('url(evil)'), false)
  assert.equal(isCssFontFamily('Arial; color: red'), false)
  assert.equal(isCssFontFamily('@import "x"'), false)
})

test('normalizeThemeTokens keeps the allowlist and drops bad values', () => {
  assert.deepEqual(
    normalizeThemeTokens({
      accent: '#1a6b4a',
      canvas: 'nope',
      navy: '#000',
      chromeBg: 'rgba(255,255,255,0.8)',
      text: '#0f172a',
      font: '"Inter", system-ui, sans-serif',
      fontHead: 'url(bad)',
    }),
    {
      accent: '#1a6b4a',
      chromeBg: 'rgba(255,255,255,0.8)',
      text: '#0f172a',
      font: '"Inter", system-ui, sans-serif',
    },
  )
  assert.deepEqual(normalizeThemeTokens(null), {})
  assert.deepEqual(normalizeThemeTokens('x'), {})
})

test('applyThemeTokens is a no-op on document', () => {
  const base = baseVars('document')
  const out = applyThemeTokens(base, {
    accent: '#1a6b4a',
    canvas: '#f7faf8',
    text: '#0f172a',
    font: 'Georgia, serif',
  }, 'document')
  assert.equal(out['--antu-accent'], base['--antu-accent'])
  assert.equal(out['--antu-canvas'], base['--antu-canvas'])
  assert.equal(out['--antu-text'], base['--antu-text'])
  assert.equal(out['--antu-font'], base['--antu-font'])
})

test('applyThemeTokens overlays accent, canvas, text, line, chrome and fonts on modern', () => {
  const base = baseVars('modern')
  assert.equal(base['--antu-accent'], themeOf('modern').color.side1)
  const out = applyThemeTokens(base, {
    accent: '#1a6b4a',
    canvas: '#f7faf8',
    text: '#0f172a',
    textMuted: '#334155',
    line: '#cbd5e1',
    chromeBorder: '#94a3b8',
    chromeBg: 'rgba(255,255,255,0.92)',
    font: 'Georgia, serif',
    fontHead: '"Source Han Sans SC", sans-serif',
  }, 'modern')
  assert.equal(out['--antu-accent'], '#1a6b4a')
  assert.equal(out['--antu-canvas'], '#f7faf8')
  assert.equal(out['--antu-bg'], '#f7faf8')
  assert.equal(out['--antu-text'], '#0f172a')
  assert.equal(out['--antu-text-2'], '#334155')
  assert.equal(out['--antu-line'], '#cbd5e1')
  assert.equal(out['--antu-line-soft'], '#cbd5e1')
  assert.equal(out['--antu-chrome-border'], '1px solid #94a3b8')
  assert.equal(out['--antu-chrome-bg'], 'rgba(255,255,255,0.92)')
  assert.equal(out['--antu-font'], 'Georgia, serif')
  assert.equal(out['--antu-font-head'], '"Source Han Sans SC", sans-serif')
})

test('a canvas that fails contrast against theme ink is dropped', () => {
  assert.equal(canvasOverrideOk('modern', '#0f172a'), false)
  const base = baseVars('modern')
  const out = applyThemeTokens(base, { canvas: '#0f172a', accent: '#1a6b4a' }, 'modern')
  assert.equal(out['--antu-canvas'], base['--antu-canvas'])
  assert.equal(out['--antu-accent'], '#1a6b4a')
})

test('host text is used when judging canvas contrast against ink', () => {
  // Dark canvas fails against modern's dark ink; a light host text alone is not enough —
  // modern side2 also fails on #0f172a, so canvas still drops.
  assert.equal(canvasOverrideOk('modern', '#0f172a'), false)
  assert.equal(canvasOverrideOk('modern', '#0f172a', '#f8fafc'), false)
  const base = baseVars('modern')
  const out = applyThemeTokens(base, { canvas: '#f7faf8', text: '#0f172a' }, 'modern')
  assert.equal(out['--antu-canvas'], '#f7faf8')
  assert.equal(out['--antu-text'], '#0f172a')
})

test('text that fails contrast against canvas is dropped', () => {
  const base = baseVars('modern')
  const out = applyThemeTokens(base, { text: '#f8fafc', canvas: '#ffffff' }, 'modern')
  assert.equal(out['--antu-text'], base['--antu-text'])
  assert.equal(out['--antu-canvas'], '#ffffff')
})

test('mergeThemeTokens merges colours and fonts, clears null keys', () => {
  const a = mergeThemeTokens({}, { accent: '#111111', navy: '#000', font: 'Georgia, serif' })
  assert.deepEqual(a.tokens, { accent: '#111111', font: 'Georgia, serif' })
  assert.equal(a.changed, true)
  const b = mergeThemeTokens(a.tokens, { accent: null, canvas: '#f7faf8', font: null, text: '#0f172a' })
  assert.deepEqual(b.tokens, { canvas: '#f7faf8', text: '#0f172a' })
  const c = mergeThemeTokens(b.tokens, null)
  assert.deepEqual(c.tokens, {})
  assert.equal(c.changed, true)
})
