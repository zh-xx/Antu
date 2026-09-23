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

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 已知路径。**这里不堆厂商路径**：任何 Chromium 内核的浏览器都能靠
// ANTU_CHROME 接进来（麒麟／统信上常见的国产浏览器就走这条路），
// 仓库不必替用户猜他用的是哪一个。
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

// 有些发行版把浏览器装在别处，或者只通过 update-alternatives 挂进来，
// 所以候选表落空后再按可执行名去 PATH 里找一遍。
// **这个表是下面 shell 插值的唯一来源**，不要让外部值流进来。
const PATH_NAMES = ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome']

function findInPath(name) {
  try {
    const out = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim()
    return out || null
  } catch {
    return null // 没有 sh（例如 Windows）或没找到，都算落空
  }
}

/** 候选必须是**能执行的文件**：目录不算（ANTU_CHROME 少写一层就会指到目录上） */
function isBrowserFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * 找本机的浏览器。顺序：ANTU_CHROME 环境变量 > 已知路径 > PATH。
 *
 * 环境变量**每次现读**，不在模块加载时读死：否则调用方在 import 之后再设就不生效，
 * 验证器也没法在同一个进程里换着值验它。
 */
export function findChrome() {
  const explicit = process.env.ANTU_CHROME
  if (explicit && isBrowserFile(explicit)) return explicit
  for (const p of CANDIDATES) if (isBrowserFile(p)) return p
  for (const name of PATH_NAMES) {
    const found = findInPath(name)
    if (found && isBrowserFile(found)) return found
  }
  return null
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 等调试端口起来，拿到页面目标的 WebSocket 地址。
 *
 * `died` 传进来时，进程一退就立刻放弃：等一个已经死掉的浏览器，
 * 除了把超时时间白白耗完没有别的结果。
 */
async function pageTarget(port, timeoutMs = 15000, died = null) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (died?.()) return null
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* 还没起来，继续等 */
    }
    await wait(200)
  }
  return null
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
/**
 * 三种 headless 写法，按"先老后新"的顺序试。
 *
 * `--headless=old` 在 Chrome 132 之后被移除，而 CI 的 runner 版本比本机新；
 * 但老机器上只有这一种，所以三种都留着：本机和 CI 不必各配一套。
 */
export const HEADLESS_VARIANTS = [['--headless=old'], ['--headless=new'], []]

/** 每次尝试等调试端口的时限。进程一退就提前放弃，所以给得宽也不拖时间。 */
const ATTEMPT_TIMEOUT = 30000

/**
 * 每种写法**各占一个端口**。
 *
 * 不能三次共用一个端口：上一版万一还活着，端口还占着，下一版绑不上就退，
 * 备用链路等于没有。端口错开之后，前一版没死透也不影响后一版起来。
 */
export function attemptPorts(basePort, count = HEADLESS_VARIANTS.length) {
  return Array.from({ length: count }, (_, i) => basePort + i)
}

