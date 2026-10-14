// ============================================================
//  tools/dsh/src/tools.mjs — Host tool bodies for @zh-xx/antu-dsh (no Cordis import)
//
//  Pure helpers + execute logic. The Host `apply` wraps these with defineTool.
//  Session cwd: exec.agent.session.header.cwd (same as @deepseek-ai/dsh-tool-fs).
// ============================================================

import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

/** Session workspace cwd for this call, or undefined */
export function sessionCwd(exec) {
  return exec?.agent?.session?.header?.cwd
}

/** Safe file stem from a title */
export function slugify(title) {
  const s = String(title || 'antu')
    .trim()
    .replace(/[^\w\u4e00-\u9fff.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'antu'
}

/** True when `path` is outside `root` (including `..` and absolute relatives). */
export function leavesRoot(root, path) {
  const rel = relative(root, path)
  return rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')
}

function tryLstat(path) {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

/** Nearest path that exists in the filesystem sense of `lstat` (includes dangling symlinks). */
function nearestLstatPath(path) {
  let cursor = path
  for (;;) {
    if (tryLstat(cursor)) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) return null
    cursor = parent
  }
}

/** Resolve one symlink step to an absolute path (target need not exist). */
function readLinkAbsolute(linkPath) {
  const target = readlinkSync(linkPath)
  return isAbsolute(target) ? resolve(target) : resolve(dirname(linkPath), target)
}

/**
 * Where a create/write at `path` would actually land, following symlinks on the
 * path prefix (including a dangling leaf symlink and a symlinked parent dir).
 */
export function effectiveWritePath(path) {
  const existing = nearestLstatPath(path)
  if (!existing) return resolve(path)
  const st = lstatSync(existing)
  if (existing === path) {
    if (!st.isSymbolicLink()) {
      try {
        return realpathSync(path)
      } catch {
        return resolve(path)
      }
    }
    // Leaf is a symlink (possibly dangling): writing replaces/follows the target.
    const target = readLinkAbsolute(path)
    try {
      return realpathSync(path)
    } catch {
      return effectiveWritePath(target)
    }
  }
  // `existing` is an ancestor. If it is a symlink to a directory (or anything),
  // join the remainder onto its real location.
  let base
  if (st.isSymbolicLink()) {
    const target = readLinkAbsolute(existing)
    try {
      base = realpathSync(existing)
    } catch {
      base = effectiveWritePath(target)
    }
  } else {
    base = realpathSync(existing)
  }
  const rest = relative(existing, path)
  return rest ? join(base, rest) : base
}

function workspaceRoot(cwd) {
  const root = resolve(cwd)
  try {
    if (existsSync(root)) return realpathSync(root)
  } catch {
    /* keep lexical */
  }
  return root
}

/**
 * Resolve where antu_render writes the HTML.
 * Always under the session cwd (absolute paths, `..`, and symlink escapes are refused).
 */
export function resolveOutPath(outPath, title, cwd) {
  if (!cwd || typeof cwd !== 'string') {
    throw new Error('antu_render needs a session workspace (cwd)')
  }
  const rootReal = workspaceRoot(cwd)
  const name = outPath && String(outPath).trim() ? String(outPath).trim() : `${slugify(title)}.html`
  // Relative names join the real cwd. Absolute names keep resolve(), then the
  // effective-write check accepts macOS `/var` vs `/private/var` equivalences.
  const path = isAbsolute(name) ? resolve(name) : resolve(rootReal, name)
  const effective = effectiveWritePath(path)
  if (leavesRoot(rootReal, effective)) {
    throw new Error(`antu_render outPath must stay under the session workspace (${rootReal})`)
  }
  return path
}

/** Validate; return the tool's JSON value (never throws for bad specs) */
export function runValidate(spec, { validate }) {
  const r = validate(spec)
  return {
    ok: r.ok,
    errors: r.errors ?? [],
    notes: r.notes ?? [],
  }
}

/** Layout report as data + text */
export function runLayout(spec, { layout, kind, orientation } = {}) {
  const r = layout(spec, { kind, orientation })
  if (!r.ok) {
    return { ok: false, reason: r.reason, errors: r.errors ?? [] }
  }
  return {
    ok: true,
    type: r.type,
    kind: r.kind,
    text: r.text,
  }
}

/**
 * Validate, render HTML, write under the session workspace.
 * @returns {{ ok: true, path, bytes, title } | { ok: false, errors?, reason? }}
 */
export function runRender(spec, { renderHtml, outPath, kind, theme, cwd } = {}) {
  let html
  try {
    html = renderHtml(spec, { kind, theme })
  } catch (e) {
    if (Array.isArray(e.errors) && e.errors.length) {
      return { ok: false, errors: e.errors }
    }
    return { ok: false, reason: e.message || String(e) }
  }
  let path
  try {
    path = resolveOutPath(outPath, spec?.title, cwd)
  } catch (e) {
    return { ok: false, reason: e.message || String(e) }
  }
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, html)
  } catch (e) {
    return { ok: false, reason: e.message || String(e) }
  }
  return {
    ok: true,
    path,
    bytes: Buffer.byteLength(html),
    title: typeof spec?.title === 'string' ? spec.title : '',
  }
}

/** Parse tool-call argsRaw JSON; null when truncated or invalid */
export function parseArgsRaw(argsRaw) {
  if (typeof argsRaw !== 'string' || !argsRaw.trim()) return null
  try {
    return JSON.parse(argsRaw)
  } catch {
    return null
  }
}
