#!/usr/bin/env node
// ============================================================
//  tools/layout-scan/run.mjs — compare current layout vs Mainline-first (issue 190)
//
//  Usage: node tools/layout-scan/run.mjs
//  Writes JSON summary to stdout.
//
//  Mainline only diverges in columnMode (stages on, >1 stage, every node staged).
//  Rows outside that mode are marked applicable: false — engines are identical there.
// ============================================================

import { readFileSync, readdirSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { buildProcedureGraph } from '../../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../../src/renderers/procedure/flow/straighten.js'

const DIR = 'examples/procedure'
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.zh-CN.json'))
  .sort()

/** Same predicate as layout.js columnMode with stages shown. */
const columnCapable = (spec) => {
  const stages = spec.stages ?? []
  if (stages.length <= 1) return false
  const ids = new Set(stages.map((s) => s.id))
  return (spec.nodes ?? []).every((n) => n.stageId && ids.has(n.stageId))
}

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
    positions: g.nodes.map((n) => [n.id, n.position.x, n.position.y]),
  }
}

const dropPositions = (m) => {
  const { positions: _p, ...rest } = m
  return rest
}

const samePositions = (a, b) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1] || a[i][2] !== b[i][2]) return false
  }
  return true
}

const rows = []
const stagesOff = []
for (const f of files) {
  const spec = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'))
  const capable = columnCapable(spec)
  for (const dir of ['vertical', 'horizontal']) {
    const current = scan(spec, {}, dir)
    const mainline = scan(spec, { engine: 'mainline' }, dir)
    rows.push({
      file: f,
      orientation: dir,
      mode: 'stages-on',
      applicable: capable,
      note: capable
        ? 'columnMode: engines may diverge'
        : 'N/A — not columnMode (0–1 stage or unstaged nodes); engines identical by construction',
      current: dropPositions(current),
      mainline: dropPositions(mainline),
      identical: samePositions(current.positions, mainline.positions),
    })

    const offCurrent = scan(spec, { stages: false }, dir)
    const offMainline = scan(spec, { stages: false, engine: 'mainline' }, dir)
    stagesOff.push({
      file: f,
      orientation: dir,
      mode: 'stages-off',
      applicable: false,
      note: 'N/A — stages off forces the single-graph path; engines identical',
      identical: samePositions(offCurrent.positions, offMainline.positions),
      current: dropPositions(offCurrent),
      mainline: dropPositions(offMainline),
    })
  }
}

const applicable = rows.filter((r) => r.applicable)
const sum = (list, key, eng) => list.reduce((s, r) => s + r[eng][key], 0)
const summary = {
  note:
    'Totals under `columnMode` only (stages on, >1 stage, every node staged). See `stagesOff` for the N/A path where engines are identical.',
  files: files.length,
  orientations: 2,
  columnModeRows: applicable.length,
  current: {
    overlaps: sum(applicable, 'overlaps', 'current'),
    bends: sum(applicable, 'bends', 'current'),
    mainInBent: sum(applicable, 'mainInBent', 'current'),
    mainIn: sum(applicable, 'mainIn', 'current'),
    mainBoundBent: sum(applicable, 'mainBoundBent', 'current'),
    ms: Math.round(sum(applicable, 'ms', 'current') * 10) / 10,
  },
  mainline: {
    overlaps: sum(applicable, 'overlaps', 'mainline'),
    bends: sum(applicable, 'bends', 'mainline'),
    mainInBent: sum(applicable, 'mainInBent', 'mainline'),
    mainIn: sum(applicable, 'mainIn', 'mainline'),
    mainBoundBent: sum(applicable, 'mainBoundBent', 'mainline'),
    ms: Math.round(sum(applicable, 'ms', 'mainline') * 10) / 10,
  },
  stagesOffIdentical: stagesOff.every((r) => r.identical),
  rows,
  stagesOff,
}

console.log(JSON.stringify(summary, null, 2))
