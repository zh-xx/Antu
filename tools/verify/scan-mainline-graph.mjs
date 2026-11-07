#!/usr/bin/env node
// Full-graph geometric scan for Mainline stages-off (PR #359 acceptance).
// Usage:
//   GIT_HEAD=<sha> SCAN_TAG=baseline|after SCAN_OUT_DIR=<dir> node tools/verify/scan-mainline-graph.mjs
// Writes ONLY under SCAN_OUT_DIR (immutable separate dirs). Never overwrites sibling tags.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(process.env.SCAN_REPO || resolve(__dirname, '../..'))

// Prefer local hangSpineRoute segHits when available (patched tree); else inline audited copy.
let segHitsBox
try {
  ;({ segHitsBox } = await import(resolve(REPO, 'src/renderers/procedure/flow/hangSpineRoute.js')))
} catch {
  segHitsBox = (p, q, box, pad = 0.5) => {
    const [x1, y1] = p
    const [x2, y2] = q
    const minx = Math.min(x1, x2)
    const maxx = Math.max(x1, x2)
    const miny = Math.min(y1, y2)
    const maxy = Math.max(y1, y2)
    const bx = box.x ?? box.position?.x
    const by = box.y ?? box.position?.y
    const bw = box.w ?? box.data?.w
    const bh = box.h ?? box.data?.h
    if (maxx < bx + pad || minx > bx + bw - pad || maxy < by + pad || miny > by + bh - pad) return false
    if (Math.abs(y1 - y2) < 0.5) return y1 > by + pad && y1 < by + bh - pad && maxx > bx + pad && minx < bx + bw - pad
    if (Math.abs(x1 - x2) < 0.5) return x1 > bx + pad && x1 < bx + bw - pad && maxy > by + pad && miny < by + bh - pad
    return false
  }
}

const { buildProcedureGraph } = await import(resolve(REPO, 'src/renderers/procedure/flow/layout.js'))
const { bendsOf } = await import(resolve(REPO, 'src/renderers/procedure/flow/straighten.js'))

const fields = { engine: 'mainline', stages: false }
const tag = process.env.SCAN_TAG || 'scan'
const outDir = process.env.SCAN_OUT_DIR || join('/opt/cursor/artifacts/pr359-accept/metrics', tag)
const head = process.env.GIT_HEAD || 'unknown'
mkdirSync(outDir, { recursive: true })

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function faceOf(n, [x, y], tol = 1.5) {
  const cx = n.position.x + n.data.w / 2
  const cy = n.position.y + n.data.h / 2
  if (Math.abs(x - n.position.x) < tol && Math.abs(y - cy) < 2) return 'W'
  if (Math.abs(x - (n.position.x + n.data.w)) < tol && Math.abs(y - cy) < 2) return 'E'
  if (Math.abs(y - n.position.y) < tol && Math.abs(x - cx) < 2) return 'N'
  if (Math.abs(y - (n.position.y + n.data.h)) < tol && Math.abs(x - cx) < 2) return 'S'
  return '?'
}

function boxOverlap(a, b, pad = 0.5) {
  return (
    a.position.x + pad < b.position.x + b.data.w - pad &&
    b.position.x + pad < a.position.x + a.data.w - pad &&
    a.position.y + pad < b.position.y + b.data.h - pad &&
    b.position.y + pad < a.position.y + a.data.h - pad
  )
}

function orthoOk(points) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p, q] = [points[i], points[i + 1]]
    if (Math.abs(p[0] - q[0]) >= 0.5 && Math.abs(p[1] - q[1]) >= 0.5) return false
  }
  return true
}

function scan(spec, dir = 'vertical', engineFields = fields) {
  const t0 = Date.now()
  const g = buildProcedureGraph(spec, { ...engineFields }, undefined, dir)
  const ms = Date.now() - t0
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const spine = new Set(g.spine)
  const hits = []
  const badOrtho = []
  const badPorts = []
  const spineBends = []
  for (const c of g.connections) {
    if (!c.points?.length) continue
    if (!orthoOk(c.points)) badOrtho.push(c.id)
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (from && to) {
      const lf = faceOf(from, c.points[0])
      const ef = faceOf(to, c.points[c.points.length - 1])
      if (lf === '?' || ef === '?') badPorts.push(`${c.id}:${lf}->${ef}`)
    }
    if (c.kind === 'main' && spine.has(c.from) && spine.has(c.to)) {
      const b = bendsOf(c.points)
      if (b !== 0) spineBends.push(`${c.id}:${b}`)
    }
    for (let i = 0; i < c.points.length - 1; i += 1) {
      for (const n of g.nodes) {
        if (n.id === c.from || n.id === c.to) continue
        const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
        if (segHitsBox(c.points[i], c.points[i + 1], box)) hits.push(`${c.id}@${n.id}`)
      }
    }
  }
  const overlaps = []
  for (let i = 0; i < g.nodes.length; i += 1) {
    for (let j = i + 1; j < g.nodes.length; j += 1) {
      if (boxOverlap(g.nodes[i], g.nodes[j])) overlaps.push(`${g.nodes[i].id}|${g.nodes[j].id}`)
    }
  }
  const touched = new Set()
  for (const e of spec.edges || []) {
    touched.add(e.from)
    touched.add(e.to)
  }
  const missingNodes = (spec.nodes || []).filter((n) => touched.has(n.id) && !byId.has(n.id)).map((n) => n.id)
  const edgeIds = new Set((spec.edges || []).map((e) => `c:${e.from}->${e.to}`))
  const connPairs = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
  const missingEdges = [...edgeIds].filter((id) => {
    const m = id.match(/^c:(.+)->(.+)$/)
    return m && !connPairs.has(`${m[1]}->${m[2]}`)
  })
  return {
    errors: g.errors,
    ms,
    nodes: g.nodes.length,
    edges: g.connections.length,
    spineBends,
    hits: [...new Set(hits)],
    overlaps,
    badOrtho,
    badPorts: badPorts.slice(0, 20),
    missingNodes,
    missingEdges,
    ok:
      !g.errors?.length &&
      hits.length === 0 &&
      overlaps.length === 0 &&
      spineBends.length === 0 &&
      badOrtho.length === 0 &&
      missingNodes.length === 0,
  }
}

