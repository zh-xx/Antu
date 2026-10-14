// ============================================================
//  tools/dsh/src/client.js — ModuleLoader entry for @zh-xx/antu-dsh
//
//  Tiny Client half: registers tool.call.toolview for antu_render (and the
//  stopgap MCP wire name). Lazy-loads client.embed.js (repackaged @zh-xx/antu/embed).
//  Copied into package/client.js by build.mjs (build output is not committed).
// ============================================================

window.__ModuleLoader__.load({
  id: '@zh-xx/antu-dsh',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    const WIRE_NAMES = ['antu_render', 'mcp__antu__antu_render']
    const THEMES = ['document', 'modern', 'legal']
    const TAB_ID = '@zh-xx/antu-dsh'
    const TAB_KIND = 'antu-diagram'
    /** Filled when sidebar-right is available; Enlarge no-ops until then. */
    const enlargeApi = { open: null }

    function parseArgsRaw(argsRaw) {
      if (typeof argsRaw !== 'string' || !argsRaw.trim()) return null
      try {
        return JSON.parse(argsRaw)
      } catch {
        return null
      }
    }

    function argsRawOf(block) {
      if (!block) return null
      if ('kind' in block) return block.call?.argsRaw ?? null
      if (block.phase === 'start') return block.argsRaw ?? null
      return null
    }

    function resultPath(block) {
      if (!block || !('kind' in block) || block.isError) return null
      const meta = block.meta
      if (meta && typeof meta === 'object' && typeof meta.path === 'string') return meta.path
      const text = Array.isArray(block.content)
        ? block.content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n')
        : ''
      const m = text.match(/^Written:\s*(.+)$/m)
      return m ? m[1].trim() : null
    }

    function statusOf(phase, block) {
      if (phase === 'preparing') return 'preparing'
      if (phase === 'start') return 'running'
      if (block?.isError) return 'error'
      if (block?.error?.code === 'interrupted') return 'stopped'
      return 'ok'
    }

    function destroyHandle(handle) {
      if (!handle) return
      try {
        handle.destroy()
      } catch {
        /* already destroyed */
      }
    }

    /** Lazy promise for the ModuleLoader embed chunk (mount + cardUi + kindsOf). */
    let embedPromise
    function loadEmbed(requireAsync) {
      if (!embedPromise) {
        embedPromise = requireAsync('./client.embed.js').then((mod) => {
          if (!mod || typeof mod.mount !== 'function') {
            throw new Error('@zh-xx/antu-dsh: client.embed.js did not export mount()')
          }
          if (!mod.cardUi || mod.cardUi.panOnScroll !== false) {
            throw new Error('@zh-xx/antu-dsh: client.embed.js is missing cardUi (rebuild with npm run build:dsh)')
          }
          return mod
        })
      }
      return embedPromise
    }

    /** Full-size diagram in the right Sidebar (no cardUi chrome reduction). */
    function AntuSidebarBody({ useTabInfo }) {
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const [embed, setEmbed] = useState(null)
      const [embedError, setEmbedError] = useState(null)
      const { tab } = useTabInfo()
      const params = tab?.navigation?.params && typeof tab.navigation.params === 'object' ? tab.navigation.params : {}
      const spec = params.spec && typeof params.spec === 'object' ? params.spec : null
      const paramKind = typeof params.kind === 'string' ? params.kind : null
      const paramTheme = typeof params.theme === 'string' ? params.theme : null
      const revision = tab?.navigation?.revision

      useEffect(() => {
        let cancelled = false
        loadEmbed(require.async)
          .then((mod) => {
            if (!cancelled) setEmbed(mod)
          })
          .catch((err) => {
            if (!cancelled) setEmbedError(err?.message || String(err))
          })
        return () => {
          cancelled = true
        }
      }, [])

      useLayoutEffect(() => {
        const el = hostRef.current
        if (!el || !embed || !spec) return undefined
        destroyHandle(handleRef.current)
        handleRef.current = null
        el.replaceChildren()
        setEmbedError(null)
        let known
        try {
          known = typeof spec.type === 'string' ? embed.kindsOf(spec.type) || [] : []
        } catch {
          known = []
        }
        const mountKind = paramKind && known.includes(paramKind) ? paramKind : null
        const mountTheme = paramTheme && THEMES.includes(paramTheme) ? paramTheme : null
        try {
          handleRef.current = embed.mount(el, spec, {
            ...(mountKind ? { kind: mountKind } : {}),
            ...(mountTheme ? { theme: mountTheme } : {}),
            // Full page chrome in the sidebar — not cardUi.
          })
        } catch (err) {
          setEmbedError(err?.message || String(err))
          return undefined
        }
        return () => {
          destroyHandle(handleRef.current)
          handleRef.current = null
        }
      }, [embed, spec, paramKind, paramTheme, revision])

      const label = spec && typeof spec.title === 'string' && spec.title.trim() ? spec.title.trim() : 'Antu'
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
      )
    }

    function AntuRenderCard(props) {
      const { phase, block, openFile, toolName } = props
      const hostRef = useRef(null)
      const handleRef = useRef(null)
      const [embed, setEmbed] = useState(null)
      const [embedError, setEmbedError] = useState(null)
      // What the diagram is showing (for chrome); seeded from args, then from successful setters.
      const [activeKind, setActiveKind] = useState(null)
      const [activeTheme, setActiveTheme] = useState(null)

      const argsRaw = argsRawOf(block)
      const args = useMemo(() => parseArgsRaw(argsRaw), [argsRaw])
      const spec = args && typeof args === 'object' ? args.spec : null
      const path = resultPath(block)
      const status = statusOf(phase, block)
      const title =
        spec && typeof spec.title === 'string' && spec.title.trim()
          ? spec.title.trim()
          : toolName === 'mcp__antu__antu_render'
            ? 'Antu (MCP)'
            : 'Antu'

      const kinds = useMemo(() => {
        if (!embed || !spec || typeof spec.type !== 'string') return []
        try {
          return embed.kindsOf(spec.type) || []
        } catch {
          return []
        }
      }, [embed, spec])

      useEffect(() => {
        let cancelled = false
        loadEmbed(require.async)
          .then((mod) => {
            if (!cancelled) setEmbed(mod)
          })
          .catch((err) => {
            if (!cancelled) setEmbedError(err?.message || String(err))
          })
        return () => {
          cancelled = true
        }
      }, [])

      useLayoutEffect(() => {
        const el = hostRef.current
        if (!el || !embed || !spec || typeof spec !== 'object') return undefined

        destroyHandle(handleRef.current)
        handleRef.current = null
        el.replaceChildren()
        setEmbedError(null)

        const known = (() => {
          try {
            return typeof spec.type === 'string' ? embed.kindsOf(spec.type) || [] : []
          } catch {
            return []
          }
        })()
        const wantKind = args && typeof args.kind === 'string' ? args.kind : null
        const mountKind = wantKind && known.includes(wantKind) ? wantKind : null
        const wantTheme = args && typeof args.theme === 'string' ? args.theme : null
        const mountTheme = wantTheme && THEMES.includes(wantTheme) ? wantTheme : null

        try {
          handleRef.current = embed.mount(el, spec, {
            ...(mountKind ? { kind: mountKind } : {}),
            ...(mountTheme ? { theme: mountTheme } : {}),
            ui: { ...embed.cardUi },
          })
          // Opening kind is a validated arg, else the type's first kind (kindsOf order).
          setActiveKind(mountKind || known[0] || null)
          setActiveTheme(mountTheme)
        } catch (err) {
          setEmbedError(err?.message || String(err))
          return undefined
        }

        return () => {
          destroyHandle(handleRef.current)
          handleRef.current = null
        }
        // Remount when the embed API or the call's argsRaw/spec change; kind/theme buttons use setters.
      }, [embed, spec, argsRaw])

      function chooseKind(k) {
        const handle = handleRef.current
        if (!handle || typeof handle.setKind !== 'function') {
          setActiveKind(k)
          return
        }
        if (handle.setKind(k)) setActiveKind(k)
      }

      function chooseTheme(t) {
        const handle = handleRef.current
        if (!handle || typeof handle.setTheme !== 'function') {
          setActiveTheme(t)
          return
        }
        if (handle.setTheme(t)) setActiveTheme(t)
      }

      const summary =
        status === 'preparing'
          ? 'Preparing diagram…'
          : status === 'running'
            ? 'Rendering…'
            : status === 'error'
              ? 'Render failed'
              : status === 'stopped'
                ? 'Stopped'
                : path
                  ? path
                  : title

      return h(
        'div',
        { className: 'antuDsh_card', 'data-antu-dsh': 'render' },
        h(
          'div',
          { className: 'antuDsh_row' },
          h('span', { className: 'antuDsh_title' }, title),
          h('span', { className: 'antuDsh_dot', 'aria-hidden': true }),
          h(
            'span',
            {
              className:
                'antuDsh_summary' +
                (status === 'error' ? ' antuDsh_summaryError' : '') +
                (status === 'stopped' ? ' antuDsh_summaryWarn' : ''),
            },
            summary,
          ),
        ),
        phase === 'preparing'
          ? null
          : !spec
            ? h(
                'div',
                { className: 'antuDsh_fallback' },
                argsRaw
                  ? 'Could not parse tool arguments; open the HTML file when the call finishes.'
                  : 'Waiting for diagram arguments…',
              )
            : h(
                'div',
                { className: 'antuDsh_body' },
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
                h(
                  'div',
                  { className: 'antuDsh_chrome' },
                  kinds.length
                    ? h(
                        'div',
                        { className: 'antuDsh_group', role: 'group', 'aria-label': 'Kind' },
                        kinds.map((k) =>
                          h(
                            'button',
                            {
                              key: k,
                              type: 'button',
                              className: 'antuDsh_btn' + (activeKind === k ? ' antuDsh_btnActive' : ''),
                              onClick: () => chooseKind(k),
                            },
                            k,
                          ),
                        ),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'antuDsh_group', role: 'group', 'aria-label': 'Theme' },
                    THEMES.map((t) =>
                      h(
                        'button',
                        {
                          key: t,
                          type: 'button',
                          className: 'antuDsh_btn' + (activeTheme === t ? ' antuDsh_btnActive' : ''),
                          onClick: () => chooseTheme(t),
                        },
                        t,
                      ),
                    ),
                  ),
                  typeof enlargeApi.open === 'function' && spec
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'antuDsh_btn antuDsh_btnPrimary',
                          onClick: () =>
                            enlargeApi.open({
                              spec,
                              kind: activeKind || undefined,
                              theme: activeTheme || undefined,
                            }),
                        },
                        'Enlarge',
                      )
                    : null,
                  path && typeof openFile === 'function'
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'antuDsh_btn antuDsh_btnPrimary',
                          onClick: () => openFile(path),
                        },
                        'Open HTML',
                      )
                    : null,
                ),
              ),
      )
    }

    const css = `
.antuDsh_card{display:flex;flex-direction:column;gap:6px;min-width:0;color:var(--dsw-alias-label-secondary)}
.antuDsh_row{display:flex;align-items:center;min-width:0;height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary)}
.antuDsh_title{flex:none;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-secondary)}
.antuDsh_dot{flex:none;width:2px;height:2px;margin:0 8px;border-radius:1px;background:var(--dsw-alias-label-caption)}
.antuDsh_summary{flex:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--dsh-content-font-size-secondary,13px)}
.antuDsh_summaryError{color:var(--dsw-alias-state-error-primary)}
.antuDsh_summaryWarn{color:var(--dsw-alias-state-warn-label)}
.antuDsh_body{display:flex;flex-direction:column;gap:8px;min-width:0}
.antuDsh_canvas{min-height:220px;height:min(42vh,360px);border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-base);overflow:hidden}
.antuDsh_canvas>div,.antuDsh_canvas [antu-embed-root],.antuDsh_canvas>*{width:100%;height:100%}
.antuDsh_chrome{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.antuDsh_group{display:inline-flex;flex-wrap:wrap;gap:4px}
.antuDsh_btn{appearance:none;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:2px 8px;font-size:11px;line-height:16px;cursor:pointer}
.antuDsh_btn:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
.antuDsh_btnActive{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}
.antuDsh_btnPrimary{border-color:var(--dsw-alias-border-l2)}
.antuDsh_fallback{padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);font-size:12px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-markdown-code-block)}
.antuDsh_side{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;padding:8px;box-sizing:border-box}
.antuDsh_sideCanvas{flex:auto;min-height:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-base);overflow:hidden}
.antuDsh_sideCanvas>div,.antuDsh_sideCanvas>*{width:100%;height:100%}
@media (prefers-reduced-motion:reduce){.antuDsh_btn{transition:none}}
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
            enlargeApi.open = (params) => {
              sideCtx.sidebarRight.openTab(TAB_KIND, { params })
            }
            return () => {
              enlargeApi.open = null
            }
          }, 'antu-dsh: enlarge opener')
        })
      },
    }
  },
})

