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
//    the type, and how many ways it can be drawn
//    the picker: "‹  current way  3 / 9 ▾  ›". The arrows (and the left and right keys) step to the
//    neighbour in one click; the name opens a panel with a sketch of every way, to pick any in two.
//    With one kind there is no picker.
//    size and time span
//    a small arrow at the top right folds the card to one line (type, title, arrow) and unfolds it again;
//    the card opens unfolded, and the choice is remembered like the other display preferences
//    the theme: three choices in a row (document black and white, modern, legal blue), remembered; a page made
//    with `--theme` is fixed to that one and shows no choice
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { useLang } from './LangContext.jsx'
import KindIcon from './KindIcon.jsx'
import { useTheme, THEME_IDS } from '../theme/ThemeContext.jsx'
import { themeOf } from '../theme/themes.js'
import { isInside, useEnv } from './env.js'

export default function DiagramHeader({ title, typeLabel, info = [], kinds = [], kind, onSelectKind }) {
  const { t } = useLang()
  const { id: themeId, setTheme, forced: themeForced } = useTheme()
  const env = useEnv()
  const { prefs } = env

  // With only one rendering kind there is nothing to pick
  const multi = kinds.length > 1
  const [open, setOpen] = useState(false)
  const [folded, setFolded] = useState(() => prefs.read().headerFolded === true)
  const toggleFold = () => {
    const next = !folded
    setFolded(next)
    setOpen(false)
    prefs.write({ headerFolded: next })
  }
  const rootRef = useRef(null)
  const index = Math.max(0, kinds.findIndex((k) => k.kind === kind))
  const step = (d) => onSelectKind(kinds[(index + d + kinds.length) % kinds.length].kind)

  // Close on an outside click (capture phase, so the canvas's pointerdown does not swallow it) or on Escape
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!isInside(rootRef.current, e)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Left and right step through the kinds, unless the reader is typing or a control wants the key.
  // A mounted diagram shares the window with its host: it takes the keys only while the focus is inside it.
  useEffect(() => {
    if (!multi) return undefined
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (env.embedded && !isInside(env.root, e)) return
      // inside a shadow root the event's target is the host; the first entry of its path is the element itself
      const el = (typeof e.composedPath === 'function' && e.composedPath()[0]) || e.target
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest('.react-flow__node'))) return
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // The registry hands back wording keys; resolve them in the current language
  // (see listKinds in core/registry.js)
  const kindKey = kinds.find((k) => k.kind === kind)?.labelKey
  const kindLabel = kindKey ? t(kindKey) : kind

  return (
    <div className="antu-header" ref={rootRef}>
      {folded ? (
        <div className="antu-header-card is-folded">
          <span className="antu-header-type">{typeLabel}</span>
          <h1 className="antu-header-title">{title}</h1>
          <FoldButton folded onClick={toggleFold} label={t('header.unfold')} />
        </div>
      ) : (
        <div className="antu-header-card">
          <div className="antu-header-top">
            <h1 className="antu-header-title">{title}</h1>
            <FoldButton folded={false} onClick={toggleFold} label={t('header.fold')} />
          </div>

          <div className="antu-header-row">
            <span className="antu-header-type">{typeLabel}</span>
            {!multi && kindLabel && <span className="antu-header-kind">{kindLabel}</span>}
          </div>

          {multi && (
            <div className="antu-header-pick" role="group" aria-label={t('header.kindGroup')}>
              <button className="antu-header-step" onClick={() => step(-1)} title={t('header.kindPrev')} aria-label={t('header.kindPrev')}>
                ‹
              </button>
              <button className={`antu-header-current${open ? ' is-open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} title={t('header.kindOpen', { n: kinds.length })}>
                <span className="antu-header-current-name">{kindLabel}</span>
                <span className="antu-header-count">
                  {index + 1} / {kinds.length}
                </span>
                <span className="antu-header-caret" />
              </button>
              <button className="antu-header-step" onClick={() => step(1)} title={t('header.kindNext')} aria-label={t('header.kindNext')}>
                ›
              </button>
            </div>
          )}

          {info.length > 0 && <p className="antu-header-info">{info.join(' · ')}</p>}

          {!themeForced && (
            <div className="antu-header-theme" role="group" aria-label={t('header.theme')}>
              {THEME_IDS.map((id) => (
                <button key={id} className={`antu-header-themeopt${id === themeId ? ' is-on' : ''}`} aria-pressed={id === themeId} onClick={() => setTheme(id)} title={t(themeOf(id).labelKey)}>
                  {t(themeOf(id).labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="antu-header-panel" role="listbox" aria-label={t('header.kindGroup')}>
          {kinds.map((k) => (
            <button
              key={k.kind}
              role="option"
              aria-selected={k.kind === kind}
              className={`antu-header-cell${k.kind === kind ? ' is-on' : ''}`}
              onClick={() => {
                setOpen(false)
                onSelectKind(k.kind)
              }}
            >
              <KindIcon kind={k.kind} />
              <span>{t(k.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FoldButton({ folded, onClick, label }) {
  return (
    <button className="antu-header-fold" onClick={onClick} title={label} aria-label={label} aria-expanded={!folded}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={folded ? 'M3.5 5.5 8 10l4.5-4.5' : 'M3.5 10.5 8 6l4.5 4.5'} />
      </svg>
    </button>
  )
}
