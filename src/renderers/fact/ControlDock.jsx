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
import { DockExportButton, DockLangSwitch, DockSegmented } from '../../shell/DockParts.jsx'

/** Optional card fields (title and time are always shown and not listed here). Message keys are stored and resolved per language on use. */
const OPTIONAL_FIELDS = ['sources', 'actors', 'summary']
const FIELD_KEYS = { sources: 'dock.sources', actors: 'dock.actors', summary: 'dock.summary' }

const ORIENTATIONS = [
  ['vertical', 'dock.vertical'],
  ['horizontal', 'dock.horizontal'],
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
  const { t } = useLang()

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
        <DockSegmented options={ORIENTATIONS} value={orientation} onChange={onToggleOrientation} />

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
        <DockLangSwitch />

        {/* Set off by a divider: everything before is a "how to look at it" switch, this is the only action */}
        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}
