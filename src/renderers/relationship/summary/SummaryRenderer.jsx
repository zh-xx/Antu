// ============================================================
//  src/renderers/relationship/summary/SummaryRenderer.jsx — the camp summary (issue #93)
//
//  Each camp as one block, one line between two blocks. Same JSON as the graph; the layout
//  (summary/layout.js) is pure; the page is the shared levelled view. It reads left to right and is wide,
//  so it opens fitted to the whole picture, not to its width.
// ============================================================

import LevelledView from '../LevelledView.jsx'
import { buildSummaryGraph } from './layout.js'

export default function RelationshipSummary({ spec }) {
  return <LevelledView spec={spec} build={buildSummaryGraph} className="antu-sm" fitWidth={false} />
}
