// ============================================================
//  src/renderers/relationship/equity/EquityRenderer.jsx — the equity tree (issue #91)
//
//  Holders above what they hold, the share on each line. Same JSON as the graph; the reader switches
//  kind in the label card, and picks a company in the dock. The layout (equity/layout.js) is pure; the
//  page is the shared levelled view.
// ============================================================

import CompanyView from '../CompanyView.jsx'
import { buildEquityGraph } from './layout.js'

export default function RelationshipEquity({ spec }) {
  return <CompanyView spec={spec} build={buildEquityGraph} className="antu-eq" kind="equity" />
}
