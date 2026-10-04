// ============================================================
//  src/renderers/relationship/equity/EquityRenderer.jsx — the equity tree (issue #91)
//
//  Holders above what they hold, the share on each line. Same JSON as the graph; the reader switches
//  kind in the label card. The layout (equity/layout.js) is pure; the page is the shared levelled view.
// ============================================================

import LevelledView from '../LevelledView.jsx'
import { buildEquityGraph } from './layout.js'

export default function RelationshipEquity({ spec }) {
  return <LevelledView spec={spec} build={buildEquityGraph} className="antu-eq" />
}
