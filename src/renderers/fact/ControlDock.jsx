// ============================================================
//  src/renderers/fact/ControlDock.jsx — the control capsule at the bottom of the canvas
//
//  Display controls are collected here, floating centred just below the canvas.
//  Controls, each in its own shape by Apple's rule:
//    card fields     three independent switches, few → put them all out, click to toggle (on = highlighted)
//    orientation     two mutually exclusive → a segmented control, both out, the selected one raised
//    grid lines      one switch → click to toggle
//    export image    an **action**, not a state → set off by a divider, one click downloads
//  In one sentence: few independent options go out in the open.
//  Actions and states must be distinguishable at a glance: states use background darkness
//  (transparent / 12% grey), the action is the only solid block in the dock, with a download symbol.
//  The rendering kind (sub-type) is not here either: it answers "in which way is this data looked
//  at", the topmost question on the page, so it sits in the label card at the top left.
// ============================================================

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
  fields = {},
  onToggleField,
  orientation = 'vertical',
  onToggleOrientation,
  showGrid = false,
  onToggleGrid,
  /** Staggered rows: vertical only, so the chip is shown only then; on by default */
  stagger = false,
  onToggleStagger,
  exporting = false,
  onExport,
}) {
  const { t } = useLang()

  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
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

        {onToggleStagger && orientation === 'vertical' && (
          <button
            className={`antu-dock-chip${stagger ? ' is-on' : ''}`}
            data-chip="stagger"
            aria-pressed={stagger}
            title={t('dock.staggerHint')}
            onClick={() => onToggleStagger(!stagger)}
          >
            {t('dock.stagger')}
          </button>
        )}

        <span className="antu-dock-sep" />

        {/* The grid lines assume rows of one height, so they are not offered while the rows are staggered
            (the chip and its separator go together, so two separators never meet) */}
        {!(stagger && orientation === 'vertical') && (
          <>
            <button
              className={`antu-dock-chip${showGrid ? ' is-on' : ''}`}
              data-chip="grid"
              onClick={() => onToggleGrid(!showGrid)}
            >
              {t('dock.grid')}
            </button>

            <span className="antu-dock-sep" />
          </>
        )}

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
