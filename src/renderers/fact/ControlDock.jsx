// ============================================================
//  src/renderers/fact/ControlDock.jsx — the control capsule at the bottom of the canvas
//
//  Display controls are collected here, floating centred just below the canvas.
//  The view is not here: it is the most used, so it stays on the first level of the left
//  column, one click away.
//
//  Six controls, each in its own shape by Apple's rule:
//    view            option names are long and there are up to five, no room → one button showing
//                    the current value, opening a list with tick marks
//    card fields     three independent switches, few → put them all out, click to toggle (on = highlighted)
//    orientation     two mutually exclusive → a segmented control, both out, the selected one raised
//    grid lines      one switch → click to toggle
//    export image    the only **action**, not a state → set off by a divider, one click downloads
//  In one sentence: few independent options go out in the open, long option names go into a menu.
//  Actions and states must be distinguishable at a glance: states use background darkness
//  (transparent / 12% grey), the action is the only solid block in the dock, with a download symbol.
//  The rendering kind (sub-type) is not here either: it answers "in which way is this data looked
//  at", the topmost question on the page, so it sits in the label card at the top left.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { useLang } from '../../shell/LangContext.jsx'

/** Optional card fields (title and time are always shown and not listed here). Message keys are stored and resolved per language on use. */
const OPTIONAL_FIELDS = ['sources', 'actors', 'summary']
const FIELD_KEYS = { sources: 'dock.sources', actors: 'dock.actors', summary: 'dock.summary' }

const ORIENTATIONS = [
  ['vertical', 'dock.vertical'],
  ['horizontal', 'dock.horizontal'],
]

/** Language switch. Each language name is written in its own language, so you recognise your entry even in the wrong language. */
const LANGS = [
  ['en', 'dock.langEn'],
  ['zh', 'dock.langZh'],
]

export default function ControlDock({
  /** The usable views (ones that do not fit were filtered upstream and never arrive here) */
  viewOptions = [],
  /** How many views the data has in total, used to decide whether to show this menu */
  viewCount = 0,
  view,
  onSelectView,
  fields = {},
  onToggleField,
  orientation = 'vertical',
  onToggleOrientation,
  showGrid = false,
  onToggleGrid,
  exporting = false,
  onExport,
}) {
  const { t, lang, setLang } = useLang()

  // Only one menu is open at a time: opening a new one closes the old
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Close on an outside click. The capture phase is used so the canvas's own handlers cannot swallow it.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  return (
    <div className="antu-dock" ref={rootRef}>
      {open && (
        <div className="antu-dock-pop">
          {viewOptions.map((info) => (
            <button
              key={info.view.label}
              className={`antu-dock-opt${info.view === view ? ' is-on' : ''}`}
              onClick={() => {
                setOpen(false)
                onSelectView(info.index)
              }}
            >
              <span className="antu-dock-tick">{info.view === view ? '✓' : ''}</span>
              {info.view.label}
            </button>
          ))}
        </div>
      )}

      <div className="antu-dock-bar">
        {/* View option names are long and there are at most five, no room, so they go into a menu */}
        {viewCount > 1 && (
          <>
            <button
              className={`antu-dock-chip${open ? ' is-open' : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              {view?.label}
              <span className="antu-dock-caret" />
            </button>
            <span className="antu-dock-sep" />
          </>
        )}
        {OPTIONAL_FIELDS.map((key) => (
          <button
            key={key}
            className={`antu-dock-chip${fields[key] ? ' is-on' : ''}`}
            onClick={() => onToggleField(key, !fields[key])}
          >
            {t(FIELD_KEYS[key])}
          </button>
        ))}

        <span className="antu-dock-sep" />

        {/* Segmented control: only two options, putting both out saves one click compared with a menu */}
        <div className="antu-dock-seg">
          {ORIENTATIONS.map(([value, key]) => (
            <button
              key={value}
              className={`antu-dock-seg-item${orientation === value ? ' is-on' : ''}`}
              onClick={() => onToggleOrientation(value)}
            >
              {t(key)}
            </button>
          ))}
        </div>

        <span className="antu-dock-sep" />

        <button
          className={`antu-dock-chip${showGrid ? ' is-on' : ''}`}
          onClick={() => onToggleGrid(!showGrid)}
        >
          {t('dock.grid')}
        </button>

        <span className="antu-dock-sep" />

        {/* Language affects interface text only, never data: the case content on the diagram
            comes with the JSON. So switching language reloads no data and changes no geometry. */}
        <div className="antu-dock-seg" title={t('dock.lang')}>
          {LANGS.map(([value, key]) => (
            <button
              key={value}
              className={`antu-dock-seg-item${lang === value ? ' is-on' : ''}`}
              onClick={() => setLang(value)}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {/* Set off by a divider: everything before is a "how to look at it" switch, this is the only action */}
        <span className="antu-dock-sep" />

        <button
          className="antu-dock-action"
          onClick={onExport}
          disabled={exporting}
          title={t('dock.exportTitle')}
        >
          {/* The conventional download mark (an arrow down onto a line). This cell is an action
              while the others are states, and giving an action a symbol is standard toolbar
              practice: four words alone on a dark background read more like a label than
              something pressable.
              `fill="none"`: these strokes are drawn as outlines, and leaving the fill on
              smears them into a solid block.
              Size 13 rather than 12: a symbol beside small text must be slightly larger to
              not look small. */}
          <svg
            className="antu-dock-action-icon"
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M8 1.8v7.4M4.8 6.2 8 9.4l3.2-3.2M2.4 12.6h11.2"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {exporting ? t('dock.exporting') : t('dock.exportImage')}
        </button>
      </div>
    </div>
  )
}
