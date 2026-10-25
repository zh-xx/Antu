// The lock on the theme (issue #97): a diagram's colours come from src/theme, not from the view that draws it.
// Colours written anywhere else would not change with the theme, and the document theme would not be black and white.
// Type sizes come from src/theme/scale.js the same way: a view or the stylesheet that writes its own does not
// follow the scale, and the box and the text in it can disagree.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { TYPE, typeVars } from '../src/theme/scale.js'

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

/**
 * Type sizes are not exempt in the shell: the dock, the label card and the error text use the same
 * tokens as the diagram. Colour is different (SHELL above) because the page ground and the export
 * paper keep their own paint. A later exception belongs in this set, as a reviewed line.
 */
const TYPE_SHELL = new Set()
/** Where the numbers live. Everywhere else reads them. */
const TYPE_HOME = 'src/theme/scale.js'
const TYPE_VAR = /^var\(\s*--antu-type-[a-z]+\s*\)$/

/** What `rel` writes that is not a step of the type scale. `css` decides whether `font:` is the shorthand. */
function typeSizeFaults(rel, text) {
  const bad = []
  const css = rel.endsWith('.css')
  for (const m of text.matchAll(/font-size\s*:\s*([^;]+)/g)) {
    const value = m[1].trim()
    if (value === 'inherit' || TYPE_VAR.test(value)) continue
    bad.push(`${rel}: font-size: ${value}`)
  }
  // `font:` as a shorthand is CSS. In a script the same spelling is a theme's font family (themes.js).
  if (css) {
    for (const m of text.matchAll(/\bfont\s*:\s*([^;]+)/g)) {
      const value = m[1].trim()
      if (value === 'inherit' || !/\d+(?:\.\d+)?px/.test(value)) continue
      bad.push(`${rel}: font: ${value}`)
    }
  }
  if (/\.(js|jsx)$/.test(rel)) {
    for (const m of text.matchAll(/fontSize\s*[:=]\s*\{?\s*['"]?\d+(?:\.\d+)?['"]?\}?/g)) bad.push(`${rel}: ${m[0]}`)
    for (const m of text.matchAll(/\b(?:[A-Z][A-Z0-9_]*)?FONT\s*=\s*\d+(?:\.\d+)?/g)) bad.push(`${rel}: ${m[0]}`)
  }
  return bad
}

function rootBlock(css) {
  const start = css.indexOf(':root')
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

test('the type scale in :root is src/theme/scale.js, and the theme puts the same variables on the viewport', () => {
  const css = readFileSync('src/styles.css', 'utf8')
  const declared = [...rootBlock(css).matchAll(/--antu-type-([a-z]+)\s*:\s*([^;]+)/g)]
  const got = Object.fromEntries(declared.map((m) => [m[1], m[2].trim()]))
  const want = Object.fromEntries(Object.entries(TYPE).map(([name, step]) => [name, `${step.size}px`]))
  assert.deepEqual(got, want, 'a type size in :root that is not a step of TYPE, or a step missing from :root')
  const ctx = readFileSync('src/theme/ThemeContext.jsx', 'utf8')
  const fn = ctx.slice(ctx.indexOf('export function themeVars'), ctx.indexOf('export function shellVars'))
  assert.match(fn, /\.\.\.typeVars\(\)/, 'themeVars must spread typeVars(), so an export of the viewport carries the sizes')
  assert.deepEqual(
    typeVars(),
    Object.fromEntries(Object.entries(want).map(([name, px]) => [`--antu-type-${name}`, px])),
  )
})

test('no view or the stylesheet writes its own type size', () => {
  const bad = []
  for (const f of files(SRC)) {
    const rel = relative('.', f).split('\\').join('/')
    if (!/\.(js|jsx|css)$/.test(f) || rel === TYPE_HOME || TYPE_SHELL.has(rel)) continue
    bad.push(...typeSizeFaults(rel, readFileSync(f, 'utf8')))
  }
  assert.deepEqual(bad, [], 'a type size written in a view does not follow the scale: put it in src/theme/scale.js TYPE')
})

test('a hardcoded type size is the failure the lock reports, and a step is not', () => {
  assert.deepEqual(typeSizeFaults('src/styles.css', '.a { font-size: 13px; font: inherit; font-size: var(--antu-type-node); }'), ['src/styles.css: font-size: 13px'])
  assert.deepEqual(typeSizeFaults('src/styles.css', '.a { font: 600 14px/1.4 sans-serif; }'), ['src/styles.css: font: 600 14px/1.4 sans-serif'])
  assert.deepEqual(typeSizeFaults('src/view.jsx', 'const LABEL_FONT = 12\n<text fontSize={11} fontSize={TYPE.caption.size} />'), ['src/view.jsx: fontSize={11}', 'src/view.jsx: LABEL_FONT = 12'])
  assert.deepEqual(typeSizeFaults('src/theme/themes.js', "font: { body: 'serif' }, border: '1px solid'"), [])
})
