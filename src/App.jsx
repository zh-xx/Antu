// ============================================================
//  src/App.jsx — the application shell
//
//  Responsibilities kept minimal:
//   1. validate the spec inlined into the page
//   2. get the renderer from the registry by type × kind and render it
//   3. remember the user's own reading preferences
//  The core knows nothing of the business meaning of "fact diagram /
//  relationship diagram"; it knows type only.
//
//  **Where the data comes from: inlined into the page.** The product is one
//  self-contained HTML, one file per JSON; in development a plugin in
//  vite.config.js injects that same JSON into index.html. Both travel the exact
//  same path, which is why there is no fetch, no example list and no fallback
//  branch here. The demo data lives in the dev configuration and not one byte of
//  it travels into the product.
//
//  Layout: no permanent sidebar; the canvas fills the whole window and everything
//  else is a popover on the canvas.
//    top left           the label card (diagram title, type, rendering kind switch)
//    bottom centre      the control capsule (placed by the renderer itself)
//    bottom left/right  zoom, minimap (from React Flow)
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { validateSpec } from './core/validate.js'
import { getRenderer, knowledgeOf, listKinds, listTypes } from './core/registry.js'
import { GRAPH_TYPE_KEYS } from './core/labels.js'
import { useLang } from './shell/LangContext.jsx'
import DiagramHeader from './shell/DiagramHeader.jsx'
import { readPrefs, writePrefs } from './shell/prefs.js'
import ErrorBoundary from './shell/ErrorBoundary.jsx'

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

export default function App() {
  const { t, lang, labelOf, formatNumber } = useLang()
  const [spec, setSpec] = useState(null)
  const [errors, setErrors] = useState([])

  // The data is inlined into the page. If it cannot be found, something went
  // wrong at the generation/injection step: say so plainly, do not fob the user
  // off with "let me look elsewhere" (there is no "elsewhere" in the product).
  useEffect(() => {
    const inline = typeof window !== 'undefined' ? window.__ANTU_SPEC__ : undefined
    if (!inline) {
      setErrors([
        import.meta.env.DEV ? t('fallback.devNoData') : t('fallback.noInlineData'),
      ])
      return
    }
    // The tab (and the file name a browser offers when the page is printed to PDF) names the diagram. It is set
    // here, from the data, and not written into the file when the page is made: a page made by filling the
    // viewer template with data (the skill's way, with nothing but a text replacement) then gets it too.
    if (typeof inline.title === 'string' && inline.title) document.title = `${inline.title} · antu`
    const errs = validateSpec(inline)
    setErrors(errs)
    setSpec(errs.length ? null : inline)
  }, [])

  // The per-diagram preference is keyed by **title**: the title is written in the
  // data, so both dev and the product have it, and it does not depend on a file
  // name (the product has no file name at all).
  const specKey = spec?.title || ''

  // The kind is a choice of the rendering layer, not part of the data: look up
  // from the registry which kinds the type has.
  // A manually chosen one is remembered per diagram; with none chosen, use the
  // first (the default kind).
  const kinds = useMemo(() => (spec ? listKinds(spec.type) : []), [spec])
  const [kindPrefs, setKindPrefs] = useState(() => readPrefs().kinds || {})
  const kind = kinds.find((k) => k.kind === kindPrefs[specKey])?.kind ?? kinds[0]?.kind ?? null
  const selectKind = (next) => {
    const map = { ...kindPrefs, [specKey]: next }
    setKindPrefs(map)
    writePrefs({ kinds: map })
  }
  const Renderer = spec ? getRenderer(spec.type, kind) : null
  const ready = errors.length === 0 && Renderer

  return (
    <div className="antu-app">
      {/* The label card is always shown, with no switch. It used to control both
          "whether it shows on screen" and "whether the export carries it"; now the
          export never carries the heading (spec/fact/rendering.md §10.2 changed),
          so the switch has no meaning. */}
      <DiagramHeader
        title={spec?.title || t('common.untitled')}
        typeLabel={spec ? labelOf(GRAPH_TYPE_KEYS, spec.type) : ''}
        info={diagramInfo(spec, t, formatNumber)}
        kinds={kinds}
        kind={kind}
        onSelectKind={selectKind}
      />

      {ready ? (
        <ErrorBoundary lang={lang}>
          <Renderer spec={spec} />
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
