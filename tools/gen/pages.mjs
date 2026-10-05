// ============================================================
//  tools/gen/pages.mjs — the pages of the site on GitHub Pages: one page for every way of drawing, in both languages
//
//  `node tools/gen/pages.mjs [--out DIR]` (DIR is _site by default) writes, from the cases in examples/:
//    <type>-<kind>.<lang>.html   a case of that type, opening in that way (the reader can still switch in the page)
//    index.html                  the sketches of the ways, each linking to its page
//  The pages are made by the same code as any page (tools/lib/make-html.mjs), so what is shown there is what a
//  reader gets. The cases are fictional (examples/README.md). The workflow is .github/workflows/pages.yml;
//  the engine has to be built first (`npm run build:engine`).
// ============================================================

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { renderToFile } from '../lib/make-html.mjs'
import { en, zh } from '../../src/core/messages/index.js'

/** The ways of each type in the order of the README, and the case each is drawn from */
export const SITE = [
  { type: 'relationship', file: 'marketplace-parties', kinds: ['graph', 'focus', 'chain', 'matrix', 'equity', 'authority', 'related', 'path', 'summary'] },
  { type: 'fact', file: 'neighbour-corridor-charging', kinds: ['timeline', 'chronicle', 'scale'] },
  { type: 'procedure', file: '05-premises-lease', kinds: ['flow', 'route'] },
  { type: 'justification', file: 'fang-yuan-defense-excess', kinds: ['tree'] },
]
export const LANGS = [
  { code: 'en', suffix: 'en', dict: en, title: 'Antu: the ways of drawing', intro: 'Each page opens a fictional case in one way of drawing; the page has a picker for the others, and a switch for the theme.', types: { relationship: 'Relationship', fact: 'Fact', procedure: 'Procedure', justification: 'Justification' } },
  { code: 'zh', suffix: 'zh-CN', dict: zh, title: '案图：各种画法', intro: '每个页面用一种画法打开一个虚构的案例；页面里有选择器可以切换到其他画法，也可以切换主题。', types: { relationship: '关系图', fact: '事实图', procedure: '程序图', justification: '证成图' } },
]

export const pageName = (type, kind, suffix) => `${type}-${kind}.${suffix}.html`

export function writeSite(out, repo = '.') {
  mkdirSync(out, { recursive: true })
  mkdirSync(join(out, 'kinds'), { recursive: true })
  const written = []
  for (const { type, file, kinds } of SITE) {
    for (const lang of LANGS) {
      const spec = JSON.parse(readFileSync(join(repo, 'examples', type, `${file}.${lang.suffix}.json`), 'utf8'))
      for (const kind of kinds) {
        const name = pageName(type, kind, lang.suffix)
        renderToFile(spec, { outPath: join(out, name), preset: { defaultKind: kind }, quiet: true })
        written.push(name)
      }
    }
    for (const kind of kinds) copyFileSync(join(repo, 'assets/kinds', `${kind}.svg`), join(out, 'kinds', `${kind}.svg`))
  }
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const sections = LANGS.map((lang) => {
    const rows = SITE.map(({ type, kinds }) => {
      const cells = kinds.map((kind) => {
        const label = esc(lang.dict[`graphKind.${kind}`])
        return `<a class="way" href="${pageName(type, kind, lang.suffix)}?lang=${lang.code}"><img src="kinds/${kind}.svg" width="120" alt="${label}"><span>${label}</span></a>`
      })
      return `<h3>${esc(lang.types[type])}</h3><div class="ways">${cells.join('')}</div>`
    })
    return `<section lang="${lang.code}"><h2>${esc(lang.title)}</h2><p>${esc(lang.intro)}</p>${rows.join('')}</section>`
  })
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Antu 案图</title>
<style>body{font:15px/1.5 system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a;max-width:960px;margin:0 auto;padding:24px}h2{margin-top:40px}h3{margin:20px 0 8px;font-size:15px}
.ways{display:flex;flex-wrap:wrap;gap:12px}.way{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;color:inherit;text-decoration:none;font-size:13px}.way:hover{border-color:#64748b}
footer{margin-top:48px;color:#64748b;font-size:13px}</style></head><body>${sections.join('')}<footer>Antu 案图 · <a href="https://github.com/zh-xx/Antu">source</a></footer></body></html>`
  writeFileSync(join(out, 'index.html'), html)
  written.push('index.html')
  return written
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out')
  const out = i >= 0 ? process.argv[i + 1] : '_site'
  const files = writeSite(out)
  process.stdout.write(`${files.length} files written to ${out}\n`)
}
