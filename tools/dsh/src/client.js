// ============================================================
//  tools/dsh/src/client.js — ModuleLoader entry for @zh-xx/antu-dsh
//
//  Client half: the turn data of antu_render calls, their diagram cards in the turn tail, a compact
//  tool row, and the full view in the right panel. Lazy-loads client.embed.js (repackaged
//  @zh-xx/antu/embed). Copied into package/client.js by build.mjs (build output is not committed).
// ============================================================

window.__ModuleLoader__.load({
  id: '@zh-xx/antu-dsh',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    const WIRE_NAMES = ['antu_render', 'mcp__antu__antu_render']
    const TAB_ID = '@zh-xx/antu-dsh'
    const TAB_KIND = 'antu-diagram'
    /**
     * The full view (a page in DSH's right panel). `open` is filled when sidebar-right is available.
     * `files` maps a written path to the card's `openFile`, so the full view can open the HTML.
     */
    const fullView = { open: null, files: new Map() }
    /** Set once the conversation service is there: the turn tail draws finished diagrams, so the tool row stays compact. */
    let hasTurnTail = false

    function destroyHandle(handle) {
      if (!handle) return
      try {
        handle.destroy()
      } catch {
        /* already destroyed */
      }
    }

    // Inlined by build.mjs (do not edit the marker bodies by hand): card-model.mjs, then require-async.mjs.
    /*@@INJECT_CARD_MODEL@@*/

    /*@@INJECT_REQUIRE_ASYNC@@*/

    /** Lazy promise for the ModuleLoader embed chunk (mount + cardUi + kindsOf). */
    const embedPromiseCache = { promise: null }
    function loadEmbed(requireFn) {
      return beginLoadEmbed(requireFn, embedPromiseCache)
    }

    /** The embed API once its chunk has loaded, or why it could not (e.g. DSH older than 0.2.0-rc.2) */
    function useEmbed() {
      const [state, setState] = useState({ embed: null, loadError: null })
      useEffect(() => {
        let cancelled = false
        loadEmbed(require)
          .then((embed) => {
            if (!cancelled) setState({ embed, loadError: null })
          })
          .catch((err) => {
            if (!cancelled) setState({ embed: null, loadError: err?.message || String(err) })
          })
        return () => {
          cancelled = true
        }
      }, [])
      return state
    }

    /**
     * One resource failure frame. The plan provider throws RemoteError, but that class is not on our
     * ModuleLoader face; a plain Error carrying `code` has the same `{ ok: false, error }` shape.
     */
    function antuResourceError(code, message) {
      const error = new Error(message)
      error.code = code
      return error
    }

    /**
     * The `antu` resource protocol: read one diagram from a Session's history by its call id.
     * Mirrors dsh-client-ui-plan's planResourceProvider: follow to a snapshot, then page back until
     * the exact call is found. The tab keeps only the address, so a reload re-reads here.
     */
    function antuResourceProvider(remote) {
      return {
        protocol: 'antu',
        async *open(address, { signal }) {
          const aborted = () => signal.aborted
          if (aborted()) return
          const target = parseAntuAddress(address)
          if (target === undefined) {
            yield { ok: false, error: antuResourceError('antu/invalid-address', 'Invalid Antu resource address.') }
            return
          }
          const sessionAddress = target.session
          try {
            let snapshot
            for await (const frame of remote.follow({ address: sessionAddress }, signal)) {
              if (frame.type === 'snapshot') {
                snapshot = frame
                break
              }
            }
            if (aborted()) return
            if (snapshot === undefined) {
              throw antuResourceError('antu/unavailable', 'Session history ended before the diagram could be read.')
            }
            let page = { records: snapshot.records, hasMore: snapshot.hasMore }
            // Keep what earlier pages held: the result is newer than its call, so it may sit on a page
            // we already read when the call itself turns up on an older one.
            const records = []
            while (true) {
              records.push(...page.records)
              const value = diagramFromRecords(records, target.callId)
              if (value !== undefined) {
                yield { ok: true, value }
                return
              }
              const beforeSeq = page.records[0]?.event.seq
              if (!page.hasMore || beforeSeq === undefined) break
              const next = await remote.page({ address: sessionAddress, throughSeq: snapshot.cursor, beforeSeq }, signal)
              if (aborted()) return
              if (!next.ok) {
                yield next
                return
              }
              page = next.value
            }
            yield { ok: false, error: antuResourceError('antu/not-found', 'The diagram was not found in this Session.') }
          } catch (error) {
            if (!aborted()) {
              yield {
                ok: false,
                error:
                  error && typeof error.code === 'string'
                    ? error
                    : antuResourceError('antu/read-failed', error instanceof Error ? error.message : String(error)),
              }
            }
          }
        },
      }
    }

    /**
     * Show the right panel fullscreen, as its own fullscreen button does. The public face of
     * `ctx.sidebarRight` (DSH 0.2.0-rc.2) has no such call; the controller has `commandTarget` and
     * `toggleFullscreen`, so use them when present and otherwise leave the panel as it is (the reader
     * still has the panel's own fullscreen button).
     */
    function tryFullscreen(sidebarRight) {
      try {
        if (typeof sidebarRight?.commandTarget !== 'function' || typeof sidebarRight?.toggleFullscreen !== 'function') return false
        const target = sidebarRight.commandTarget()
        if (!target) return false
        sidebarRight.toggleFullscreen(target)
        return true
      } catch {
        return false
      }
    }

    /** Mount `spec` into `el` as asked (kind and theme are checked); `ui` is the chat card's quiet chrome */
    function mountDiagram(embed, el, spec, wantKind, wantTheme, ui) {
      const opening = pickOpening(knownKinds(embed, spec), wantKind, wantTheme)
      return { handle: embed.mount(el, spec, mountOptions(opening, ui)), opening }
    }

    /**
     * Mount the diagram into `hostRef` and keep it fitted. React Flow fits when it mounts; a card
     * mounted inside DSH's collapsed fold is 0×0 and would stay blank, so refit on every resize
     * (opening the fold changes the host's size). Returns the mount error, if any.
     */
    function useDiagram(hostRef, handleRef, embed, spec, kind, theme, ui, revision) {
      const [mountError, setMountError] = useState(null)

      useLayoutEffect(() => {
        const el = hostRef.current
        if (!el || !embed || !spec || typeof spec !== 'object') return undefined

        destroyHandle(handleRef.current)
        handleRef.current = null
        el.replaceChildren()
        setMountError(null)

        try {
          handleRef.current = mountDiagram(embed, el, spec, kind, theme, ui).handle
        } catch (err) {
          setMountError(err?.message || String(err))
          return undefined
        }

        // React Flow fitted at mount; refit on every later resize (opening DSH's fold grows the host).
        let observer
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            try {
              handleRef.current?.fitView()
            } catch {
              /* the handle is gone (destroyed): nothing left to fit */
            }
          })
          observer.observe(el)
        }

        return () => {
          observer?.disconnect()
          destroyHandle(handleRef.current)
          handleRef.current = null
        }
      }, [embed, spec, kind, theme, ui, revision])

      return mountError
    }

    /** The fitted whole diagram with the cover that opens the full view (the tool row and the tail share it). */
    function diagramCard({ hostRef, title, embedError, canOpenFull, onOpenFull }) {
      return h(
        'div',
        { className: 'antuDsh_card', 'data-antu-dsh': 'render' },
        // Keep the mount host in the tree even when the last mount failed.
        // If we swap it for the error fallback, hostRef is null on the next
        // argsRaw change and the layout effect returns early forever.
        h('div', {
          ref: hostRef,
          className: 'antuDsh_canvas',
          role: 'img',
          'aria-label': title,
          hidden: !!embedError,
        }),
        embedError ? h('div', { className: 'antuDsh_fallback' }, embedError) : null,
        // A cover over the picture: a click opens the full view, and the wheel goes on to the conversation.
        canOpenFull
          ? h(
              'button',
              {
                type: 'button',
                className: 'antuDsh_cover',
                title: 'Open full view',
                'aria-label': `Open full view: ${title}`,
                onClick: onOpenFull,
              },
              h('span', { className: 'antuDsh_coverIcon', 'aria-hidden': true }, '⤢'),
            )
          : null,
      )
    }

    /** Full-size diagram in the right Sidebar, read from the tab's resource address (no cardUi, no private cache). */
    function AntuSidebarBody({ useTabInfo, useResource }) {
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const { embed, loadError } = useEmbed()
      const { tab, sidebar } = useTabInfo()
      const address = tab?.navigation?.address
      const params = tab?.navigation?.params && typeof tab.navigation.params === 'object' ? tab.navigation.params : {}
      const revision = tab?.navigation?.revision
      const resource = useResource(address)
      const value = resource?.value && typeof resource.value === 'object' ? resource.value : null
      const spec = value?.spec && typeof value.spec === 'object' ? value.spec : null
      // Full page chrome in the sidebar — no cardUi.
      const mountError = useDiagram(hostRef, handleRef, embed, spec, value?.kind, value?.theme, undefined, revision)
      const embedError = loadError || mountError
      const path = typeof value?.path === 'string' ? value.path : null
      const openFile = path ? fullView.files.get(path) : null

      // Opened from a chat card: present the panel fullscreen (once per opening; leaving it is the reader's choice).
      // `wantFullscreen` is in params only for that opening; a reload drops it, so nothing replays it.
      const askedRevision = useRef(null)
      useEffect(() => {
        if (!params.wantFullscreen || sidebar?.fullscreen || askedRevision.current === revision) return
        askedRevision.current = revision
        if (typeof fullView.fullscreen === 'function') fullView.fullscreen()
      }, [revision, params.wantFullscreen, sidebar?.fullscreen])

      const failure = typeof value?.failure === 'string' && value.failure ? value.failure : null
      // A tab saved by an older build has no address, so its resource is `none`: keep the old notice.
      const notice =
        embedError ||
        (resource.status === 'loading'
          ? 'Loading diagram…'
          : resource.status === 'none'
            ? 'No diagram in this tab.'
            : resource.status === 'failed'
              ? 'Could not load this diagram.'
              : failure || (!spec ? 'No diagram in this tab.' : null))
      const label = titleOf(spec, 'Antu')
      return h(
        'div',
        { className: 'antuDsh_side' },
        notice
          ? h(
              'div',
              {
                className:
                  'antuDsh_fallback' + (failure || resource.status === 'failed' ? ' antuDsh_noticeError' : ''),
              },
              notice,
            )
          : h('div', {
              ref: hostRef,
              className: 'antuDsh_sideCanvas',
              role: 'img',
              'aria-label': label,
            }),
        spec && path && typeof openFile === 'function'
          ? h(
              'button',
              { type: 'button', className: 'antuDsh_btn antuDsh_sideFile', title: path, onClick: () => openFile(path) },
              'Open HTML',
            )
          : null,
      )
    }

    /** The tab title, recovered from the same resource address (PlanTitle is the worked example). */
    function AntuTitle({ useTabInfo, useResource }) {
      const { tab } = useTabInfo()
      const resource = useResource(tab?.navigation?.address)
      const value = resource?.value && typeof resource.value === 'object' ? resource.value : null
      return value?.title || tab?.title || 'Antu'
    }

    function AntuRenderCard(props) {
      const { phase, block, openFile, toolName, sessionId, callId } = props
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const { embed, loadError } = useEmbed()

      const argsRaw = argsRawOf(block)
      const args = useMemo(() => parseArgsRaw(argsRaw), [argsRaw])
      const spec = args && typeof args === 'object' ? args.spec : null
      const path = resultPath(block)
      const status = statusOf(phase, block)
      // antu_render returned ok: false (bad spec, outPath outside the workspace, a write error): say why, draw nothing
      const failure = renderFailure(block)
      const title = titleOf(spec, toolName === 'mcp__antu__antu_render' ? 'Antu (MCP)' : 'Antu')
      // The whole diagram, fitted; no chrome (cardUi). Reading happens in the full view.
      const ui = useMemo(() => (embed ? { ...embed.cardUi } : undefined), [embed])
      const mountError = useDiagram(hostRef, handleRef, embed, spec, args?.kind, args?.theme, ui, argsRaw)
      const embedError = loadError || mountError

      const openFull = () => {
        if (typeof fullView.open !== 'function' || !spec || !sessionId || callId == null) return
        // The card's openFile is only alive while the card is: keep it for the full view's "Open HTML".
        if (path && typeof openFile === 'function') fullView.files.set(path, openFile)
        fullView.open({ sessionId, callId: String(callId) })
      }
      const canOpenFull =
        typeof fullView.open === 'function' && !!spec && !embedError && !!sessionId && callId != null

      // With the turn tail there, the finished diagram is drawn after DSH's fold; the folded tool
      // row only names the diagram and opens the full view, so the reader sees one line, not a blank card.
      if (hasTurnTail) {
        const error = status === 'error' || !!failure
        const label =
          status === 'preparing' || (!spec && !argsRaw)
            ? 'Preparing…'
            : error
              ? failure || 'Render failed'
              : status === 'running'
                ? 'Running…'
                : status === 'stopped'
                  ? 'Stopped'
                  : !spec
                    ? 'Could not parse tool arguments'
                    : 'Done'
        return h(
          'div',
          { className: 'antuDsh_toolrow', 'data-antu-dsh': 'render' },
          h('span', { className: 'antuDsh_toolTitle' }, title),
          h('span', { className: 'antuDsh_toolStatus' + (error ? ' antuDsh_noticeError' : '') }, label),
          canOpenFull && status === 'ok'
            ? h('button', { type: 'button', className: 'antuDsh_btn', onClick: openFull }, 'Open full view')
            : null,
        )
      }

      // Before the diagram can be drawn, or when it cannot: one quiet line, no picture.
      const notice =
        status === 'preparing' || (!spec && !argsRaw)
          ? 'Preparing diagram…'
          : status === 'error'
            ? 'Render failed'
            : failure
              ? failure
              : status === 'stopped'
                ? 'Stopped'
                : !spec
                  ? 'Could not parse tool arguments; open the HTML file when the call finishes.'
                  : null

      if (notice) {
        return h(
          'div',
          {
            className:
              'antuDsh_notice' +
              (status === 'error' || failure ? ' antuDsh_noticeError' : '') +
              (status === 'stopped' ? ' antuDsh_noticeWarn' : ''),
            'data-antu-dsh': 'render',
          },
          notice,
        )
      }

      return diagramCard({ hostRef, title, embedError, canOpenFull, onOpenFull: openFull })
    }

    /** One finished call's card in the turn tail; `call` is a record of the turn's diagram data. */
    function AntuTailDiagram({ call, openFile, sessionId }) {
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const { embed, loadError } = useEmbed()
      const args = call.args && typeof call.args === 'object' ? call.args : null
      const spec = args ? args.spec : null
      const title = titleOf(spec, call.name === 'mcp__antu__antu_render' ? 'Antu (MCP)' : 'Antu')
      const ui = useMemo(() => (embed ? { ...embed.cardUi } : undefined), [embed])
      const mountError = useDiagram(hostRef, handleRef, embed, spec, args?.kind, args?.theme, ui, call.argsRaw)
      const embedError = loadError || mountError

      const openFull = () => {
        if (typeof fullView.open !== 'function' || !spec || !sessionId || call.callId == null) return
        // The tail's openFile is the chat's, so the full view's "Open HTML" reaches the written file.
        if (call.path && typeof openFile === 'function') fullView.files.set(call.path, openFile)
        fullView.open({ sessionId, callId: String(call.callId) })
      }

      return diagramCard({
        hostRef,
        title,
        embedError,
        canOpenFull:
          typeof fullView.open === 'function' && !!spec && !embedError && !!sessionId && call.callId != null,
        onOpenFull: openFull,
      })
    }

    /**
     * The finished turn's diagrams, drawn in `conversation.chat.turnTail` after DSH folds the turn's
     * tool steps. Running calls show nothing; a failure is one quiet line; a success is the card.
     */
    function AntuTurnTail({ turn, openFile, sessionId }) {
      const data = turn && turn.data ? turn.data.get(ANTU_DIAGRAMS_KIND) : undefined
      const calls = data && Array.isArray(data.calls) ? data.calls : []
      if (calls.length === 0) return null

      const rows = []
      for (const call of calls) {
        if (call.status === 'running') continue
        if (call.status !== 'ok') {
          rows.push(
            h(
              'div',
              { key: call.callId, className: 'antuDsh_notice antuDsh_noticeError', 'data-antu-dsh': 'render' },
              call.failure || 'Render failed',
            ),
          )
          continue
        }
        const spec = call.args && typeof call.args === 'object' ? call.args.spec : null
        if (!spec) {
          rows.push(
            h(
              'div',
              { key: call.callId, className: 'antuDsh_notice', 'data-antu-dsh': 'render' },
              'Could not parse tool arguments; open the HTML file when the call finishes.',
            ),
          )
          continue
        }
        rows.push(h(AntuTailDiagram, { key: call.callId, call, openFile, sessionId }))
      }

      return rows.length === 0 ? null : h('div', { className: 'antuDsh_tail', 'data-antu-dsh': 'turn-tail' }, rows)
    }

    const css = `
.antuDsh_card{position:relative;min-width:0}
.antuDsh_canvas{min-height:220px;height:min(42vh,360px);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-base);overflow:hidden}
.antuDsh_canvas>*{width:100%;height:100%}
.antuDsh_cover{position:absolute;inset:0;margin:0;padding:0;border:0;border-radius:var(--dsw-radius-lg,8px);background:transparent;cursor:zoom-in}
.antuDsh_cover:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}
.antuDsh_coverIcon{position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l4);opacity:0;transition:opacity .15s}
.antuDsh_cover:hover .antuDsh_coverIcon,.antuDsh_cover:focus-visible .antuDsh_coverIcon{opacity:1}
.antuDsh_notice{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary)}
.antuDsh_noticeError{color:var(--dsw-alias-state-error-primary)}
.antuDsh_noticeWarn{color:var(--dsw-alias-state-warn-label)}
.antuDsh_btn{appearance:none;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:2px 8px;font-size:11px;line-height:16px;cursor:pointer}
.antuDsh_btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
.antuDsh_fallback{padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);font-size:12px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-markdown-code-block)}
.antuDsh_side{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;padding:8px;box-sizing:border-box}
.antuDsh_sideCanvas{flex:auto;min-height:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-base);overflow:hidden}
.antuDsh_sideCanvas>*{width:100%;height:100%}
.antuDsh_sideFile{position:absolute;right:16px;bottom:16px}
.antuDsh_toolrow{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}
.antuDsh_toolTitle{color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.antuDsh_toolStatus{color:var(--dsw-alias-label-tertiary)}
.antuDsh_tail{display:flex;flex-direction:column;gap:8px}
@media (prefers-reduced-motion:reduce){.antuDsh_coverIcon{transition:none}}
`

    function ensureStyles() {
      const tagId = '@zh-xx/antu-dsh/card.css'
      if (typeof document === 'undefined') return
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`)) return
      const tag = document.createElement('style')
      tag.dataset.plugin = '@zh-xx/antu-dsh'
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyles()
        // 0.14/0.15 builds kept a private tab cache; remove its keys once. Only for those users — may be deleted later.
        try {
          const store = window.localStorage
          store.removeItem('antu-dsh:tabs')
          for (let i = store.length - 1; i >= 0; i -= 1) {
            const key = store.key(i)
            if (key && key.startsWith('antu-dsh:tab:')) store.removeItem(key)
          }
        } catch {
          /* no storage (private mode, sandboxed iframe): nothing to clean */
        }
        ctx.slots.inject('tool.call.toolview', () => {
          for (const key of WIRE_NAMES) {
            ctx.slots.register({ name: 'tool.call.toolview', key, inject: (sessionId) => ({ sessionId }) }, AntuRenderCard)
          }
        })
        // Optional: without the right Sidebar or the resource/session services the chat card stays and
        // there is simply no "open full view".
        ctx.inject(
          ['resources', 'sessions', 'remote', 'remote.session', 'sidebarRight', 'sidebarRightTabs'],
          (sideCtx) => {
            sideCtx.effect(
              () => sideCtx.resources.register(antuResourceProvider(sideCtx.remote.session)),
              'antu-dsh: diagram resource provider',
            )
            sideCtx.effect(
              () =>
                sideCtx.sidebarRightTabs.register({
                  id: TAB_ID,
                  kind: TAB_KIND,
                  patterns: ['dsh-resource://antu/**'],
                  canOpen: (address) => parseAntuAddress(address) !== undefined,
                  priority: 'extension',
                  title: () => 'Antu',
                }),
              'antu-dsh: sidebar tab type',
            )
            sideCtx.effect(
              () =>
                sideCtx.slots.inject('sidebar.right.pane.tab', () =>
                  sideCtx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, AntuSidebarBody),
                ),
              'antu-dsh: sidebar tab body',
            )
            sideCtx.effect(
              () =>
                sideCtx.slots.inject('sidebar.right.pane.tab.title', () =>
                  sideCtx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, AntuTitle),
                ),
              'antu-dsh: sidebar tab title',
            )
            sideCtx.effect(() => {
              fullView.open = ({ sessionId, callId }) => {
                const child = sideCtx.sessions.subagentAddress(sessionId)
                const session = child === undefined ? { kind: 'session', sessionId } : { kind: 'subagent', ...child }
                sideCtx.sidebarRight.openResource(antuAddress({ session, callId }), {
                  params: { wantFullscreen: true },
                })
              }
              fullView.fullscreen = () => tryFullscreen(sideCtx.sidebarRight)
              return () => {
                fullView.open = null
                fullView.fullscreen = null
              }
            }, 'antu-dsh: full view opener')
          },
        )
        // Optional: only DSH with the conversation service has the turn tail. Without it the tool
        // row keeps the full card (older DSH has no folded turn to get lost in).
        ctx.inject(['uiConversation'], (convCtx) => {
          hasTurnTail = true
          convCtx.effect(
            () => convCtx.uiConversation.events.register(antuDiagramsDefinition),
            'antu-dsh: diagram turn data',
          )
          convCtx.slots.inject('conversation.chat.turnTail', () =>
            convCtx.slots.register(
              { name: 'conversation.chat.turnTail', id: TAB_ID, inject: (sessionId) => ({ sessionId }) },
              AntuTurnTail,
            ),
          )
        })
      },
    }
  },
})

