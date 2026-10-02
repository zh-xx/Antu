// ============================================================
//  tools/lib/chrome.mjs — shared utility for running a page in the local Chrome
//
//  Why it exists: verifying the rendered result has been done dozens of times in
//  this project, each time writing the same throwaway CDP script in /tmp (launch
//  a browser, connect to the debugging port, navigate, poll, screenshot). Now
//  there is one copy, used by both the verify script and the MCP preview.
//
//  No headless browser dependency: reuse the Chrome already on the machine, and
//  Node 22 ships WebSocket, so not even CDP needs a package.
// ============================================================

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Known paths. **No vendor paths are piled up here**: any Chromium-based browser
// can be plugged in through ANTU_CHROME (the domestic browsers common on Kylin /
// UOS go this way), so the repository need not guess which one the user has.
const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  // Windows: Edge ships with the system, so a Windows user always has one (the skill's `preview` counts on it);
  // Chrome where its installer puts it, for all users or for one
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ...(process.env.LOCALAPPDATA ? [`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`] : []),
]

// Some distributions put the browser elsewhere, or only link it in through
// update-alternatives, so once the candidate list comes up empty look for the
// executable names in PATH as well.
// **This list is the only source of the shell interpolation below**, so that no
// external value can flow into it.
const PATH_NAMES = ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'chrome']

function findInPath(name) {
  try {
    const out = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim()
    return out || null
  } catch {
    return null // no sh (Windows, for instance) or not found: both count as a miss
  }
}

/** A candidate must be an **executable file**: a directory does not count (one level missing in ANTU_CHROME points at a directory) */
function isBrowserFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * The diagram's own items, whichever type is on the page: a fact event card, a procedure flow
 * node or a relationship entity. Waiting on the fact card alone made every procedure page sit out
 * the full 15-second timeout before a screenshot, and report "0 cards"; the relationship graph
 * did the same until its entity was added here (16 seconds for a preview). The fact chronicle's card is
 * its own class (.antu-chr-card).
 */
export const ITEM_SELECTOR = '.antu-card, .antu-chr-card, .antu-pn, .antu-rn, .antu-jn'

/**
 * Find the browser on this machine. Order: ANTU_CHROME environment variable > known paths > PATH.
 *
 * The environment variable is **read fresh every time**, not frozen at module load: otherwise a
 * caller that sets it after the import gets nothing, and the verifier could not test it by
 * swapping values inside one process.
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
 * Wait for the debugging port to come up and get the WebSocket address of the page target.
 *
 * When `died` is passed in, give up the moment the process exits: waiting on an
 * already dead browser only burns the whole timeout for nothing.
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
      /* not up yet, keep waiting */
    }
    await wait(200)
  }
  return null
}

/** Minimal CDP client: good enough, not a complete implementation */
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
    ws.addEventListener('error', () => rej(new Error('Cannot connect to the browser debugging port')), { once: true })
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
 * Launch a headless Chrome and return a session.
 * Always close() it when done, or both the process and the temporary directory are left behind.
 */
/**
 * Three headless variants, tried in the order "old first, new after".
 *
 * `--headless=old` was removed after Chrome 132 and the CI runner is newer than
 * this machine; but old machines have only that one, so all three stay: this
 * machine and CI do not each need their own set.
 */
export const HEADLESS_VARIANTS = [['--headless=old'], ['--headless=new'], []]

/** How long one attempt waits for the debugging port. A dead process gives up early, so a generous value costs no time. */
const ATTEMPT_TIMEOUT = 30000

/**
 * **Each variant gets its own port.**
 *
 * Three attempts must not share one port: if the previous one is somehow still
 * alive it still holds the port, the next one cannot bind and exits, and the
 * fallback chain is worth nothing. With staggered ports a previous variant that
 * did not die cleanly no longer stops the next one from starting.
 */
export function attemptPorts(basePort, count = HEADLESS_VARIANTS.length) {
  return Array.from({ length: count }, (_, i) => basePort + i)
}

