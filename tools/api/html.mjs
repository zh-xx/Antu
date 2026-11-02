// ============================================================
//  tools/api/html.mjs — the entry of `@zh-xx/antu/html` (issue #152)
//
//  The self-contained page of a diagram, as a string, for a host's own command line or server: what `antu
//  render` writes, without the file. It refuses what `render` refuses (an invalid spec, a kind the type does
//  not have, a theme that does not exist). Node only: in the package it reads the viewer template that lies
//  beside it (assets/viewer.html). Bundled by vite.api.config.js into dist-npm/lib/html.mjs. Contract:
//  spec/embed.md.
//
//  Public `.d.ts` is generated from this file's JSDoc (`node tools/gen/api-dts.mjs`, issue 227).
// ============================================================

import { validate as problemsOf, kindProblem } from '../lib/report.mjs'
import { pageHtml } from '../lib/make-html.mjs'
import { THEME_IDS, isTheme } from '../../src/theme/themes.js'

/**
 * The self-contained page of a diagram (what `antu render` writes), as a string.
 * `kind`: the kind the page opens in (the reader can still switch); `theme`: the page is fixed to it.
 * Throws when the spec is not valid (the problems are in `error.errors`), or `kind` or `theme` is not one.
 * @param {unknown} spec
 * @param {{ kind?: string, theme?: 'document'|'modern'|'legal'|'dark' }} [options]
 * @returns {string} the HTML of the page
 */
export function renderHtml(spec, options = {}) {
  const { kind, theme } = options
  const errors = problemsOf(spec)
  if (errors.length) {
    throw Object.assign(new Error(`antu: the spec is not valid (${errors.length} problem(s)): ${errors[0]}`), { errors: [...errors] })
  }
  const bad = kindProblem(spec, kind)
  if (bad) throw new Error(`antu: ${bad}`)
  if (theme !== undefined && !isTheme(theme)) throw new Error(`antu: the theme is one of ${THEME_IDS.join(', ')}`)
  const preset = kind || theme ? { ...(kind && { defaultKind: kind }), ...(theme && { theme }) } : undefined
  return pageHtml(spec, { preset, quiet: true })
}
