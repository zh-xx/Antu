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

/** Why `antu_render` produced no file (from its presentation meta), or null when it did or is not done */
export function renderFailure(block) {
  if (!block || !('kind' in block)) return null
  const meta = block.meta
  if (!meta || typeof meta !== 'object' || meta.ok !== false) return null
  const errors = Array.isArray(meta.errors) ? meta.errors.filter((e) => typeof e === 'string') : []
  const reason = typeof meta.reason === 'string' && meta.reason ? meta.reason : 'Render failed'
  return errors.length ? `${reason}: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}` : reason
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

// ---- The full view's Esc (pure: no React, no DOM; inlined into the client entry) ----

/** The first Element of a composed path; document, window and plain objects are skipped. */
function firstElementOf(path) {
  for (const node of path) {
    if (!node || typeof node !== 'object') continue
    if (typeof node.getAttribute === 'function' || typeof node.matches === 'function' || typeof node.tagName === 'string') return node
  }
  return null
}

/** A text field or a contenteditable host: Esc belongs to it, not to the full view. */
function isEditable(node) {
  if (!node || typeof node !== 'object') return false
  const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : ''
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (typeof node.matches === 'function') {
    try {
      if (node.matches('input, textarea, select, [contenteditable]')) return true
    } catch {
      /* a stand-in without selector support: fall through to getAttribute */
    }
  }
  if (typeof node.getAttribute === 'function') {
    const editable = node.getAttribute('contenteditable')
    if (editable !== null && editable !== undefined && editable !== 'false') return true
  }
  return false
}

/** An open DSH modal outside the panel (confirm / settings dialog) owns its Escape. */
function modalOwnsEscape(doc, panelEl) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return false
  const nodes = doc.querySelectorAll('[aria-modal="true"], dialog[open]')
  if (!nodes || typeof nodes[Symbol.iterator] !== 'function') return false
  for (const node of nodes) {
    if (panelEl && typeof panelEl.contains === 'function' && panelEl.contains(node)) continue
    return true
  }
  return false
}

/** An open menu / listbox / expanded control inside the panel gets the first Esc. */
function panelOwnsEscape(path, panelEl) {
  const panelAt = path.indexOf(panelEl)
  if (panelAt < 0) return false
  for (const node of path.slice(0, panelAt)) {
    if (!node || typeof node.getAttribute !== 'function') continue
    const role = node.getAttribute('role')
    if (node.getAttribute('aria-expanded') === 'true' || role === 'menu' || role === 'listbox') return true
  }
  return false
}

/**
 * Should a keydown leave the Antu full view? True for a bare Escape (no modifiers, not a repeat, not
 * composing, not already handled) whose target is not editable, that has no open menu/listbox inside
 * the panel, and that no DSH modal outside the panel is waiting for. `path.indexOf(panelEl) < 0` means
 * the event came from outside the panel, so no inner node is checked (and the focus left on the chat
 * cover button no longer hides the panel). `doc` is the owner document; it defaults to the global one
 * and a missing `doc` (no DOM) skips the modal check. Duck-typed so it can be tested without a DOM.
 */
export function isFullViewEscape(event, panelEl, doc = typeof globalThis.document !== 'undefined' ? globalThis.document : undefined) {
  if (!event || event.key !== 'Escape') return false
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false
  if (event.repeat || event.isComposing || event.defaultPrevented) return false
  const raw = typeof event.composedPath === 'function' ? event.composedPath() : []
  const path = Array.isArray(raw) ? raw : []
  if (isEditable(firstElementOf(path))) return false
  if (modalOwnsEscape(doc, panelEl)) return false
  return !panelOwnsEscape(path, panelEl)
}

// ---- Per-turn diagram calls (the turn tail reads this; the folded tool row stays compact) ----

/** The Turn data key of the per-turn diagram calls. */
export const ANTU_DIAGRAMS_KIND = 'antu-diagrams'

/** Does this wire name call the diagram renderer? */
export function isAntuRenderName(name) {
  return name === 'antu_render' || name === 'mcp__antu__antu_render'
}

/** Only append-origin surface events are transcript history; a replacement copy must not rewrite it. */
export function isAppendSurfaceEvent(event) {
  return !!event && event.surfaceOp === 'append'
}

/** New per-turn state at `turn/start`. */
export function antuDiagramsStart(event) {
  return { turn: event.data.turn, calls: [] }
}

/**
 * One turn's diagram calls, in call order: a `tool/call` appends a running call and a `tool/result`
 * settles it with the written path or the failure. Unrelated tools and replacement results leave
 * `state` as it is, so React keeps the same Location value.
 */
export function antuDiagramsUpdate(state, event) {
  if (!state) return state
  if (event.type === 'tool/call') {
    if (!isAntuRenderName(event.data?.name)) return state
    const callId = event.data.callId == null ? null : String(event.data.callId)
    if (callId === null) return state
    const argsRaw = typeof event.data.arguments === 'string' ? event.data.arguments : null
    return {
      ...state,
      calls: [
        ...state.calls,
        { callId, name: event.data.name, argsRaw, args: parseArgsRaw(argsRaw), status: 'running', path: null, failure: null },
      ],
    }
  }
  if (event.type !== 'tool/result' || !isAppendSurfaceEvent(event)) return state
  const message = event.data?.message
  const callId = message?.source?.callId == null ? null : String(message.source.callId)
  if (callId === null) return state
  const index = state.calls.findIndex((call) => call.callId === callId)
  if (index < 0) return state
  const block = {
    kind: 'result',
    isError: message.isError === true,
    // DSH 0.2.0-rc.2 carries the presentation meta on the event; message.meta is the documented fallback.
    meta: event.data.meta ?? message.meta,
    content: message.content,
  }
  const failure = renderFailure(block) || (block.isError ? 'Render failed' : null)
  const calls = state.calls.slice()
  calls[index] = {
    ...calls[index],
    status: failure ? 'failed' : 'ok',
    path: failure ? null : resultPath(block),
    failure,
  }
  return { ...state, calls }
}

/** Turn-scoped accumulator of diagram calls; it publishes no view Node. */
export const antuDiagramsDefinition = {
  kind: ANTU_DIAGRAMS_KIND,
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return isAntuRenderName(event.data?.name) ? { id: String(event.data.turn), role: 'update' } : null
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context, match) => antuDiagramsStart(match.event),
  update: (context, match) => antuDiagramsUpdate(context.state, match.event),
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    const value = { calls: context.state.calls }
    // The same calls array means nothing changed: hand back `previous` so React does not re-render.
    if (previous?.kind === 'turn' && previous.turn === context.state.turn && previous.key === ANTU_DIAGRAMS_KIND && previous.value?.calls === value.calls) {
      return previous
    }
    return { kind: 'turn', turn: context.state.turn, key: ANTU_DIAGRAMS_KIND, value }
  },
}
