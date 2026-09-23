// ============================================================
//  test/layout.test.mjs —— 排布成 React Flow 节点（纯函数）
//
//  钉住画面结构的几条硬约定：边恒空、事件不丢、绘制层级、
//  以及"哪些视角摆不下"要如实带出来（不能静默丢掉事件）。
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildFactGraph } from '../src/renderers/fact/timeline/layout.js'
import { viewsOf } from '../src/renderers/fact/timeline/grid.js'

const spec = JSON.parse(readFileSync('examples/fact/电梯劝烟案.json', 'utf8'))
const fields = { sources: false, actors: false, summary: true }
const graph = buildFactGraph(spec, fields, undefined, 'vertical')

test('edges 恒为空（引线由单独的引线层节点承担）', () => {
  assert.deepEqual(graph.edges, [])
})

test('事件一个都不少：每条事件都变成一张卡片', () => {
  const cards = graph.nodes.filter((n) => n.type === 'card')
  const total = spec.slots.reduce((n, s) => n + s.events.length, 0)
  assert.equal(cards.length, total)
  // 每条事件的 id 都在
  const ids = new Set(cards.map((c) => c.id))
  for (const s of spec.slots) for (const e of s.events) assert.ok(ids.has(e.id), `少了 ${e.id}`)
})

test('五类节点齐全，且只有这五类', () => {
  const types = new Set(graph.nodes.map((n) => n.type))
  assert.deepEqual([...types].sort(), ['axis', 'card', 'cells', 'colHeader', 'links'])
})

test('绘制层级：格子层最底、卡片最后（后画的压在上面）', () => {
  const at = (type) => graph.nodes.findIndex((n) => n.type === type)
  assert.equal(at('cells'), 0, '格子层要在最底')
  assert.ok(at('colHeader') < at('links'), '列标题在引线之前')
  assert.ok(at('links') < at('axis'), '引线在轴线之前（轴点要盖住线头）')
  assert.ok(at('axis') < at('card'), '卡片最后（要压住引线）')
})

test('装饰节点声明了 1×1 —— 不能是 0×0', () => {
  // 0×0 会让 React Flow 永远量不出尺寸，nodesInitialized 一直为 false，
  // 画布上"适应视图"按钮就会点了没反应（踩过）。1×1 两条都满足。
  for (const t of ['cells', 'links']) {
    const n = graph.nodes.find((x) => x.type === t)
    assert.equal(n.width, 1, `${t} 的宽度必须是 1`)
    assert.equal(n.height, 1, `${t} 的高度必须是 1`)
  }
})

test('尺寸是有限正数，且包含箭头那 6px', () => {
  assert.ok(graph.size.width > 0 && graph.size.height > 0)
  assert.ok(Number.isFinite(graph.size.width) && Number.isFinite(graph.size.height))
})

test('摆不下的视角：错误如实带出来，而不是把事件悄悄丢了', () => {
  const blocked = viewsOf(spec).filter((v) => buildFactGraph(spec, fields, v).errors.length > 0)
  assert.ok(blocked.length > 0, '这份数据本来就有一个视角摆不下')
  for (const v of blocked) {
    const g = buildFactGraph(spec, fields, v)
    assert.ok(g.errors.length > 0)
    assert.ok(g.errors[0].length > 10, '错误要说人话')
  }
})

test('每份示例的第一个视角都排得下（新打开一定看得见东西）', () => {
  const dir = 'examples/fact'
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const g = buildFactGraph(s, fields, viewsOf(s)[0], s.slots.length >= 5 ? 'vertical' : 'horizontal')
    assert.deepEqual(g.errors, [], `${f} 的第一个视角就排不下`)
  }
})

test('agent 示例的每一个视角都排得下', () => {
  const dir = 'examples/agent/fact'
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    for (const v of viewsOf(s)) {
      const g = buildFactGraph(s, fields, v, 'vertical')
      assert.deepEqual(g.errors, [], `${f} 的视角「${v.label}」排不下`)
    }
  }
})
