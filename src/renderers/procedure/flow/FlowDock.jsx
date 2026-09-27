// ============================================================
//  src/renderers/procedure/flow/FlowDock.jsx — the flowchart's control capsule
//
//  The controls are the ones listed in spec/procedure/schema-draft.md §6.2, in the four shapes
//  of spec/fact/rendering.md §4.2 (no new shapes invented):
//    condition labels / node detail / main line / stage bands   independent switches → chips
//    orientation                                                 two exclusive options → segmented
//    language, export image                                      shared with every dock (shell/DockParts.jsx)
//  The stage-band switch only appears when the data has stages: a switch that can change
//  nothing is noise.
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch, DockSegmented } from '../../../shell/DockParts.jsx'

/** The switches, in display order. Message keys are stored and resolved per language on use. */
const SWITCHES = [
  ['conditions', 'flow.conditions'],
  ['detail', 'flow.detail'],
  ['mainLine', 'flow.mainLine'],
  ['stages', 'flow.stages'],
]

const ORIENTATIONS = [
  ['vertical', 'dock.vertical'],
  ['horizontal', 'dock.horizontal'],
]

export default function FlowDock({
  fields = {},
  onToggleField,
  hasStages = false,
  orientation = 'vertical',
  onToggleOrientation,
  exporting = false,
  onExport,
}) {
  const { t } = useLang()

  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
        {SWITCHES.filter(([key]) => key !== 'stages' || hasStages).map(([key, label]) => (
          <button
            key={key}
            className={`antu-dock-chip${fields[key] ? ' is-on' : ''}`}
            onClick={() => onToggleField(key, !fields[key])}
          >
            {t(label)}
          </button>
        ))}

        <span className="antu-dock-sep" />

        <DockSegmented options={ORIENTATIONS} value={orientation} onChange={onToggleOrientation} />

        <span className="antu-dock-sep" />

        <DockLangSwitch />

        {/* Set off by a divider: everything before is a "how to look at it" switch, this is the only action */}
        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />
      </div>
    </div>
  )
}
