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
//  A JSON output carries the same notice as a small `_notice` object (kind, current, latest, message, command); the
//  text output keeps the `Notice: ...` lines. A skill folder whose VERSION differs from the command line beside it is
//  `kind: "skill"`, and needs no network.
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
export const SKILL_UPDATE_COMMAND = 'npx skills update antu -g'
export const NPM_UPDATE_COMMAND = `npm update -g ${PACKAGE_NAME}`
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

/**
 * The structured notice for a newer version on npm, or null when there is none to give (#113).
 *
 * The shape is deliberately small and stable, because an agent reads it: kind, current, latest, a one-line message
 * and the one command to give. `current` is always the running program's version. `latest` is the newer version the
 * notice is about; for a stale skill folder it is that folder's version (see skillNoticeObject).
 */
export function noticeObject({ current, latest, where }) {
  if (where !== 'skill' && where !== 'npm') return null
  if (compareVersions(current, latest) !== -1) return null
  if (where === 'skill') {
    return { kind: 'update', current, latest, message: `Antu ${latest} is out; this skill is ${current}.`, command: SKILL_UPDATE_COMMAND }
  }
  return { kind: 'update', current, latest, message: `Antu ${latest} is out; this is ${current}.`, command: NPM_UPDATE_COMMAND }
}

/**
 * The structured notice for a skill folder whose own VERSION differs from the command line running beside it (#113).
 * It needs no network: it says the two files disagree, even when npm's newest version is the one running.
 * current = the running program's version, latest = the version the skill folder says it is.
 */
export function skillNoticeObject({ current, skillVersion, where }) {
  if (where !== 'skill' || !skillVersion || String(skillVersion) === String(current)) return null
  return {
    kind: 'skill',
    current,
    latest: String(skillVersion),
    message: `This skill folder says ${skillVersion}, but the command line beside it is ${current}.`,
    command: SKILL_UPDATE_COMMAND,
  }
}

/** The text for a notice object, in the words agents already know (the Notice: lines stay as they were) */
function noticeTextOf(n) {
  if (n.kind === 'skill') {
    return [
      `Notice: ${n.message}`,
      'When the request is done, tell the user in a sentence or two that the skill can be updated with:',
      `  ${n.command}`,
      'Do not run it unless the user agrees.',
    ].join('\n')
  }
  if (n.command === SKILL_UPDATE_COMMAND) {
    return [
      `Notice: ${n.message}`,
      'When the request is done, tell the user in a sentence or two that the skill can be updated with:',
      `  ${n.command}`,
      'Do not run it unless the user agrees.',
    ].join('\n')
  }
  return [
    `Notice: ${n.message}`,
    'When the request is done, tell the user in a sentence or two that it can be updated with:',
    `  ${NPM_UPDATE_COMMAND}   (or run it with: npx -y ${PACKAGE_NAME}@latest)`,
    'Do not run it unless the user agrees.',
  ].join('\n')
}

/** The notice text for a newer version, or '' when there is none to give */
export function noticeText({ current, latest, where }) {
  const n = noticeObject({ current, latest, where })
  return n ? noticeTextOf(n) : ''
}

/** The VERSION file beside a skill's scripts/ folder, or null when these are not skill files */
export function skillVersionBeside(file = fileURLToPath(import.meta.url)) {
  const dir = dirname(file)
  if (basename(dir) !== 'scripts') return null
  const root = dirname(dir)
  if (!existsSync(join(root, 'SKILL.md'))) return null
  try {
    return readFileSync(join(root, 'VERSION'), 'utf8').trim() || null
  } catch {
    return null
  }
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
 * The notice for this run as an object (null when none), for a JSON output's `_notice`. Start it at the beginning of
 * a command and wait for it at the end, so that the asking overlaps with the work. It never throws.
 *
 * A newer npm version wins over a stale skill folder; when npm has nothing newer, a skill folder whose VERSION
 * differs from the running command line still says so (no network needed).
 */
export async function updateNoticeObject({ current, where, env = process.env, now = Date.now(), file = fileURLToPath(import.meta.url) } = {}) {
  try {
    // whereRuns depends on the file, so it is worked out here rather than as a default that a passed `file` cannot change
    const place = where ?? whereRuns(file)
    if (env.ANTU_NO_UPDATE_NOTIFIER || place === 'source' || compareVersions(current, current) === null) return null
    const url = env.ANTU_REGISTRY_URL || REGISTRY_URL
    const cacheFile = join(tmpdir(), `antu-update-check-${createHash('sha1').update(url).digest('hex').slice(0, 16)}.json`)
    const latest = await latestVersion({ url, cacheFile, now })
    const update = latest ? noticeObject({ current, latest, where: place }) : null
    if (update) return update
    return skillNoticeObject({ current, skillVersion: skillVersionBeside(file), where: place })
  } catch {
    return null
  }
}

/**
 * The notice for this run, as text ('' when none). Start it at the beginning of a command and wait for it at the end,
 * so that the asking overlaps with the work. It never throws.
 */
export async function updateNotice(opts = {}) {
  const n = await updateNoticeObject(opts)
  return n ? noticeTextOf(n) : ''
}
