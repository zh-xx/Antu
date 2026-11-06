#!/usr/bin/env node
// ============================================================
//  tools/layout-scan/run.mjs — compare current layout vs Mainline-first (issue 190)
//
//  Usage: node tools/layout-scan/run.mjs
//  Writes JSON summary to stdout.
//
//  Engines diverge when the data has stage columns (>1 stage with nodes, every node staged),
//  whether or not the Stages *paint* switch is on. Rows without stage-column data are N/A.
// ============================================================

import { readFileSync, readdirSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { buildProcedureGraph } from '../../src/renderers/procedure/flow/layout.js'
import { bendsOf } from '../../src/renderers/procedure/flow/straighten.js'

const DIR = 'examples/procedure'
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.zh-CN.json'))
  .sort()

/** Same predicate as layout.js hasStageColumns. */
const hasStageColumns = (spec) => {
  const nodes = spec.nodes ?? []
  const present = (spec.stages ?? []).filter((st) => nodes.some((n) => n.stageId === st.id))
  if (present.length <= 1) return false
  const ids = new Set((spec.stages ?? []).map((s) => s.id))
  return nodes.every((n) => n.stageId && ids.has(n.stageId))
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
    stageBoxes: g.stageBoxes.length,
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
  const capable = hasStageColumns(spec)
  for (const dir of ['vertical', 'horizontal']) {
    const current = scan(spec, {}, dir)
    const mainline = scan(spec, { engine: 'mainline' }, dir)
    rows.push({
      file: f,
      orientation: dir,
      mode: 'stages-on',
      applicable: capable,
      note: capable
        ? 'hasStageColumns: engines may diverge; stage bands painted'
        : 'N/A — no stage columns in the data (0–1 stage or unstaged nodes); engines identical by construction',
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
      applicable: capable,
      note: capable
        ? 'hasStageColumns with bands off: same layout path as stages-on; paint omits boxes'
        : 'N/A — no stage columns in the data; engines identical by construction',
      identical: samePositions(offCurrent.positions, offMainline.positions),
      current: dropPositions(offCurrent),
      mainline: dropPositions(offMainline),
    })
  }
}

const applicableOn = rows.filter((r) => r.applicable)
const applicableOff = stagesOff.filter((r) => r.applicable)
const sum = (list, key, eng) => list.reduce((s, r) => s + r[eng][key], 0)
const pack = (list) => ({
  overlaps: sum(list, 'overlaps', 'current'),
  bends: sum(list, 'bends', 'current'),
  mainInBent: sum(list, 'mainInBent', 'current'),
  mainIn: sum(list, 'mainIn', 'current'),
  mainBoundBent: sum(list, 'mainBoundBent', 'current'),
  ms: Math.round(sum(list, 'ms', 'current') * 10) / 10,
  // twin under mainline
  mainline: {
    overlaps: sum(list, 'overlaps', 'mainline'),
    bends: sum(list, 'bends', 'mainline'),
    mainInBent: sum(list, 'mainInBent', 'mainline'),
    mainIn: sum(list, 'mainIn', 'mainline'),
    mainBoundBent: sum(list, 'mainBoundBent', 'mainline'),
    ms: Math.round(sum(list, 'ms', 'mainline') * 10) / 10,
  },
})
const onPack = pack(applicableOn)
const offPack = pack(applicableOff)
const summary = {
  note:
    'Totals under hasStageColumns (data). Stages paint switch does not change the layout path; stages-off still compares ELK columns vs mainline.',
  files: files.length,
  orientations: 2,
  columnModeRows: applicableOn.length,
  current: {
    overlaps: onPack.overlaps,
    bends: onPack.bends,
    mainInBent: onPack.mainInBent,
    mainIn: onPack.mainIn,
    mainBoundBent: onPack.mainBoundBent,
    ms: onPack.ms,
  },
  mainline: onPack.mainline,
  stagesOff: {
    current: {
      overlaps: offPack.overlaps,
      bends: offPack.bends,
      mainInBent: offPack.mainInBent,
      mainIn: offPack.mainIn,
      mainBoundBent: offPack.mainBoundBent,
      ms: offPack.ms,
    },
    mainline: offPack.mainline,
    // With stage columns, engines should usually diverge even with bands off
    anyDiverge: applicableOff.some((r) => !r.identical),
  },
  rows,
  stagesOffRows: stagesOff,
}

console.log(JSON.stringify(summary, null, 2))
