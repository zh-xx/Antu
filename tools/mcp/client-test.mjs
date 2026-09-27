#!/usr/bin/env node
// ============================================================
//  tools/mcp/client-test.mjs —— write an MCP client to test the server
//
//  Why it exists: MCP is a protocol, and reading the code does not show whether a
//  client can get through. This script walks the sequence a real client would:
//  handshake → list tools → call each one → read resources, printing exactly what the
//  server returns (images only report their size, to avoid flooding the screen).
//
//  Usage: node tools/mcp/client-test.mjs
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
      console.log('  ⚠ a line arrived that is not JSON:', line.slice(0, 120))
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
        rej(new Error(`${method} timed out`))
      }
    }, 60000)
  })

const notify = (method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')

const textOf = (r) => (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const imageOf = (r) => (r.content || []).find((c) => c.type === 'image')

const step = (n, title) => console.log(`\n[${n}] ${title}`)

try {
  step(1, 'Handshake')
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'antu-client-test', version: '0.1.0' },
  })
  notify('notifications/initialized')
  console.log('  server:', init.serverInfo?.name, init.serverInfo?.version)
  console.log('  protocol version:', init.protocolVersion)

  step(2, 'List tools')
  const tools = await rpc('tools/list', {})
  for (const t of tools.tools) console.log(`  - ${t.name}: ${t.title}`)

  step(3, 'List resources (only the agent-facing ones should be here)')
  const res = await rpc('resources/list', {})
  for (const r of res.resources) console.log(`  - ${r.uri}`)

  step(4, 'Read one "spec for an agent" resource')
  const spec = await rpc('resources/read', { uri: 'antu://agent/fact/guide' })
  const specText = spec.contents?.[0]?.text ?? ''
  console.log(`  got ${specText.length} chars, starts: ${specText.split('\n')[0]}`)

  step(5, 'Call antu_schema (the field table, generated from the code)')
  const sch = await rpc('tools/call', { name: 'antu_schema', arguments: {} })
  const schText = textOf(sch)
  console.log(`  ${schText.length} chars (about ${Math.round(schText.length * 0.65 / 1000 * 10) / 10}k tokens), starts: ${schText.split('\n')[0]}`)

  step(6, 'Call antu_guide (the mechanism notes)')
  const guide = await rpc('tools/call', { name: 'antu_guide', arguments: {} })
  console.log(`  ${textOf(guide).length} chars, starts: ${textOf(guide).split('\n').find((l) => l.trim()) ?? ''}`)

  step(7, 'Call antu_examples (list the examples)')
  const ex = await rpc('tools/call', { name: 'antu_examples', arguments: {} })
  console.log('  ' + textOf(ex).split('\n').slice(0, 6).join('\n  '))

  step(8, 'Validate a bad JSON (fields deliberately missing)')
  const bad = await rpc('tools/call', {
    name: 'antu_validate',
    arguments: { spec: { type: 'fact', title: 'bad', slots: [{ events: [{ id: 'e1', label: 'no time' }] }] } },
  })
  console.log('  isError =', bad.isError)
  console.log('  ' + textOf(bad).split('\n').slice(0, 5).join('\n  '))

  step(9, 'Validate a real JSON')
  const good = JSON.parse(readFileSync(join(REPO, 'examples/fact/elevator-smoking-case.zh-CN.json'), 'utf8'))
  const v = await rpc('tools/call', { name: 'antu_validate', arguments: { spec: good } })
  console.log('  ' + textOf(v))

  step(10, 'Work out the geometry (no rendering)')
  const lay = await rpc('tools/call', { name: 'antu_layout', arguments: { spec: good } })
  console.log('  ' + textOf(lay).split('\n').join('\n  '))

  step(11, 'Build the self-contained HTML')
  const html = await rpc('tools/call', {
    name: 'antu_render',
    arguments: { spec: good, outPath: '/tmp/mcp-test-out.html' },
  })
  console.log('  ' + textOf(html).split('\n').join('\n  '))

  step(12, 'Screenshot preview (this step needs a browser)')
  const pv = await rpc('tools/call', {
    name: 'antu_preview',
    arguments: { spec: good, width: 1400, height: 820 },
  })
  const img = imageOf(pv)
  console.log('  ' + textOf(pv))
  if (img) {
    const out = process.env.PREVIEW_OUT || '/tmp/mcp-preview.png'
    writeFileSync(out, Buffer.from(img.data, 'base64'))
    console.log(`  image: ${img.mimeType}, base64 ${Math.round(img.data.length / 1024)} KB -> written to ${out}`)
  } else {
    console.log('  image: none')
  }

  console.log('\n✅ all twelve steps passed')
  if (stderr.trim()) console.log('\nserver stderr:\n' + stderr.trim().split('\n').slice(0, 8).join('\n'))
} catch (e) {
  console.log('\n❌ failed:', e.message)
  if (stderr.trim()) console.log('server stderr:\n' + stderr.trim().split('\n').slice(0, 12).join('\n'))
  process.exitCode = 1
} finally {
  child.kill()
}
