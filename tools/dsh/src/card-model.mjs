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

// ---- Resource address (a tab keeps its identity only; the provider recovers the diagram from history) ----

/**
 * Encode a diagram's durable identity: the Session (or its subagent form) and the `antu_render` call.
 * Shaped like dsh-client-ui-plan's planAddress so the sidebar can treat it as a resource type.
 * @param {{ session: object, callId: string }} target
 * @returns {string} a dsh-resource://antu/… address
 */
export function antuAddress({ session, callId }) {
  const parts =
    session.kind === 'session'
      ? [session.sessionId, callId]
      : ['subagent', session.parentSessionId, session.childSessionId, session.mode, callId]
  return `dsh-resource://antu/${parts.map(encodeURIComponent).join('/')}`
}

/**
 * Decode a saved or caller-supplied diagram address; undefined unless it is exactly a Session or
 * subagent address this plugin wrote (same rules as parsePlanAddress).
 * @param {string} address
 * @returns {object | undefined} the decoded { session, callId }
 */
export function parseAntuAddress(address) {
  const match = /^dsh-resource:\/\/antu\/([^?#]+)$/.exec(address)
  if (match === null) return undefined
  try {
    const parts = match[1].split('/').map(decodeURIComponent)
    if (parts.some((part) => part === '')) return undefined
    if (parts.length === 2) {
      return { session: { kind: 'session', sessionId: parts[0] }, callId: parts[1] }
    }
    if (
      parts.length === 5 &&
      parts[0] === 'subagent' &&
      (parts[3] === 'one-shot' || parts[3] === 'continuable' || parts[3] === 'unknown')
    ) {
      return {
        session: {
          kind: 'subagent',
          parentSessionId: parts[1],
          childSessionId: parts[2],
          mode: parts[3],
        },
        callId: parts[4],
      }
    }
    return undefined
  } catch {
    return undefined
  }
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

/**
 * Read one diagram from Session history records (each `{ event }`), for the `antu` resource provider.
 * The call supplies the spec, kind, theme and title; a later result supplies the written path or the
 * failure. Returns undefined when the call is absent or its arguments are not the JSON object we wrote.
 * @param {Array<{ event?: object }>} records
 * @param {string} callId
 */
export function diagramFromRecords(records, callId) {
  if (!Array.isArray(records) || typeof callId !== 'string' || callId === '') return undefined

  let diagram
  for (const entry of records) {
    const event = entry?.event
    if (!event || event.type !== 'tool/call') continue
    const data = event.data
    if (!data || !isAntuRenderName(data.name)) continue
    if (data.callId == null || String(data.callId) !== callId) continue
    const argsRaw = typeof data.arguments === 'string' ? data.arguments : null
    const args = parseArgsRaw(argsRaw)
    // A truncated or non-object argument string is not a diagram call we can show.
    if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined
    const spec = args.spec && typeof args.spec === 'object' && !Array.isArray(args.spec) ? args.spec : null
    if (!spec) return undefined
    diagram = {
      callId,
      spec,
      kind: args.kind,
      theme: args.theme,
      title: titleOf(spec, data.name === 'mcp__antu__antu_render' ? 'Antu (MCP)' : 'Antu'),
      path: null,
      failure: null,
    }
    break
  }
  if (!diagram) return undefined

  for (const entry of records) {
    const event = entry?.event
    if (!event || event.type !== 'tool/result') continue
    const message = event.data?.message
    if (message?.source?.callId == null || String(message.source.callId) !== callId) continue
    const block = {
      kind: 'result',
      isError: message.isError === true,
      // DSH 0.2.0-rc.2 carries the presentation meta on the event; message.meta is the documented fallback.
      meta: event.data.meta ?? message.meta,
      content: message.content,
    }
    const failure = renderFailure(block) || (block.isError ? 'Render failed' : null)
    diagram.failure = failure
    diagram.path = failure ? null : resultPath(block)
    break
  }
  return diagram
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
