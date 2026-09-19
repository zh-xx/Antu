// ============================================================
//  tools/mcp/preview.mjs —— 把生成的 HTML 截成一张 PNG
//
//  为什么这件事重要：**agent 看不见自己画的东西**。
//  校验全过、排布也合理，图照样可能难看（卡片挤、字太小、太空）。
//  这个工具让 agent 能"看一眼"再决定改不改。
//
//  实现上不引入无头浏览器依赖，复用**本机已有的 Chrome**：
//  起一个 headless 实例，通过 CDP 导航到 file:// 并截图。
//  Node 22 自带 WebSocket，所以连 CDP 也不用额外装包。
// ============================================================

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function findChrome() {
  for (const p of CANDIDATES) if (existsSync(p)) return p
  return null
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 等浏览器把调试端口开起来，并拿到一个页面目标的 WebSocket 地址 */
async function pageTarget(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* 还没起来，继续等 */
    }
    await wait(200)
  }
  throw new Error(`浏览器调试端口 ${port} 没起来`)
}

/** 极简 CDP 客户端：够用就好，不做完整实现 */
function cdp(url) {
  const ws = new WebSocket(url)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(msg.error.message))
    else p.resolve(msg.result)
  })
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('连不上浏览器调试端口')), { once: true })
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ready, send, close: () => ws.close() }
}

/**
 * 把一份自包含 HTML 截成 PNG。
 * @returns {{ data: string, mimeType: 'image/png', width: number, height: number, ms: number }}
 */
export async function screenshot(htmlPath, { width = 1600, height = 900, settleMs = 1200 } = {}) {
  const chrome = findChrome()
  if (!chrome) {
    throw new Error(
      '没找到 Chrome/Chromium。预览需要本机有一个 Chrome；没装的话可以只用 antu_validate 和 antu_layout。',
    )
  }

  const port = 9500 + Math.floor(Math.random() * 400)
  const profile = mkdtempSync(join(tmpdir(), 'antu-mcp-'))
  const child = spawn(
    chrome,
    [
      '--headless=old',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--disable-extensions',
      '--allow-file-access-from-files',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const started = Date.now()
  try {
    const target = await pageTarget(port)
    const c = cdp(target)
    await c.ready
    await c.send('Page.enable')
    await c.send('Runtime.enable')
    await c.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await c.send('Page.navigate', { url: pathToFileURL(htmlPath).href })

    // 等图真的画出来：卡片出现、并且数量不再变
    const deadline = Date.now() + 15000
    let last = -1
    let stable = 0
    while (Date.now() < deadline) {
      const r = await c.send('Runtime.evaluate', {
        expression: 'document.querySelectorAll(".antu-card").length',
        returnByValue: true,
      })
      const n = r.result?.value ?? 0
      if (n > 0 && n === last) {
        stable += 1
        if (stable >= 2) break
      } else {
        stable = 0
      }
      last = n
      await wait(200)
    }
    await wait(settleMs)

    const shot = await c.send('Page.captureScreenshot', { format: 'png' })
    const cards = await c.send('Runtime.evaluate', {
      expression: 'document.querySelectorAll(".antu-card").length',
      returnByValue: true,
    })
    c.close()
    return {
      data: shot.data,
      mimeType: 'image/png',
      width,
      height,
      cards: cards.result?.value ?? 0,
      ms: Date.now() - started,
    }
  } finally {
    child.kill()
    // 等它真的退出再删目录，否则可能残留
    await wait(200)
    rmSync(profile, { recursive: true, force: true })
  }
}
