// ============================================================
//  tools/lib/chrome.mjs —— 用本机 Chrome 跑页面的共用工具
//
//  为什么要它：验证渲染结果这件事，这个项目做过几十次，每次都是在
//  /tmp 里现写一套一模一样的 CDP 脚本（起浏览器、连调试端口、导航、
//  轮询、截图），用完就扔。现在只有这一份，验证脚本和 MCP 预览都用它。
//
//  不引入无头浏览器依赖：复用本机已有的 Chrome；Node 22 自带
//  WebSocket，所以连 CDP 也不用装包。
// ============================================================

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

/** 等调试端口起来，拿到页面目标的 WebSocket 地址 */
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
  const listeners = []
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.method) {
      for (const fn of listeners) fn(msg)
      return
    }
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
  return { ready, send, on: (fn) => listeners.push(fn), close: () => ws.close() }
}

/**
 * 起一个 headless Chrome，返回一个会话。
 * 用完务必 close()，否则进程和临时目录都会留下。
 */
export async function launchBrowser({ width = 1600, height = 900, port } = {}) {
  const chrome = findChrome()
  if (!chrome) {
    throw new Error('没找到 Chrome/Chromium。装一个，或者跳过需要浏览器的检查。')
  }
  const debugPort = port ?? 9500 + Math.floor(Math.random() * 400)
  const profile = mkdtempSync(join(tmpdir(), 'antu-chrome-'))
  const common = [
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ]

  // --headless=old 在 Chrome 132 之后被移除了，而 CI 的 runner 版本比本机新。
  // 所以先按老写法起，起不来再换新写法，最后再试不带参数的。
  // 这样本机和 CI 都能跑，不必两边各配一套。
  const variants = [['--headless=old'], ['--headless=new'], []]
  let child = null
  let target = null
  const failures = []
  for (const variant of variants) {
    child = spawn(chrome, [...variant, ...common], { stdio: 'ignore' })
    try {
      target = await pageTarget(debugPort, 8000)
      break
    } catch (e) {
      failures.push(`${variant.join(' ') || '(不带 headless)'} → ${e.message}`)
      child.kill()
      await wait(300)
      child = null
      target = null
    }
  }
  if (!target) {
    child?.kill()
    rmSync(profile, { recursive: true, force: true })
    throw new Error(
      `Chrome 起不来，三种 headless 写法都试过了：\n  ${failures.join('\n  ')}\n` +
        `Chrome 路径：${chrome}`,
    )
  }

  const c = cdp(target)
  await c.ready
  await c.send('Page.enable')
  await c.send('Runtime.enable')
  await c.send('Network.enable')
  await c.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  /** 本次导航期间发起的网络请求（用来断言"没有外部请求"） */
  let requests = []
  /** 控制台的 error 与未捕获异常 */
  let errors = []
  c.on((msg) => {
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url)
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })

  const session = {
    /**
     * 打开一个页面并等它稳定。
     * @param url          file:// 或 http://
     * @param waitFor      等这个表达式为真再返回（默认等出现 .antu-card）
     * @param settleMs     稳定之后再等一会儿，让动画落定
     */
    async open(url, { waitFor = 'document.querySelectorAll(".antu-card").length', settleMs = 800 } = {}) {
      requests = []
      errors = []
      await c.send('Page.navigate', { url })
      const deadline = Date.now() + 15000
      let last = null
      let stable = 0
      while (Date.now() < deadline) {
        const r = await c.send('Runtime.evaluate', { expression: waitFor, returnByValue: true })
        const v = r.result?.value
        if (v) {
          if (v === last) {
            stable += 1
            if (stable >= 2) break
          } else {
            stable = 0
          }
          last = v
        }
        await wait(200)
      }
      await wait(settleMs)
      return session
    },

    async eval(expression) {
      const r = await c.send('Runtime.evaluate', { expression, returnByValue: true })
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      }
      return r.result?.value
    },

    /** 截图的 base64（MCP 预览要的是它，不落盘） */
    async screenshotData() {
      const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
      return data
    },

    /** 截图写到文件（验证脚本要的是它，好让人工看一眼） */
    async screenshot(outPath) {
      writeFileSync(outPath, Buffer.from(await session.screenshotData(), 'base64'))
      return outPath
    },

    /** 本次导航期间请求过的地址 */
    get requests() {
      return requests.slice()
    },
    /** 本次导航期间的控制台错误与未捕获异常 */
    get errors() {
      return errors.slice()
    },

    async close() {
      c.close()
      child.kill()
      await wait(200)
      rmSync(profile, { recursive: true, force: true })
    },
  }

  return session
}

/**
 * 把一份 HTML 截成 PNG（MCP 预览用的就是它）。
 * 起一次浏览器、开一个页面、截完就关。
 */
export async function screenshotPage(htmlPath, { width = 1600, height = 900, settleMs = 800 } = {}) {
  const started = Date.now()
  const session = await launchBrowser({ width, height })
  try {
    await session.open(pathToFileURL(htmlPath).href, { settleMs })
    const cards = await session.eval('document.querySelectorAll(".antu-card").length')
    return {
      data: await session.screenshotData(),
      mimeType: 'image/png',
      width,
      height,
      cards,
      ms: Date.now() - started,
    }
  } finally {
    await session.close()
  }
}
