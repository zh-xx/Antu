#!/usr/bin/env node
// Full semver matrix for engines.dsh — stdout for evidence logs (#360).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package/package.json'), 'utf8'),
)
const declared = pkg.engines.dsh
const badExample = '>=0.2.0-rc.2 <0.3.0'

const versions = [
  '0.2.0-rc.1',
  '0.2.0-rc.2',
  '0.2.0-rc.3',
  '0.2.1-rc.0',
  '0.2.1-rc.1',
  '0.2.1-rc.5',
  '0.2.2-rc.1',
  '0.2.2-rc.2',
  '0.2.3-rc.0',
  '0.2.0',
  '0.2.1',
  '0.2.2',
  '0.2.3',
  '0.3.0-rc.1',
  '0.3.0',
  '0.1.9',
]

function published(v) {
  try {
    execFileSync('npm', ['view', `@deepseek-ai/dsh@${v}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return 'yes'
  } catch {
    return 'no'
  }
}

console.log('declared engines.dsh:', declared)
console.log('peer @deepseek-ai/dsh-tools:', pkg.peerDependencies['@deepseek-ai/dsh-tools'])
console.log('issue example (rejected for shipping):', badExample)
console.log('')
console.log('version'.padEnd(16), 'declared', 'badExample', 'npmPublishedDSH')
for (const v of versions) {
  console.log(
    v.padEnd(16),
    semver.satisfies(v, declared) ? 'MATCH' : 'reject',
    semver.satisfies(v, badExample) ? 'MATCH' : 'reject',
    published(v),
  )
}
