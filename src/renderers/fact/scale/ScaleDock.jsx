// ============================================================
//  src/renderers/fact/scale/ScaleDock.jsx — the time scale's control dock
//
//  The scale has no card switches (a card is its title and its time; everything else is in the
//  overlay) and no orientation. One switch, shown only when a side has two or more parties: a lane per party
//  instead of one per group. Then language, then export.
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch } from '../../../shell/DockParts.jsx'

export default function ScaleDock({ byParty = false, onToggleByParty, exporting = false, onExport }) {
  const { t } = useLang()
  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
        {onToggleByParty && (
          <>
            <button data-chip="byParty" className={`antu-dock-chip${byParty ? ' is-on' : ''}`} onClick={() => onToggleByParty(!byParty)}>
              {t('dock.byParty')}
            </button>
            <span className="antu-dock-sep" />
          </>
        )}
        <DockLangSwitch />
        <span className="antu-dock-sep" />
        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}
