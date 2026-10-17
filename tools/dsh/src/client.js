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

    /** True from pagehide/beforeunload on: the tab-scoped cache must survive a reload, so an abort must not drop it. */
    let pageUnloading = false
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const markPageUnloading = () => {
        pageUnloading = true
      }
      window.addEventListener('pagehide', markPageUnloading)
      window.addEventListener('beforeunload', markPageUnloading)
    }

    const TAB_CACHE_PREFIX = 'antu-dsh:tab:'
    const TAB_CACHE_INDEX = 'antu-dsh:tabs'
    const TAB_CACHE_LIMIT = 20

    /** localStorage can be absent or throw (private mode, sandboxed iframe): every access goes through here. */
    function tabCacheStore() {
      try {
        return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
      } catch {
        return null
      }
    }

    /** The cached tab ids, most recent last; a corrupt index reads as empty. */
    function readTabCacheIndex(store) {
      try {
        const raw = store.getItem(TAB_CACHE_INDEX)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
          store.removeItem(TAB_CACHE_INDEX)
          return []
        }
        return parsed.filter((id) => typeof id === 'string' && id)
      } catch {
        try {
          store.removeItem(TAB_CACHE_INDEX)
        } catch {
          /* the store is unusable; nothing else to do */
        }
        return []
      }
    }

    /** Cache one tab's diagram so a reload can restore it (the layout keeps the tab id, not its params). */
    function saveTabDiagram(tabId, data) {
      const store = tabCacheStore()
      if (!store || !tabId) return
      try {
        store.setItem(TAB_CACHE_PREFIX + tabId, JSON.stringify({ ...data, savedAt: Date.now() }))
      } catch {
        return
      }
      try {
        const ids = readTabCacheIndex(store).filter((id) => id !== tabId)
        ids.push(tabId)
        while (ids.length > TAB_CACHE_LIMIT) {
          const evicted = ids.shift()
          if (evicted) store.removeItem(TAB_CACHE_PREFIX + evicted)
        }
        store.setItem(TAB_CACHE_INDEX, JSON.stringify(ids))
      } catch {
        /* the index is best effort */
      }
    }

    /** The cached diagram for `tabId`, or null; corrupt or non-object entries are dropped. */
    function loadTabDiagram(tabId) {
      const store = tabCacheStore()
      if (!store || !tabId) return null
      let raw
      try {
        raw = store.getItem(TAB_CACHE_PREFIX + tabId)
      } catch {
        return null
      }
      if (raw == null) return null
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        dropTabDiagram(tabId)
        return null
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        dropTabDiagram(tabId)
        return null
      }
      return parsed
    }

    /** Forget a tab's diagram and its index slot (the tab closed, or its cache was unusable). */
    function dropTabDiagram(tabId) {
      const store = tabCacheStore()
      if (!store || !tabId) return
      try {
        store.removeItem(TAB_CACHE_PREFIX + tabId)
      } catch {
        /* already gone */
      }
      try {
        store.setItem(TAB_CACHE_INDEX, JSON.stringify(readTabCacheIndex(store).filter((id) => id !== tabId)))
      } catch {
        /* the index is best effort */
      }
    }

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

    /** Full-size diagram in the right Sidebar (no cardUi chrome reduction). */
    function AntuSidebarBody({ useTabInfo }) {
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const { embed, loadError } = useEmbed()
      const { tab, sidebar } = useTabInfo()
      const tabId = tab?.id
      const params = tab?.navigation?.params && typeof tab.navigation.params === 'object' ? tab.navigation.params : {}
      const liveSpec = params.spec && typeof params.spec === 'object' ? params.spec : null
      const revision = tab?.navigation?.revision
      // After a reload the layout keeps only the tab id, so the diagram comes back from the tab cache.
      // Read once per tab/revision so the restored spec keeps one identity across renders.
      const cached = useMemo(() => (liveSpec ? null : loadTabDiagram(tabId)), [liveSpec, tabId, revision])
      const restored = !liveSpec && !!cached
      const spec = liveSpec || (cached && cached.spec && typeof cached.spec === 'object' ? cached.spec : null)
      const kind = liveSpec ? params.kind : cached?.kind
      const theme = liveSpec ? params.theme : cached?.theme
      // Full page chrome in the sidebar — no cardUi.
      const mountError = useDiagram(hostRef, handleRef, embed, spec, kind, theme, undefined, revision)
      const embedError = loadError || mountError
      const path = liveSpec
        ? typeof params.path === 'string' ? params.path : null
        : typeof cached?.path === 'string' ? cached.path : null
      const openFile = path ? fullView.files.get(path) : null

      // Keep the tab cache current while the tab still has live params (they are gone after a reload).
      useEffect(() => {
        if (!tabId || !liveSpec) return
        saveTabDiagram(tabId, { spec: liveSpec, kind: params.kind, theme: params.theme, path: params.path, title: params.title })
      }, [revision, tabId])

      // The tab closed: forget its cached diagram. A page unload keeps it, so a reload can restore it.
      useEffect(() => {
        const signal = tab?.signal
        if (!signal || typeof signal.addEventListener !== 'function') return undefined
        const onAbort = () => {
          if (!pageUnloading) dropTabDiagram(tabId)
        }
        signal.addEventListener('abort', onAbort)
        return () => {
          if (typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
        }
      }, [tabId])

      // Opened from a chat card: present the panel fullscreen (once per opening; leaving it is the reader's choice).
      const askedRevision = useRef(null)
      useEffect(() => {
        if (restored || !params.wantFullscreen || sidebar?.fullscreen || askedRevision.current === revision) return
        askedRevision.current = revision
        if (typeof fullView.fullscreen === 'function') fullView.fullscreen()
      }, [revision, params.wantFullscreen, sidebar?.fullscreen])

      const label = titleOf(spec, 'Antu')
      return h(
        'div',
        { className: 'antuDsh_side' },
        embedError
          ? h('div', { className: 'antuDsh_fallback' }, embedError)
          : !spec
            ? h('div', { className: 'antuDsh_fallback' }, 'No diagram in this tab.')
            : h('div', {
                ref: hostRef,
                className: 'antuDsh_sideCanvas',
                role: 'img',
                'aria-label': label,
              }),
        !restored && spec && path && typeof openFile === 'function'
          ? h(
              'button',
              { type: 'button', className: 'antuDsh_btn antuDsh_sideFile', title: path, onClick: () => openFile(path) },
              'Open HTML',
            )
          : null,
      )
    }

    function AntuRenderCard(props) {
      const { phase, block, openFile, toolName } = props
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
        if (typeof fullView.open !== 'function' || !spec) return
        if (path && typeof openFile === 'function') fullView.files.set(path, openFile)
        fullView.open({ spec, kind: args?.kind, theme: args?.theme, path: path || undefined, title })
      }
      const canOpenFull = typeof fullView.open === 'function' && !!spec && !embedError

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
    function AntuTailDiagram({ call, openFile }) {
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
        if (typeof fullView.open !== 'function' || !spec) return
        // The tail's openFile is the chat's, so the full view's "Open HTML" reaches the written file.
        if (call.path && typeof openFile === 'function') fullView.files.set(call.path, openFile)
        fullView.open({ spec, kind: args?.kind, theme: args?.theme, path: call.path || undefined, title })
      }

      return diagramCard({
        hostRef,
        title,
        embedError,
        canOpenFull: typeof fullView.open === 'function' && !!spec && !embedError,
        onOpenFull: openFull,
      })
    }

    /**
     * The finished turn's diagrams, drawn in `conversation.chat.turnTail` after DSH folds the turn's
     * tool steps. Running calls show nothing; a failure is one quiet line; a success is the card.
     */
    function AntuTurnTail({ turn, openFile }) {
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
        rows.push(h(AntuTailDiagram, { key: call.callId, call, openFile }))
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
        ctx.slots.inject('tool.call.toolview', () => {
          for (const key of WIRE_NAMES) {
            ctx.slots.register({ name: 'tool.call.toolview', key }, AntuRenderCard)
          }
        })
        // Optional: profiles without the right Sidebar still get the chat card.
        ctx.inject(['sidebarRight', 'sidebarRightTabs'], (sideCtx) => {
          sideCtx.effect(
            () =>
              sideCtx.sidebarRightTabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
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
          sideCtx.effect(() => {
            fullView.open = (params) => {
              sideCtx.sidebarRight.openTab(TAB_KIND, { params: { ...params, wantFullscreen: true } })
            }
            fullView.fullscreen = () => tryFullscreen(sideCtx.sidebarRight)
            return () => {
              fullView.open = null
              fullView.fullscreen = null
            }
          }, 'antu-dsh: full view opener')
        })
        // Optional: only DSH with the conversation service has the turn tail. Without it the tool
        // row keeps the full card (older DSH has no folded turn to get lost in).
        ctx.inject(['uiConversation'], (convCtx) => {
          hasTurnTail = true
          convCtx.effect(
            () => convCtx.uiConversation.events.register(antuDiagramsDefinition),
            'antu-dsh: diagram turn data',
          )
          convCtx.slots.inject('conversation.chat.turnTail', () =>
            convCtx.slots.register({ name: 'conversation.chat.turnTail', id: TAB_ID }, AntuTurnTail),
          )
        })
      },
    }
  },
})

