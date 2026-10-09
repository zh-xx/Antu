// ============================================================
//  src/App.jsx — the application shell
//
//  Responsibilities kept minimal:
//   1. validate the spec it is given
//   2. get the renderer from the registry by type × kind and render it
//   3. remember the user's own reading preferences
//  The core knows nothing of the business meaning of "fact diagram /
//  relationship diagram"; it knows type only.
//
//  **Where the data comes from: a prop.** On the viewer page main.jsx passes the
//  JSON inlined into the page: the product is one self-contained HTML, one file per
//  JSON; in development a plugin in vite.config.js injects that same JSON into
//  index.html. Both travel the exact same path, which is why there is no fetch, no
//  example list and no fallback branch here. The demo data lives in the dev
//  configuration and not one byte of it travels into the product.
//  A host's application passes its own (`mount`, issue 152); both are drawn by
//  the same src/embed/core.jsx.
//
//  Layout: no permanent sidebar; the canvas fills the whole window and everything
//  else is a popover on the canvas.
//    top left           the label card (diagram title, type, rendering kind switch)
//    bottom centre      the control capsule (placed by the renderer itself)
//    bottom left/right  zoom, minimap (from React Flow)
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { validateSpec } from './core/validate.js'
import { getRenderer, knowledgeOf, listKinds, listTypes } from './core/registry.js'
import { GRAPH_TYPE_KEYS } from './core/labels.js'
import { useLang } from './shell/LangContext.jsx'
import DiagramHeader from './shell/DiagramHeader.jsx'
import { ShownSpecContext, useEnv, useUi } from './shell/env.js'
import ErrorBoundary from './shell/ErrorBoundary.jsx'
import { useTheme } from './theme/ThemeContext.jsx'

/** The fallback explanation when no renderer is available */
function FallbackInfo({ errors, spec, hasRenderer, t, labelOf, formatNumber }) {
  if (errors.length > 0) {
    return (
      <div className="antu-fallback">
        <div className="antu-error-title">{t('fallback.invalidTitle', { n: formatNumber(errors.length) })}</div>
        <ul className="antu-error-list">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    )
  }

  if (spec && !hasRenderer) {
    return (
      <div className="antu-fallback">
        <div className="antu-error-title">{t('fallback.noRendererTitle', { type: spec.type })}</div>
        <div className="antu-error-hint">
          {t('fallback.registered', {
            list: listTypes().map((ty) => labelOf(GRAPH_TYPE_KEYS, ty)).join(' / ') || t('common.none'),
          })}
        </div>
      </div>
    )
  }

  return null
}

/**
 * The label card's third line: size and time span, counted in the type's own units.
 * The type supplies it through its knowledge (renderers/<type>/schema.js), so App still
 * knows type only; a type without one simply shows no third line.
 */
function diagramInfo(spec, t, formatNumber) {
  if (!spec) return []
  return knowledgeOf(spec.type)?.info?.(spec, t, formatNumber) ?? []
}

/**
 * One diagram.
 * @param spec     the JSON: on the viewer page the one inlined into it (main.jsx), in a mounted diagram the
 *                 host's (src/embed/)
 * @param kind     the kind it opens in until the reader picks another (a host's `mount(…, { kind })`)
 * @param kinds    the kinds the reader may pick from; leave out for all of the type's
 *
 * Kinds from the page's preset (window.__ANTU_PRESET__, written by tools/lib/fill.mjs; usePreset):
 *   kind         a screenshot names the kind outright (preview --kind)
 *   defaultKind  a delivered page opens in this kind until the reader picks another (render --kind)
 */
