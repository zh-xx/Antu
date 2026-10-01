// ============================================================
//  test/license.test.mjs — the licence of antu, and the notices of the code of others that travels with it
//
//  antu is under the GNU AGPL, version 3 or any later version (issue #70). What is checked here is what can go
//  wrong without anyone noticing: a new package imported by src/ that has no notice, a page that is built without
//  the licence, a skill folder that lost its LICENSE.
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { ADDITIONAL_PERMISSION, BUNDLED_ROOTS, COPYRIGHT, LICENSE_SPDX, REPO_URL, bundledPackages, licenseHeader, licenseNotice, thirdPartyNotices } from '../tools/lib/notices.mjs'
import { buildViewerHtml } from '../tools/lib/make-html.mjs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

/** The packages that the files the engine and the command line are built from import by name */
function importedPackages() {
  const found = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(js|jsx|mjs)$/.test(name)) scan(path)
    }
  }
  const scan = (path) => {
    // comments are left out: they say things like "import 'x' ..." in words
    const text = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    for (const m of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1]
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      found.set(name, path)
    }
  }
  walk('src')
  for (const f of ['tools/cli/antu.mjs', 'tools/lib/report.mjs', 'tools/lib/fill.mjs']) scan(f)
  return found
}

test('the licence is the AGPL, and package.json says so', () => {
  assert.equal(pkg.license, 'AGPL-3.0-or-later')
  assert.equal(LICENSE_SPDX, pkg.license)
  const text = readFileSync('LICENSE', 'utf8')
  assert.match(text, /GNU AFFERO GENERAL PUBLIC LICENSE/)
  assert.match(text, /Version 3, 19 November 2007/)
  assert.match(text, /END OF TERMS AND CONDITIONS/)
})

test('every package that src/ (and what the command line takes from tools/) imports has a notice', () => {
  const imported = importedPackages()
  assert.ok(imported.size > 0)
  for (const [name, file] of imported) {
    assert.ok(BUNDLED_ROOTS.includes(name), `${file} imports "${name}", which is in no notice: add it to BUNDLED_ROOTS in tools/lib/notices.mjs (and check its licence can be combined with the AGPL)`)
  }
  for (const root of BUNDLED_ROOTS) assert.ok(imported.has(root), `BUNDLED_ROOTS lists "${root}" but nothing imports it any more`)
})

test('the notices name every bundled package with its licence and carry the text of it', () => {
  const packages = bundledPackages()
  const text = thirdPartyNotices()
  for (const root of BUNDLED_ROOTS) assert.ok(packages.some((p) => p.name === root), root)
  for (const p of packages) {
    assert.ok(p.license && p.license !== 'undefined', `${p.name} has no licence field`)
    assert.ok(p.text.length > 100, `${p.name}: the licence text is missing`)
    assert.ok(text.includes(`### ${p.name}`), p.name)
    assert.ok(text.includes(p.text), `the text of the licence of ${p.name} is not in the notices as it ships`)
  }
  assert.ok(!packages.some((p) => p.name.startsWith('@types/')), 'type-only packages are not in any output')
  assert.match(text, /elkjs[\s\S]*GPL-3\.0-or-later/)
})

test('the header says whose work it is, under which licence, and where the source of that version is', () => {
  const header = licenseHeader('1.2.3')
  assert.ok(header.includes(COPYRIGHT))
  assert.match(header, /GNU Affero General Public\s+License/)
  assert.ok(header.includes(`${REPO_URL}/tree/v1.2.3`), 'the Corresponding Source of that version')
  assert.ok(header.includes(`${REPO_URL}/blob/v1.2.3/LICENSE`))
})

test('the additional permission (the data in a page is not covered) is in the header, so in every page and the command line', () => {
  assert.ok(ADDITIONAL_PERMISSION.join(' ').includes('are not part of antu and are not covered by this licence'))
  for (const line of ADDITIONAL_PERMISSION) assert.ok(licenseHeader('1.2.3').includes(line), line)
  assert.ok(buildViewerHtml({ js: '', css: '' }).includes(ADDITIONAL_PERMISSION[0]))
  assert.ok(readFileSync('skills/antu/scripts/antu.mjs', 'utf8').slice(0, 4000).includes('Additional permission under section 7'))
  const readme = readFileSync('README.md', 'utf8')
  assert.ok(readme.includes('Additional permission (AGPL section 7)'))
  assert.ok(readFileSync('README.zh-CN.md', 'utf8').includes('附加许可（AGPL 第 7 条）'))
})

test('a page carries the licence block, and the block cannot close the script it sits in', () => {
  const html = buildViewerHtml({ js: '/*engine*/', css: '' })
  const block = html.match(/<script type="text\/plain" id="antu-license">([\s\S]*?)<\/script>/)
  assert.ok(block, 'the page has no licence block')
  assert.ok(block[1].includes(COPYRIGHT))
  assert.ok(block[1].includes('GNU AFFERO GENERAL PUBLIC LICENSE'))
  assert.ok(block[1].includes('### react'), 'the third-party notices are in the page')
  assert.ok(!/<\/script/i.test(licenseNotice('1.0.0')), 'a licence text that held "</script" would cut the block short')
  assert.ok(!licenseNotice('1.0.0').includes('<!--'))
})

test('the skill folder holds the licence and the notices, and the command line starts with them', () => {
  assert.equal(readFileSync('skills/antu/LICENSE', 'utf8'), readFileSync('LICENSE', 'utf8'))
  assert.equal(readFileSync('skills/antu/THIRD-PARTY-NOTICES.md', 'utf8'), thirdPartyNotices())
  const cli = readFileSync('skills/antu/scripts/antu.mjs', 'utf8')
  assert.ok(cli.slice(0, 3000).includes('GNU Affero General Public'), 'the command line does not start with the licence notice')
  assert.ok(cli.includes('=== Third-party notices ==='))
  assert.ok(existsSync('skills/antu/assets/viewer.html'))
  assert.ok(readFileSync('skills/antu/assets/viewer.html', 'utf8').includes('id="antu-license"'))
})
