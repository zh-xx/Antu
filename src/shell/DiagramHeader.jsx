// ============================================================
//  src/shell/DiagramHeader.jsx —— the block at the top left of the canvas
//
//  The final product is a **self-contained HTML**: one fact produces one JSON,
//  one JSON produces one HTML. That HTML opens as a single diagram, with no "other
//  diagram" to switch to, so there is no file/case switcher here.
//
//  The only thing on the page that must be operable is the **rendering kind (sub-type)**:
//  one JSON belongs to one type (fact) and can be drawn with any sub-type of that type,
//  such as the timeline or a swimlane diagram. Switching it does not reload the data.
//
//  Rows:
//    the diagram title (the JSON `title`)
//    the type, and the rendering kind: with two to four kinds they are all shown below as
//    a segmented row (the current one raised); with more, the current one is a button that
//    opens a menu, with the number of kinds on it
//    size and time span
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { useLang } from './LangContext.jsx'

/** Up to this many kinds are all shown side by side; more go in a menu */
export const FLAT_KINDS_MAX = 4

export default function DiagramHeader({ title, typeLabel, info = [], kinds = [], kind, onSelectKind }) {
  const { t } = useLang()

  // With only one rendering kind, do not make it a button: opening a menu with
  // a single option wastes a step
  const multi = kinds.length > 1
  // A few kinds are shown all at once, so the reader sees there are others without opening anything
  const flat = multi && kinds.length <= FLAT_KINDS_MAX
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Close on an outside click. Use the capture phase so the canvas's pointerdown
  // does not swallow it.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // The registry hands back wording keys; resolve them in the current language
  // (see listKinds in core/registry.js)
  const kindKey = kinds.find((k) => k.kind === kind)?.labelKey
  const kindLabel = kindKey ? t(kindKey) : kind

  return (
    <div className="antu-header" ref={rootRef}>
      <div className="antu-header-card">
        <h1 className="antu-header-title">{title}</h1>

        <div className="antu-header-row">
          <span className="antu-header-type">{typeLabel}</span>
          {flat ? null : multi ? (
            <button
              className={`antu-header-kind is-btn${open ? ' is-open' : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              {kindLabel}
              <span className="antu-header-count" title={t('header.kindCount', { n: kinds.length })}>
                {kinds.length}
              </span>
              <span className="antu-header-caret" />
            </button>
          ) : (
            kindLabel && <span className="antu-header-kind">{kindLabel}</span>
          )}
        </div>

        {flat && (
          <div className="antu-header-seg" role="group" aria-label={t('header.kindGroup')}>
            {kinds.map((k) => (
              <button key={k.kind} className={`antu-header-segopt${k.kind === kind ? ' is-on' : ''}`} aria-pressed={k.kind === kind} onClick={() => onSelectKind(k.kind)}>
                {t(k.labelKey)}
              </button>
            ))}
          </div>
        )}

        {info.length > 0 && <p className="antu-header-info">{info.join(' · ')}</p>}
      </div>

      {open && (
        <div className="antu-header-menu">
          {kinds.map((k) => (
            <button
              key={k.kind}
              className={`antu-header-opt${k.kind === kind ? ' is-on' : ''}`}
              onClick={() => {
                setOpen(false)
                onSelectKind(k.kind)
              }}
            >
              <span className="antu-header-tick">{k.kind === kind ? '✓' : ''}</span>
              {t(k.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
