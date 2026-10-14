// ============================================================
//  tools/dsh/src/tools.mjs — Host tool bodies for @zh-xx/antu-dsh (no Cordis import)
//
//  Pure helpers + execute logic. The Host `apply` wraps these with defineTool.
//  Session cwd: exec.agent.session.header.cwd (same as @deepseek-ai/dsh-tool-fs).
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

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

/**
 * Resolve where antu_render writes the HTML.
 * Relative paths and omitted outPath are under the session cwd (required).
 */
export function resolveOutPath(outPath, title, cwd) {
  if (outPath && isAbsolute(outPath)) return resolve(outPath)
  if (!cwd || typeof cwd !== 'string') {
    throw new Error(
      'antu_render needs a session workspace (cwd); pass an absolute outPath when testing without a session',
    )
  }
  const name = outPath && outPath.trim() ? outPath.trim() : `${slugify(title)}.html`
  return resolve(join(cwd, name))
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
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, html)
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
