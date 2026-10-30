// src/types/antu-specs.d.ts is written from each type's `*_FIELDS`
// (tools/gen/spec-types.mjs) so `@zh-xx/antu/types` stays in step with describe/validate (issue 294).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MODULE } from '../tools/gen/spec-types.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

test('antu-specs.d.ts is what the field tables say (run `node tools/gen/spec-types.mjs`)', () => {
  const r = spawnSync(process.execPath, ['tools/gen/spec-types.mjs', '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr || r.stdout)
})

test('generated types name each diagram Spec and the union', () => {
  const text = readFileSync(MODULE, 'utf8')
  for (const name of ['FactSpec', 'ProcedureSpec', 'RelationshipSpec', 'JustificationSpec', 'AntuDiagramSpec']) {
    assert.match(text, new RegExp(`export (?:interface|type) ${name}\\b`), name)
  }
  assert.match(text, /kind: "start" \| "step" \| "decision"/)
  assert.match(text, /type: "procedure"/)
})

test('generated declarations, public API .d.ts, and embed/shell/App checkJs typecheck (npm run typecheck)', () => {
  const r = spawnSync('npm', ['run', 'typecheck'], { encoding: 'utf8', cwd: REPO })
  assert.equal(r.status, 0, r.stderr || r.stdout)
})