/** 一次尝试的完整启动参数。profile 与端口由调用方按尝试分配，不共用。 */
export function launchArgs({ flags, port, profile, width, height }) {
  return [
    ...flags,
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--allow-file-access-from-files',
    // 容器里 /dev/shm 往往很小，Chrome 会因此起不来。CI 上跑得跑这一条
    '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ]
}

/** 收着 Chrome 自己的 stderr：起不来的时候，原因基本都在这里面 */
function captureStderr(child, keep = 600) {
  let buf = ''
  child.stderr?.on('data', (d) => {
    buf += String(d)
    if (buf.length > keep * 4) buf = buf.slice(-keep * 2) // 别让它无限长
  })
  return () => buf.slice(-keep).trim()
}

/** 等一个子进程真的退出，最多等 ms */
async function waitForExit(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return Promise.race([
    new Promise((r) => child.once('exit', () => r(true))),
    wait(ms).then(() => false),
  ])
}

/**
 * 先好好请它走，不走就强杀。
 *
 * 为什么要强杀：容器的负载一高，Chrome 可能卡住不理 SIGTERM。
 * 它不走，profile 目录就还占着、临时文件也删不掉，
 * 而且会一直占着 CPU 影响后面几次尝试。
 */
async function terminate(child, ms = 3000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  if (!(await waitForExit(child, ms))) child.kill('SIGKILL')
}

/**
 * 起一个 headless Chrome，返回一个会话。
 * 用完务必 close()，否则进程和临时目录都会留下。
 */
export async function launchBrowser({ width = 1600, height = 900, port, timeoutMs } = {}) {
  const chrome = findChrome()
  if (!chrome) {
    throw new Error('没找到 Chrome/Chromium。装一个，或者跳过需要浏览器的检查。')
  }
  const ports = attemptPorts(port ?? 9500 + Math.floor(Math.random() * 400))

  // 每次尝试一份**自己的** profile 目录，这是这个工具踩过的坑：
  // Chrome 见到同一个 --user-data-dir 已经有实例，会直接
  //   Failed to create SingletonLock: File exists
  //   Failed to create a ProcessSingleton for your profile directory ... Aborting now
  // 自杀退出。共用一份时，第一版一旦没起来（或没死透），后面两版连启动都做不到，
  // "三种写法挨个试"的备用链路就是废的，症状是三次全报"端口没起来"。
  // 实测（macOS Chrome 153，占着 profile 起第二份）：第二份 4 秒内退出，端口没人听。
  const attempts = HEADLESS_VARIANTS.map((flags, i) => ({
    flags,
    port: ports[i],
    profile: mkdtempSync(join(tmpdir(), 'antu-chrome-')),
  }))

  const delay = timeoutMs ?? ATTEMPT_TIMEOUT
  let child = null
  let target = null
  let profile = null
  const failures = []
  for (const a of attempts) {
    const c = spawn(chrome, launchArgs({ ...a, width, height }), {
      // stderr 要留着：Chrome 起不来的原因基本只在这里，丢掉就只能猜
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const readStderr = captureStderr(c)
    let exited = false
    c.on('exit', () => {
      exited = true
    })
    target = await pageTarget(a.port, delay, () => exited)
    if (target) {
      child = c
      profile = a.profile
      break
    }
    const tail = readStderr()
    const why = exited
      ? `Chrome 自己退了${tail ? `：${tail.split('\n').slice(-3).join(' / ')}` : '（没留下错误信息）'}`
      : `${delay / 1000} 秒内端口没起来`
    failures.push(`${a.flags.join(' ') || '(不带 headless)'}　端口 ${a.port}　${why}`)
    await terminate(c)
    target = null
  }
  // 没用上的 profile 目录一并清掉，别在 /tmp 里留一堆
  for (const a of attempts) {
    if (a.profile !== profile) rmSync(a.profile, { recursive: true, force: true })
  }
  if (!target) {
    await terminate(child)
    throw new Error(
      `Chrome 起不来，${attempts.length} 种 headless 写法都试过了（每种各占一个端口和一份 profile）：\n  ` +
        `${failures.join('\n  ')}\n` +
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

    /**
     * 在页面里求值。
     * userGesture=true 时按"用户手势"标记这次求值——脚本触发的点击默认不算手势，
     * 浏览器会因此拦掉同一个页面的第二次下载；标上手势就不拦了。
     * awaitPromise=true 时等表达式返回的 Promise 落定再回值。
     */
    async eval(expression, { userGesture = false, awaitPromise = false } = {}) {
      const r = await c.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        userGesture,
        awaitPromise,
      })
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

    /**
     * 允许下载，并指定落到哪个目录。导出功能要靠它验：
     * 点一下按钮，再检查落盘的 PNG。
     *
     * 先试 Browser 域，不行退回 Page 域——两者不同版本上可用性不一样，
     * 本机与 CI 的 Chrome 版本不同，两条都留着省得各配一套。
     */
    async setDownloadDir(dir) {
      const params = { behavior: 'allow', downloadPath: dir }
      try {
        await c.send('Browser.setDownloadBehavior', { ...params, eventsEnabled: true })
      } catch {
        await c.send('Page.setDownloadBehavior', params)
      }
    },

    /**
     * 用**真实鼠标事件**点一个元素。expr 求值结果必须是元素（可以是查找表达式）。
     *
     * 为什么不用 el.click()：脚本触发的点击不算"用户手势"，
     * 浏览器会因此拦掉同一个页面的第二次下载——导出功能正是点一下下载一次，
     * 只有真实手势才验得了"连着导两次"。
     */
    async clickAt(expr) {
      const json = await session.eval(`(() => {
        const el = (${expr})
        if (!el) return null
        const r = el.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
      })()`)
      if (!json) throw new Error(`点不到元素：${expr}`)
      const { x, y } = JSON.parse(json)
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      }
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
      await terminate(child)
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
