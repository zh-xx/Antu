// ============================================================
//  src/renderers/relationship/focus/FocusNoteNode.jsx — the caption over the islands
//
//  Parties no relation reaches from the centre are laid out in rows under the picture; this says what
//  they are. A decoration node (see fact/timeline/nodes.js for why it is declared 1×1).
// ============================================================

import { memo } from 'react'
import { useLang } from '../../../shell/LangContext.jsx'

const FocusNoteNode = memo(function FocusNoteNode() {
  const { t } = useLang()
  return <div className="antu-rf-note">{t('rel.focus.apart')}</div>
})

export default FocusNoteNode
