// ============================================================
//  tools/lib/update-notice.mjs — the command line tells when a newer Antu is out
//
//  The skill is a copy of the last release and does not update itself, and a user who installed the package does
//  not look at npm every day. So the command line, which an agent runs anyway, asks the npm registry once a day for
//  the newest version number and, when it is newer than this one, ends its output with a notice for the agent to pass
//  on (#113). It is a notice, not an update: nothing is installed.
//
//  What it sends: one GET for the version of the package, from the machine that runs the command; nothing of any
//  diagram. The answer is kept in the temporary folder for a day. It never fails a command: no network, a slow
//  registry, an unreadable answer: no notice. ANTU_NO_UPDATE_NOTIFIER=1 turns it off.
//  ANTU_REGISTRY_URL points it at another address (the unit test does).
// ============================================================

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE_NAME = '@zh-xx/antu'
export const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME.replace(/\//g, '%2f')}/latest`
export const DAY_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 1500

/** -1, 0 or 1 for a < b, a = b, a > b; null when either is not MAJOR.MINOR.PATCH (a pre-release or "dev" is never compared) */
export function compareVersions(a, b) {
  const parse = (v) => /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v))?.slice(1).map(Number)
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return null
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1
  return 0
}

/**
 * Where this file runs from: 'skill' (scripts/antu.mjs beside a SKILL.md), 'npm' (inside node_modules, installed or
 * run by npx) or 'source' (a clone of the repository: no notice).
 */
export function whereRuns(file = fileURLToPath(import.meta.url)) {
  const dir = dirname(file)
  if (basename(dir) === 'scripts' && existsSync(join(dir, '..', 'SKILL.md'))) return 'skill'
  if (file.split(/[\\/]/).includes('node_modules')) return 'npm'
  return 'source'
}

/** The notice text for a newer version, or '' when there is none to give */
export function noticeText({ current, latest, where }) {
  if (compareVersions(current, latest) !== -1) return ''
  if (where === 'skill') {
    return [
      `Notice: Antu ${latest} is out; this skill is ${current}.`,
      'When the request is done, tell the user in a sentence or two that the skill can be updated with:',
      '  npx skills update antu -g',
      'Do not run it unless the user agrees.',
    ].join('\n')
  }
  if (where === 'npm') {
    return [
      `Notice: Antu ${latest} is out; this is ${current}.`,
      'When the request is done, tell the user in a sentence or two that it can be updated with:',
      `  npm update -g ${PACKAGE_NAME}   (or run it with: npx -y ${PACKAGE_NAME}@latest)`,
      'Do not run it unless the user agrees.',
    ].join('\n')
  }
  return ''
}

async function latestVersion({ url, cacheFile, now }) {
  try {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'))
    if (typeof cached.latest === 'string' && now - cached.checkedAt < DAY_MS) return cached.latest
  } catch {
    // no cache, or not readable: ask
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const latest = (await res.json())?.version
    if (typeof latest !== 'string') return null
    try {
      writeFileSync(cacheFile, JSON.stringify({ checkedAt: now, latest }))
    } catch {
      // the folder cannot be written: ask again next time
    }
    return latest
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The notice for this run, as text ('' when none). Start it at the beginning of a command and wait for it at the end,
 * so that the asking overlaps with the work. It never throws.
 */
export async function updateNotice({ current, where = whereRuns(), env = process.env, now = Date.now() } = {}) {
  try {
    if (env.ANTU_NO_UPDATE_NOTIFIER || where === 'source' || compareVersions(current, current) === null) return ''
    const url = env.ANTU_REGISTRY_URL || REGISTRY_URL
    const cacheFile = join(tmpdir(), `antu-update-check-${createHash('sha1').update(url).digest('hex').slice(0, 16)}.json`)
    const latest = await latestVersion({ url, cacheFile, now })
    return latest ? noticeText({ current, latest, where }) : ''
  } catch {
    return ''
  }
}
