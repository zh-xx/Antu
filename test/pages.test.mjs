// The site on GitHub Pages (tools/gen/pages.mjs): a page for every registered way of drawing, in both languages,
// and a gallery that links to each of them and shows its sketch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LANGS, SITE, pageName, writeSite } from '../tools/gen/pages.mjs'

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

test('the site has a page for every registered way of drawing, in both languages, and the index links to each', () => {
  const registered = walk('src/renderers')
    .filter((f) => f.endsWith('register.js'))
    .map((f) => readFileSync(f, 'utf8').match(/registerRenderer\('([a-z]+)', '([a-z]+)'/))
    .filter(Boolean)
    .map((m) => `${m[1]}/${m[2]}`)
    .sort()
  const planned = SITE.flatMap((s) => s.kinds.map((k) => `${s.type}/${k}`)).sort()
  assert.deepEqual(planned, registered, 'a way of drawing is missing from SITE in tools/gen/pages.mjs (or is in it without being registered)')

  const out = mkdtempSync(join(tmpdir(), 'antu-site-'))
  const written = writeSite(out)
  const index = readFileSync(join(out, 'gallery.html'), 'utf8')
  for (const { type, kinds } of SITE) {
    for (const kind of kinds) {
      assert.ok(existsSync(join(out, 'kinds', `${kind}.svg`)), `sketch of ${kind}`)
      for (const lang of LANGS) {
        const name = pageName(type, kind, lang.suffix)
        assert.ok(written.includes(name) && existsSync(join(out, name)), name)
        assert.ok(index.includes(`href="${name}?lang=${lang.code}"`), `the index links to ${name}`)
      }
    }
  }
  // the home page is the committed lenses.html
  assert.equal(readFileSync(join(out, 'index.html'), 'utf8'), readFileSync('site/prototypes/hero/lenses.html', 'utf8'))
  // a page is a real page: it carries the engine and opens in the way asked
  const page = readFileSync(join(out, pageName('procedure', 'route', 'en')), 'utf8')
  assert.match(page, /"defaultKind":"route"/)
})
