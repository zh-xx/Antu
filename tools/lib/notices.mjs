// ============================================================
//  tools/lib/notices.mjs — the licence notices that travel with what antu ships
//
//  antu is licensed under the GNU AGPL, version 3 or any later version (LICENSE). The pages it makes, the command
//  line and the skill zip contain code of other projects, each under its own licence; those licences ask that
//  their notices stay with the copies. The AGPL asks that anyone who has a copy can get the Corresponding Source.
//  This file is the one place that knows what to say:
//
//    · which packages are inside what we ship (BUNDLED_ROOTS and what they depend on, read from node_modules),
//    · the text of each package's own licence file, as the package ships it,
//    · the header that says whose work this is, under what licence, and where the source is.
//
//  It reads node_modules, so it runs at build time (the page builder, the skill build, the command line bundle),
//  never inside the shipped files. test/license.test.mjs keeps BUNDLED_ROOTS in step with what src/ imports.
// ============================================================

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const COPYRIGHT = 'Copyright (C) 2026 Ji Cheng'
export const LICENSE_SPDX = 'AGPL-3.0-or-later'
export const REPO_URL = 'https://github.com/zh-xx/Antu'

/**
 * An additional permission under section 7 of the AGPL: it takes nothing from the licence, it says what is not
 * covered. A page holds antu's code and, next to it, the data of the person who made it; that data stays theirs.
 */
export const ADDITIONAL_PERMISSION = [
  'Additional permission under section 7 of the GNU Affero General Public License, version 3: A page made with antu',
  'contains antu\'s code together with the diagram data you gave it. The diagram data, and the content of the diagram',
  'you drew from your material, are not part of antu and are not covered by this licence: you may keep them private,',
  'publish them, or sell them on any terms you like. This licence covers antu\'s code in the page, and the notices in',
  'the page must stay with it.',
]

/**
 * The packages that code in src/ (the engine, and what the command line takes from it) imports, and so what ends
 * up inside viewer.html and antu.mjs. Their own dependencies are followed. Not here: the MCP server's packages
 * (installed from npm by whoever runs the server) and the build tools (in no output).
 */
export const BUNDLED_ROOTS = ['@xyflow/react', 'elkjs', 'html-to-image', 'react', 'react-dom']

/** node_modules/<name> for a package, looked up the way Node does from `from` */
function packageDir(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(dir) === dir) throw new Error(`package "${name}" is not installed (run npm ci)`)
  }
}

function licenseOf(pkg) {
  const l = pkg.license ?? pkg.licenses
  return typeof l === 'string' ? l : JSON.stringify(l)
}

function licenseFile(dir) {
  const name = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f))
  if (!name) return null
  return readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n').trimEnd()
}

/** Every bundled package, with its licence and the text of its licence file: sorted by name */
export function bundledPackages() {
  const seen = new Map()
  const visit = (name, from) => {
    const dir = packageDir(name, from)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (seen.has(pkg.name)) return
    const text = licenseFile(dir)
    if (!text) throw new Error(`package "${pkg.name}" has no licence file: its notice cannot be shipped`)
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    seen.set(pkg.name, { name: pkg.name, license: licenseOf(pkg), repository: String(repo ?? '').replace(/^git\+/, '').replace(/\.git$/, ''), text })
    // @types/* packages only describe types for the editor: they are not in any output
    for (const dep of Object.keys(pkg.dependencies ?? {})) if (!dep.startsWith('@types/')) visit(dep, dir)
  }
  for (const root of BUNDLED_ROOTS) visit(root, REPO)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const fence = '````'

/** THIRD-PARTY-NOTICES.md */
export function thirdPartyNotices() {
  const packages = bundledPackages()
  const lines = [
    '# Third-party notices',
    '',
    'antu itself is licensed under the GNU Affero General Public License, version 3 or any later version (see LICENSE).',
    'Its pages (assets/viewer.html and every page made from it) and its command line (scripts/antu.mjs) contain the',
    'code of the packages below. Each is used under its own licence, and its notice is kept here as the package ships it.',
    '',
    '| Package | Licence |',
    '| --- | --- |',
    ...packages.map((p) => `| ${p.name} | ${p.license} |`),
    '',
    '## elkjs',
    '',
    'elkjs (the layout engine) is offered under `EPL-2.0 OR GPL-3.0-or-later`. antu uses it under the **GNU General Public',
    'License, version 3 or any later version**, which can be combined with the GNU AGPL (section 13 of each licence).',
    'The licence file that comes with the package is the Eclipse Public License 2.0 and is reproduced below as shipped.',
    'The GNU GPL version 3 is at https://www.gnu.org/licenses/gpl-3.0.txt. Source of elkjs: https://github.com/kieler/elkjs',
    '',
    '## The notices',
    '',
  ]
  for (const p of packages) {
    lines.push(`### ${p.name}`, '', `Licence: ${p.license}${p.repository ? `. Source: ${p.repository}` : ''}`, '', fence + 'text', p.text, fence, '')
  }
  return lines.join('\n')
}

/** What a page, the command line and the zip say about whose work this is and where its source is */
export function licenseHeader(version) {
  return [
    `antu ${version}`,
    COPYRIGHT,
    '',
    'antu is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public',
    'License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any',
    'later version. It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the',
    'implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the licence below.',
    '',
    ...ADDITIONAL_PERMISSION,
    '',
    `Corresponding Source of this version: ${REPO_URL}/tree/v${version}`,
    `The licence: ${REPO_URL}/blob/v${version}/LICENSE`,
    `Third-party notices: ${REPO_URL}/blob/v${version}/skills/antu/THIRD-PARTY-NOTICES.md`,
  ].join('\n')
}

let agplText
/** The text of the AGPL as in LICENSE */
export function agplLicense() {
  agplText ??= readFileSync(join(REPO, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trimEnd()
  return agplText
}

/** The whole notice: header, the licence, the third-party notices (inside a page, and at the top of the command line) */
export function licenseNotice(version) {
  return [licenseHeader(version), '', '=== The licence of antu ===', '', agplLicense(), '', '=== Third-party notices ===', '', thirdPartyNotices()].join('\n')
}
