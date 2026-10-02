// ============================================================
//  src/renderers/fact/scale/ScaleDock.jsx — the time scale's control dock
//
//  The scale has no card switches (a card is its title and its time; everything else is in the
//  overlay), no views and no orientation: language, then the two actions.
// ============================================================

import { DockExportButton, DockLangSwitch } from '../../../shell/DockParts.jsx'
import CopyTableButton from '../CopyTableButton.jsx'

export default function ScaleDock({ spec, exporting = false, onExport }) {
  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
        <DockLangSwitch />
        <span className="antu-dock-sep" />
        <CopyTableButton spec={spec} />
        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}