// Detector self-check (fail the scan process if detector is broken)
{
  const box = { x: 10, y: 10, w: 20, h: 20 }
  const checks = [
    [segHitsBox([0, 20], [40, 20], box) === true, 'horiz-hit'],
    [segHitsBox([20, 0], [20, 40], box) === true, 'vert-hit'],
    [segHitsBox([0, 5], [40, 5], box) === false, 'above'],
    [segHitsBox([50, 0], [50, 40], box) === false, 'beside'],
  ]
  for (const [ok, name] of checks) {
    if (!ok) {
      console.error('DETECTOR_AUDIT_FAIL', name)
      process.exit(2)
    }
  }
}

const frozenDir = process.env.SCAN_INPUT_DIR || join('/opt/cursor/artifacts/pr359-accept/frozen-inputs')
const fixtures = []
if (process.env.SCAN_INPUT_DIR) {
  for (const f of readdirSync(frozenDir).filter((x) => x.endsWith('.json'))) {
    fixtures.push(join(frozenDir, f))
  }
} else {
  fixtures.push(
    ...readdirSync(join(REPO, 'preview/synthetic-rejoin/fixtures'))
      .filter((f) => f.endsWith('.zh-CN.json'))
      .map((f) => join(REPO, 'preview/synthetic-rejoin/fixtures', f)),
  )
  for (const f of readdirSync(join(REPO, 'examples/procedure')).filter((x) => x.endsWith('.zh-CN.json'))) {
    fixtures.push(join(REPO, 'examples/procedure', f))
  }
}

const report = {
  tag,
  head,
  repo: REPO,
  fields,
  command: process.argv.join(' '),
  scannedAt: new Date().toISOString(),
  cases: [],
}
const inputHashes = {}

for (const path of fixtures.sort()) {
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  if (spec.type !== 'procedure') continue
  inputHashes[basename(path)] = sha256(path)
  const vertical = scan(spec, 'vertical')
  const horizontal = scan(spec, 'horizontal')
  const stagesOn = scan(spec, 'vertical', { engine: 'mainline', stages: true })
  report.cases.push({
    path,
    title: spec.title,
    inputSha256: inputHashes[basename(path)],
    vertical,
    horizontal: {
      ok: horizontal.ok,
      hits: horizontal.hits.length,
      overlaps: horizontal.overlaps.length,
      spineBends: horizontal.spineBends.length,
      hitList: horizontal.hits,
    },
    stagesOn: {
      ok: stagesOn.ok,
      hits: stagesOn.hits.length,
      hitList: stagesOn.hits,
      errors: stagesOn.errors,
    },
  })
  const mark = vertical.ok ? 'OK' : 'FAIL'
  console.log(
    mark,
    basename(path),
    `hits=${vertical.hits.length}`,
    `ov=${vertical.overlaps.length}`,
    `spineB=${vertical.spineBends.length}`,
    `stagesOnHits=${stagesOn.hits.length}`,
    `ms=${vertical.ms}`,
    vertical.hits.slice(0, 4).join(',') || '',
  )
}

report.inputHashes = inputHashes
const outJson = join(outDir, `${tag}-scan.json`)
const outSum = join(outDir, `${tag}-fail-summary.txt`)
const outMeta = join(outDir, `${tag}-meta.json`)
writeFileSync(outJson, JSON.stringify(report, null, 2))
const fails = report.cases.filter((c) => !c.vertical.ok)
writeFileSync(
  outSum,
  fails
    .map(
      (c) =>
        `${c.path}\n  sha=${c.inputSha256}\n  hits=${c.vertical.hits.join('|')}\n  ov=${c.vertical.overlaps.join('|')}\n  spine=${c.vertical.spineBends.join('|')}\n  err=${JSON.stringify(c.vertical.errors)}\n`,
    )
    .join('\n') || 'none',
)
writeFileSync(
  outMeta,
  JSON.stringify(
    {
      tag,
      head,
      repo: REPO,
      fields,
      outDir,
      caseCount: report.cases.length,
      failCount: fails.length,
      scannedAt: report.scannedAt,
    },
    null,
    2,
  ),
)
console.log('\nFAILS', fails.length, '/', report.cases.length, '→', outJson)
process.exitCode = fails.length ? 1 : 0
