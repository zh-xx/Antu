#!/usr/bin/env node
// ============================================================
//  tools/mcp/client-test.mjs —— 自己写一个 MCP 客户端来测服务端
//
//  为什么要它：MCP 是协议，光看代码看不出"客户端调得通吗"。
//  这个脚本按下真实客户端的顺序走一遍：握手 → 列工具 → 逐个调用 → 读资源，
//  把服务端返回的东西原样打出来（图片只报大小，不刷屏）。
//
//  用法：node tools/mcp/client-test.mjs
// ============================================================

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SERVER = join(REPO, 'tools/mcp/server.mjs')

const child = spawn('node', [SERVER], { cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'] })
let stderr = ''
child.stderr.on('data', (d) => {
  stderr += d.toString()
})

let seq = 0
const pending = new Map()
let buf = ''
child.stdout.on('data', (d) => {
  buf += d.toString()
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      console.log('  ⚠ 收到不是 JSON 的一行：', line.slice(0, 120))
      continue
    }
    const p = pending.get(msg.id)
    if (p) {
      pending.delete(msg.id)
      p(msg)
    }
  }
})

const rpc = (method, params) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? rej(new Error(`${m.error.code}: ${m.error.message}`)) : res(m.result)))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        rej(new Error(`${method} 超时`))
      }
    }, 60000)
  })

const notify = (method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')

const textOf = (r) => (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const imageOf = (r) => (r.content || []).find((c) => c.type === 'image')

const step = (n, title) => console.log(`\n【${n}】${title}`)

try {
  step(1, '握手')
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'antu-client-test', version: '0.1.0' },
  })
  notify('notifications/initialized')
  console.log('  服务端：', init.serverInfo?.name, init.serverInfo?.version)
  console.log('  协议版本：', init.protocolVersion)

  step(2, '列工具')
  const tools = await rpc('tools/list', {})
  for (const t of tools.tools) console.log(`  - ${t.name}：${t.title}`)

  step(3, '列资源（只该有给 agent 的那几份）')
  const res = await rpc('resources/list', {})
  for (const r of res.resources) console.log(`  - ${r.uri}`)

  step(4, '读一份"给 agent 的规格"资源')
  const spec = await rpc('resources/read', { uri: 'antu://agent/fact/guide' })
  const specText = spec.contents?.[0]?.text ?? ''
  console.log(`  取到 ${specText.length} 字符，开头：${specText.split('\n')[0]}`)

  step(5, '调 antu_schema（字段表，从代码生成）')
  const sch = await rpc('tools/call', { name: 'antu_schema', arguments: {} })
  const schText = textOf(sch)
  console.log(`  ${schText.length} 字符（约 ${Math.round(schText.length * 0.65 / 1000 * 10) / 10}k token），开头：${schText.split('\n')[0]}`)

  step(6, '调 antu_guide（机制说明）')
  const guide = await rpc('tools/call', { name: 'antu_guide', arguments: {} })
  console.log(`  ${textOf(guide).length} 字符，开头：${textOf(guide).split('\n').find((l) => l.trim()) ?? ''}`)

  step(7, '调 antu_examples（列示例）')
  const ex = await rpc('tools/call', { name: 'antu_examples', arguments: {} })
  console.log('  ' + textOf(ex).split('\n').slice(0, 6).join('\n  '))

  step(8, '校验一份坏 JSON（故意少字段）')
  const bad = await rpc('tools/call', {
    name: 'antu_validate',
    arguments: { spec: { type: 'fact', title: '坏的', slots: [{ events: [{ id: 'e1', label: '没时间' }] }] } },
  })
  console.log('  isError =', bad.isError)
  console.log('  ' + textOf(bad).split('\n').slice(0, 5).join('\n  '))

  step(9, '校验一份真 JSON')
  const good = JSON.parse(readFileSync(join(REPO, 'examples/fact/电梯劝烟案.json'), 'utf8'))
  const v = await rpc('tools/call', { name: 'antu_validate', arguments: { spec: good } })
  console.log('  ' + textOf(v))

  step(10, '算几何（不渲染）')
  const lay = await rpc('tools/call', { name: 'antu_layout', arguments: { spec: good } })
  console.log('  ' + textOf(lay).split('\n').join('\n  '))

  step(11, '生成自包含 HTML')
  const html = await rpc('tools/call', {
    name: 'antu_render',
    arguments: { spec: good, outPath: '/tmp/mcp-test-out.html' },
  })
  console.log('  ' + textOf(html).split('\n').join('\n  '))

  step(12, '截图预览（这一步要浏览器）')
  const pv = await rpc('tools/call', {
    name: 'antu_preview',
    arguments: { spec: good, width: 1400, height: 820 },
  })
  const img = imageOf(pv)
  console.log('  ' + textOf(pv))
  if (img) {
    const out = process.env.PREVIEW_OUT || '/tmp/mcp-preview.png'
    writeFileSync(out, Buffer.from(img.data, 'base64'))
    console.log(`  图片：${img.mimeType}，base64 ${Math.round(img.data.length / 1024)} KB → 已存 ${out}`)
  } else {
    console.log('  图片：没有')
  }

  console.log('\n✅ 十二个步骤全部走通')
  if (stderr.trim()) console.log('\n服务端 stderr：\n' + stderr.trim().split('\n').slice(0, 8).join('\n'))
} catch (e) {
  console.log('\n❌ 失败：', e.message)
  if (stderr.trim()) console.log('服务端 stderr：\n' + stderr.trim().split('\n').slice(0, 12).join('\n'))
  process.exitCode = 1
} finally {
  child.kill()
}
