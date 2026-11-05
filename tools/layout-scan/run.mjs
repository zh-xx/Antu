#!/usr/bin/env node
// ============================================================
//  tools/layout-scan/run.mjs — compare current layout vs Mainline-first (#190)
//
//  Usage: node tools/layout-scan/run.mjs
//  Writes JSON summary to stdout. Metrics follow #186/#189 style (bends, overlaps,
//  main-line bends inside a stage vs at boundaries, wall time).
// ============================================================

import { readFileSync, readdirSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { buildProcedureGraph } from '../../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../../src/renderers/procedure/flow/straighten.js'

const DIR = 'examples/procedure'
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.zh-CN.json'))
  .sort()

const overlapCount = (g) => {
  const boxes = g.nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.data.w,
    h: n.data.h,
  }))
  let n = 0
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) n += 1
    }
  }
  return n
}

const scan = (spec, fields, dir) => {
  const t0 = performance.now()
  const g = buildProcedureGraph(spec, fields, undefined, dir)
  const ms = performance.now() - t0
  const stage = new Map(spec.nodes.map((n) => [n.id, n.stageId]))
  let mainIn = 0
  let mainInBent = 0
  let mainBound = 0
  let mainBoundBent = 0
  let bends = 0
  for (const c of g.connections) {
    const b = bendsOf(c.points)
    bends += b
    if (c.kind !== 'main') continue
    if (stage.get(c.from) === stage.get(c.to)) {
      mainIn += 1
      if (b > 0) mainInBent += 1
    } else {
      mainBound += 1
      if (b > 0) mainBoundBent += 1
    }
  }
  return {
    ms: Math.round(ms * 10) / 10,
    nodes: g.nodes.length,
    connections: g.connections.length,
    overlaps: overlapCount(g),
    bends,
    mainIn,
    mainInBent,
    mainBound,
    mainBoundBent,
    width: Math.round(g.size.width),
    height: Math.round(g.size.height),
  }
}

const rows = []
for (const f of files) {
  const spec = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  for (const dir of ['vertical', 'horizontal']) {
    rows.push({
      file: f,
      orientation: dir,
      current: scan(spec, {}, dir),
      mainline: scan(spec, { engine: 'mainline' }, dir),
    })
  }
}

const sum = (key, eng) => rows.reduce((s, r) => s + r[eng][key], 0)
const summary = {
  files: files.length,
  orientations: 2,
  current: {
    overlaps: sum('overlaps', 'current'),
    bends: sum('bends', 'current'),
    mainInBent: sum('mainInBent', 'current'),
    mainIn: sum('mainIn', 'current'),
    mainBoundBent: sum('mainBoundBent', 'current'),
    ms: Math.round(sum('ms', 'current') * 10) / 10,
  },
  mainline: {
    overlaps: sum('overlaps', 'mainline'),
    bends: sum('bends', 'mainline'),
    mainInBent: sum('mainInBent', 'mainline'),
    mainIn: sum('mainIn', 'mainline'),
    mainBoundBent: sum('mainBoundBent', 'mainline'),
    ms: Math.round(sum('ms', 'mainline') * 10) / 10,
  },
  rows,
}

console.log(JSON.stringify(summary, null, 2))
