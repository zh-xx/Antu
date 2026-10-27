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
//    the type (clickable → about panel with the three versions, issue 131), and how many ways it can be drawn
//    the picker: "‹  current way  3 / 9 ▾  ›". The arrows (and the left and right keys) step to the
//    neighbour in one click; the name opens a panel with a sketch of every way, to pick any in two.
//    With one kind there is no picker.
//    size and time span
//    a small arrow at the top right folds the card to one line (type, title, arrow) and unfolds it again;
//    the card opens unfolded, and the choice is remembered like the other display preferences
//    the theme: three choices in a row (document black and white, modern, legal blue), remembered; a page made
//    with `--theme` is fixed to that one and shows no choice
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { diagramAboutOf } from '../core/diagramAbout.js'
import { useLang } from './LangContext.jsx'
import KindIcon from './KindIcon.jsx'
import { useTheme, THEME_IDS } from '../theme/ThemeContext.jsx'
import { themeOf } from '../theme/themes.js'
import { isInside, useEnv, useViewValue } from './env.js'
import { readSpecPref, writeSpecPref } from './prefs.js'

export default function DiagramHeader({
  specKey = '',
  title,
  type,
  typeLabel,
  info = [],
  kinds = [],
  kind,
  onSelectKind,
  onPrefsChanged = () => {},
}) {
  const { t } = useLang()
  const { id: themeId, setTheme, forced: themeForced } = useTheme()
  const env = useEnv()
  const { prefs } = env

  // With only one rendering kind there is nothing to pick
  const multi = kinds.length > 1
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // the label card fold goes through the view state (issue 200): `initial` wins over the stored choice,
  // a host may lock it, and a reader's click in this mount wins over both. It is remembered per diagram
  // (issue 236), in a map from the diagram's content key to the fold.
  const foldView = useViewValue('shell.headerFolded', readSpecPref(prefs, 'headerFolded', specKey) === true, false)
  const [folded, setFolded] = useState(foldView.value === true)
  const toggleFold = () => {
    const next = !folded
    setFolded(next)
    setOpen(false)
    setAboutOpen(false)
    foldView.touch()
    writeSpecPref(prefs, 'headerFolded', specKey, next)
    onPrefsChanged()
  }
  const rootRef = useRef(null)
  const index = Math.max(0, kinds.findIndex((k) => k.kind === kind))
  const step = (d) => onSelectKind(kinds[(index + d + kinds.length) % kinds.length].kind)

  const about = useMemo(() => diagramAboutOf(type, kind), [type, kind])

  const toggleAbout = () => {
    setOpen(false)
    setAboutOpen((v) => !v)
  }

  // Close kind picker / about on an outside click (capture) or on Escape (window capture,
  // same path as the source overview panel).
  useEffect(() => {
    if (!open && !aboutOpen) return undefined
    const onDown = (e) => {
      if (!isInside(rootRef.current, e)) {
        setOpen(false)
        setAboutOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
      setAboutOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, aboutOpen])

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

  const typeControl = typeLabel ? (
    <button
      type="button"
      className={`antu-header-type${aboutOpen ? ' is-on' : ''}`}
      onClick={toggleAbout}
      aria-expanded={aboutOpen}
      aria-controls="antu-header-about"
      title={t('header.aboutTitle')}
    >
      {typeLabel}
    </button>
  ) : null

  return (
    <div className="antu-header" ref={rootRef}>
      {folded ? (
        <div className="antu-header-card is-folded">
          {typeControl}
          <h1 className="antu-header-title">{title}</h1>
          {!foldView.locked && <FoldButton folded onClick={toggleFold} label={t('header.unfold')} />}
        </div>
      ) : (
        <div className="antu-header-card">
          <div className="antu-header-top">
            <h1 className="antu-header-title">{title}</h1>
            {!foldView.locked && <FoldButton folded={false} onClick={toggleFold} label={t('header.fold')} />}
          </div>

          <div className="antu-header-row">
            {typeControl}
            {!multi && kindLabel && <span className="antu-header-kind">{kindLabel}</span>}
          </div>

          {multi && (
            <div className="antu-header-pick" role="group" aria-label={t('header.kindGroup')}>
              <button className="antu-header-step" onClick={() => step(-1)} title={t('header.kindPrev')} aria-label={t('header.kindPrev')}>
                ‹
              </button>
              <button
                className={`antu-header-current${open ? ' is-on' : ''}`}
                onClick={() => {
                  setAboutOpen(false)
                  setOpen((v) => !v)
                }}
                aria-expanded={open}
                title={t('header.kindOpen', { n: kinds.length })}
              >
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

      {aboutOpen && (
        <aside id="antu-header-about" className="antu-header-about" aria-label={t('header.about')}>
          <h2 className="antu-header-about-title">{t('header.about')}</h2>
          <dl className="antu-header-about-list">
            <div className="antu-header-about-row">
              <dt>{t('header.about.engine')}</dt>
              <dd>{t('header.about.engineValue', { v: about.engine })}</dd>
            </div>
            <div className="antu-header-about-row">
              <dt>{t('header.about.format')}</dt>
              <dd>
                {about.format != null
                  ? t('header.about.formatValue', { type: typeLabel || type, n: about.format })
                  : '—'}
              </dd>
            </div>
            <div className="antu-header-about-row">
              <dt>{t('header.about.diagram')}</dt>
              <dd>
                {about.diagram
                  ? t('header.about.diagramValue', {
                      kind: kindLabel || kind,
                      n: about.diagram.version,
                      status: t(`diagram.status.${about.diagram.status}`),
                    })
                  : '—'}
              </dd>
            </div>
          </dl>
        </aside>
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
