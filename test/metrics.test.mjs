// ============================================================
//  test/metrics.test.mjs —— 尺寸与坐标（纯函数，不开浏览器）
//
//  这一层专门盯"算出来的数"。导出图里箭头丢失那个缺陷有两条成因，
//  其中一条正是这里的事：**箭头多占的 6px 有没有算进内容尺寸**。
//  端到端测试要到"导出成图再数像素"才发现，太晚；这里一眼就能钉住。
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildGrid } from '../src/renderers/fact/timeline/grid.js'
import { makeMetrics, CELL_W, CELL_GAP, HEADER_H, HEADER_W, ARROW_EXTENT } from '../src/renderers/fact/timeline/metrics.js'

const spec = JSON.parse(readFileSync('examples/fact/电梯劝烟案.json', 'utf8'))
const fields = { sources: false, actors: false, summary: true }
const grid = buildGrid(spec)

test('内容尺寸把轴末端箭头算进去了', () => {
  // 竖向：高 = 标题区 + 时间点 × 每格高 + 箭头
  const v = makeMetrics(grid, fields, false)
  assert.equal(
    v.contentH,
    v.originY + v.rowCount * v.slotExtent + ARROW_EXTENT,
    '竖向高度漏了箭头的 6px，导出时箭头会被裁在框外',
  )
  // 横向：宽 = 标题区 + 时间点 × 每格宽 + 箭头
  const h = makeMetrics(grid, fields, true)
  assert.equal(
    h.contentW,
    h.originX + h.rowCount * h.slotExtent + ARROW_EXTENT,
    '横向宽度漏了箭头的 6px',
  )
})

test('箭头常量本身是有值的（防止有人图省事改成 0）', () => {
  assert.ok(ARROW_EXTENT > 0)
})

test('时间点占的长度与车道占的长度，横竖正好互换', () => {
  const v = makeMetrics(grid, fields, false)
  const h = makeMetrics(grid, fields, true)
  assert.equal(v.slotExtent, h.laneExtent)
  assert.equal(v.laneExtent, h.slotExtent)
  assert.equal(v.laneExtent, CELL_W)
})

test('格子高 = 卡片高 + 留白；卡片高随字段开关变', () => {
  const withSummary = makeMetrics(grid, fields, false)
  assert.equal(withSummary.cellH, withSummary.cardH + CELL_GAP)
  const noSummary = makeMetrics(grid, { ...fields, summary: false }, false)
  assert.ok(noSummary.cardH < withSummary.cardH, '关掉摘要卡片应该变矮')
  assert.equal(noSummary.contentH, withSummary.contentH - grid.rows.length * (withSummary.cardH - noSummary.cardH))
})

test('网格起点：竖向在上方留标题区，横向在左侧留标题区', () => {
  const v = makeMetrics(grid, fields, false)
  assert.deepEqual([v.originX, v.originY], [0, HEADER_H])
  const h = makeMetrics(grid, fields, true)
  assert.deepEqual([h.originX, h.originY], [HEADER_W, 0])
})

test('cellAt：槽沿时间轴走，车道沿车道轴走', () => {
  const v = makeMetrics(grid, fields, false)
  // 竖向：列是 x、槽是 y
  assert.deepEqual(v.cellAt(0, 0), { x: 0, y: v.originY })
  assert.deepEqual(v.cellAt(2, 1), { x: v.laneExtent, y: v.originY + 2 * v.slotExtent })
  // 横向：槽是 x、列是 y
  const h = makeMetrics(grid, fields, true)
  assert.deepEqual(h.cellAt(0, 0), { x: h.originX, y: 0 })
  assert.deepEqual(h.cellAt(2, 1), { x: h.originX + 2 * h.slotExtent, y: h.laneExtent })
})

test('轴线中心落在轴线那一列的正中', () => {
  const v = makeMetrics(grid, fields, false)
  assert.equal(v.axisCenter, grid.axisColumnIndex * v.laneExtent + v.laneExtent / 2)
})
