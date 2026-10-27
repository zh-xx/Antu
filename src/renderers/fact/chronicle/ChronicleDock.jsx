// ============================================================
//  src/renderers/fact/chronicle/ChronicleDock.jsx — the chronicle's control dock
//
//  Fewer controls than the timeline's: no views (every event is shown once, in order), no
//  orientation (a chronicle reads top to bottom) and no grid. What is left:
//    card fields     the same three switches as the timeline, remembered together with it
//    language, export  the shared parts
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch, DockResetButton } from '../../../shell/DockParts.jsx'
import { DockTraceButton } from '../../../shell/TracePanel.jsx'

const OPTIONAL_FIELDS = ['sources', 'actors', 'summary']
const FIELD_KEYS = { sources: 'dock.sources', actors: 'dock.actors', summary: 'dock.summary' }

export default function ChronicleDock({ fields = {}, onToggleField, exporting = false, onExport }) {
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

        <DockLangSwitch />
        <DockTraceButton />

        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />

        <DockResetButton />
      </div>
    </div>
  )
}