/** The full launch arguments for one attempt. Profile and port are assigned per attempt by the caller, never shared. */
export function launchArgs({ flags, port, profile, width, height }) {
  return [
    ...flags,
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--allow-file-access-from-files',
    // /dev/shm is often tiny in a container and Chrome then fails to start. Needed on CI
    '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ]
}

/** Keep Chrome's own stderr: when it fails to start, the reason is almost always in here */
function captureStderr(child, keep = 600) {
  let buf = ''
  child.stderr?.on('data', (d) => {
    buf += String(d)
    if (buf.length > keep * 4) buf = buf.slice(-keep * 2) // so it cannot grow without bound
  })
  return () => buf.slice(-keep).trim()
}

/** Wait for a child process to really exit, at most ms */
async function waitForExit(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return Promise.race([
    new Promise((r) => child.once('exit', () => r(true))),
    wait(ms).then(() => false),
  ])
}

/**
 * Ask it politely to leave first, and force-kill if it does not.
 *
 * Why force-kill: under heavy container load Chrome can freeze and ignore SIGTERM.
 * If it does not leave, the profile directory stays occupied, the temporary files
 * cannot be deleted, and it keeps burning CPU for the attempts that follow.
 */
async function terminate(child, ms = 3000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  killGroup(child)
  if (await waitForExit(child, ms)) return
  killGroup(child, 'SIGKILL')
  await waitForExit(child, 1000)
}

/**
 * Kill **the whole process group**, not just the main process.
 *
 * Killing only the main process leaves the child that is writing the profile
 * alive, and deleting the directory right after hits
 * `ENOTEMPTY: directory not empty`. This happened on CI for real (commits 384d52b and
 * 5bbd087 fixed it): the main process exited on SIGTERM while the child was still writing
 * into the profile, so `rmSync` reached its final rmdir with the directory
 * non-empty again. Launching the child with detached makes it its own process
 * group, so it can be reaped group and all here.
 */
function killGroup(child, signal = 'SIGTERM') {
  // **This must test the same thing as the detached flag on the spawn above**: only when the
  // child is its own process group does the minus sign mean its group; without detached, -pid
  // points at the verify process's own group and would kill us too.
  if (process.platform === 'win32') {
    try {
      child.kill(signal)
    } catch {
      /* already gone */
    }
    return
  }
  try {
    // the minus sign = the whole process group
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* already gone */
    }
  }
}

/**
 * Delete one temporary profile directory.
 *
 * It needs retries: in the few hundred milliseconds while Chrome is winding down
 * there are still stray writes, and failing to delete in one go is normal.
 * If the retries still fail, return false honestly and let the caller decide what
 * to do (neither swallow it nor throw).
 */
async function removeProfile(dir, attempts = 5) {
  if (!dir) return true
  for (let i = 0; i < attempts; i += 1) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return true
    } catch {
      await wait(200)
    }
  }
  return false
}

/**
 * Launch a headless Chrome and return a session.
 * Always close() it when done, or both the process and the temporary directory are left behind.
 */
