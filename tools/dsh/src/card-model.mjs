// ============================================================
//  tools/dsh/src/card-model.mjs — pure helpers of the chat card and the sidebar tab
//
//  No React, no DOM: the Client entry (client.js) has no ESM imports, so build.mjs inlines this file
//  into package/client.js, and the tests import it directly.
// ============================================================

/** The page looks the card can switch between (same ids as `theme` in the tools). */
export const THEMES = ['document', 'modern', 'legal']

/** Parse tool-call argsRaw JSON; null when truncated or invalid */
export function parseArgsRaw(argsRaw) {
  if (typeof argsRaw !== 'string' || !argsRaw.trim()) return null
  try {
    return JSON.parse(argsRaw)
  } catch {
    return null
  }
}

/** The argsRaw string of a tool-call block (running, or finished with a result), or null */
export function argsRawOf(block) {
  if (!block) return null
  if ('kind' in block) return block.call?.argsRaw ?? null
  if (block.phase === 'start') return block.argsRaw ?? null
  return null
}

/** Where `antu_render` wrote the file: from the result's meta, else from its "Written: …" line */
export function resultPath(block) {
  if (!block || !('kind' in block) || block.isError) return null
  const meta = block.meta
  if (meta && typeof meta === 'object' && typeof meta.path === 'string') return meta.path
  const text = Array.isArray(block.content)
    ? block.content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n')
    : ''
  const m = text.match(/^Written:\s*(.+)$/m)
  return m ? m[1].trim() : null
}

/** preparing | running | error | stopped | ok */
export function statusOf(phase, block) {
  if (phase === 'preparing') return 'preparing'
  if (phase === 'start') return 'running'
  if (block?.isError) return 'error'
  if (block?.error?.code === 'interrupted') return 'stopped'
  return 'ok'
}

/** The ways of drawing the spec's type has (empty when the type is unknown to this embed) */
export function knownKinds(embed, spec) {
  if (!embed || !spec || typeof spec.type !== 'string') return []
  try {
    return embed.kindsOf(spec.type) || []
  } catch {
    return []
  }
}

/**
 * What a diagram opens as: the asked-for kind and theme when they exist, else none (the engine's default).
 * `kind` falls back to the type's first kind only for the buttons' highlight, never for mounting.
 * @returns {{ mountKind: string | null, mountTheme: string | null, activeKind: string | null }}
 */
export function pickOpening(known, wantKind, wantTheme) {
  const mountKind = typeof wantKind === 'string' && known.includes(wantKind) ? wantKind : null
  const mountTheme = typeof wantTheme === 'string' && THEMES.includes(wantTheme) ? wantTheme : null
  return { mountKind, mountTheme, activeKind: mountKind || known[0] || null }
}

/** The mount options for an opening; `ui` is only passed for the compact chat card */
export function mountOptions({ mountKind, mountTheme }, ui) {
  return {
    ...(mountKind ? { kind: mountKind } : {}),
    ...(mountTheme ? { theme: mountTheme } : {}),
    ...(ui ? { ui } : {}),
  }
}

/** A diagram's title for labels: the spec's own title, else the fallback */
export function titleOf(spec, fallback) {
  return spec && typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim() : fallback
}
