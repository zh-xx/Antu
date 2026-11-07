#!/usr/bin/env node
// Full-graph geometric scan for Mainline stages-off (PR #359 acceptance).
// Usage:
//   GIT_HEAD=<sha> SCAN_TAG=baseline|after SCAN_OUT_DIR=<dir> node tools/verify/scan-mainline-graph.mjs
// Writes ONLY under SCAN_OUT_DIR (immutable separate dirs). Never overwrites sibling tags.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(process.env.SCAN_REPO || resolve(__dirname, '../..'))

let segHitsBox
let orthoSegsCross
let pathCrossCount
try {
  ;({ segHitsBox, orthoSegsCross, pathCrossCount } = await import(
    resolve(REPO, 'src/renderers/procedure/flow/hangSpineRoute.js')
  ))
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
  orthoSegsCross = (a, b) => {
    const [p, q] = a
    const [r, s] = b
    const av = Math.abs(p[0] - q[0]) < 0.5
    const bv = Math.abs(r[0] - s[0]) < 0.5
    if (av === bv) return false
    const [v0, v1, h0, h1] = av ? [p, q, r, s] : [r, s, p, q]
    return (
      v0[0] > Math.min(h0[0], h1[0]) + 0.5 &&
      v0[0] < Math.max(h0[0], h1[0]) - 0.5 &&
      h0[1] > Math.min(v0[1], v1[1]) + 0.5 &&
      h0[1] < Math.max(v0[1], v1[1]) - 0.5
    )
  }
  pathCrossCount = (pts, others = []) => {
    const segs = (p) => p.slice(1).map((q, i) => [p[i], q])
    let n = 0
    for (const o of others) {
      for (const s of segs(pts)) for (const t of segs(o)) if (orthoSegsCross(s, t)) n += 1
    }
    return n
  }
}

const { buildProcedureGraph } = await import(resolve(REPO, 'src/renderers/procedure/flow/layout.js'))
const { bendsOf } = await import(resolve(REPO, 'src/renderers/procedure/flow/straighten.js'))

const fields = { engine: 'mainline', stages: false }
const tag = process.env.SCAN_TAG || 'scan'
const outDir = process.env.SCAN_OUT_DIR || join('/opt/cursor/artifacts/pr359-accept/metrics', tag)
let head = process.env.GIT_HEAD || 'unknown'
try {
  if (head === 'unknown') head = execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim()
} catch {
  /* keep unknown */
}
mkdirSync(outDir, { recursive: true })

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function faceOf(n, [x, y], tol = 1.5) {
  // Legal leave/enter may sit anywhere on a face (not only the mid-point). Fan-out /
  // face-stagger for sibling diamond branches relies on this (07 n-3).
  const bx = n.position.x
  const by = n.position.y
  const w = n.data.w
  const h = n.data.h
  const onW = Math.abs(x - bx) < tol && y >= by - tol && y <= by + h + tol
  const onE = Math.abs(x - (bx + w)) < tol && y >= by - tol && y <= by + h + tol
  const onN = Math.abs(y - by) < tol && x >= bx - tol && x <= bx + w + tol
  const onS = Math.abs(y - (by + h)) < tol && x >= bx - tol && x <= bx + w + tol
  // Corner: prefer the side whose mid is closer to the point.
  const hits = [
    onW && 'W',
    onE && 'E',
    onN && 'N',
    onS && 'S',
  ].filter(Boolean)
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) {
    const cx = bx + w / 2
    const cy = by + h / 2
    const score = { W: Math.abs(y - cy), E: Math.abs(y - cy), N: Math.abs(x - cx), S: Math.abs(x - cx) }
    return hits.sort((a, b) => score[a] - score[b])[0]
  }
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

function distBox(n, p) {
  const x = n.position.x
  const y = n.position.y
  const w = n.data.w
  const h = n.data.h
  const dx = p[0] < x ? x - p[0] : p[0] > x + w ? p[0] - (x + w) : 0
  const dy = p[1] < y ? y - p[1] : p[1] > y + h ? p[1] - (y + h) : 0
  return Math.hypot(dx, dy)
}

