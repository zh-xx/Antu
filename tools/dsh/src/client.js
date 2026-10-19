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
    const useSyncExternalStore = React.useSyncExternalStore

    // DSH's shared atoms are an optional sync require: a host that cannot resolve them keeps
    // the hand-written row below. Do not import any other DSH client package.
    let primitives = null
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives') || null
    } catch {
      /* no primitives: fall back to the row we own */
    }
    // DisclosureRow and the icons are memo / forwardRef exotic components: objects, not functions.
    const isComponent = (c) => typeof c === 'function' || (typeof c === 'object' && c !== null && '$$typeof' in c)
    const DisclosureRow = primitives && isComponent(primitives.DisclosureRow) ? primitives.DisclosureRow : null
    const DiagramIcon = primitives && isComponent(primitives.IconShareOutlineRegular) ? primitives.IconShareOutlineRegular : null
    const noop = () => {}

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
    /** The code require-async.mjs gives the upgrade error; the component localizes the message at render. */
    const REQUIRE_ASYNC_CODE = 'ANTU_DSH_REQUIRE_ASYNC'

    /** DSH's resolved light / dark mode, shared by every card. apply fills it from the optional theme service. */
    const hostTheme = { dark: false, listeners: new Set() }

    function setHostDark(dark) {
      if (hostTheme.dark === dark) return
      hostTheme.dark = dark
      for (const listener of [...hostTheme.listeners]) listener()
    }

    function subscribeHostDark(listener) {
      hostTheme.listeners.add(listener)
      return () => hostTheme.listeners.delete(listener)
    }

    /** Re-render when DSH switches mode; without React's external store, subscribe by hand. */
    function useHostDark() {
      if (typeof useSyncExternalStore === 'function') {
        return useSyncExternalStore(subscribeHostDark, () => hostTheme.dark)
      }
      const [dark, setDark] = useState(hostTheme.dark)
      useEffect(() => {
        setDark(hostTheme.dark)
        return subscribeHostDark(() => setDark(hostTheme.dark))
      }, [])
      return dark
    }

    /** Plain English lookup for a host without the optional locale service (same `{name}` placeholders). */
    function lookupEnglish(key, params) {
      const template = typeof en[key] === 'string' ? en[key] : key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }

    /** The active translator: DSH's stable bound function when locale is present, else our English lookup. */
    let activeT = lookupEnglish

    /** A slot-injected `t` (it re-renders on a language switch) or the current one from `apply`. */
    function translator(injected) {
      return typeof injected === 'function' ? injected : activeT
    }

    /** card-model's fallback reason is a sentinel, not copy: translate it, keep real reasons. */
    function failureText(reason, t) {
      return reason === 'Render failed' ? t('tool.failed') : reason
    }

    function destroyHandle(handle) {
      if (!handle) return
      try {
        handle.destroy()
      } catch {
        /* already destroyed */
      }
    }

    // Inlined by build.mjs (do not edit the marker bodies by hand): card-model.mjs, locale.mjs,
    // then require-async.mjs.
    /*@@INJECT_CARD_MODEL@@*/

    /*@@INJECT_LOCALE@@*/

    /*@@INJECT_REQUIRE_ASYNC@@*/

    /** Lazy promise for the ModuleLoader embed chunk (mount + cardUi + kindsOf + kindIcon/kindLabel). */
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
            if (!cancelled) {
              // Keep the code, not the message: the upgrade text follows a language switch at render.
              setState({ embed: null, loadError: err?.code === REQUIRE_ASYNC_CODE ? REQUIRE_ASYNC_CODE : err?.message || String(err) })
            }
          })
        return () => {
          cancelled = true
        }
      }, [])
      return state
    }

    /** A load error as the reader sees it: the upgrade notice is localized now, other errors stay technical. */
    function embedErrorMessage(loadError, mountError, t) {
      if (loadError) return loadError === REQUIRE_ASYNC_CODE ? t('error.upgrade') : loadError
      return mountError
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
            yield { ok: false, error: antuResourceError('antu/invalid-address', activeT('error.invalidAddress')) }
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
              throw antuResourceError('antu/unavailable', activeT('error.historyEnded'))
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
            yield { ok: false, error: antuResourceError('antu/not-found', activeT('error.notFound')) }
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

    /** The language the embedded page should speak: DSH's active one, read through our dictionary (`embed.lang`). */
    function embedLang(t) {
      const lang = t('embed.lang')
      return lang === 'zh' || lang === 'en' ? lang : undefined
    }

    /**
     * Mount `spec` into `el` as asked (kind and theme are checked); `ui` is the chat card's quiet chrome.
     * `kindPickRef` carries the reader's kind through a remount (the host's dark mode, new arguments).
     */
    function mountDiagram(embed, el, spec, wantKind, wantTheme, ui, lang, onEvent, kindPickRef) {
      const opening = pickOpening(knownKinds(embed, spec), kindPickRef?.current || wantKind, wantTheme)
      const options = mountOptions({ ...opening, lang }, ui)
      // The full view needs the embed's events (the reader's theme pick); mountOptions stays pure.
      if (typeof onEvent === 'function') options.onEvent = onEvent
      return { handle: embed.mount(el, spec, options), opening }
    }

    /**
     * Mount the diagram into `hostRef` and keep it fitted. React Flow fits when it mounts; a card
     * mounted inside DSH's collapsed fold is 0×0 and would stay blank, so refit on every resize
     * (opening the fold changes the host's size). Returns the mount error, if any.
     */
    function useDiagram(hostRef, handleRef, embed, spec, kind, theme, ui, revision, lang, onEvent, kindPickRef) {
      const [mountError, setMountError] = useState(null)
      // Mount with the language of the moment; a later switch goes through setLang, not a remount.
      const langRef = useRef(lang)
      langRef.current = lang
      // The embed keeps the handler it was mounted with; a ref keeps the latest one without a remount.
      const onEventRef = useRef(onEvent)
      onEventRef.current = onEvent
      const dispatchEvent = useRef((event) => onEventRef.current?.(event)).current

      useLayoutEffect(() => {
        const el = hostRef.current
        if (!el || !embed || !spec || typeof spec !== 'object') return undefined

        destroyHandle(handleRef.current)
        handleRef.current = null
        el.replaceChildren()
        setMountError(null)

        try {
          const mounted = mountDiagram(
            embed,
            el,
            spec,
            kind,
            theme,
            ui,
            langRef.current,
            typeof onEvent === 'function' ? dispatchEvent : undefined,
            kindPickRef,
          )
          handleRef.current = mounted.handle
        } catch (err) {
          setMountError(err?.message || String(err))
          return undefined
        }

        // React Flow fitted at mount; refit on every later resize (opening DSH's fold grows the host).
        // One frame later: React Flow tracks its own size with its own observer, and fitting before it has
        // seen the new width fits the old one (a card narrowed by an open side panel kept its old placement).
        let observer
        let frame = 0
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              try {
                handleRef.current?.fitView()
              } catch {
                /* the handle is gone (destroyed): nothing left to fit */
              }
            })
          })
          observer.observe(el)
        }

        return () => {
          if (observer) cancelAnimationFrame(frame)
          observer?.disconnect()
          destroyHandle(handleRef.current)
          handleRef.current = null
        }
      }, [embed, spec, kind, theme, ui, revision])

      useEffect(() => {
        if (lang) handleRef.current?.setLang?.(lang)
      }, [lang, embed, spec, kind, theme, ui, revision])

      return mountError
    }

    /** The fitted whole diagram with the cover that opens the full view (the tool row and the tail share it). */
    function diagramCard({ hostRef, title, embedError, canOpenFull, onOpenFull, strip, t }) {
      // Keep the mount host in the tree even when the last mount failed.
      // If we swap it for the error fallback, hostRef is null on the next
      // argsRaw change and the layout effect returns early forever.
      const canvas = h('div', {
        ref: hostRef,
        className: 'antuDsh_canvas',
        role: 'img',
        'aria-label': title,
        hidden: !!embedError,
      })
      const fallback = embedError ? h('div', { className: 'antuDsh_fallback' }, embedError) : null
      // A cover over the picture: a click opens the full view, and the wheel goes on to the conversation.
      const cover = canOpenFull
        ? h(
            'button',
            {
              type: 'button',
              className: 'antuDsh_cover',
              title: t('card.openFull'),
              'aria-label': t('card.openFullNamed', { title }),
              onClick: onOpenFull,
            },
            h('span', { className: 'antuDsh_coverIcon', 'aria-hidden': true }, '⤢'),
          )
        : null
      if (!strip) {
        return h('div', { className: 'antuDsh_card', 'data-antu-dsh': 'render' }, canvas, fallback, cover)
      }
      // The strip is a bar on top of the picture inside one frame; it is a sibling of the picture, so the cover
      // stays over the canvas only: a click there changes the kind, it does not leave the card.
      return h(
        'div',
        { className: 'antuDsh_card antuDsh_cardWithStrip', 'data-antu-dsh': 'render' },
        h(
          'div',
          { className: 'antuDsh_strip', role: 'group', 'aria-label': strip.label },
          h('span', { className: 'antuDsh_stripLabel' }, strip.label),
          strip.choices.map((choice) => {
            const active = choice.kind === strip.active
            return h(
              'button',
              {
                key: choice.kind,
                type: 'button',
                className: 'antuDsh_kind' + (active ? ' antuDsh_kindActive' : ''),
                'aria-pressed': active,
                title: choice.label,
                'aria-label': choice.label,
                onClick: () => strip.onPick(choice.kind),
              },
              // The sketch is Antu's own static SVG string, drawn in the strip's DSH token colours.
              choice.icon
                ? h('span', {
                    className: 'antuDsh_kindIcon',
                    'aria-hidden': true,
                    dangerouslySetInnerHTML: { __html: choice.icon },
                  })
                : h('span', { className: 'antuDsh_kindFallback', 'aria-hidden': true }, choice.label),
            )
          }),
        ),
        h('div', { className: 'antuDsh_picture' }, canvas, fallback, cover),
      )
    }

    /** Full-size diagram in the right Sidebar, read from the tab's resource address (no cardUi, no private cache). */
    function AntuSidebarBody({ useTabInfo, useResource, t: injectedT }) {
      const t = translator(injectedT)
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
      const dark = useHostDark()
      // The full view has the theme switch: remember the reader's choice made while DSH is light. A ref, not state:
      // the pick must not remount the diagram the reader has just changed (the zoom and the pinned card would go);
      // it only decides which theme to come back to when DSH goes from dark to light again.
      const lightPickRef = useRef(undefined)
      const onEvent = (event) => {
        const picked = readerPick(event, dark)
        if (picked !== undefined) lightPickRef.current = picked
      }
      const requestedTheme = value?.theme
      const theme = useMemo(
        () => effectiveTheme({ dark, requested: requestedTheme, lightPick: lightPickRef.current }),
        [dark, requestedTheme],
      )
      // The card's pick rides in the opening's params: use it when it is a kind of this type, else the
      // call's own kind. Params are transient, so a reload falls back to `value.kind`, as before.
      const known = knownKinds(embed, spec)
      const openingKind =
        typeof params.kind === 'string' && known.includes(params.kind) ? params.kind : value?.kind
      // Full page chrome in the sidebar — no cardUi.
      const mountError = useDiagram(hostRef, handleRef, embed, spec, openingKind, theme, undefined, revision, embedLang(t), onEvent)
      const embedError = embedErrorMessage(loadError, mountError, t)
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
      // #229: `none` is the one state with no visible cause — an empty address, or no provider for the
      // scheme. Name it in the console so the next report carries the reason, not just the symptom.
      useEffect(() => {
        if (resource.status !== 'none') return
        console.warn(
          '[antu-dsh] cannot show this tab:',
          typeof address === 'string' && address ? address : '(tab has no resource address)',
        )
      }, [resource.status, address])
      // A tab saved by an older build has no address, so its resource is `none`: keep the old notice.
      const notice =
        embedError ||
        (resource.status === 'loading'
          ? t('sidebar.loading')
          : resource.status === 'none'
            ? t('sidebar.none')
            : resource.status === 'failed'
              ? t('sidebar.failed')
              : failureText(failure, t) || (!spec ? t('sidebar.none') : null))
      const label = titleOf(spec, t('tab.title'))
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
              t('sidebar.openHtml'),
            )
          : null,
      )
    }

    /** The tab title, recovered from the same resource address (PlanTitle is the worked example). */
    function AntuTitle({ useTabInfo, useResource, t: injectedT }) {
      const t = translator(injectedT)
      const { tab } = useTabInfo()
      const resource = useResource(tab?.navigation?.address)
      const value = resource?.value && typeof resource.value === 'object' ? resource.value : null
      return value?.title || tab?.title || t('tab.title')
    }

    function AntuRenderCard(props) {
      const { phase, block, openFile, toolName, sessionId, callId } = props
      const t = translator(props.t)
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const { embed, loadError } = useEmbed()
      const dark = useHostDark()

      const argsRaw = argsRawOf(block)
      const args = useMemo(() => parseArgsRaw(argsRaw), [argsRaw])
      const spec = args && typeof args === 'object' ? args.spec : null
      const path = resultPath(block)
      const status = statusOf(phase, block)
      // antu_render returned ok: false (bad spec, outPath outside the workspace, a write error): say why, draw nothing
      const failure = renderFailure(block)
      const title = titleOf(spec, toolName === 'mcp__antu__antu_render' ? t('title.mcp') : t('tab.title'))
      // The whole diagram, fitted; no chrome (cardUi). Reading happens in the full view.
      const ui = useMemo(() => (embed ? { ...embed.cardUi } : undefined), [embed])
      const mountError = useDiagram(
        hostRef,
        handleRef,
        embed,
        spec,
        args?.kind,
        effectiveTheme({ dark, requested: args?.theme }),
        ui,
        argsRaw,
        embedLang(t),
      )
      const embedError = embedErrorMessage(loadError, mountError, t)

      const openFull = () => {
        if (typeof fullView.open !== 'function' || !spec || !sessionId || callId == null) return
        // The card's openFile is only alive while the card is: keep it for the full view's file button.
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
            ? t('tool.preparing')
            : error
              ? failureText(failure, t) || t('tool.failed')
              : status === 'running'
                ? t('tool.running')
                : status === 'stopped'
                  ? t('tool.stopped')
                  : !spec
                    ? t('tool.badArgs')
                    : t('tool.done')
        const openButton =
          canOpenFull && status === 'ok'
            ? h('button', { type: 'button', className: 'antuDsh_btn', onClick: openFull }, t('card.openFull'))
            : null
        // DSH's own 24px disclosure row when the shared atoms resolve; otherwise the hand-written row.
        if (DisclosureRow && DiagramIcon) {
          return h(
            'div',
            { className: 'antuDsh_toolrow', 'data-antu-dsh': 'render' },
            h(DisclosureRow, {
              icon: h(DiagramIcon, { size: 14 }),
              title,
              open: false,
              expandable: false,
              onToggle: noop,
              running: status === 'running' || status === 'preparing',
              collapsedContent: h(
                'span',
                { className: 'antuDsh_toolRowSummary' },
                h('span', { className: 'antuDsh_toolStatus' + (error ? ' antuDsh_noticeError' : '') }, label),
                openButton,
              ),
            }),
          )
        }
        return h(
          'div',
          { className: 'antuDsh_toolrow', 'data-antu-dsh': 'render' },
          h('span', { className: 'antuDsh_toolTitle' }, title),
          h('span', { className: 'antuDsh_toolStatus' + (error ? ' antuDsh_noticeError' : '') }, label),
          openButton,
        )
      }

      // Before the diagram can be drawn, or when it cannot: one quiet line, no picture.
      const notice =
        status === 'preparing' || (!spec && !argsRaw)
          ? t('notice.preparing')
          : status === 'error'
            ? t('tool.failed')
            : failure
              ? failureText(failure, t)
              : status === 'stopped'
                ? t('tool.stopped')
                : !spec
                  ? t('notice.badArgs')
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

      return diagramCard({ hostRef, title, embedError, canOpenFull, onOpenFull: openFull, t })
    }

    /** One finished call's card in the turn tail; `call` is a record of the turn's diagram data. */
    function AntuTailDiagram({ call, openFile, sessionId, t: injectedT }) {
      const t = translator(injectedT)
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const { embed, loadError } = useEmbed()
      const dark = useHostDark()
      const args = call.args && typeof call.args === 'object' ? call.args : null
      const spec = args ? args.spec : null
      const title = titleOf(spec, call.name === 'mcp__antu__antu_render' ? t('title.mcp') : t('tab.title'))
      const ui = useMemo(() => (embed ? { ...embed.cardUi } : undefined), [embed])
      const lang = embedLang(t)
      // Recomputed on a language switch: the kind names are Antu's own words, not our dictionary's.
      const choices = useMemo(() => kindChoices(embed, spec, lang), [embed, spec, lang])
      // What the card was opened as: the call's valid kind, else the type's first. Never the mount kind
      // itself (a click must not remount the diagram), so `args?.kind` stays the dependency below.
      const opening = pickOpening(knownKinds(embed, spec), args?.kind, args?.theme)
      const [picked, setPicked] = useState(undefined)
      // The same pick in a ref: a remount for any other reason (a theme switch, new arguments) mounts in it.
      const kindPickRef = useRef(undefined)
      const active = choices.some((choice) => choice.kind === picked) ? picked : opening.activeKind
      const onEvent = (event) => {
        // The keyboard can change the kind too; follow it, and keep it across a remount.
        if (!event || event.type !== 'kindchange' || typeof event.kind !== 'string') return
        kindPickRef.current = event.kind
        setPicked(event.kind)
      }
      const pickKind = (kind) => {
        const handle = handleRef.current
        if (!handle || typeof handle.setKind !== 'function') return
        // A kind the embed does not take leaves the highlight where it was.
        if (handle.setKind(kind) === false) return
        kindPickRef.current = kind
        setPicked(kind)
      }
      const mountError = useDiagram(
        hostRef,
        handleRef,
        embed,
        spec,
        args?.kind,
        effectiveTheme({ dark, requested: args?.theme }),
        ui,
        call.argsRaw,
        lang,
        onEvent,
        kindPickRef,
      )
      const embedError = embedErrorMessage(loadError, mountError, t)

      const openFull = () => {
        if (typeof fullView.open !== 'function' || !spec || !sessionId || call.callId == null) return
        // The tail's openFile is the chat's, so the full view's file button reaches the written file.
        if (call.path && typeof openFile === 'function') fullView.files.set(call.path, openFile)
        fullView.open({
          sessionId,
          callId: String(call.callId),
          ...(typeof picked === 'string' ? { kind: picked } : {}),
        })
      }

      return diagramCard({
        hostRef,
        title,
        embedError,
        canOpenFull:
          typeof fullView.open === 'function' && !!spec && !embedError && !!sessionId && call.callId != null,
        onOpenFull: openFull,
        // One choice is no choice: a diagram with a single way of drawing gets no strip at all.
        strip:
          choices.length > 1
            ? { choices, active, onPick: pickKind, label: t('card.kindStrip') }
            : undefined,
        t,
      })
    }

    /**
     * The finished turn's diagrams, drawn in `conversation.chat.turnTail` after DSH folds the turn's
     * tool steps. Running calls show nothing; a failure is one quiet line; a success is the card.
     */
    function AntuTurnTail({ turn, openFile, sessionId, t: injectedT }) {
      const t = translator(injectedT)
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
              failureText(call.failure, t) || t('tool.failed'),
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
              t('notice.badArgs'),
            ),
          )
          continue
        }
        rows.push(h(AntuTailDiagram, { key: call.callId, call, openFile, sessionId, t }))
      }

      return rows.length === 0 ? null : h('div', { className: 'antuDsh_tail', 'data-antu-dsh': 'turn-tail' }, rows)
    }

    const css = `
.antuDsh_card{position:relative;min-width:0}
.antuDsh_canvas{min-height:220px;height:min(42vh,360px);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-base);overflow:hidden}
.antuDsh_canvas>*{width:100%;height:100%}
.antuDsh_cardWithStrip{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-base);overflow:hidden}
.antuDsh_cardWithStrip .antuDsh_canvas{border:0;border-radius:0}
.antuDsh_picture{position:relative;min-width:0}
.antuDsh_strip{display:flex;align-items:center;gap:6px;box-sizing:border-box;padding:6px 8px;overflow-x:auto;overflow-y:hidden;border-bottom:.5px solid var(--dsw-alias-border-l2);background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-base));--antu-text-3:var(--dsw-alias-label-tertiary);--antu-line:var(--dsw-alias-border-l2);--antu-bg:var(--dsw-alias-bg-base)}
.antuDsh_stripLabel{flex:none;margin-right:4px;font-size:var(--dsh-content-font-size-secondary,13px);line-height:1;color:var(--dsw-alias-label-tertiary)}
.antuDsh_kind{appearance:none;flex:none;width:44px;box-sizing:border-box;margin:0;padding:1px;border:.5px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);line-height:0;cursor:pointer}
.antuDsh_kind:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.antuDsh_kind:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}
.antuDsh_kind[aria-pressed="true"]{border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-base);--antu-text-3:var(--dsw-alias-label-primary)}
.antuDsh_kindIcon{display:block}
.antuDsh_kind svg{display:block;width:100%;height:auto}
.antuDsh_kindFallback{display:block;font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.2;overflow-wrap:anywhere}
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
.antuDsh_toolRowSummary{display:inline-flex;align-items:center;gap:8px;min-width:0;margin-left:8px}
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
      // `locale` is a core DSH service every official UI plugin injects; apply still copes without it.
      inject: ['slots', 'locale'],
      apply(ctx) {
        // #229: a second application in the same page (HMR, a double loader entry) makes the resource
        // provider registration throw ("already has a provider"); whichever instance is disposed first
        // then leaves NO provider, and the full view opens onto `sidebar.none`. Apply once per page.
        if (globalThis.__antuDshApplied) {
          console.warn('[antu-dsh] already applied in this page; skipping the second application')
          return
        }
        globalThis.__antuDshApplied = true
        ctx.effect(
          () => () => {
            globalThis.__antuDshApplied = false
          },
          'antu-dsh: apply guard',
        )
        ensureStyles()
        // Optional like the other services: without locale the English dictionary above is the fallback,
        // and registration only carries `locale` when the service is really there (a missing face throws).
        let slotLocale = {}
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function' && typeof ctx.locale.bind === 'function') {
            ctx.effect(() => ctx.locale.register(ANTU_NS, { zh, en }), 'antu-dsh: dictionaries')
            // `bind` returns one stable function that reads the active locale, so components follow a switch.
            activeT = ctx.locale.bind(ANTU_NS)
            slotLocale = { locale: ANTU_NS }
          }
        } catch {
          /* no locale service: English through lookupEnglish */
          activeT = lookupEnglish
          slotLocale = {}
        }
        // Optional: the theme service tells us DSH's resolved light / dark mode (`system` is already
        // resolved). Without it the store stays light and the diagram opens as the call asked (rule 10).
        ctx.inject(['theme'], (themeCtx) => {
          const readDark = () => {
            try {
              return themeCtx.theme.getTheme()?.active?.colorScheme === 'dark'
            } catch {
              return false
            }
          }
          themeCtx.effect(() => {
            setHostDark(readDark())
            const off = themeCtx.on('theme/change', () => setHostDark(readDark()))
            return () => {
              off?.()
              setHostDark(false)
            }
          }, 'antu-dsh: host theme')
        })
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
            ctx.slots.register(
              { name: 'tool.call.toolview', key, ...slotLocale, inject: (sessionId) => ({ sessionId }) },
              AntuRenderCard,
            )
          }
        })
        // #229: the provider is the one piece the full view cannot do without, so it is registered on
        // its own — a missing sidebar service, or a throw in a neighbouring registration, must not leave
        // a tab type that opens onto nothing (`sidebar.none` means exactly "no provider for this scheme").
        ctx.inject(['resources', 'remote', 'remote.session'], (resCtx) => {
          resCtx.effect(() => {
            try {
              return resCtx.resources.register(antuResourceProvider(resCtx.remote.session))
            } catch (error) {
              // A duplicate registration is survivable (the other instance serves the address); any
              // other cause is not, and silence would only resurface as an empty tab.
              console.error('[antu-dsh] antu resource provider not registered:', error)
              return () => {}
            }
          }, 'antu-dsh: diagram resource provider')
        })
        // Optional: without the right Sidebar the chat card stays and there is no "open full view".
        ctx.inject(
          ['sessions', 'sidebarRight', 'sidebarRightTabs'],
          (sideCtx) => {
            sideCtx.effect(
              () =>
                sideCtx.sidebarRightTabs.register({
                  id: TAB_ID,
                  kind: TAB_KIND,
                  patterns: ['dsh-resource://antu/**'],
                  canOpen: (address) => parseAntuAddress(address) !== undefined,
                  priority: 'extension',
                  title: () => activeT('tab.title'),
                }),
              'antu-dsh: sidebar tab type',
            )
            sideCtx.effect(
              () =>
                sideCtx.slots.inject('sidebar.right.pane.tab', () =>
                  sideCtx.slots.register(
                    { name: 'sidebar.right.pane.tab', key: TAB_ID, ...slotLocale },
                    AntuSidebarBody,
                  ),
                ),
              'antu-dsh: sidebar tab body',
            )
            sideCtx.effect(
              () =>
                sideCtx.slots.inject('sidebar.right.pane.tab.title', () =>
                  sideCtx.slots.register(
                    { name: 'sidebar.right.pane.tab.title', key: TAB_ID, ...slotLocale },
                    AntuTitle,
                  ),
                ),
              'antu-dsh: sidebar tab title',
            )
            sideCtx.effect(() => {
              fullView.open = ({ sessionId, callId, kind }) => {
                const child = sideCtx.sessions.subagentAddress(sessionId)
                const session = child === undefined ? { kind: 'session', sessionId } : { kind: 'subagent', ...child }
                // `kind` is the card's pick, transient like `wantFullscreen`: a reload drops both.
                sideCtx.sidebarRight.openResource(antuAddress({ session, callId }), {
                  params: { wantFullscreen: true, ...(typeof kind === 'string' ? { kind } : {}) },
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
              { name: 'conversation.chat.turnTail', id: TAB_ID, ...slotLocale, inject: (sessionId) => ({ sessionId }) },
              AntuTurnTail,
            ),
          )
        })
      },
    }
  },
})