export default function App({ spec: given, kind: hostKind = null, kinds: allowed = null }) {
  const { t, lang, setLang, labelOf, formatNumber } = useLang()
  const { id: themeId, setTheme } = useTheme()
  const env = useEnv()
  const { prefs, preset, emit, commands } = env
  const [spec, setSpec] = useState(null)
  const [errors, setErrors] = useState([])

  // The viewer page: the data is inlined into the page. If it cannot be found, something
  // went wrong at the generation/injection step: say so plainly, do not fob the user
  // off with "let me look elsewhere" (there is no "elsewhere" in the product).
  // A mounted diagram: the host handed the data over, and hands over a new one with `update`.
  useEffect(() => {
    if (!given && !env.embedded) {
      setErrors([
        import.meta.env.DEV ? t('fallback.devNoData') : t('fallback.noInlineData'),
      ])
      return
    }
    // The tab (and the file name a browser offers when the page is printed to PDF) names the diagram. It is set
    // here, from the data, and not written into the file when the page is made: a page made by filling the
    // viewer template with data (the skill's way, with nothing but a text replacement) then gets it too.
    // A mounted diagram is not the document, and leaves the host's title alone.
    if (!env.embedded && typeof given.title === 'string' && given.title) document.title = `${given.title} · Antu`
    const errs = validateSpec(given)
    setErrors(errs)
    setSpec(errs.length ? null : given)
    if (errs.length) emit({ type: 'invalid', errors: [...errs] })
    // Valid, and still nothing can draw it (knowledge registered without a component): the page says so below,
    // and a host must hear it too, or its `ready` would wait for a drawing that never comes
    else if (listKinds(given.type).length === 0) emit({ type: 'invalid', errors: [`no renderer is registered for type "${given.type}"`] })
  }, [given])

  // The per-diagram preference is keyed by **title**: the title is written in the
  // data, so both dev and the product have it, and it does not depend on a file
  // name (the product has no file name at all).
  // (Read from the data as given, so a kind a host sets right after mounting, before the
  // validation has run, is kept under the same key.)
  const specKey = (typeof given?.title === 'string' && given.title) || ''

  // The kind is a choice of the rendering layer, not part of the data: look up
  // from the registry which kinds the type has.
  // A manually chosen one is remembered per diagram; with none chosen, use the
  // first (the default kind).
  // A host may narrow the choice. `mount` refuses names that are not this type's kinds; a list that names none
  // of them can only come from `update` to a spec of another type, and then it narrows nothing.
  const kinds = useMemo(() => {
    const all = spec ? listKinds(spec.type) : []
    const some = Array.isArray(allowed) ? all.filter((k) => allowed.includes(k.kind)) : all
    return some.length ? some : all
  }, [spec, allowed])
  const [kindPrefs, setKindPrefs] = useState(() => prefs.read().kinds || {})
  // A screenshot preset (antu_preview, the skill's preview --kind) names the kind outright and
  // never touches the reader's own preference
  const kind =
    kinds.find((k) => k.kind === preset?.kind)?.kind ??
    kinds.find((k) => k.kind === kindPrefs[specKey])?.kind ??
    kinds.find((k) => k.kind === hostKind)?.kind ??
    kinds.find((k) => k.kind === preset?.defaultKind)?.kind ??
    kinds[0]?.kind ??
    null
  const selectKind = (next) => {
    const map = { ...kindPrefs, [specKey]: next }
    setKindPrefs(map)
    prefs.write({ kinds: map })
  }
  const Renderer = spec ? getRenderer(spec.type, kind) : null
  const ready = errors.length === 0 && Renderer

  // A mounted diagram: the host hears each change of kind after the first drawing, and may set the kind, the
  // theme and the language itself (src/embed/mount.js checks the value and sends it through the command bus;
  // the kinds are not checked here, because right after mounting the spec is not validated yet)
  const toldKind = useRef(null)
  useEffect(() => {
    if (!kind) return
    if (toldKind.current !== null && toldKind.current !== kind) emit({ type: 'kindchange', kind })
    toldKind.current = kind
  }, [kind, emit])
  const selectKindRef = useRef(selectKind)
  selectKindRef.current = selectKind
  useEffect(() => {
    const offs = [
      commands.on('setKind', (next) => selectKindRef.current(next)),
      commands.on('setTheme', (next) => setTheme(next)),
      commands.on('setLang', (next) => setLang(next)),
    ]
    return () => offs.forEach((off) => off())
  }, [commands, setTheme, setLang])

  const showHeader = useUi('header')

  return (
    <div className="antu-app" data-theme={themeId}>
      {/* The label card has no switch of its own on the page. It used to control both
          "whether it shows on screen" and "whether the export carries it"; now the
          export never carries the heading (spec/fact/rendering.md §10.2 changed),
          so the switch has no meaning. A host that draws its own title may leave it out. */}
      {showHeader && (
        <DiagramHeader
          title={spec?.title || t('common.untitled')}
          typeLabel={spec ? labelOf(GRAPH_TYPE_KEYS, spec.type) : ''}
          info={diagramInfo(spec, t, formatNumber)}
          kinds={kinds}
          kind={kind}
          onSelectKind={selectKind}
        />
      )}

      {ready ? (
        <ErrorBoundary lang={lang}>
          <ShownSpecContext.Provider value={spec}>
            <Renderer spec={spec} />
          </ShownSpecContext.Provider>
        </ErrorBoundary>
      ) : (
        <FallbackInfo
          errors={errors}
          spec={spec}
          hasRenderer={!!Renderer}
          t={t}
          labelOf={labelOf}
          formatNumber={formatNumber}
        />
      )}
    </div>
  )
}
