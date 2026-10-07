// ============================================================
//  tools/gen/versions.mjs — writes spec/versions.md from the registry
//
//    node tools/gen/versions.mjs            write the file
//    node tools/gen/versions.mjs --check    exit 1 if the file is not what the registry says (the unit test does the same)
// ============================================================

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { versionsMarkdown, versionsReport } from '../lib/versions.mjs'

export const VERSIONS_FILE = fileURLToPath(new URL('../../spec/versions.md', import.meta.url))

/** What the file should hold now */
export const expectedVersionsFile = () => versionsMarkdown(versionsReport(''))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const want = expectedVersionsFile()
  if (process.argv.includes('--check')) {
    const have = existsSync(VERSIONS_FILE) ? readFileSync(VERSIONS_FILE, 'utf8') : ''
    if (have !== want) {
      console.error('spec/versions.md is out of date: run `node tools/gen/versions.mjs`')
      process.exit(1)
    }
    console.log('spec/versions.md is up to date')
  } else {
    writeFileSync(VERSIONS_FILE, want)
    console.log('wrote spec/versions.md')
  }
}