function scan(spec, dir = 'vertical', engineFields = fields) {
  const t0 = Date.now()
  const g = buildProcedureGraph(spec, { ...engineFields }, undefined, dir)
  const ms = Date.now() - t0
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const spine = new Set(g.spine)
  const hits = []
  const badOrtho = []
  const diagonals = []
  const zeroLen = []
  const badPorts = []
  const spineBends = []
  const crossings = []
  const endpointGaps = []
  const missingLabels = []
  let bendTotal = 0
  for (const c of g.connections) {
    if (!c.points?.length) {
      zeroLen.push(c.id)
      continue
    }
    if (!orthoOk(c.points)) {
      badOrtho.push(c.id)
      diagonals.push(c.id)
    }
    bendTotal += bendsOf(c.points)
    const from = byId.get(c.from)
    const to = byId.get(c.to)
    if (from && to) {
      const lf = faceOf(from, c.points[0])
      const ef = faceOf(to, c.points[c.points.length - 1])
      if (lf === '?' || ef === '?') badPorts.push(`${c.id}:${lf}->${ef}`)
      const d0 = distBox(from, c.points[0])
      const d1 = distBox(to, c.points[c.points.length - 1])
      if (d0 > 1.5 || d1 > 1.5) endpointGaps.push(`${c.id}:${d0.toFixed(1)}/${d1.toFixed(1)}`)
    }
    if (c.label && !c.labelAt) missingLabels.push(c.id)
    if (c.kind === 'main' && spine.has(c.from) && spine.has(c.to)) {
      const b = bendsOf(c.points)
      if (b !== 0) spineBends.push(`${c.id}:${b}`)
    }
    for (let i = 0; i < c.points.length - 1; i += 1) {
      const [p, q] = [c.points[i], c.points[i + 1]]
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01) zeroLen.push(`${c.id}#${i}`)
      for (const n of g.nodes) {
        if (n.id === c.from || n.id === c.to) continue
        const box = { x: n.position.x, y: n.position.y, w: n.data.w, h: n.data.h }
        if (segHitsBox(p, q, box)) hits.push(`${c.id}@${n.id}`)
      }
    }
  }
  const cs = g.connections.filter((c) => c.points?.length >= 2)
  for (let i = 0; i < cs.length; i += 1) {
    for (let j = i + 1; j < cs.length; j += 1) {
      const a = cs[i].points
      const b = cs[j].points
      for (let u = 0; u < a.length - 1; u += 1) {
        for (let v = 0; v < b.length - 1; v += 1) {
          if (orthoSegsCross([a[u], a[u + 1]], [b[v], b[v + 1]])) {
            crossings.push(`${cs[i].id} x ${cs[j].id}`)
          }
        }
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
  // S3-specific extras when present
  let s3 = null
  const rejoin = g.connections.find((c) => c.id === 'c:n-21->n-3')
  if (rejoin && byId.has('n-21')) {
    const from = byId.get('n-21')
    const [x, y] = rejoin.points[0]
    const cy = from.position.y + from.data.h / 2
    const leaveW = Math.abs(x - from.position.x) < 1.5 && Math.abs(y - cy) < 2
    const leaveE = Math.abs(x - (from.position.x + from.data.w)) < 1.5 && Math.abs(y - cy) < 2
    s3 = {
      rejoinBends: bendsOf(rejoin.points),
      leaveEW: leaveW || leaveE,
      points: rejoin.points,
    }
  }
  const hitList = [...new Set(hits)]
  const crossList = [...new Set(crossings)]
  // Shared face-centre leave: two non-main edges leaving the same port point on one node.
  const leavePorts = new Map()
  for (const c of g.connections) {
    if (!c.points?.length || c.kind === 'main') continue
    const key = `${c.from}@${c.points[0][0].toFixed(1)},${c.points[0][1].toFixed(1)}`
    if (!leavePorts.has(key)) leavePorts.set(key, [])
    leavePorts.get(key).push(c.id)
  }
  const sharedPorts = [...leavePorts.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => `${k}:{${ids.join(',')}}`)
  // Spec may list duplicate from→to pairs; compare unique pairs to painted connections.
  const specEdgeUniq = new Set((spec.edges || []).map((e) => `${e.from}->${e.to}`))
  const connUniq = new Set(g.connections.map((c) => `${c.from}->${c.to}`))
  const edgeCountMatch = specEdgeUniq.size === connUniq.size && missingEdges.length === 0
  return {
    errors: g.errors,
    ms,
    nodes: g.nodes.length,
    edges: g.connections.length,
    specEdgeUniq: specEdgeUniq.size,
    spineBends,
    hits: hitList,
    crossings: crossList,
    overlaps,
    badOrtho,
    diagonals,
    zeroLen: [...new Set(zeroLen)],
    badPorts: badPorts.slice(0, 20),
    endpointGaps,
    missingLabels,
    missingNodes,
    missingEdges,
    bendTotal,
    s3,
    sharedPorts,
    edgeCountMatch,
    ok:
      !g.errors?.length &&
      hitList.length === 0 &&
      crossList.length === 0 &&
      overlaps.length === 0 &&
      spineBends.length === 0 &&
      badOrtho.length === 0 &&
      missingNodes.length === 0 &&
      missingEdges.length === 0 &&
      endpointGaps.length === 0 &&
      missingLabels.length === 0 &&
      badPorts.length === 0 &&
      edgeCountMatch,
  }
}

// Detector self-check: known cross / non-cross / vertex-touch / T-junction / polyline.
// Geometry is style-agnostic (solid vs dashed ink uses the same polylines).
{
  const box = { x: 10, y: 10, w: 20, h: 20 }
  const checks = [
    [segHitsBox([0, 20], [40, 20], box) === true, 'horiz-hit'],
    [segHitsBox([20, 0], [20, 40], box) === true, 'vert-hit'],
    [segHitsBox([0, 5], [40, 5], box) === false, 'above'],
    [segHitsBox([50, 0], [50, 40], box) === false, 'beside'],
    [orthoSegsCross([[0, 10], [20, 10]], [[10, 0], [10, 20]]) === true, 'proper-cross'],
    // Vertex-only touch must NOT count as a crossing (polyline join / T stub).
    [orthoSegsCross([[0, 10], [10, 10]], [[10, 10], [10, 20]]) === false, 'vertex-touch'],
    [orthoSegsCross([[0, 10], [20, 10]], [[10, 10], [10, 20]]) === false, 'T-junction'],
    [orthoSegsCross([[0, 10], [20, 10]], [[0, 0], [0, 20]]) === false, 'endpoint-on-horiz'],
    // Polyline with a vertical run that properly crosses a foreign horizontal (dashed or solid — same geometry).
    [pathCrossCount([[0, 0], [0, 30], [30, 30]], [[[-10, 15], [40, 15]]]) === 1, 'polyline-vs-seg'],
    [pathCrossCount([[0, 0], [0, 20], [20, 20]], [[[0, 20], [20, 20]]]) === 0, 'shared-seg-no-cross'],
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
  node: process.version,
  cases: [],
}
const inputHashes = {}

for (const path of fixtures.sort()) {
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  if (spec.type !== 'procedure') continue
  inputHashes[basename(path)] = sha256(path)
  const vertical = scan(spec, 'vertical')
  const horizontal = scan(spec, 'horizontal')
  report.cases.push({
    path,
    title: spec.title,
    inputSha256: inputHashes[basename(path)],
    vertical,
    horizontal,
  })
  // Hard gate: both orients must be box-clear AND crossing-free (plus vertical.ok extras).
  // Previously H crossings were logged but not failed — L4-H could report OK with 3 crosses.
  // Nested hang acceptance fixtures also reject shared leave ports; corpus may still warn.
  const base = basename(path)
  const nestedGate = /^(S\d|L\d|H1)/.test(base)
  const sharedFail =
    nestedGate && (vertical.sharedPorts.length > 0 || horizontal.sharedPorts.length > 0)
  const mark = vertical.ok && horizontal.ok && !sharedFail ? 'OK' : 'FAIL'
  const warnShared =
    vertical.sharedPorts.length || horizontal.sharedPorts.length
      ? ` sharedPorts V=${vertical.sharedPorts.length} H=${horizontal.sharedPorts.length}`
      : ''
  console.log(
    mark,
    base,
    `V:hits=${vertical.hits.length},cross=${vertical.crossings.length},gap=${vertical.endpointGaps.length},spineB=${vertical.spineBends.length}`,
    `H:hits=${horizontal.hits.length},cross=${horizontal.crossings.length},gap=${horizontal.endpointGaps.length}`,
    warnShared,
  )
  if (warnShared && mark === 'OK') console.log('  WARN shared leave ports (corpus; not nested gate)', {
    V: vertical.sharedPorts,
    H: horizontal.sharedPorts,
  })
}

report.inputHashes = inputHashes
const outJson = join(outDir, `${tag}-scan.json`)
const outSum = join(outDir, `${tag}-fail-summary.txt`)
const outMeta = join(outDir, `${tag}-meta.json`)
writeFileSync(outJson, JSON.stringify(report, null, 2))
const fails = report.cases.filter((c) => {
  const base = basename(c.path)
  const nestedGate = /^(S\d|L\d|H1)/.test(base)
  const sharedFail =
    nestedGate && (c.vertical.sharedPorts.length > 0 || c.horizontal.sharedPorts.length > 0)
  return !c.vertical.ok || !c.horizontal.ok || sharedFail
})
const warns = report.cases.filter(
  (c) =>
    (c.vertical.sharedPorts.length > 0 || c.horizontal.sharedPorts.length > 0) &&
    !fails.includes(c),
)
writeFileSync(
  outSum,
  [
    ...fails.map(
      (c) =>
        `${c.path}\n  sha=${c.inputSha256}\n  V hits=${c.vertical.hits.join('|')} cross=${c.vertical.crossings.join('|')} gaps=${c.vertical.endpointGaps.join('|')} shared=${c.vertical.sharedPorts.join('|')}\n  H hits=${c.horizontal.hits.join('|')} cross=${c.horizontal.crossings.join('|')} shared=${c.horizontal.sharedPorts.join('|')}\n`,
    ),
    ...warns.map(
      (c) =>
        `WARN-shared-ports ${c.path}\n  V ${c.vertical.sharedPorts.join('|')}\n  H ${c.horizontal.sharedPorts.join('|')}\n`,
    ),
  ].join('\n') || 'none',
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
      node: process.version,
      superseded: false,
    },
    null,
    2,
  ),
)
console.log('\nFAILS', fails.length, '/', report.cases.length, '→', outJson)
process.exitCode = fails.length ? 1 : 0
