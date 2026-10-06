// The npm package and the MCP registry entry (tools/build-npm.mjs) say the same thing as the repository: one version
// number (package.json's) in the package, in server.json and in the skill, and the registry's ownership mark matches.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MCP_NAME, PACKAGE_NAME, packageJson, serverJson } from '../tools/build-npm.mjs'

const root = JSON.parse(readFileSync('package.json', 'utf8'))

test('the package, server.json and the skill carry the one version of package.json', () => {
  const pkg = packageJson()
  const server = serverJson()
  assert.equal(pkg.version, root.version)
  assert.equal(server.version, root.version)
  assert.equal(server.packages[0].version, root.version)
  assert.equal(readFileSync('skills/antu/VERSION', 'utf8').trim(), root.version, 'skills/antu/ is rebuilt in the release pull request (npm run build:skill)')
})

test('server.json points to this package, and the package carries the registry ownership mark', () => {
  const pkg = packageJson()
  const server = serverJson()
  assert.equal(pkg.name, PACKAGE_NAME)
  assert.equal(server.packages[0].identifier, pkg.name)
  assert.equal(server.packages[0].registryType, 'npm')
  assert.equal(server.name, MCP_NAME)
  assert.equal(pkg.mcpName, server.name, 'the registry checks that package.json mcpName equals server.json name')
  assert.match(server.name, /^io\.github\.zh-xx\//, 'with a GitHub login the registry name starts with io.github.<owner>/')
  assert.ok(server.description.length <= 100, 'keep the registry description short')
})

test('the package makes the two commands', () => {
  const pkg = packageJson()
  assert.deepEqual(Object.keys(pkg.bin).sort(), ['antu', 'antu-mcp'])
  assert.equal(pkg.publishConfig.access, 'public')
})
