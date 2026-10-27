// ============================================================
//  src/renderers/procedure/flow/FlowDock.jsx — the flowchart's control capsule
//
//  The controls are the ones listed in spec/procedure/schema-draft.md §6.2, in the four shapes
//  of spec/fact/rendering.md §4.2 (no new shapes invented):
//    condition labels / node detail / main line / states / stage bands / rules   independent switches → chips
//    orientation, link style (straight / curved)                         two exclusive options → segmented
//    language, print, export image                                       shared with every dock (shell/DockParts.jsx)
//  The stage-band and rule switches only appear when the data has stages / rules: a switch
//  that can change nothing is noise.
// ============================================================

import { useLang } from '../../../shell/LangContext.jsx'
import { DockExportButton, DockLangSwitch, DockResetButton, DockSegmented } from '../../../shell/DockParts.jsx'
import { DockTraceButton } from '../../../shell/TracePanel.jsx'

/** The switches, in display order. Message keys are stored and resolved per language on use. */
const SWITCHES = [
  ['conditions', 'flow.conditions'],
  ['detail', 'flow.detail'],
  ['mainLine', 'flow.mainLine'],
  ['states', 'flow.states'],
  ['stages', 'flow.stages'],
  ['rules', 'flow.rules'],
]

const ORIENTATIONS = [
  ['vertical', 'dock.vertical'],
  ['horizontal', 'dock.horizontal'],
]

const LINK_STYLES = [
  ['straight', 'flow.linkStraight'],
  ['curved', 'flow.linkCurved'],
]

export default function FlowDock({
  fields = {},
  onToggleField,
  hasStages = false,
  hasRules = false,
  orientation = 'vertical',
  onToggleOrientation,
  linkStyle = 'straight',
  onToggleLinkStyle,
  locked = {},
  exporting = false,
  onExport,
}) {
  const { t } = useLang()

  return (
    <div className="antu-dock">
      <div className="antu-dock-bar">
        {SWITCHES.filter(([key]) => !locked[key] && (key !== 'stages' || hasStages) && (key !== 'rules' || hasRules)).map(([key, label]) => (
          <button
            key={key}
            className={`antu-dock-chip${fields[key] ? ' is-on' : ''}`}
            onClick={() => onToggleField(key, !fields[key])}
          >
            {t(label)}
          </button>
        ))}

        <span className="antu-dock-sep" />

        {/* A locked orientation or style has no control at all (issue 200) */}
        {!locked.orientation && <DockSegmented options={ORIENTATIONS} value={orientation} onChange={onToggleOrientation} />}

        {!locked.linkStyle && <DockSegmented options={LINK_STYLES} value={linkStyle} onChange={onToggleLinkStyle} title={t('flow.linkStyle')} />}

        <span className="antu-dock-sep" />

        <DockLangSwitch />
        <DockTraceButton />

        {/* Set off by a divider: everything before is a "how to look at it" switch, this is the only action */}
        <span className="antu-dock-sep" />

        <DockExportButton exporting={exporting} onExport={onExport} />

        <DockResetButton />
      </div>
    </div>
  )
}
