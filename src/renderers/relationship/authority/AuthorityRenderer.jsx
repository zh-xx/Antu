// ============================================================
//  src/renderers/relationship/authority/AuthorityRenderer.jsx — the authority chart (issue #93)
//
//  Control, employment and agency, as an organisation chart: whoever commands above, whoever is
//  commanded below. Same JSON as the graph; the reader picks a company in the dock. The layout
//  (authority/layout.js) is pure; the page is the shared levelled view.
// ============================================================

import CompanyView from '../CompanyView.jsx'
import { buildAuthorityGraph } from './layout.js'

export default function RelationshipAuthority({ spec }) {
  return <CompanyView spec={spec} build={buildAuthorityGraph} className="antu-au" kind="authority" />
}