export async function launchBrowser({ width = 1600, height = 900, port, timeoutMs } = {}) {
  const chrome = findChrome()
  if (!chrome) {
    throw new Error('Chrome/Chromium not found. Install one, or skip the checks that need a browser.')
  }
  const ports = attemptPorts(port ?? 9500 + Math.floor(Math.random() * 400))

  // **Its own** profile directory per attempt, a trap this tool has fallen into:
  // when Chrome sees the same --user-data-dir already has an instance, it exits
  // with "Failed to create SingletonLock: File exists" / "Aborting now". With one
  // shared directory, once the first variant fails to start (or does not die
  // cleanly) the other two cannot even launch, the "try three variants" fallback
  // chain is dead, and the symptom is all three reporting "the port never came up".
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
      // keep stderr: the reason Chrome fails to start is almost only in here, and dropping it leaves only guesses
      stdio: ['ignore', 'ignore', 'pipe'],
      // its own process group, so that shutdown can reap the children too (see killGroup)
      detached: process.platform !== 'win32',
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
      ? `Chrome exited on its own${tail ? `: ${tail.split('\n').slice(-3).join(' / ')}` : ' (left no error message)'}`
      : `the port did not come up within ${delay / 1000}s`
    failures.push(`${a.flags.join(' ') || '(no headless flag)'}  port ${a.port}  ${why}`)
    await terminate(c)
    target = null
  }
  // clean up the profile directories that went unused too, rather than leaving a pile in /tmp
  for (const a of attempts) {
    if (a.profile !== profile) await removeProfile(a.profile)
  }
  if (!target) {
    await terminate(child)
    throw new Error(
      `Chrome will not start; all ${attempts.length} headless variants were tried (each with its own port and profile):\n  ` +
        `${failures.join('\n  ')}\n` +
        `Chrome path: ${chrome}`,
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

  /** Network requests made during this navigation (used to assert "no external requests") */
  let requests = []
  /** Console errors and uncaught exceptions */
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
     * Open a page and wait for it to settle.
     * @param url          file:// or http://
     * @param waitFor      return once this expression is truthy (by default, wait for the diagram's items to appear)
     * @param settleMs     wait a little longer after it settles, so animations come to rest
     */
    async open(url, { waitFor = `document.querySelectorAll(${JSON.stringify(ITEM_SELECTOR)}).length`, settleMs = 800 } = {}) {
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
     * Evaluate an expression in the page.
     * With userGesture=true this evaluation is marked as a "user gesture": a script-triggered
     * click does not count as a gesture by default, and the browser then blocks the second
     * download from the same page; marking the gesture stops it from blocking.
     * With awaitPromise=true, wait for the Promise the expression returns to settle before returning.
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

    /** Base64 of a screenshot (what the MCP preview wants, not written to disk) */
    async screenshotData() {
      const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
      return data
    },

    /** Write a screenshot to a file (what the verify scripts want, so a human can glance at it) */
    async screenshot(outPath) {
      writeFileSync(outPath, Buffer.from(await session.screenshotData(), 'base64'))
      return outPath
    },

    /**
     * Allow downloads and say which directory they land in. The export feature is verified
     * through it: click the button, then check the PNG that landed on disk.
     *
     * Try the Browser domain first and fall back to the Page domain: their availability
     * differs between versions, and this machine and CI run different Chrome versions, so
     * both are kept rather than configuring one for each.
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
     * Click an element with a **real mouse event**. The result of evaluating expr must be an
     * element (it may be a lookup expression).
     *
     * Why not el.click(): a script-triggered click is not a "user gesture", so the browser
     * blocks the second download from the same page. Export is exactly one download per
     * click, and only a real gesture can verify "export twice in a row".
     */
    async clickAt(expr) {
      const json = await session.eval(`(() => {
        const el = (${expr})
        if (!el) return null
        const r = el.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
      })()`)
      if (!json) throw new Error(`Cannot click element: ${expr}`)
      const { x, y } = JSON.parse(json)
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      }
    },

    /** URLs requested during this navigation */
    get requests() {
      return requests.slice()
    },
    /** Console errors and uncaught exceptions during this navigation */
    get errors() {
      return errors.slice()
    },

    async close() {
      c.close()
      await terminate(child)
      await removeProfile(profile)
    },
  }

  return session
}

/**
 * Render one HTML file to a PNG (this is what the MCP preview uses).
 * Launch a browser once, open one page, close when the shot is taken.
 */
export async function screenshotPage(htmlPath, { width = 1600, height = 900, settleMs = 800 } = {}) {
  const started = Date.now()
  const session = await launchBrowser({ width, height })
  try {
    await session.open(pathToFileURL(htmlPath).href, { settleMs })
    const cards = await session.eval(`document.querySelectorAll(${JSON.stringify(ITEM_SELECTOR)}).length`)
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
