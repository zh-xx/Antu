// Human-facing full names stay pinned; machine ids are not renamed here.
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ZH_FULL = '案图 · 诉讼可视化'
const EN_FULL = 'Antu · Legal Diagrams'

test('README titles use the full display names', () => {
  assert.match(readFileSync('README.zh-CN.md', 'utf8'), new RegExp(`^# ${ZH_FULL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
  assert.match(readFileSync('README.md', 'utf8'), new RegExp(`^# ${EN_FULL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
})

test('DSH plugin locale titles use the full display names', () => {
  const zh = JSON.parse(readFileSync('tools/dsh/package/locale/zh.json', 'utf8'))
  const en = JSON.parse(readFileSync('tools/dsh/package/locale/en.json', 'utf8'))
  assert.equal(zh.meta.title, ZH_FULL)
  assert.equal(en.meta.title, EN_FULL)
})

test('the authored skill heading uses the English full display name', () => {
  assert.match(readFileSync('tools/skill/SKILL.md', 'utf8'), new RegExp(`^# ${EN_FULL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
})

test('CONTRIBUTING records the display-name rule', () => {
  const text = readFileSync('CONTRIBUTING.md', 'utf8')
  assert.match(text, /## Display names/)
  assert.ok(text.includes(ZH_FULL))
  assert.ok(text.includes(EN_FULL))
})

const ABOUT_EN =
  'Antu · Legal Diagrams turns case JSON into one offline HTML diagram—timelines, procedures, relationships, and court reasoning—for AI agents and legal professionals.'
const ABOUT_ZH =
  '案图 · 诉讼可视化：把案件 JSON 画成一张可离线打开的 HTML 图——时间线、程序流程、主体关系与裁判说理——供 AI Agent 与法律专业人士使用。'

test('the short About blurb is shared by README, AGENTS, and package.json', () => {
  assert.ok(readFileSync('README.md', 'utf8').includes(ABOUT_EN))
  assert.ok(readFileSync('README.zh-CN.md', 'utf8').includes(ABOUT_ZH))
  assert.ok(readFileSync('AGENTS.md', 'utf8').includes(ABOUT_EN))
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).description, ABOUT_EN)
})
