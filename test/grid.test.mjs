// ============================================================
//  test/grid.test.mjs —— 校验与网格（纯函数）
//
//  校验是这个项目对外的第一道门，报错文案是给 agent 看的。
//  这里钉住三件事：**拦得住、指得准、rule 只有一份**。
// ============================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildGrid } from '../src/renderers/fact/timeline/grid.js'
// 信封层校验在 core/validate.js。它按 type 查表分发，所以**必须先登记知识**
// （renderers/index.js）——这是"注册是副作用，忘了就静默失效"那个坑，
// 下面专门有一条测试守着它。
import '../src/renderers/index.js'
import { validateSpec } from '../src/core/validate.js'

const base = () => JSON.parse(readFileSync('examples/fact/电梯劝烟案.json', 'utf8'))
const errorsOf = (spec) => buildGrid(spec).errors
const some = (errs, re) => errs.some((e) => re.test(e))

test('合法数据没有任何错误', () => {
  assert.deepEqual(errorsOf(base()), [])
})

test('缺必填字段：报错要带字段路径与事件 id', () => {
  const spec = base()
  delete spec.slots[0].events[0].date
  const errs = errorsOf(spec)
  assert.ok(errs.length > 0)
  assert.ok(some(errs, /slots\[0\]/), '要指明是哪个槽')
  assert.ok(some(errs, /date/), '要指明缺哪个字段')
  assert.ok(some(errs, new RegExp(spec.slots[0].events[0].id)), '要带上事件 id')
})

test('引用悬空：actorIds / groupId / sourceIds 指向不存在的 id 都要报', () => {
  const a = base(); a.slots[0].events[0].actorIds = ['不存在的主体']
  assert.ok(some(errorsOf(a), /不存在的主体/))
  const g = base(); g.slots[1].events[0].groupId = '不存在的分组'
  assert.ok(some(errorsOf(g), /不存在的分组/))
  const s = base(); s.slots[0].events[0].sourceIds = ['不存在的来源']
  assert.ok(some(errorsOf(s), /不存在的来源/))
})

test('一格一事件：同一个时间点、同一条车道上放两条事件要报', () => {
  const spec = base()
  // 抄一份事件放进同一个槽，且不指定主体（两条都会落轴线）
  const dup = { ...spec.slots[0].events[0], id: 'ev-dup', actorIds: [] }
  spec.slots[0].events = [{ ...spec.slots[0].events[0], actorIds: [] }, dup]
  assert.ok(errorsOf(spec).length > 0, '同一格塞两条事件必须被拦下')
})

test('时段不能倒着走', () => {
  const spec = base()
  const ev = spec.slots[1].events[0]
  ev.dateEnd = '2000-01-01'
  assert.ok(some(errorsOf(spec), /倒着走|晚于|早于/))
})

test('分组最多三个', () => {
  const spec = base()
  spec.groups = [...(spec.groups || []), { id: 'g-x', label: '第四组' }, { id: 'g-y', label: '第五组' }]
  assert.ok(errorsOf(spec).length > 0, '超过三个分组必须报错')
})

test('信封层：title 不是字符串要报（这一条由 validateSpec 管，不是 buildGrid）', () => {
  const spec = base()
  spec.title = 42
  assert.ok(validateSpec(spec).length > 0)
  // 反过来：buildGrid 不管信封层，它只看 fact 自己那些字段
  assert.deepEqual(buildGrid(spec).errors, [])
})

test('validateSpec 按 type 分发到 fact 的校验上（登记知识的副作用没被漏掉）', () => {
  // 这条防的是"忘了 import 知识清单"：那时 validateSpec 查表查不到，
  // 会静默返回"通过"，坏数据就混进去了（真发生过，是验证器抓出来的）。
  const spec = base()
  delete spec.slots[0].events[0].date
  assert.ok(validateSpec(spec).length > 0, '信封层过了之后必须继续查 fact 那一层')
})

test('信封层：缺 type 要报', () => {
  const spec = base()
  delete spec.type
  assert.ok(validateSpec(spec).length > 0)
})

test('没登记知识的大类不校验（现在只有 fact，所以空数组）', () => {
  assert.deepEqual(validateSpec({ type: 'relationship', title: '还没做' }), [])
})

test('校验就是排布：出错时仍然给出网格，好让上层把问题显示出来', () => {
  const spec = base()
  delete spec.slots[0].events[0].date
  const g = buildGrid(spec)
  assert.ok(g.errors.length > 0)
  assert.ok(Array.isArray(g.rows) && g.rows.length > 0, '不该因为报错就不给网格')
  assert.ok(Array.isArray(g.columns))
})
