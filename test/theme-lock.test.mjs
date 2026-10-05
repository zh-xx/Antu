// The lock on the theme (issue #97): a diagram's colours come from src/theme, not from the view that draws it.
// Colours written anywhere else would not change with the theme, and the document theme would not be black and white.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = 'src'
/** The shell is not themed (only the diagram is), and the export's paper is white: these may keep their own colours */
const SHELL = new Set(['src/shell/Canvas.jsx', 'src/shell/exportPng.js'])

const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })

/** Text with every `var(--name, fallback)` fallback taken out: a fallback is only what shows before a theme is set */
const withoutFallbacks = (text) => text.replace(/var\(\s*--[\w-]+\s*,[^()]*(?:\([^()]*\)[^()]*)*\)/g, 'var(--x)')
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\((?!\s*var\()|\bhsla?\(/g
const isWhite = (text, at) => /^rgba\(\s*255\s*,\s*255\s*,\s*255\b/.test(text.slice(at))

function found(text) {
  const clean = withoutFallbacks(text)
  const out = []
  for (const m of clean.matchAll(COLOUR)) if (!isWhite(clean, m.index)) out.push(m[0])
  return out
}

test('no view writes its own colour: the scripts take theirs from src/theme', () => {
  const bad = []
  for (const f of files(SRC)) {
    const rel = relative('.', f).split('\\').join('/')
    if (!/\.(js|jsx)$/.test(f) || rel.startsWith('src/theme/') || rel.startsWith('src/core/messages/') || SHELL.has(rel)) continue
    const list = found(readFileSync(f, 'utf8'))
    if (list.length) bad.push(`${rel}: ${[...new Set(list)].slice(0, 4).join(' ')}`)
  }
  assert.deepEqual(bad, [], 'a colour written in a view does not follow the theme: put it in src/theme/themes.js')
})

test('the stylesheet keeps no colour of its own outside the defaults of :root', () => {
  const css = readFileSync('src/styles.css', 'utf8')
  const afterRoot = css.slice(css.indexOf('.antu-app'))
  assert.ok(css.indexOf('.antu-app') > 0)
  assert.deepEqual([...new Set(found(afterRoot))], [], 'use the theme variables (var(--antu-text), var(--antu-line), ...)')
})
